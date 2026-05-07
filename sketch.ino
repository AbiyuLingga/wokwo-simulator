#include <Arduino.h>
#include <math.h>
#include <string.h>

#ifdef ARDUINO_ARCH_ESP32
#include <HTTPClient.h>
#include <WiFi.h>
#endif

// Reference image pin map:
// GPIO36 = CD4051 COM ADC for current channels, GPIO10 = direct ZMPT101B
// voltage ADC, GPIO42/41/40 = CD4051 A/B/C select,
// GPIO39/GPIO38/GPIO37/GPIO35 = relay controls for load 1..4, and
// GPIO30/GPIO31/GPIO32/GPIO33 = low-voltage wall-switch inputs for load 1..4.
// Note: on real ESP32-S3 silicon, ADC pins are GPIO1-GPIO20. If Wokwi or real
// hardware returns zero on GPIO36, move CD4051 COM and PIN_ADC_MUX to a valid
// ADC pin such as GPIO4 or GPIO5.
static const uint8_t LOAD_COUNT = 4;
static const int PIN_ADC_MUX = 36;
static const int PIN_ADC_ZMPT = 10;
static const int PIN_MUX_A = 42;
static const int PIN_MUX_B = 41;
static const int PIN_MUX_C = 40;
static const int PIN_RELAY[LOAD_COUNT] = {39, 38, 37, 35};
static const int PIN_WALL_SWITCH[LOAD_COUNT] = {30, 31, 32, 33};

static const uint8_t MUX_CURRENT_CHANNEL[LOAD_COUNT] = {0, 1, 2, 3};

static const uint32_t SAMPLE_WINDOW_MS = 5000;
static const uint32_t SAMPLE_INTERVAL_US = 1000;

// Wokwi Custom Chip Analog API currently maps 0..5V to ADC min..max.
// Recalibrate these constants for real ESP32-S3 hardware and sensor modules.
static const float ADC_REF_VOLTS = 5.0f;
static const float ADC_MAX_COUNTS = 4095.0f;
static const float SENSOR_BIAS_VOLTS = ADC_REF_VOLTS / 2.0f;
static const float VOLTAGE_SENSOR_RMS_AT_220V = 0.80f;
static const float VOLTAGE_SCALE = 220.0f / VOLTAGE_SENSOR_RMS_AT_220V;
static const float CURRENT_SENSOR_RMS_VOLTS_PER_AMP = 0.08f;

// Fill these values after running supabase/schema.sql.
// Wokwi ESP32 internet uses Wokwi-GUEST with an empty password.
static const bool ENABLE_SUPABASE = false;
static const char WIFI_SSID[] = "Wokwi-GUEST";
static const char WIFI_PASSWORD[] = "";
static const char SUPABASE_URL[] = "https://your-project-id.supabase.co";
static const char SUPABASE_ANON_KEY[] = "paste-your-supabase-anon-key";
static const float DEFAULT_TARIFF_IDR_PER_KWH = 1444.70f;
static const uint32_t SUPABASE_RELAY_POLL_MS = 2500;

struct Measurement {
  uint8_t load;
  uint32_t samples;
  uint32_t elapsedMs;
  float vrms;
  float irms;
  float pavgWatts;
  float apparentVa;
};

static bool relayEnabled[LOAD_COUNT] = {true, true, true, true};
static bool wallSwitchClosed[LOAD_COUNT] = {false, false, false, false};
static bool lastWallSwitchReading[LOAD_COUNT] = {false, false, false, false};
static uint32_t lastWallSwitchChangeMs[LOAD_COUNT] = {0};
static float energyWh[LOAD_COUNT] = {0};
static uint32_t lastSupabaseRelayPollMs = 0;

static void supabaseSetRelayState(uint8_t load, bool relayOn);

static float adcToVolts(int raw) {
  return ((float)raw * ADC_REF_VOLTS) / ADC_MAX_COUNTS;
}

static void writeRelay(uint8_t load) {
  if (load >= LOAD_COUNT) {
    return;
  }
  digitalWrite(PIN_RELAY[load], relayEnabled[load] ? HIGH : LOW);
}

static void writeRelays() {
  for (uint8_t i = 0; i < LOAD_COUNT; i++) {
    writeRelay(i);
  }
}

