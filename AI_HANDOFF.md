# AI Handoff - AC Power Wokwi Sim

Tanggal konteks: 2026-05-04

Dokumen ini adalah pegangan untuk AI berikutnya yang melanjutkan proyek `ac-power-wokwi-sim`. Isinya merangkum keputusan teknis terbaru, file penting, cara menjalankan, dan hal yang tidak boleh diregresikan.

## Tujuan Proyek

Project ini mensimulasikan monitoring daya AC berbasis ESP32-S3 di Wokwi dan browser lokal. Sistem mengukur 2 beban relay secara bergantian, masing-masing selama 5 detik, lalu menghitung:

- `Vrms`
- `Irms`
- `Pavg`
- `VA`
- `Wh` / `kWh`
- estimasi biaya energi

Keputusan utama user: jangan memakai power factor (PF) sebagai input untuk menghitung daya. `Pavg` harus dihitung dari rata-rata daya instan:

```text
Pavg = average(V(t) * I(t))
```

Pada simulator resistif saat ini, V dan I dibuat sefase. PF boleh muncul sebagai nilai turunan/diagnostik, tetapi bukan input utama perhitungan.

## Struktur File

- `sketch.ino` - firmware ESP32-S3 untuk Wokwi, termasuk sampling 5 detik, relay, command serial, dan Supabase opsional.
- `diagram.json` - layout Wokwi utama.
- `cd4051b.chip.c/json` - model analog multiplexer CD4051B.
- `zmpt101b.chip.c/json` - model sensor tegangan 0-5V dengan bias sekitar 2.5V.
- `acs712.chip.c/json` - model sensor arus 0-5V dengan bias sekitar 2.5V.
- `ac-main.chip.c/json` dan `ac-mains.chip.c/json` - chip visual sumber AC.
- `fan-load.chip.c/json` - chip visual beban fan.
- `ac-power-source.chip.c/json` - sumber AC lama/kompak, bukan fokus layout referensi terbaru.
- `web-simulator.html/css/js` - simulator browser lokal dengan editor wiring, relay, grafik waveform, dan grafik Pavg.
- `local-sim.js` - simulator Node sederhana. Masih memakai model arus fixed, belum sama dengan model resistor di web simulator.
- `supabase-dashboard.html/css/js` - dashboard Supabase untuk readings dan kontrol relay.
- `supabase/schema.sql` - schema Supabase, RLS demo, dan starter rows.

## Cara Menjalankan

### Wokwi

Gunakan file ini di Wokwi:

- `diagram.json`
- `sketch.ino`
- pasangan custom chip `*.chip.c` dan `*.chip.json`

Start simulasi lalu buka Serial Monitor. Output utama keluar dari firmware.

### Simulator Web Lokal

Buka langsung:

```text
web-simulator.html
```

Jika browser membatasi akses file lokal, jalankan server statis dari folder project:

```bash
python3 -m http.server 8000
```

Lalu buka:

```text
http://127.0.0.1:8000/web-simulator.html
```

### Simulator Node

```bash
node local-sim.js
```

Catatan: ini fallback sederhana. Untuk perilaku terbaru seperti resistor slider, waveform sinusoidal, Pavg live graph, dan wiring editor, gunakan simulator web.

### Supabase Dashboard

1. Jalankan SQL di `supabase/schema.sql`.
2. Buka `supabase-dashboard.html`.
3. Masukkan Supabase URL dan anon key.
4. Hubungkan dengan firmware jika `ENABLE_SUPABASE` diaktifkan.

Di `sketch.ino`, Supabase default masih nonaktif:

```cpp
constexpr bool ENABLE_SUPABASE = false;
```

Jika ingin aktif:

```cpp
constexpr bool ENABLE_SUPABASE = true;
```

Isi juga:

```cpp
SUPABASE_URL
SUPABASE_ANON_KEY
```

## Model Pengukuran

Keputusan terbaru dari user:

- Tidak memakai input PF.
- Satu load diukur penuh selama 5 detik.
- Setelah load 1 selesai 5 detik, baru load 2 diukur selama 5 detik.
- Jangan mengeluarkan dua hasil load dalam waktu yang sama.
- Total refresh penuh untuk 2 load sekitar 10 detik.
- Jika relay OFF, grafik dan sampling load itu harus berhenti/clear.

Alur firmware:

```text
load 1 -> sampling 5 detik -> print hasil
load 2 -> sampling 5 detik -> print hasil
ulang
```

Alur simulator web:

