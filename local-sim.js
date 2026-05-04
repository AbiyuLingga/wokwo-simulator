#!/usr/bin/env node

const readline = require("readline");

const loads = [
  { current: 1.2, relay: true, wh: 0 },
  { current: 1.8, relay: true, wh: 0 },
];

const voltageRms = 220;
const sampleWindowMs = 5000;
let lastTick = Date.now();
let currentLoadIndex = 0;

function help() {
  console.log("");
  console.log("Commands: on | off | toggle | reset | on1 | off1 | toggle1 | on2 | off2 | toggle2 | help | quit");
  console.log("Output: LOAD Vrms Irms Pavg VA Wh kWh Relay");
  console.log("");
}

function printMeasurement(index, elapsedMs) {
  const load = loads[index];
  const irms = load.relay ? load.current : 0;
  const pavgWatts = voltageRms * irms;
  const va = voltageRms * irms;
  load.wh += pavgWatts * (elapsedMs / 3600000);

  console.log(
    `LOAD${index + 1}` +
      `  Vrms=${voltageRms.toFixed(2)}V` +
      `  Irms=${irms.toFixed(3)}A` +
      `  Pavg=${pavgWatts.toFixed(2)}W` +
      `  VA=${va.toFixed(2)}` +
      `  Wh=${load.wh.toFixed(5)}` +
      `  kWh=${(load.wh / 1000).toFixed(8)}` +
      `  Samples=${sampleWindowMs}` +
      `  Relay=${load.relay ? "ON" : "OFF"}`
  );
}

function setAll(value) {
  loads.forEach((load) => {
    load.relay = value;
  });
}

function toggleAll() {
  loads.forEach((load) => {
    load.relay = !load.relay;
  });
}

function handleCommand(input) {
  const command = input.trim().toLowerCase();
  if (!command) return;

  if (command === "on") {
    setAll(true);
    console.log("All relays ON");
  } else if (command === "off") {
    setAll(false);
    console.log("All relays OFF");
  } else if (command === "toggle") {
    toggleAll();
    console.log("All relays toggled");
  } else if (command === "reset") {
    loads.forEach((load) => {
      load.wh = 0;
    });
    console.log("Energy counters reset");
  } else if (/^(on|off|toggle)[12]$/.test(command)) {
    const index = Number(command.at(-1)) - 1;
    if (command.startsWith("on")) loads[index].relay = true;
    if (command.startsWith("off")) loads[index].relay = false;
    if (command.startsWith("toggle")) loads[index].relay = !loads[index].relay;
    console.log(`Relay ${index + 1} ${loads[index].relay ? "ON" : "OFF"}`);
  } else if (command === "help") {
    help();
  } else if (command === "quit" || command === "exit") {
    process.exit(0);
  } else {
    help();
  }
}

function tick() {
  const now = Date.now();
  const elapsedMs = now - lastTick;
  lastTick = now;
  printMeasurement(currentLoadIndex, elapsedMs);
  currentLoadIndex = (currentLoadIndex + 1) % loads.length;
}

console.log("AC Power Monitoring ESP32-S3 Local Simulation");
console.log("This is a local logic/sensor-output simulation, not the Wokwi MCU/circuit engine.");
help();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

rl.on("line", handleCommand);
setInterval(tick, sampleWindowMs);