static bool readWallSwitchClosed(uint8_t load) {
  if (load >= LOAD_COUNT) {
    return false;
  }
  return digitalRead(PIN_WALL_SWITCH[load]) == LOW;
}

static void applyManualSwitchOverride(uint8_t load) {
  if (load >= LOAD_COUNT) {
    return;
  }

  if (!relayEnabled[load]) {
    relayEnabled[load] = true;
    writeRelay(load);
    supabaseSetRelayState(load, true);
    Serial.print("Manual switch ");
    Serial.print(load + 1);
    Serial.println(" changed; relay released for manual ON");
  } else {
    Serial.print("Manual switch ");
    Serial.print(load + 1);
    Serial.println(wallSwitchClosed[load] ? " ON" : " OFF");
  }
}

static void pollWallSwitches() {
  const uint32_t now = millis();
  for (uint8_t load = 0; load < LOAD_COUNT; load++) {
    const bool reading = readWallSwitchClosed(load);
    if (reading != lastWallSwitchReading[load]) {
      lastWallSwitchReading[load] = reading;
      lastWallSwitchChangeMs[load] = now;
    }

    if (reading != wallSwitchClosed[load] && (now - lastWallSwitchChangeMs[load]) >= 40) {
      wallSwitchClosed[load] = reading;
      applyManualSwitchOverride(load);
    }
  }
}

static void selectMuxChannel(uint8_t channel) {
  digitalWrite(PIN_MUX_A, (channel & 0x01) ? HIGH : LOW);
  digitalWrite(PIN_MUX_B, (channel & 0x02) ? HIGH : LOW);
  digitalWrite(PIN_MUX_C, (channel & 0x04) ? HIGH : LOW);
  delayMicroseconds(250);
}

static float readMuxVolts(uint8_t channel) {
  selectMuxChannel(channel);
  return adcToVolts(analogRead(PIN_ADC_MUX));
}

static float readZmptVolts() {
  return adcToVolts(analogRead(PIN_ADC_ZMPT));
}

static void printHelp() {
  Serial.println();
  Serial.println("Commands: on | off | toggle | reset | on1..on4 | off1..off4 | toggle1..toggle4");
  Serial.println("Wall switches on GPIO30..GPIO33 are low-voltage inputs with INPUT_PULLUP.");
  Serial.println("Output: LOAD Vrms Irms Pavg VA Wh kWh Relay Switch");
  Serial.println();
}

static bool parseLoadCommand(const String &command, const char *prefix, uint8_t *load) {
  const size_t prefixLength = strlen(prefix);
  if (!command.startsWith(prefix) || command.length() <= prefixLength) {
    return false;
  }

  for (size_t i = prefixLength; i < command.length(); i++) {
    const char c = command.charAt(i);
    if (c < '0' || c > '9') {
      return false;
    }
  }

  const int loadNumber = command.substring(prefixLength).toInt();
  if (loadNumber < 1 || loadNumber > LOAD_COUNT) {
    return false;
  }

  *load = (uint8_t)(loadNumber - 1);
  return true;
}

static bool supabaseConfigured() {
#ifdef ARDUINO_ARCH_ESP32
  return ENABLE_SUPABASE &&
         strlen(SUPABASE_URL) > 20 &&
         strstr(SUPABASE_URL, "your-project-id") == nullptr &&
         strlen(SUPABASE_ANON_KEY) > 40 &&
         strstr(SUPABASE_ANON_KEY, "paste-your") == nullptr;
#else
  return false;
#endif
}

#ifdef ARDUINO_ARCH_ESP32
static String supabaseBaseUrl() {
  String url = SUPABASE_URL;
  while (url.endsWith("/")) {
    url.remove(url.length() - 1);
  }
  return url;
}

static bool ensureWifiConnected() {
  if (!supabaseConfigured()) {
    return false;
  }

  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.print("Connecting WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const uint32_t startMs = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startMs) < 15000) {
    Serial.print(".");
    delay(300);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(" failed");
    return false;
  }

  Serial.print(" connected, IP=");
  Serial.println(WiFi.localIP());
  return true;
}

