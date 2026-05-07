# AI Handoff - AC Power Wokwi Sim

Tanggal konteks: 2026-05-07

Dokumen ini adalah pegangan untuk AI berikutnya yang melanjutkan proyek `ac-power-wokwi-sim`. Isinya merangkum keputusan teknis terbaru, file penting, cara menjalankan, dan hal yang tidak boleh diregresikan.

## Tujuan Proyek

Project ini mensimulasikan monitoring daya AC berbasis ESP32-S3 di Wokwi dan browser lokal. Sistem sekarang mengukur 4 beban relay secara bergantian, masing-masing selama 5 detik, dengan 1 sensor tegangan shared dan sensor arus per rangkaian, lalu menghitung:

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
- `web-simulator-3d.js` - 3D WebGL viewer CRUMB-style untuk rangkaian, memakai Three.js lokal, mode 3D default, dan state bridge dari `web-simulator.js`.
- `vendor/three/` - Three.js r172 vendored lokal agar static server tanpa npm/bundler tetap bisa memuat module WebGL.
- `assets/3d/ATTRIBUTION.md` - catatan aset 3D dan sumber referensi.
- `assets/3d/models/fan.glb` - asset kipas internet yang tetap disimpan sebagai referensi, tetapi viewer terbaru memakai kipas rumah procedural karena user meminta kipas rumah, bukan cooling fan kecil.
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

Catatan rollout terakhir: port `8001` sudah pernah terpakai, lalu server aktif dipakai di `8002`:

```bash
python3 -m http.server 8002
```

```text
http://127.0.0.1:8002/web-simulator.html
```

Halaman sekarang membuka mode `3D` secara default. Tombol `2D` di topbar mengembalikan editor wiring 2D lama.

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
- Setelah satu load selesai 5 detik, firmware pindah ke load berikutnya.
- Jangan mengeluarkan beberapa hasil load dalam waktu yang sama.
- Total refresh penuh untuk 4 load sekitar 20 detik.
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
constexpr uint8_t LOAD_COUNT = 4;
constexpr uint8_t PIN_ADC_MUX = 36;
constexpr uint8_t MUX_SELECT_PINS[3] = {42, 41, 40};
constexpr uint8_t RELAY_PINS[LOAD_COUNT] = {39, 38, 37, 35};
constexpr uint8_t WALL_SWITCH_PINS[LOAD_COUNT] = {30, 31, 32, 33};
constexpr uint8_t CURRENT_CHANNELS[LOAD_COUNT] = {0, 1, 2, 3};
constexpr uint8_t SHARED_VOLTAGE_CHANNEL = 7;
constexpr uint32_t SAMPLE_WINDOW_MS = 5000;
constexpr uint32_t SAMPLE_INTERVAL_US = 1000;
```

Catatan hardware nyata: firmware memakai `PIN_ADC_MUX = 36` untuk konteks simulasi sekarang. Untuk ESP32-S3 nyata, ADC umumnya ada di GPIO1-GPIO20. Jika dipindah ke hardware, pindahkan ADC mux ke pin ADC valid seperti GPIO4/GPIO5 dan update wiring. Saklar manual pada GPIO30-GPIO33 harus berupa input low-voltage terisolasi, bukan jalur 220V langsung.

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
on3
off3
toggle3
on4
off4
toggle4
```

Jawaban praktis jika user bertanya cara mematikan satu relay:

- `off1` mematikan relay/load 1.
- `off2` mematikan relay/load 2.
- `off3` dan `off4` mematikan load 3 dan load 4.
- `on1` sampai `on4` menyalakan lagi.

## Detail Simulator Web

File utama 2D/state: `web-simulator.js`.

State load terbaru:

```js
const loads = [
  { resistanceOhms: 183.3, relay: true, wallSwitch: false, wh: 0 },
  { resistanceOhms: 122.2, relay: true, wallSwitch: false, wh: 0 },
  { resistanceOhms: 91.7, relay: true, wallSwitch: false, wh: 0 },
  { resistanceOhms: 73.3, relay: true, wallSwitch: false, wh: 0 },
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
- `window.acPowerSim` - bridge global untuk 3D viewer. Expose `getState()`, `toggleWallSwitch(index)`, `setViewMode(mode)`, dan getter `running/runtimeMs/voltageRms/viewMode`.
- `notifySimulatorStateChanged()` - dispatch event `ac-power-state-change` setelah state visual berubah.

View mode:

- `3D` default, handled oleh `setViewMode("3d")`.
- `2D` menampilkan `.legacy-2d-shell` dan tools wiring lama.
- Tombol `Fit` di mode 3D dispatch `ac-power-3d-reset-camera`; di mode 2D tetap menjalankan `fitCircuit()`.

## Detail 3D Viewer

File utama: `web-simulator-3d.js`.

Implementasi:

- Three.js WebGL renderer dengan `powerPreference: "high-performance"`.
- Import map di `web-simulator.html` mengarah ke `./vendor/three/three.module.js`.
- `OrbitControls` dipakai untuk rotate/zoom/pan kamera.
- Mode 3D memakai state dari `window.acPowerSim`, bukan state terpisah.
- Klik saklar 3D memanggil `window.acPowerSim.toggleWallSwitch(index)`.
- Klik kabel 3D memilih satu kabel dan membuat highlight kuning; status HUD menampilkan label jalur, misalnya `Load 1: ESP.R1 -> Relay.IN`.
- Klik area kosong menghapus pilihan kabel.

Layout 3D terakhir:

- Control area ESP32 + CD4051 di kiri.
- Empat load pod tersusun 2x2.
- Setiap load pod mengelompokkan sensor, relay, kipas rumah besar, dan saklar dinding besar.
- Kipas sekarang procedural household/pedestal fan. Jangan balik ke `fan.glb` cooling fan kecil kecuali user minta.
- `fan.glb` tetap ada di `assets/3d/models/fan.glb` hanya sebagai asset/referensi yang sudah diunduh.

Kabel 3D terbaru:

- Kabel dirender sebagai tube 3D dan tersambung ke pin/terminal tiap komponen.
- Pin yang dimodelkan: AC `L/N`, ACS712 `L IN/L OUT/VCC/OUT/GND`, ZMPT101B `L/N/VCC/OUT/GND`, relay `VCC/GND/IN/NO/COM/NC`, fan `L/N`, switch `SIG/GND`, ESP/control pins, dan MUX channels.
- Kabel horizontal utama diroute lewat bawah board dengan `underBoardWireY`.
- Endpoint tetap naik/turun vertikal pendek ke pin komponen.
- User terakhir meminta menghapus panel tulisan besar `Load 1 pin bawah board`; jangan munculkan panel pin map besar lagi.
- User terakhir meminta kabel jangan terlihat patah tajam. Implementasi memakai `createRoundedPath()` dengan `THREE.QuadraticBezierCurve3` di belokan, sambil tetap mempertahankan arah jalur orthogonal.
- Hitbox kabel dibuat dengan tube transparan yang lebih tebal (`wireHitTargets`) supaya klik kabel lebih mudah.

Fungsi penting 3D:

- `createHouseFan()` - model kipas rumah procedural.
- `createWire(points, color, loadIndex, role, radius, label)` - membuat kabel, hitbox klik, dan metadata label.
- `routeUnderBoard(points)` - menurunkan titik jalur ke layer bawah board.
- `createRoundedPath(vectors)` - membuat belokan smooth pada jalur orthogonal.
- `selectWire(wire)` - set kabel aktif/highlight dan update HUD.
- `updateSwitchHover(event)` - raycast saklar dan kabel.
- `animate(time)` - update orbit controls, animasi kipas, wire glow, dan highlight kabel.

Jangan regresi di 3D:

- Jangan menaruh kabel utama lewat atas board/komponen.
- Jangan mengembalikan panel label besar yang mengganggu.
- Jangan membuat kabel patah siku tajam.
- Jangan menghapus klik kabel/highlight.
- Jangan menghilangkan klik saklar 3D.
- Jangan mengganti kipas rumah besar menjadi cooling fan kecil.
- Jangan membuat 3D state terpisah dari simulator utama.

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
- beberapa load dihitung dalam satu window yang sama

## Wiring dan Editor Browser

Permintaan user terbaru:

- wiring harus jauh lebih rapi
- kabel jangan melewati atas komponen jika bisa dihindari
- kurangi kabel yang saling tumpang tindih
- beri label pin pada ESP32
- kabel harus tersambung ke kotak kuning pin ESP32, bukan bulat di samping pin

Status terbaru:

- ESP32 punya labelled pads di HTML untuk `3V3`, `5V`, `GND`, `TX`, `RX`, `2`, `42`, `41`, `40`, `36`, `38`, dan `39`.
- `pinMap` ESP32 diarahkan ke edge pad kuning.
- Anchor dot komponen disembunyikan dalam mode normal.
- Anchor dot muncul saat wire mode aktif.
- Kabel dirender di belakang komponen.
- Routing otomatis memakai jalur sekitar komponen dan pin stub pendek.
- Catatan: bagian ini khusus 2D editor lama. Untuk 3D, lihat bagian `Detail 3D Viewer`.

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
  (2, 'Relay 2', true, 1444.70),
  (3, 'Relay 3', true, 1444.70),
  (4, 'Relay 4', true, 1444.70);
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
- Untuk 3D viewer, jangan memakai screenshot headless sebagai bukti GPU nyata. Chrome headless di mesin ini pernah fallback dan menulis error VAAPI/Vulkan, tetapi render WebGL tetap berhasil untuk screenshot.
- README lebih ringkas; dokumen ini adalah rujukan lanjutan yang lebih detail.

## Validasi Cepat

Untuk perubahan JavaScript:

```bash
node --check web-simulator.js
node --check web-simulator-3d.js
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

Smoke test static server yang dipakai terakhir:

```bash
python3 -m http.server 8002
google-chrome --headless=new --no-sandbox --enable-gpu --ignore-gpu-blocklist --window-size=1800,1000 --virtual-time-budget=5000 --screenshot=/tmp/ac-sim-3d-smooth-wires.png http://127.0.0.1:8002/web-simulator.html
```

Screenshot terakhir yang berhasil dibuat:

```text
/tmp/ac-sim-3d-smooth-wires.png
```

Untuk firmware, validasi terbaik tetap lewat Wokwi karena custom chip dan Arduino core ESP32-S3 dijalankan di sana.

## Prioritas Jika Melanjutkan

1. Pertahankan `sketch.ino` sebagai sumber utama logika pengukuran 5 detik per load.
2. Jika memperbaiki simulator web, samakan perilaku dengan firmware.
3. Jika user bertanya soal relay, jawab dengan command spesifik `off1` sampai `off4` atau `on1` sampai `on4`.
4. Jika user meminta grafik, cek langsung waveform V/I lane dan Pavg graph.
5. Jika user meminta wiring, cek visual browser, bukan hanya struktur data kabel. Untuk 3D, perhatikan rute bawah board, belokan smooth, dan klik-highlight kabel.
6. Jika user meminta integrasi hardware nyata, revisi pin ADC dan kalibrasi sensor terlebih dahulu.