```text
currentLoadIndex 0 -> activeWindow 5 detik -> render hasil
currentLoadIndex 1 -> activeWindow 5 detik -> render hasil
ulang
```

## Detail Firmware

File utama: `sketch.ino`.

Konstanta penting:

```cpp
constexpr uint8_t LOAD_COUNT = 2;
constexpr uint8_t PIN_ADC_MUX = 36;
constexpr uint8_t MUX_SELECT_PINS[3] = {2, 42, 41};
constexpr uint8_t RELAY_PINS[LOAD_COUNT] = {39, 38};
constexpr uint8_t CURRENT_CHANNELS[LOAD_COUNT] = {0, 2};
constexpr uint8_t VOLTAGE_CHANNELS[LOAD_COUNT] = {1, 3};
constexpr uint32_t SAMPLE_WINDOW_MS = 5000;
constexpr uint32_t SAMPLE_INTERVAL_US = 1000;
```

Catatan hardware nyata: firmware memakai `PIN_ADC_MUX = 36` untuk konteks simulasi sekarang. Untuk ESP32-S3 nyata, ADC umumnya ada di GPIO1-GPIO20. Jika dipindah ke hardware, pindahkan ADC mux ke pin ADC valid seperti GPIO4/GPIO5 dan update wiring.

Kalibrasi penting:

```text
ADC_REF_VOLTS = 5.0
ADC_MAX_COUNTS = 4095
SENSOR_BIAS_VOLTS = 2.5
VOLTAGE_SENSOR_RMS_AT_220V = 0.80
CURRENT_SENSOR_RMS_VOLTS_PER_AMP = 0.08
```

Perhitungan utama:

```text
voltageSensor = readMuxVoltage(voltageChannel) - bias
currentSensor = readMuxVoltage(currentChannel) - bias
gridVoltage = voltageSensor * voltageScale
gridCurrent = currentSensor * currentScale
instantPower = gridVoltage * gridCurrent
Pavg = sum(instantPower) / samples
```

Output serial:

```text
LOADx Vrms Irms Pavg VA Wh kWh Samples Relay
```

Perintah serial:

```text
on
off
toggle
reset
on1
off1
toggle1
on2
off2
toggle2
```

Jawaban praktis jika user bertanya cara mematikan satu relay:

- `off1` mematikan relay/load 1.
- `off2` mematikan relay/load 2.
- `on1` / `on2` menyalakan lagi.

## Detail Simulator Web

File utama: `web-simulator.js`.

State load terbaru:

```js
const loads = [
  { resistanceOhms: 183.3, relay: true, wh: 0, readings: null },
  { resistanceOhms: 122.2, relay: true, wh: 0, readings: null },
];
```

Model arus:

```text
I_rms = V_rms / R
```

Parameter waktu:

```js
const sampleWindowMs = 5000;
const acFrequencyHz = 50;
const graphSampleIntervalMs = 2;
const graphRenderIntervalMs = 50;
const waveformDisplayMs = 220;
```

Fungsi penting:

- `tick()` - mengatur window 5 detik per load, menyimpan hasil, lalu pindah ke load berikutnya.
- `graphLoop()` - menggambar waveform real-time saat simulator berjalan.
- `instantSample(index, elapsedMs)` - menghasilkan sample sinusoidal V(t), I(t), dan P(t). Jika relay OFF, output harus 0.
- `clearLoadCharts(index)` - membersihkan waveform dan Pavg graph load terkait.
- `startMeasurementWindow(index)` - memulai window sampling baru.
- `handleCommand(command)` - menangani command relay dan reset.

## Grafik

User meminta grafik yang membaca voltase dan arus real-time selama 5 detik, sehingga membentuk sinusoidal, bukan hanya titik-titik hasil akhir.

Status terbaru:

- Grafik waveform menampilkan V(t) dan I(t) live.
- V dan I dipisahkan supaya tidak bertabrakan:
  - voltage di lane atas
  - current di lane bawah
- Ada grafik Pavg yang berubah dari akumulasi `sumP / samples`.
- Saat relay OFF, grafik load terkait harus clear/berhenti.

Jangan regresi ke:

- grafik hanya titik-titik
- V dan I saling menutup pada baseline yang sama
- grafik tetap berjalan saat relay OFF
- dua load dihitung dalam satu window yang sama

## Wiring dan Editor Browser

Permintaan user terbaru:

- wiring harus jauh lebih rapi
- kabel jangan melewati atas komponen jika bisa dihindari
- kurangi kabel yang saling tumpang tindih
- beri label pin pada ESP32
- kabel harus tersambung ke kotak kuning pin ESP32, bukan bulat di samping pin