static int supabaseRequest(const String &path, const char *method, const String &body, String *responseBody, const char *prefer = nullptr) {
  if (!ensureWifiConnected()) {
    return -1;
  }

  HTTPClient http;
  http.begin(supabaseBaseUrl() + path);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
  http.addHeader("Content-Type", "application/json");
  if (prefer != nullptr) {
    http.addHeader("Prefer", prefer);
  }

  int code = -1;
  if (strcmp(method, "GET") == 0) {
    code = http.GET();
  } else if (strcmp(method, "POST") == 0) {
    code = http.POST(body);
  } else if (strcmp(method, "PATCH") == 0) {
    code = http.sendRequest("PATCH", body);
  }

  if (responseBody != nullptr) {
    *responseBody = http.getString();
  }
  http.end();
  return code;
}

static void supabaseSeedCircuits() {
  if (!supabaseConfigured()) {
    return;
  }

  String body = "[";
  for (uint8_t load = 0; load < LOAD_COUNT; load++) {
    if (load > 0) {
      body += ",";
    }
    body += "{\"relay_index\":";
    body += String(load + 1);
    body += ",\"name\":\"Rangkaian ";
    body += String(load + 1);
    body += "\",\"relay_on\":";
    body += relayEnabled[load] ? "true" : "false";
    body += ",\"tariff_idr_per_kwh\":";
    body += String(DEFAULT_TARIFF_IDR_PER_KWH, 2);
    body += ",\"command_nonce\":0}";
  }
  body += "]";

  const int code = supabaseRequest(
    "/rest/v1/circuits?on_conflict=relay_index",
    "POST",
    body,
    nullptr,
    "resolution=ignore-duplicates,return=minimal"
  );
  Serial.print("Supabase circuit seed HTTP ");
  Serial.println(code);
}

static bool parseRelayState(const String &payload, uint8_t relayIndex, bool *value) {
  const String needle = String("\"relay_index\":") + String(relayIndex);
  const int relayPos = payload.indexOf(needle);
  if (relayPos < 0) {
    return false;
  }

  const int statePos = payload.indexOf("\"relay_on\":", relayPos);
  if (statePos < 0) {
    return false;
  }

  const int nextRelayPos = payload.indexOf("\"relay_index\":", relayPos + needle.length());
  const int scanEnd = nextRelayPos > statePos ? nextRelayPos : payload.length();
  const int truePos = payload.indexOf("true", statePos);
  const int falsePos = payload.indexOf("false", statePos);

  if (truePos >= 0 && truePos < scanEnd && (falsePos < 0 || truePos < falsePos)) {
    *value = true;
    return true;
  }
  if (falsePos >= 0 && falsePos < scanEnd) {
    *value = false;
    return true;
  }
  return false;
}

static void supabasePollRelays(bool force = false) {
  if (!supabaseConfigured()) {
    return;
  }

  const uint32_t now = millis();
  if (!force && (now - lastSupabaseRelayPollMs) < SUPABASE_RELAY_POLL_MS) {
    return;
  }
  lastSupabaseRelayPollMs = now;

  String payload;
  const int code = supabaseRequest(
    "/rest/v1/circuits?select=relay_index,relay_on&order=relay_index.asc",
    "GET",
    "",
    &payload
  );

  if (code < 200 || code >= 300) {
    Serial.print("Supabase relay poll HTTP ");
    Serial.println(code);
    return;
  }

  for (uint8_t load = 0; load < LOAD_COUNT; load++) {
    bool nextState = relayEnabled[load];
    if (parseRelayState(payload, load + 1, &nextState) && nextState != relayEnabled[load]) {
      relayEnabled[load] = nextState;
      writeRelay(load);
      Serial.print("Relay ");
      Serial.print(load + 1);
      Serial.println(relayEnabled[load] ? " ON from Supabase" : " OFF from Supabase");
    }
  }
}

