# AC Power Monitoring ESP32-S3 Wokwi Simulation

Browser and Wokwi simulation for an ESP32-S3 AC power monitor with two relay-controlled loads. The project measures voltage and current waveforms, calculates real average power from instantaneous samples, tracks energy, and can optionally sync readings and relay commands through Supabase.

> Safety note: this is a safe simulation. The Wokwi circuit uses custom sensor chips and analog-level signals; it does not put real 220V mains onto MCU wires.

This version follows the visual layout in `circuit_image (1).png`: ESP32-S3 on the left, CD4051 near the ESP32, two AC/load branches, two ZMPT101B voltage sensors, two ACS712-style current sensors, and two relay modules.

Wokwi does not provide the same photo-style ZMPT101B, ACS712, fan, or AC source modules from the Circuit Designer screenshot, so those parts are represented as free Wokwi custom chips. The simulation stays safe: it does not put real 220V mains into Wokwi analog wires.

For detailed continuation notes for the next AI agent, see [`AI_HANDOFF.md`](AI_HANDOFF.md).

## Features

- ESP32-S3 firmware for two independent relay loads.
- CD4051B analog multiplexer model for current and voltage sensor channels.
- ZMPT101B-style voltage sensor and ACS712-style current sensor custom chips.
- Real power calculation from `Pavg = average(V(t) * I(t))`.
- 5-second sampling window per load, measured sequentially.
- Browser simulator with draggable wiring, relay controls, waveform charts, and Pavg graph.
- Optional Supabase dashboard for live readings and relay control.

## Quick Start

Run the browser simulator locally:

```bash
cd ~/computing/ac-power-wokwi-sim
python3 -m http.server 8000
```

Open:

```text
http://127.0.0.1:8000/web-simulator.html
```

For the Supabase dashboard:

```text
http://127.0.0.1:8000/supabase-dashboard.html
```

## Files Used By The Reference Layout

- `sketch.ino` - ESP32-S3 firmware for two relay-controlled loads.
- `diagram.json` - Wokwi layout arranged to match the reference image.
- `cd4051b.chip.c/json` - analog CD4051B multiplexer model.
- `zmpt101b.chip.c/json` - ZMPT101B-style 0-5V voltage sensor output.
- `acs712.chip.c/json` - ACS712-style 0-5V current sensor output.
- `ac-main.chip.c/json` - visual AC L/N source and relay state signal.
- `fan-load.chip.c/json` - visual fan/load endpoint.
- `supabase-dashboard.html/css/js` - simple browser dashboard for Supabase readings and relay control.
- `supabase/schema.sql` - Supabase tables, indexes, RLS policies, and starter circuit rows.

`ac-power-source.chip.c/json` is the older compact simulator source and is no longer used by the reference-image diagram.

## How To Run In Wokwi

1. Open https://wokwi.com/projects/new/esp32-s3
2. Replace the generated `sketch.ino` with the local `sketch.ino`.
3. Replace the generated `diagram.json` with the local `diagram.json`.
4. Add these custom chip file pairs as Wokwi tabs:
   - `cd4051b.chip.json`
   - `cd4051b.chip.c`
   - `zmpt101b.chip.json`
   - `zmpt101b.chip.c`
   - `acs712.chip.json`
   - `acs712.chip.c`
   - `ac-main.chip.json`
   - `ac-main.chip.c`
   - `fan-load.chip.json`
   - `fan-load.chip.c`
5. If Wokwi automatically adds extra unconnected custom chip blocks when you create the chip files, delete those duplicate blocks from the diagram.
6. Start the simulation and open Serial Monitor.

Serial commands:

- `on` - enable both loads.
- `off` - disable both loads.
- `toggle` - toggle both loads.
- `on1`, `off1`, `toggle1` - control load 1.
- `on2`, `off2`, `toggle2` - control load 2.
- `reset` - reset Wh/kWh counters.

## Supabase Dashboard

This project now supports an optional Supabase loop:

1. ESP32/Wokwi posts each load measurement to `power_readings`.
2. The dashboard reads the latest measurement per `relay_index`.
3. The dashboard updates `circuits.relay_on` when you switch a relay on/off.
4. ESP32/Wokwi polls `circuits` and applies the relay state to GPIO39/GPIO38.

Setup:

1. Create a Supabase project.
2. Open the Supabase SQL editor and run `supabase/schema.sql`.
3. In `sketch.ino`, set:
   - `ENABLE_SUPABASE = true`
   - `SUPABASE_URL = "https://your-project-id.supabase.co"`
   - `SUPABASE_ANON_KEY = "your anon public key"`
