const storageKey = "ac-power-supabase-dashboard";
const pollMs = 3000;

const state = {
  config: loadConfig(),
  circuits: [],
  readings: [],
  pollTimer: null,
};

const elements = {
  form: document.querySelector("#connectionForm"),
  url: document.querySelector("#supabaseUrl"),
  anonKey: document.querySelector("#supabaseAnonKey"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  refreshButton: document.querySelector("#refreshButton"),
  seedButton: document.querySelector("#seedButton"),
  allOnButton: document.querySelector("#allOnButton"),
  allOffButton: document.querySelector("#allOffButton"),
  circuitGrid: document.querySelector("#circuitGrid"),
  template: document.querySelector("#circuitCardTemplate"),
  totalPower: document.querySelector("#totalPower"),
  totalEnergy: document.querySelector("#totalEnergy"),
  totalCost: document.querySelector("#totalCost"),
  lastRefresh: document.querySelector("#lastRefresh"),
};

const idrFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 2,
});

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

function saveConfig(config) {
  state.config = config;
  localStorage.setItem(storageKey, JSON.stringify(config));
}

function normalizeUrl(url) {
  return url.trim().replace(/\/+$/, "");
}

function hasConfig() {
  return Boolean(state.config.supabaseUrl && state.config.anonKey);
}

function setStatus(kind, text) {
  elements.statusDot.classList.toggle("ok", kind === "ok");
  elements.statusDot.classList.toggle("error", kind === "error");
  elements.statusText.textContent = text;
}

function headers(extra = {}) {
  return {
    apikey: state.config.anonKey,
    Authorization: `Bearer ${state.config.anonKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function supabaseFetch(path, options = {}) {
  if (!hasConfig()) {
    throw new Error("Supabase URL dan anon key belum diisi.");
  }

  const response = await fetch(`${state.config.supabaseUrl}${path}`, {
    ...options,
    headers: headers(options.headers),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Supabase request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function formatWatts(value) {
  return `${numberFormatter.format(Number(value) || 0)} W`;
}

function formatWh(value) {
  const wh = Number(value) || 0;
  if (wh >= 1000) {
    return `${numberFormatter.format(wh / 1000)} kWh`;
  }
  return `${numberFormatter.format(wh)} Wh`;
}

function formatAmp(value) {
  return `${(Number(value) || 0).toFixed(3)} A`;
}

function formatVolt(value) {
  return `${numberFormatter.format(Number(value) || 0)} V`;
}

function formatVa(value) {
  return `${numberFormatter.format(Number(value) || 0)} VA`;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function latestReadingsByRelay() {
  const map = new Map();
  state.readings.forEach((reading) => {
    if (!map.has(reading.relay_index)) {
      map.set(reading.relay_index, reading);
    }
  });
  return map;
}

function hourlyCost(powerWatts, tariffIdrPerKwh) {
  return ((Number(powerWatts) || 0) / 1000) * (Number(tariffIdrPerKwh) || 0);
}

function updateSummary(latestMap) {
  let totalPower = 0;
  let totalEnergy = 0;
  let totalCost = 0;
  let lastTimestamp = null;

  state.circuits.forEach((circuit) => {
    const reading = latestMap.get(circuit.relay_index);
    totalPower += Number(reading?.power_watts) || 0;
    totalEnergy += Number(reading?.energy_wh) || 0;
    totalCost += hourlyCost(reading?.power_watts, circuit.tariff_idr_per_kwh);
    if (reading?.measured_at && (!lastTimestamp || reading.measured_at > lastTimestamp)) {
      lastTimestamp = reading.measured_at;
    }
  });

  elements.totalPower.textContent = formatWatts(totalPower);
  elements.totalEnergy.textContent = formatWh(totalEnergy);
  elements.totalCost.textContent = idrFormatter.format(totalCost);
  elements.lastRefresh.textContent = lastTimestamp ? formatDate(lastTimestamp) : "-";
}

function renderEmpty(text) {
  elements.circuitGrid.innerHTML = `<div class="empty-state">${text}</div>`;
}

function renderCircuits() {
  const latestMap = latestReadingsByRelay();
  updateSummary(latestMap);
  elements.circuitGrid.textContent = "";

  if (!hasConfig()) {
    renderEmpty("Masukkan Supabase URL dan anon key.");
    return;
  }

  if (state.circuits.length === 0) {
    renderEmpty("Belum ada rangkaian di tabel circuits.");
    return;
  }

  state.circuits.forEach((circuit) => {
    const reading = latestMap.get(circuit.relay_index) || {};
    const card = elements.template.content.firstElementChild.cloneNode(true);
    const relayOn = Boolean(circuit.relay_on);
    const cost = hourlyCost(reading.power_watts, circuit.tariff_idr_per_kwh);

    card.querySelector(".card-kicker").textContent = `Relay ${circuit.relay_index}`;
    card.querySelector("h2").textContent = circuit.name;
    card.querySelector('[data-field="power"]').textContent = formatWatts(reading.power_watts);
    card.querySelector('[data-field="energy"]').textContent = formatWh(reading.energy_wh);
    card.querySelector('[data-field="cost"]').textContent = idrFormatter.format(cost);
    card.querySelector('[data-field="relay"]').textContent = relayOn ? "ON" : "OFF";
    card.querySelector('[data-field="voltage"]').textContent = formatVolt(reading.voltage_rms);
    card.querySelector('[data-field="current"]').textContent = formatAmp(reading.current_rms);
    card.querySelector('[data-field="va"]').textContent = formatVa(reading.apparent_va);
    card.querySelector('[data-field="pf"]').textContent = (Number(reading.power_factor) || 0).toFixed(3);
    card.querySelector('[data-field="time"]').textContent = reading.measured_at
      ? `Data masuk ${formatDate(reading.measured_at)}`
      : "Belum ada data sensor";

    const toggle = card.querySelector(".relay-toggle");
    toggle.textContent = relayOn ? "ON" : "OFF";
    toggle.classList.toggle("on", relayOn);
    toggle.addEventListener("click", () => setRelay(circuit.relay_index, !relayOn));

    const tariffForm = card.querySelector(".tariff-form");
    const tariffInput = tariffForm.elements.tariff;
    tariffInput.value = Number(circuit.tariff_idr_per_kwh || 0).toFixed(2);
    tariffForm.addEventListener("submit", (event) => {
      event.preventDefault();
      updateTariff(circuit.relay_index, Number(tariffInput.value));
    });

    elements.circuitGrid.appendChild(card);
  });
}

async function loadData() {
  if (!hasConfig()) {
    renderCircuits();
    return;
  }

  setStatus("syncing", "Syncing");
  const [circuits, readings] = await Promise.all([
    supabaseFetch("/rest/v1/circuits?select=*&order=relay_index.asc"),
    supabaseFetch("/rest/v1/power_readings?select=*&order=measured_at.desc&limit=200"),
  ]);

  state.circuits = circuits || [];
  state.readings = readings || [];
  renderCircuits();
  setStatus("ok", "Connected");
}

async function refresh() {
  try {
    await loadData();
  } catch (error) {
    setStatus("error", error.message.slice(0, 160));
  }
}

async function seedCircuits() {
  try {
    setStatus("syncing", "Saving");
    await supabaseFetch("/rest/v1/circuits?on_conflict=relay_index", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify([
        { relay_index: 1, name: "Rangkaian 1", relay_on: true, tariff_idr_per_kwh: 1444.7, command_nonce: Date.now() },
        { relay_index: 2, name: "Rangkaian 2", relay_on: true, tariff_idr_per_kwh: 1444.7, command_nonce: Date.now() },
        { relay_index: 3, name: "Rangkaian 3", relay_on: true, tariff_idr_per_kwh: 1444.7, command_nonce: Date.now() },
        { relay_index: 4, name: "Rangkaian 4", relay_on: true, tariff_idr_per_kwh: 1444.7, command_nonce: Date.now() },
      ]),
    });
    await loadData();
  } catch (error) {
    setStatus("error", error.message.slice(0, 160));
  }
}

async function setRelay(relayIndex, relayOn) {
  try {
    setStatus("syncing", "Saving");
    await supabaseFetch(`/rest/v1/circuits?relay_index=eq.${relayIndex}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        relay_on: relayOn,
        command_nonce: Date.now(),
      }),
    });
    await loadData();
  } catch (error) {
    setStatus("error", error.message.slice(0, 160));
  }
}