static void supabasePostMeasurement(const Measurement &m) {
  if (!supabaseConfigured()) {
    return;
  }

  const float positiveWatts = m.pavgWatts > 0.0f ? m.pavgWatts : 0.0f;
  const float powerFactor = m.apparentVa > 0.001f ? positiveWatts / m.apparentVa : 0.0f;
  const float estimatedCost = (positiveWatts / 1000.0f) * DEFAULT_TARIFF_IDR_PER_KWH;

  String body = "{";
  body += "\"relay_index\":";
  body += String(m.load + 1);
  body += ",\"voltage_rms\":";
  body += String(m.vrms, 2);
  body += ",\"current_rms\":";
  body += String(m.irms, 4);
  body += ",\"power_watts\":";
  body += String(positiveWatts, 3);
  body += ",\"apparent_va\":";
  body += String(m.apparentVa, 3);
  body += ",\"power_factor\":";
  body += String(powerFactor, 4);
  body += ",\"energy_wh\":";
  body += String(energyWh[m.load], 6);
  body += ",\"relay_on\":";
  body += relayEnabled[m.load] ? "true" : "false";
  body += ",\"estimated_cost_idr_per_hour\":";
  body += String(estimatedCost, 2);
  body += "}";

  const int code = supabaseRequest(
    "/rest/v1/power_readings",
    "POST",
    body,
    nullptr,
    "return=minimal"
  );
  if (code < 200 || code >= 300) {
    Serial.print("Supabase reading POST HTTP ");
    Serial.println(code);
  }
}

static void supabaseSetRelayState(uint8_t load, bool relayOn) {
  if (!supabaseConfigured() || load >= LOAD_COUNT) {
    return;
  }

  String body = "{";
  body += "\"relay_on\":";
  body += relayOn ? "true" : "false";
  body += ",\"command_nonce\":";
  body += String(millis());
  body += "}";

  const int code = supabaseRequest(
    String("/rest/v1/circuits?relay_index=eq.") + String(load + 1),
    "PATCH",
    body,
    nullptr,
    "return=minimal"
  );
  if (code < 200 || code >= 300) {
    Serial.print("Supabase manual relay PATCH HTTP ");
    Serial.println(code);
  }
}
#else
static void supabaseSeedCircuits() {}
static void supabasePollRelays(bool force = false) {
  (void)force;
}
static void supabasePostMeasurement(const Measurement &m) {
  (void)m;
}
static void supabaseSetRelayState(uint8_t load, bool relayOn) {
  (void)load;
  (void)relayOn;
}
#endif

static void setAllRelays(bool enabled) {
  for (uint8_t i = 0; i < LOAD_COUNT; i++) {
    relayEnabled[i] = enabled;
  }
  writeRelays();
}

static void processSerial() {
  if (!Serial.available()) {
    return;
  }

  String command = Serial.readStringUntil('\n');
  command.trim();
  command.toLowerCase();
  uint8_t load = 0;

  if (command == "on") {
    setAllRelays(true);
    Serial.println("All relays ON");
  } else if (command == "off") {
    setAllRelays(false);
    Serial.println("All relays OFF");
  } else if (command == "toggle") {
    for (uint8_t i = 0; i < LOAD_COUNT; i++) {
      relayEnabled[i] = !relayEnabled[i];
    }
    writeRelays();
    Serial.println("All relays toggled");
  } else if (parseLoadCommand(command, "on", &load)) {
    relayEnabled[load] = true;
    writeRelay(load);
    Serial.print("Relay ");
    Serial.print(load + 1);
    Serial.println(" ON");
  } else if (parseLoadCommand(command, "off", &load)) {
    relayEnabled[load] = false;
    writeRelay(load);
    Serial.print("Relay ");
    Serial.print(load + 1);
    Serial.println(" OFF");
  } else if (parseLoadCommand(command, "toggle", &load)) {
    relayEnabled[load] = !relayEnabled[load];
    writeRelay(load);
    Serial.print("Relay ");
    Serial.print(load + 1);
    Serial.println(relayEnabled[load] ? " ON" : " OFF");
  } else if (command == "reset") {
    for (uint8_t i = 0; i < LOAD_COUNT; i++) {
      energyWh[i] = 0.0f;
    }
    Serial.println("Energy counters reset");
  } else if (command.length() > 0) {
    printHelp();
  }
}