Status terbaru:

- ESP32 punya labelled pads di HTML untuk `3V3`, `5V`, `GND`, `TX`, `RX`, `2`, `42`, `41`, `36`, `38`, dan `39`.
- `pinMap` ESP32 diarahkan ke edge pad kuning.
- Anchor dot komponen disembunyikan dalam mode normal.
- Anchor dot muncul saat wire mode aktif.
- Kabel dirender di belakang komponen.
- Routing otomatis memakai jalur sekitar komponen dan pin stub pendek.

CSS penting:

```css
.wire-layer {
  z-index: 1;
}

.part {
  z-index: 2;
}

.pin-anchor {
  display: none;
}

.wire-mode .pin-anchor,
.pin-anchor.selected {
  display: flex;
}
```

Jika mengubah posisi ESP32 atau pin:

1. Update markup pad di `web-simulator.html`.
2. Update `pinMap` di `web-simulator.js`.
3. Pastikan `renderPinAnchors()` tetap sejajar dengan pad.
4. Pastikan kabel ESP masuk ke kotak kuning pad.

Jika mengubah routing kabel, cek bagian ini di `web-simulator.js`:

- `routeForWire()`
- `espMuxRoutes`
- `controlRoutes`
- `acRoutes`
- `hiddenDirectSupplyWires`
- `partSizes`
- helper obstacle/routing

## Supabase

Schema ada di `supabase/schema.sql`.

Tabel `circuits`:

- `relay_index`
- `name`
- `relay_on`
- `tariff_idr_per_kwh`
- `command_nonce`
- `updated_at`

Tabel `power_readings`:

- `id`
- `relay_index`
- `voltage_rms`
- `current_rms`
- `power_watts`
- `apparent_va`
- `power_factor`
- `energy_wh`
- `relay_on`
- `estimated_cost_idr_per_hour`
- `measured_at`

Starter row:

```sql
insert into public.circuits (relay_index, name, relay_on, tariff_idr_per_kwh)
values
  (1, 'Relay 1', true, 1444.70),
  (2, 'Relay 2', true, 1444.70);
```

RLS policy saat ini permisif untuk demo. Jangan pakai apa adanya untuk produksi tanpa authentication dan policy yang lebih ketat.

Firmware post readings ke:

```text
/rest/v1/power_readings
```

Firmware poll relay dari:

```text
/rest/v1/circuits?select=relay_index,relay_on&order=relay_index.asc
```

## Batasan dan Gotcha

- `local-sim.js` masih model lama dengan arus fixed. Jika user meminta konsistensi penuh, samakan dengan model resistor di web simulator.
- `PIN_ADC_MUX = 36` harus dipertimbangkan ulang untuk hardware ESP32-S3 nyata.
- Jangan mengembalikan input PF sebagai requirement.
- Jangan membuat dua output load dalam waktu yang sama.
- Jangan membuat grafik hanya berupa titik hasil akhir.
- Jangan biarkan grafik tetap jalan setelah relay OFF.
- Jangan membuat kabel browser kembali melewati atas komponen jika bisa diroute di belakang/sekitar komponen.
- README lebih ringkas; dokumen ini adalah rujukan lanjutan yang lebih detail.

## Validasi Cepat

Untuk perubahan JavaScript:

```bash
node --check web-simulator.js
node --check local-sim.js
```

Untuk validasi JSON:

```bash
node -e "JSON.parse(require('fs').readFileSync('diagram.json','utf8')); console.log('diagram ok')"
```

Untuk smoke test browser headless jika tersedia:

```bash
google-chrome --headless --disable-gpu --screenshot=/tmp/ac-power-wokwi-sim.png file:///home/abiyulinx/computing/ac-power-wokwi-sim/web-simulator.html
```

Untuk firmware, validasi terbaik tetap lewat Wokwi karena custom chip dan Arduino core ESP32-S3 dijalankan di sana.

## Prioritas Jika Melanjutkan

1. Pertahankan `sketch.ino` sebagai sumber utama logika pengukuran 5 detik per load.
2. Jika memperbaiki simulator web, samakan perilaku dengan firmware.
3. Jika user bertanya soal relay, jawab dengan command spesifik `off1`, `off2`, `on1`, atau `on2`.
4. Jika user meminta grafik, cek langsung waveform V/I lane dan Pavg graph.
5. Jika user meminta wiring, cek visual browser, bukan hanya struktur data kabel.
6. Jika user meminta integrasi hardware nyata, revisi pin ADC dan kalibrasi sensor terlebih dahulu.