4. Run the Wokwi simulation.
5. Serve this folder locally:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/supabase-dashboard.html
```

Paste the same Supabase URL and anon key into the dashboard, then press `Connect`.

The dashboard shows:

- active power per circuit/load,
- accumulated Wh/kWh energy,
- hourly cost estimate from `power_watts / 1000 * tariff_idr_per_kwh`,
- relay state and on/off controls.

The SQL policies are intentionally permissive for a simple Wokwi/browser demo because both the browser and ESP32 use the anon key. Do not use these policies unchanged for a public production device.

## Local Fallback Without Wokwi

If Wokwi servers are full, you can still test the relay commands and serial-style measurement output locally:

```bash
node local-sim.js
```

This does not emulate the ESP32-S3 CPU or Wokwi circuit engine. It is a local logic/sensor-output simulation that mirrors the expected Serial Monitor behavior, including `on`, `off`, `toggle`, `reset`, `on1`, `off1`, `toggle1`, `on2`, `off2`, and `toggle2`.

You can also open the local web simulator:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/web-simulator.html
```

The web simulator is still project-specific. It does not reverse engineer or replace the full Wokwi MCU/circuit engine.

## Pavg Measurement

The firmware does not use power factor as an input. For each load, it samples the voltage and current channels for `SAMPLE_WINDOW_MS = 5000`, accumulates instantaneous power with `P = V(t) * I(t)`, then reports:

```text
Pavg = sum(P) / samples
```

With two loads, the main loop measures load 1 for about 5 seconds, then load 2 for about 5 seconds. The full refresh cycle is therefore about 10 seconds.

This method is the right basis for real power as long as voltage and current waveforms are sampled with correct calibration and minimal timing skew. In this no-PF simulator model, the generated current waveform is in phase with voltage and the load current is calculated from fan resistance with `I = V / R`; for real inductive/capacitive loads, the real sensors must provide the actual phase relationship and the firmware will still compute Pavg from `V(t) * I(t)`.

Editor behavior in the web simulator:

- Drag a component to move it. Existing wires stay attached to their pin anchors and the endpoint segments stay horizontal/vertical instead of becoming diagonal.
- Use `+`, `-`, or Ctrl + mouse wheel to zoom.
- Use `Auto` to reset spacing and reroute cables into separate lanes.
- Each load card changes the fan resistor value; Irms and Pavg are calculated from that resistance instead of being edited directly.
- Auto-routed wires add a short perpendicular pin stub first, then avoid other component bodies by detouring around their sides when possible.
- Click the wire tool, click one pin, then click another pin to add a wire.
- ESP32 header pins are labeled directly on yellow board pads, and other component pin anchors are shown during wire editing.
- Wires render behind the components, with routes that try to avoid component bodies where possible.
- Choose a wire color from the inspector before connecting pins.
- Click a wire and press Delete/Backspace, or use the `x` button, to remove it.
- Click a wire to show small blue route boxes at the center of each straight cable segment.
- A selected wire shows labels for its start and destination pins.
- Drag a blue box to move only that straight cable segment.
- If the moved segment touches a pin endpoint, the editor adds a small elbow so the pin connection stays attached and the moved segment remains straight.
- Double-click a wire to add a new route point on that wire.
- Drag a selected wire to move its route points together while the endpoints stay connected.
- Pin anchors are hidden during normal viewing and appear during wire editing or selection.
- Each load card shows a live V(t)/I(t) waveform while that load is being measured, plus a Pavg graph that updates from `sum(V * I) / samples` during the 5-second measurement window.

## Reference Pin Map

- CD4051 COM ADC: GPIO36.
- CD4051 select A/B/C: GPIO2, GPIO42, GPIO41.
- Relay load 1: GPIO39.
- Relay load 2: GPIO38.
- CD4051 C0/C1: ACS712/ZMPT101B for load 1.
- CD4051 C2/C3: ACS712/ZMPT101B for load 2.

Important: GPIO36 is used because it appears in `circuit_image (1).png`. On real ESP32-S3 hardware, ADC-capable pins are GPIO1-GPIO20. If the simulation or hardware keeps reading zero from GPIO36, move CD4051 COM and `PIN_ADC_MUX` to an ADC-capable pin such as GPIO4 or GPIO5.

## Calibration Model

The default model uses:

- 220V RMS mains represented as 0.80V RMS around a 2.5V ADC bias.
- Current sensors represented as 0.08V RMS per amp around the same bias.
- Current sensor waveforms are generated from the fan resistor value and stay in phase with the voltage waveform; no power-factor input is used.
- Two relay-controlled loads.

For real hardware, recalibrate `ADC_REF_VOLTS`, `VOLTAGE_SENSOR_RMS_AT_220V`, and `CURRENT_SENSOR_RMS_VOLTS_PER_AMP` in `sketch.ino` based on actual ADC range, ZMPT101B trim-pot gain, and current-sensor calibration.