static Measurement sampleLoad(uint8_t load) {
  Measurement result = {};
  result.load = load;

  const uint8_t currentChannel = MUX_CURRENT_CHANNEL[load];
  const uint32_t startMs = millis();
  uint32_t nextProcessMs = startMs + 250;
  double sumV2 = 0.0;
  double sumI2 = 0.0;
  double sumP = 0.0;
  uint32_t samples = 0;

  while ((millis() - startMs) < SAMPLE_WINDOW_MS) {
    const float voltageSensor = readZmptVolts() - SENSOR_BIAS_VOLTS;
    float currentSensor = readMuxVolts(currentChannel) - SENSOR_BIAS_VOLTS;

    if (!relayEnabled[load]) {
      currentSensor = 0.0f;
    }

    const float gridVoltage = voltageSensor * VOLTAGE_SCALE;
    const float gridCurrent = currentSensor / CURRENT_SENSOR_RMS_VOLTS_PER_AMP;

    sumV2 += (double)gridVoltage * (double)gridVoltage;
    sumI2 += (double)gridCurrent * (double)gridCurrent;
    sumP += (double)gridVoltage * (double)gridCurrent;
    samples++;

    if ((int32_t)(millis() - nextProcessMs) >= 0) {
      processSerial();
      pollWallSwitches();
      nextProcessMs += 250;
    }

    delayMicroseconds(SAMPLE_INTERVAL_US);
  }

  result.samples = samples;
  result.elapsedMs = millis() - startMs;

  if (samples > 0) {
    result.vrms = sqrt(sumV2 / samples);
    result.irms = sqrt(sumI2 / samples);
    result.pavgWatts = sumP / samples;
    result.apparentVa = result.vrms * result.irms;
  }

  if (!isfinite(result.pavgWatts)) {
    result.pavgWatts = 0.0f;
  }

  energyWh[load] += result.pavgWatts * ((float)result.elapsedMs / 3600000.0f);
  return result;
}

static void printMeasurement(const Measurement &m) {
  Serial.print("LOAD");
  Serial.print(m.load + 1);
  Serial.print("  Vrms=");
  Serial.print(m.vrms, 2);
  Serial.print("V  Irms=");
  Serial.print(m.irms, 3);
  Serial.print("A  Pavg=");
  Serial.print(m.pavgWatts, 2);
  Serial.print("W  VA=");
  Serial.print(m.apparentVa, 2);
  Serial.print("  Wh=");
  Serial.print(energyWh[m.load], 5);
  Serial.print("  kWh=");
  Serial.print(energyWh[m.load] / 1000.0f, 8);
  Serial.print("  Samples=");
  Serial.print(m.samples);
  Serial.print("  Relay=");
  Serial.print(relayEnabled[m.load] ? "ON" : "OFF");
  Serial.print("  Switch=");
  Serial.println(wallSwitchClosed[m.load] ? "ON" : "OFF");
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(PIN_MUX_A, OUTPUT);
  pinMode(PIN_MUX_B, OUTPUT);
  pinMode(PIN_MUX_C, OUTPUT);
  pinMode(PIN_ADC_MUX, INPUT);
  pinMode(PIN_ADC_ZMPT, INPUT);
  for (uint8_t i = 0; i < LOAD_COUNT; i++) {
    pinMode(PIN_RELAY[i], OUTPUT);
    pinMode(PIN_WALL_SWITCH[i], INPUT_PULLUP);
    wallSwitchClosed[i] = readWallSwitchClosed(i);
    lastWallSwitchReading[i] = wallSwitchClosed[i];
  }

#ifdef ARDUINO_ARCH_ESP32
  analogReadResolution(12);
#endif

  writeRelays();

  Serial.println("AC Power Monitoring ESP32-S3 Reference Layout Simulation");
  Serial.println("CD4051 COM ADC: GPIO36, select A=GPIO42 B=GPIO41 C=GPIO40");
  Serial.println("CD4051 channels: C0-C3=current sensors");
  Serial.println("ZMPT101B voltage sensor OUT: GPIO10");
  Serial.println("Relays: LOAD1=GPIO39, LOAD2=GPIO38, LOAD3=GPIO37, LOAD4=GPIO35");
  Serial.println("Wall switches: LOAD1=GPIO30, LOAD2=GPIO31, LOAD3=GPIO32, LOAD4=GPIO33");
  if (supabaseConfigured()) {
    Serial.println("Supabase sync enabled");
    supabaseSeedCircuits();
    supabasePollRelays(true);
  } else {
    Serial.println("Supabase sync disabled. Set ENABLE_SUPABASE=true, SUPABASE_URL, and SUPABASE_ANON_KEY to enable it.");
  }
  printHelp();
}

void loop() {
  for (uint8_t load = 0; load < LOAD_COUNT; load++) {
    processSerial();
    pollWallSwitches();
    Measurement measurement = sampleLoad(load);
    printMeasurement(measurement);
    supabasePostMeasurement(measurement);
    supabasePollRelays();
  }
}