async function setAllRelays(relayOn) {
  const relayIndexes = state.circuits.map((circuit) => circuit.relay_index);
  for (const relayIndex of relayIndexes) {
    await supabaseFetch(`/rest/v1/circuits?relay_index=eq.${relayIndex}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        relay_on: relayOn,
        command_nonce: Date.now(),
      }),
    });
  }
}

async function updateTariff(relayIndex, tariff) {
  if (!Number.isFinite(tariff) || tariff < 0) {
    setStatus("error", "Tarif tidak valid");
    return;
  }

  try {
    setStatus("syncing", "Saving");
    await supabaseFetch(`/rest/v1/circuits?relay_index=eq.${relayIndex}`, {
      method: "PATCH",
      headers: {
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ tariff_idr_per_kwh: tariff }),
    });
    await loadData();
  } catch (error) {
    setStatus("error", error.message.slice(0, 160));
  }
}

function startPolling() {
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(refresh, pollMs);
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  saveConfig({
    supabaseUrl: normalizeUrl(elements.url.value),
    anonKey: elements.anonKey.value.trim(),
  });
  refresh();
});

elements.refreshButton.addEventListener("click", refresh);
elements.seedButton.addEventListener("click", seedCircuits);
elements.allOnButton.addEventListener("click", async () => {
  try {
    setStatus("syncing", "Saving");
    await setAllRelays(true);
    await loadData();
  } catch (error) {
    setStatus("error", error.message.slice(0, 160));
  }
});
elements.allOffButton.addEventListener("click", async () => {
  try {
    setStatus("syncing", "Saving");
    await setAllRelays(false);
    await loadData();
  } catch (error) {
    setStatus("error", error.message.slice(0, 160));
  }
});

elements.url.value = state.config.supabaseUrl || "";
elements.anonKey.value = state.config.anonKey || "";
renderCircuits();
refresh();
startPolling();
