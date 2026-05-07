const loads = [
  { resistanceOhms: 183.3, relay: true, wh: 0 },
  { resistanceOhms: 122.2, relay: true, wh: 0 },
];

let voltageRms = 220;
let running = false;
let timer = null;
let runtimeMs = 0;
let zoom = 0.72;
let lastTick = performance.now();
let currentLoadIndex = 0;
let activeWindow = null;
let animationFrame = null;
let lastGraphRenderMs = 0;

const sampleWindowMs = 5000;
const acFrequencyHz = 50;
const graphSampleIntervalMs = 2;
const graphRenderIntervalMs = 50;
const waveformDisplayMs = 220;
const waveformHistory = loads.map(() => []);
const pavgHistory = loads.map(() => []);
const serialOutput = document.querySelector("#serialOutput");
const serialForm = document.querySelector("#serialForm");
const serialInput = document.querySelector("#serialInput");
const runButton = document.querySelector("#runButton");
const runIcon = document.querySelector("#runIcon");
const resetButton = document.querySelector("#resetButton");
const fitButton = document.querySelector("#fitButton");
const zoomInButton = document.querySelector("#zoomInButton");
const zoomOutButton = document.querySelector("#zoomOutButton");
const wireButton = document.querySelector("#wireButton");
const deleteWireButton = document.querySelector("#deleteWireButton");
const autoRouteButton = document.querySelector("#autoRouteButton");
const circuit = document.querySelector("#circuit");
const canvasStage = document.querySelector("#canvasStage");
const dynamicWires = document.querySelector("#dynamicWires");
const wireLabels = document.querySelector("#wireLabels");
const previewWire = document.querySelector("#previewWire");
const statusDot = document.querySelector("#statusDot");
const serialState = document.querySelector("#serialState");
const runtimeText = document.querySelector("#runtimeText");
const voltageText = document.querySelector("#voltageText");
const voltageRange = document.querySelector("#voltageRange");
const wireReadout = document.querySelector("#wireReadout");

const wireColors = {
  red: "var(--wire-red)",
  blue: "var(--wire-blue)",
  black: "var(--wire-black)",
  purple: "var(--wire-purple)",
  orange: "var(--wire-orange)",
  green: "var(--wire-green)",
};

const parts = {
  esp: { x: 70, y: 520 },
  mux: { x: 520, y: 685 },
  ac1: { x: 1010, y: 70 },
  fan1: { x: 1680, y: 90 },
  acs1: { x: 1080, y: 360 },
  zmpt1: { x: 1080, y: 690 },
  relay1: { x: 1480, y: 395 },
  ac2: { x: 1010, y: 1040 },
  fan2: { x: 1680, y: 1070 },
  acs2: { x: 1080, y: 1190 },
  zmpt2: { x: 1080, y: 1515 },
  relay2: { x: 1480, y: 1240 },
  rail: { x: 0, y: 0 },
};

const partSizes = {
  esp: { width: 230, height: 560 },
  mux: { width: 95, height: 220 },
  ac1: { width: 110, height: 110 },
  fan1: { width: 170, height: 170 },
  acs1: { width: 150, height: 190 },
  zmpt1: { width: 150, height: 190 },
  relay1: { width: 152, height: 92 },
  ac2: { width: 110, height: 110 },
  fan2: { width: 170, height: 170 },
  acs2: { width: 150, height: 190 },
  zmpt2: { width: 150, height: 190 },
  relay2: { width: 152, height: 92 },
};

const wireObstaclePadding = 28;
const pinStubLength = 36;

const pinMap = {
  esp: {
    "3V3": { x: 6, y: 102, kind: "power-red" },
    EN: { x: 6, y: 124, kind: "logic" },
    4: { x: 6, y: 146, kind: "logic" },
    5: { x: 6, y: 168, kind: "logic" },
    6: { x: 6, y: 190, kind: "logic" },
    7: { x: 6, y: 212, kind: "logic" },
    15: { x: 6, y: 234, kind: "logic" },
    16: { x: 6, y: 256, kind: "logic" },
    17: { x: 6, y: 278, kind: "logic" },
    18: { x: 6, y: 300, kind: "logic" },
    8: { x: 6, y: 322, kind: "logic" },
    3: { x: 6, y: 344, kind: "logic" },
    46: { x: 6, y: 366, kind: "logic" },
    9: { x: 6, y: 388, kind: "logic" },
    10: { x: 6, y: 410, kind: "logic" },
    11: { x: 6, y: 432, kind: "logic" },
    "5V": { x: 6, y: 500, kind: "power-red" },
    GND: { x: 6, y: 524, kind: "ground" },
    TX: { x: 224, y: 88, kind: "signal" },
    RX: { x: 224, y: 110, kind: "signal" },
    1: { x: 224, y: 132, kind: "logic" },
    2: { x: 224, y: 154, kind: "logic" },
    42: { x: 224, y: 176, kind: "logic" },
    41: { x: 224, y: 198, kind: "logic" },
    40: { x: 224, y: 220, kind: "logic" },
    39: { x: 224, y: 242, kind: "control" },
    38: { x: 224, y: 264, kind: "control" },
    37: { x: 224, y: 286, kind: "logic" },
    36: { x: 224, y: 308, kind: "signal" },
    35: { x: 224, y: 330, kind: "logic" },
    0: { x: 224, y: 352, kind: "logic" },
    45: { x: 224, y: 374, kind: "logic" },
    48: { x: 224, y: 396, kind: "logic" },
    47: { x: 224, y: 418, kind: "logic" },
    21: { x: 224, y: 440, kind: "logic" },
    GND_R: { x: 224, y: 462, kind: "ground", label: "GND" },
  },
  mux: {
    COM: { x: 0, y: 64, kind: "signal" },
    VCC: { x: 0, y: 196, kind: "power-red" },
    GND: { x: 0, y: 172, kind: "ground" },
    VEE: { x: 0, y: 148, kind: "ground" },
    INH: { x: 0, y: 124, kind: "ground" },
    C0: { x: 95, y: 24, kind: "signal" },
    C1: { x: 95, y: 50, kind: "signal" },
    C2: { x: 95, y: 76, kind: "signal" },
    C3: { x: 95, y: 102, kind: "signal" },
    A: { x: 95, y: 150, kind: "logic" },
    B: { x: 95, y: 176, kind: "logic" },
    C: { x: 95, y: 202, kind: "logic" },
  },
  ac1: {
    L: { x: 0, y: 55, kind: "power-red" },
    N: { x: 110, y: 55, kind: "power-blue" },
  },
  fan1: {
    L: { x: 60, y: 170, kind: "power-red" },
    N: { x: 126, y: 170, kind: "power-blue" },
  },
  acs1: {
    LINE_IN: { x: 0, y: 44, kind: "power-red" },
    LINE_OUT: { x: 150, y: 44, kind: "power-red" },
    GND: { x: 40, y: 190, kind: "ground" },
    OUT: { x: 75, y: 190, kind: "signal" },
    VCC: { x: 112, y: 190, kind: "power-red" },
  },
  zmpt1: {
    AC_L: { x: 0, y: 44, kind: "power-red" },
    AC_N: { x: 150, y: 44, kind: "power-blue" },
    GND: { x: 40, y: 190, kind: "ground" },
    OUT: { x: 75, y: 190, kind: "signal" },
    VCC: { x: 112, y: 190, kind: "power-red" },
  },
  relay1: {
    VCC: { x: 0, y: 18, kind: "power-red" },
    GND: { x: 0, y: 46, kind: "ground" },
    IN: { x: 0, y: 72, kind: "control" },
    NO: { x: 152, y: 18, kind: "power-red" },
    COM: { x: 152, y: 46, kind: "power-red" },
    NC: { x: 152, y: 72, kind: "power-red" },
  },
  ac2: {
    L: { x: 0, y: 55, kind: "power-red" },
    N: { x: 110, y: 55, kind: "power-blue" },
  },
  fan2: {
    L: { x: 60, y: 170, kind: "power-red" },
    N: { x: 126, y: 170, kind: "power-blue" },
  },
  acs2: {
    LINE_IN: { x: 0, y: 44, kind: "power-red" },
    LINE_OUT: { x: 150, y: 44, kind: "power-red" },
    GND: { x: 40, y: 190, kind: "ground" },
    OUT: { x: 75, y: 190, kind: "signal" },
    VCC: { x: 112, y: 190, kind: "power-red" },
  },
  zmpt2: {
    AC_L: { x: 0, y: 44, kind: "power-red" },
    AC_N: { x: 150, y: 44, kind: "power-blue" },
    GND: { x: 40, y: 190, kind: "ground" },
    OUT: { x: 75, y: 190, kind: "signal" },
    VCC: { x: 112, y: 190, kind: "power-red" },
  },
  relay2: {
    VCC: { x: 0, y: 18, kind: "power-red" },
    GND: { x: 0, y: 46, kind: "ground" },
    IN: { x: 0, y: 72, kind: "control" },
    NO: { x: 152, y: 18, kind: "power-red" },
    COM: { x: 152, y: 46, kind: "power-red" },
    NC: { x: 152, y: 72, kind: "power-red" },
  },
  rail: {
    V5_TOP: { x: 960, y: 250, kind: "power-red" },
    V5_BOTTOM: { x: 960, y: 1780, kind: "power-red" },
    GND_TOP: { x: 1000, y: 250, kind: "ground" },
    GND_BOTTOM: { x: 1000, y: 1780, kind: "ground" },
    V5_ACS1: { x: 960, y: 550, kind: "power-red" },
    V5_ZMPT1: { x: 960, y: 880, kind: "power-red" },
    V5_RELAY1: { x: 960, y: 413, kind: "power-red" },
    V5_ACS2: { x: 960, y: 1380, kind: "power-red" },
    V5_ZMPT2: { x: 960, y: 1705, kind: "power-red" },
    V5_RELAY2: { x: 960, y: 1258, kind: "power-red" },
    GND_ACS1: { x: 1000, y: 550, kind: "ground" },
    GND_ZMPT1: { x: 1000, y: 880, kind: "ground" },
    GND_RELAY1: { x: 1000, y: 441, kind: "ground" },
    GND_ACS2: { x: 1000, y: 1380, kind: "ground" },
    GND_ZMPT2: { x: 1000, y: 1705, kind: "ground" },
    GND_RELAY2: { x: 1000, y: 1286, kind: "ground" },
  },
};

let selectedWireColor = "red";
let wireMode = false;
let selectedPin = null;
let selectedWireIndex = null;
let segmentDrag = null;
let wireDrag = null;
let stagePan = null;
const pinAnchorElements = new Map();
const wires = [
  { from: "esp:3V3", to: "mux:VCC", color: "red", classes: ["power"], points: [{ x: 405, y: 522 }, { x: 405, y: 771 }, { x: 460, y: 771 }] },
  { from: "esp:GND", to: "mux:GND", color: "black", classes: ["power"], points: [{ x: 375, y: 965 }, { x: 375, y: 747 }, { x: 460, y: 747 }] },
  { from: "esp:GND", to: "mux:VEE", color: "black", classes: ["power"], points: [{ x: 352, y: 965 }, { x: 352, y: 723 }, { x: 460, y: 723 }] },
  { from: "esp:GND", to: "mux:INH", color: "black", classes: ["power"], points: [{ x: 329, y: 965 }, { x: 329, y: 699 }, { x: 460, y: 699 }] },
  { from: "esp:36", to: "mux:COM", color: "purple", classes: ["signal"], points: [{ x: 380, y: 720 }, { x: 380, y: 639 }] },
  { from: "esp:2", to: "mux:A", color: "orange", classes: ["logic"], points: [{ x: 390, y: 544 }, { x: 390, y: 725 }, { x: 555, y: 725 }] },
  { from: "esp:42", to: "mux:B", color: "orange", classes: ["logic"], points: [{ x: 410, y: 570 }, { x: 410, y: 751 }, { x: 555, y: 751 }] },
  { from: "esp:41", to: "mux:C", color: "orange", classes: ["logic"], points: [{ x: 430, y: 596 }, { x: 430, y: 777 }, { x: 555, y: 777 }] },

  { from: "mux:C0", to: "acs1:OUT", color: "purple", classes: ["signal"], points: [{ x: 650, y: 599 }, { x: 650, y: 235 }, { x: 955, y: 235 }, { x: 955, y: 490 }] },
  { from: "mux:C1", to: "zmpt1:OUT", color: "purple", classes: ["signal"], points: [{ x: 675, y: 625 }, { x: 675, y: 545 }, { x: 955, y: 545 }, { x: 955, y: 800 }] },
  { from: "mux:C2", to: "acs2:OUT", color: "purple", classes: ["signal"], points: [{ x: 700, y: 651 }, { x: 700, y: 960 }, { x: 955, y: 960 }, { x: 955, y: 1210 }] },
  { from: "mux:C3", to: "zmpt2:OUT", color: "purple", classes: ["signal"], points: [{ x: 725, y: 677 }, { x: 725, y: 1270 }, { x: 955, y: 1270 }, { x: 955, y: 1510 }] },

  { from: "esp:5V", to: "acs1:VCC", color: "red", classes: ["power"], points: [{ x: 305, y: 930 }, { x: 305, y: 260 }, { x: 1008, y: 260 }, { x: 1008, y: 490 }] },
  { from: "esp:5V", to: "zmpt1:VCC", color: "red", classes: ["power"], points: [{ x: 286, y: 930 }, { x: 286, y: 575 }, { x: 1008, y: 575 }, { x: 1008, y: 800 }] },
  { from: "esp:5V", to: "relay1:VCC", color: "red", classes: ["power"], points: [{ x: 267, y: 930 }, { x: 267, y: 220 }, { x: 1210, y: 220 }, { x: 1210, y: 368 }] },
  { from: "esp:5V", to: "acs2:VCC", color: "red", classes: ["power"], points: [{ x: 248, y: 930 }, { x: 248, y: 990 }, { x: 1008, y: 990 }, { x: 1008, y: 1210 }] },
  { from: "esp:5V", to: "zmpt2:VCC", color: "red", classes: ["power"], points: [{ x: 229, y: 930 }, { x: 229, y: 1288 }, { x: 1008, y: 1288 }, { x: 1008, y: 1510 }] },
  { from: "esp:5V", to: "relay2:VCC", color: "red", classes: ["power"], points: [{ x: 210, y: 930 }, { x: 210, y: 1010 }, { x: 1210, y: 1010 }, { x: 1210, y: 1093 }] },

  { from: "esp:GND", to: "acs1:GND", color: "black", classes: ["power"], points: [{ x: 185, y: 965 }, { x: 185, y: 285 }, { x: 920, y: 285 }, { x: 920, y: 490 }] },
  { from: "esp:GND", to: "zmpt1:GND", color: "black", classes: ["power"], points: [{ x: 166, y: 965 }, { x: 166, y: 590 }, { x: 920, y: 590 }, { x: 920, y: 800 }] },
  { from: "esp:GND", to: "relay1:GND", color: "black", classes: ["power"], points: [{ x: 147, y: 965 }, { x: 147, y: 246 }, { x: 1190, y: 246 }, { x: 1190, y: 396 }] },
  { from: "esp:GND", to: "acs2:GND", color: "black", classes: ["power"], points: [{ x: 128, y: 965 }, { x: 128, y: 1005 }, { x: 920, y: 1005 }, { x: 920, y: 1210 }] },
  { from: "esp:GND", to: "zmpt2:GND", color: "black", classes: ["power"], points: [{ x: 109, y: 965 }, { x: 109, y: 1305 }, { x: 920, y: 1305 }, { x: 920, y: 1510 }] },
  { from: "esp:GND", to: "relay2:GND", color: "black", classes: ["power"], points: [{ x: 90, y: 965 }, { x: 90, y: 1035 }, { x: 1190, y: 1035 }, { x: 1190, y: 1121 }] },

  { from: "esp:39", to: "relay1:IN", color: "green", classes: ["control", "load1"], points: [{ x: 610, y: 780 }, { x: 610, y: 425 }, { x: 1230, y: 425 }] },
  { from: "esp:38", to: "relay2:IN", color: "green", classes: ["control", "load2"], points: [{ x: 585, y: 756 }, { x: 585, y: 1147 }, { x: 1230, y: 1147 }] },

  { from: "ac1:L", to: "relay1:NO", color: "red", classes: ["live", "load1"], points: [{ x: 835, y: 95 }, { x: 835, y: 198 }, { x: 1420, y: 198 }, { x: 1420, y: 368 }] },
  { from: "relay1:COM", to: "acs1:LINE_IN", color: "red", classes: ["live", "load1"], points: [{ x: 1428, y: 396 }, { x: 1428, y: 268 }, { x: 840, y: 268 }, { x: 840, y: 344 }] },
  { from: "acs1:LINE_OUT", to: "fan1:L", color: "red", classes: ["live", "load1"], points: [{ x: 1080, y: 344 }, { x: 1160, y: 344 }, { x: 1160, y: 225 }, { x: 1360, y: 225 }] },
  { from: "ac1:N", to: "fan1:N", color: "blue", classes: ["load1"], points: [{ x: 1025, y: 95 }, { x: 1250, y: 95 }, { x: 1250, y: 225 }, { x: 1426, y: 225 }] },
  { from: "ac1:L", to: "zmpt1:AC_L", color: "red", classes: ["live", "load1"], points: [{ x: 815, y: 95 }, { x: 815, y: 654 }] },
  { from: "ac1:N", to: "zmpt1:AC_N", color: "blue", classes: ["load1"], points: [{ x: 1045, y: 95 }, { x: 1090, y: 95 }, { x: 1090, y: 654 }, { x: 1030, y: 654 }] },

  { from: "ac2:L", to: "relay2:NO", color: "red", classes: ["live", "load2"], points: [{ x: 835, y: 890 }, { x: 835, y: 1010 }, { x: 1420, y: 1010 }, { x: 1420, y: 1093 }] },
  { from: "relay2:COM", to: "acs2:LINE_IN", color: "red", classes: ["live", "load2"], points: [{ x: 1428, y: 1121 }, { x: 1428, y: 988 }, { x: 840, y: 988 }, { x: 840, y: 1064 }] },
  { from: "acs2:LINE_OUT", to: "fan2:L", color: "red", classes: ["live", "load2"], points: [{ x: 1080, y: 1064 }, { x: 1160, y: 1064 }, { x: 1160, y: 1020 }, { x: 1360, y: 1020 }] },
  { from: "ac2:N", to: "fan2:N", color: "blue", classes: ["load2"], points: [{ x: 1025, y: 890 }, { x: 1250, y: 890 }, { x: 1250, y: 1020 }, { x: 1426, y: 1020 }] },
  { from: "ac2:L", to: "zmpt2:AC_L", color: "red", classes: ["live", "load2"], points: [{ x: 815, y: 890 }, { x: 815, y: 1364 }] },
  { from: "ac2:N", to: "zmpt2:AC_N", color: "blue", classes: ["load2"], points: [{ x: 1045, y: 890 }, { x: 1090, y: 890 }, { x: 1090, y: 1364 }, { x: 1030, y: 1364 }] },
];

const hiddenDirectSupplyWires = new Set([
  "esp:5V->acs1:VCC",
  "esp:5V->zmpt1:VCC",
  "esp:5V->relay1:VCC",
  "esp:5V->acs2:VCC",
  "esp:5V->zmpt2:VCC",
  "esp:5V->relay2:VCC",
  "esp:GND->acs1:GND",
  "esp:GND->zmpt1:GND",
  "esp:GND->relay1:GND",
  "esp:GND->acs2:GND",
  "esp:GND->zmpt2:GND",
  "esp:GND->relay2:GND",
]);

wires.forEach((wire) => {
  wire.hidden = hiddenDirectSupplyWires.has(`${wire.from}->${wire.to}`);
});

wires.push(
  { from: "esp:5V", to: "rail:V5_TOP", color: "red", classes: ["power", "rail"] },
  { from: "rail:V5_TOP", to: "rail:V5_BOTTOM", color: "red", classes: ["power", "rail"] },
  { from: "esp:GND", to: "rail:GND_TOP", color: "black", classes: ["power", "rail"] },
  { from: "rail:GND_TOP", to: "rail:GND_BOTTOM", color: "black", classes: ["power", "rail"] },
  { from: "rail:V5_ACS1", to: "acs1:VCC", color: "red", classes: ["power", "branch"] },
  { from: "rail:V5_ZMPT1", to: "zmpt1:VCC", color: "red", classes: ["power", "branch"] },
  { from: "rail:V5_RELAY1", to: "relay1:VCC", color: "red", classes: ["power", "branch"] },
  { from: "rail:V5_ACS2", to: "acs2:VCC", color: "red", classes: ["power", "branch"] },
  { from: "rail:V5_ZMPT2", to: "zmpt2:VCC", color: "red", classes: ["power", "branch"] },
  { from: "rail:V5_RELAY2", to: "relay2:VCC", color: "red", classes: ["power", "branch"] },
  { from: "rail:GND_ACS1", to: "acs1:GND", color: "black", classes: ["power", "branch"] },
  { from: "rail:GND_ZMPT1", to: "zmpt1:GND", color: "black", classes: ["power", "branch"] },
  { from: "rail:GND_RELAY1", to: "relay1:GND", color: "black", classes: ["power", "branch"] },
  { from: "rail:GND_ACS2", to: "acs2:GND", color: "black", classes: ["power", "branch"] },
  { from: "rail:GND_ZMPT2", to: "zmpt2:GND", color: "black", classes: ["power", "branch"] },
  { from: "rail:GND_RELAY2", to: "relay2:GND", color: "black", classes: ["power", "branch"] }
);

function appendSerial(line = "") {
  serialOutput.textContent += `${line}\n`;
  serialOutput.scrollTop = serialOutput.scrollHeight;
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function pinLabel(pinId) {
  const [part, pin] = pinId.split(":");
  return `${part}.${pin}`;
}

function getPinPoint(pinId) {
  if (pinId.startsWith("$")) {
    return null;
  }
  const [partId, pinName] = pinId.split(":");
  const part = parts[partId];
  const pin = pinMap[partId]?.[pinName];
  if (!part || !pin) {
    return null;
  }
  return {
    x: part.x + pin.x,
    y: part.y + pin.y,
  };
}

function roundedPoint(point) {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
  };
}

function samePoint(a, b) {
  return Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
}

function partBounds(partId, padding = 0) {
  const part = parts[partId];
  const size = partSizes[partId];
  if (!part || !size) return null;
  return {
    partId,
    left: part.x - padding,
    top: part.y - padding,
    right: part.x + size.width + padding,
    bottom: part.y + size.height + padding,
  };
}

function pinDirection(pinId) {
  const [partId, pinName] = pinId.split(":");
  const pin = pinMap[partId]?.[pinName];
  const size = partSizes[partId];
  if (!pin || !size) return { x: 0, y: 0 };

  const nearestEdges = [
    { x: -1, y: 0, distance: pin.x },
    { x: 1, y: 0, distance: size.width - pin.x },
    { x: 0, y: -1, distance: pin.y },
    { x: 0, y: 1, distance: size.height - pin.y },
  ];
  nearestEdges.sort((a, b) => a.distance - b.distance);
  return {
    x: nearestEdges[0].x,
    y: nearestEdges[0].y,
  };
}

function pinStubPoint(pinId) {
  const point = getPinPoint(pinId);
  const direction = pinDirection(pinId);
  if (!point) return null;
  return roundedPoint({
    x: point.x + direction.x * pinStubLength,
    y: point.y + direction.y * pinStubLength,
  });
}

function makeOrthogonalPath(from, to) {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx < 22 || dy < 22) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }
  const midX = from.x + (to.x - from.x) / 2;
  return `M ${from.x} ${from.y} H ${midX} V ${to.y} H ${to.x}`;
}

function pointsShareAxis(a, b) {
  return Math.abs(a.x - b.x) <= 1 || Math.abs(a.y - b.y) <= 1;
}

function orthogonalRoutePoints(from, to, horizontalFirst = true) {
  if (pointsShareAxis(from, to)) {
    return [];
  }

  if (horizontalFirst) {
    const midX = Math.round(from.x + (to.x - from.x) / 2);
    return [
      { x: midX, y: Math.round(from.y) },
      { x: midX, y: Math.round(to.y) },
    ];
  }

  const midY = Math.round(from.y + (to.y - from.y) / 2);
  return [
    { x: Math.round(from.x), y: midY },
    { x: Math.round(to.x), y: midY },
  ];
}

function defaultRoutePoints(from, to) {
  return orthogonalRoutePoints(from, to, true);
}

function appendRoutePoint(points, point) {
  const rounded = roundedPoint(point);
  const previous = points[points.length - 1];
  if (!previous || !samePoint(previous, rounded)) {
    points.push(rounded);
  }
}

function appendOrthogonalTarget(points, target, horizontalFirst = true) {
  const current = points[points.length - 1];
  const roundedTarget = roundedPoint(target);
  if (!current) {
    appendRoutePoint(points, roundedTarget);
    return;
  }
  if (!pointsShareAxis(current, roundedTarget)) {
    appendRoutePoint(
      points,
      horizontalFirst
        ? { x: roundedTarget.x, y: current.y }
        : { x: current.x, y: roundedTarget.y }
    );
  }
  appendRoutePoint(points, roundedTarget);
}

function simplifyFullRoute(points) {
  const simplified = removeDuplicatePoints(points.map(roundedPoint));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < simplified.length - 1; i++) {
      if (pointsAreCollinear(simplified[i - 1], simplified[i], simplified[i + 1])) {
        simplified.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return simplified;
}

function buildOrthogonalFullRoute(from, anchors, to, horizontalFirst = true) {
  const points = [roundedPoint(from)];
  anchors.filter(Boolean).forEach((anchor) => {
    appendOrthogonalTarget(points, anchor, horizontalFirst);
  });
  appendOrthogonalTarget(points, to, horizontalFirst);
  return simplifyFullRoute(points);
}

function segmentObstacleHit(a, b, rect) {
  if (Math.abs(a.y - b.y) <= 1) {
    const y = a.y;
    if (y <= rect.top || y >= rect.bottom) return null;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const overlapStart = Math.max(minX, rect.left);
    const overlapEnd = Math.min(maxX, rect.right);
    if (overlapEnd <= overlapStart) return null;
    return {
      rect,
      distance: Math.abs(overlapStart - a.x),
    };
  }

  if (Math.abs(a.x - b.x) <= 1) {
    const x = a.x;
    if (x <= rect.left || x >= rect.right) return null;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const overlapStart = Math.max(minY, rect.top);
    const overlapEnd = Math.min(maxY, rect.bottom);
    if (overlapEnd <= overlapStart) return null;
    return {
      rect,
      distance: Math.abs(overlapStart - a.y),
    };
  }

  return null;
}

function firstSegmentObstacle(a, b, obstacles) {
  let bestHit = null;
  obstacles.forEach((rect) => {
    const hit = segmentObstacleHit(a, b, rect);
    if (!hit) return;
    if (!bestHit || hit.distance < bestHit.distance) {
      bestHit = hit;
    }
  });
  return bestHit?.rect || null;
}

function detourSegmentAroundRect(a, b, rect) {
  const route = [a];
  if (Math.abs(a.y - b.y) <= 1) {
    const movingRight = b.x >= a.x;
    const entryX = movingRight ? rect.left : rect.right;
    const exitX = movingRight ? rect.right : rect.left;
    const detourY = Math.abs(a.y - rect.top) <= Math.abs(a.y - rect.bottom) ? rect.top : rect.bottom;
    appendRoutePoint(route, { x: entryX, y: a.y });
    appendRoutePoint(route, { x: entryX, y: detourY });
    appendRoutePoint(route, { x: exitX, y: detourY });
    appendRoutePoint(route, { x: exitX, y: b.y });
  } else {
    const movingDown = b.y >= a.y;
    const entryY = movingDown ? rect.top : rect.bottom;
    const exitY = movingDown ? rect.bottom : rect.top;
    const detourX = Math.abs(a.x - rect.left) <= Math.abs(a.x - rect.right) ? rect.left : rect.right;
    appendRoutePoint(route, { x: a.x, y: entryY });
    appendRoutePoint(route, { x: detourX, y: entryY });
    appendRoutePoint(route, { x: detourX, y: exitY });
    appendRoutePoint(route, { x: b.x, y: exitY });
  }
  appendRoutePoint(route, b);
  return route;
}

function obstacleBoundsForWire(wire) {
  const endpointParts = new Set([pinPartId(wire.from), pinPartId(wire.to), "rail"]);
  return Object.keys(partSizes)
    .filter((partId) => !endpointParts.has(partId))
    .map((partId) => partBounds(partId, wireObstaclePadding))
    .filter(Boolean);
}

function avoidWireObstacles(wire, fullRoute) {
  const obstacles = obstacleBoundsForWire(wire);
  let points = simplifyFullRoute(fullRoute);

  for (let attempt = 0; attempt < 28; attempt++) {
    let changed = false;
    for (let i = 0; i < points.length - 1; i++) {
      const obstacle = firstSegmentObstacle(points[i], points[i + 1], obstacles);
      if (!obstacle) continue;
      const detour = detourSegmentAroundRect(points[i], points[i + 1], obstacle);
      points.splice(i, 2, ...detour);
      points = simplifyFullRoute(points);
      changed = true;
      break;
    }
    if (!changed) break;
  }

  return points;
}

function routeWireAroundComponents(wire, rawPoints = [], horizontalFirst = true) {
  const from = getPinPoint(wire.from);
  const to = getPinPoint(wire.to);
  if (!from || !to) return [];

  const anchors = [];
  const fromStub = pinStubPoint(wire.from);
  const toStub = pinStubPoint(wire.to);
  if (fromStub && !samePoint(from, fromStub)) anchors.push(fromStub);
  rawPoints.forEach((point) => anchors.push(point));
  if (toStub && !samePoint(to, toStub)) anchors.push(toStub);

  const fullRoute = buildOrthogonalFullRoute(from, anchors, to, horizontalFirst);
  const avoidedRoute = avoidWireObstacles(wire, fullRoute);
  return simplifyFullRoute(avoidedRoute).slice(1, -1);
}

function defaultRoutePointsForWire(wire) {
  const from = getPinPoint(wire.from);
  const to = getPinPoint(wire.to);
  if (!from || !to) return [];
  return routeWireAroundComponents(wire, defaultRoutePoints(from, to), true);
}

function ensureWirePoints(wire) {
  if (Array.isArray(wire.points)) {
    const from = getPinPoint(wire.from);
    const to = getPinPoint(wire.to);
    if (wire.points.length === 0 && from && to) {
      wire.points = defaultRoutePointsForWire(wire);
    }
    return wire.points;
  }
  wire.points = defaultRoutePointsForWire(wire);
  return wire.points;
}

function makeManualPath(from, points, to) {
  const allPoints = [from, ...points, to];
  return allPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${Math.round(point.x)} ${Math.round(point.y)}`)
    .join(" ");
}

function wirePath(wire, from, to) {
  if (Array.isArray(wire.points)) {
    return makeManualPath(from, ensureWirePoints(wire), to);
  }
  return makeOrthogonalPath(from, to);
}

function pointToSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
  const projection = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function insertRoutePoint(wire, point) {
  const from = getPinPoint(wire.from);
  const to = getPinPoint(wire.to);
  const points = ensureWirePoints(wire);
  const pathPoints = [from, ...points, to].filter(Boolean);
  let insertIndex = points.length;
  let bestDistance = Infinity;
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const distance = pointToSegmentDistance(point, pathPoints[i], pathPoints[i + 1]);
    if (distance < bestDistance) {
      bestDistance = distance;
      insertIndex = i;
    }
  }
  points.splice(insertIndex, 0, {
    x: Math.round(point.x),
    y: Math.round(point.y),
  });
}

function isHorizontalSegment(a, b) {
  return Math.abs(a.y - b.y) <= Math.abs(a.x - b.x);
}

function routePointsForWire(wire) {
  const from = getPinPoint(wire.from);
  const to = getPinPoint(wire.to);
  if (!from || !to) return [];
  return [from, ...ensureWirePoints(wire), to];
}

function segmentHandlePosition(a, b) {
  return {
    x: Math.round((a.x + b.x) / 2),
    y: Math.round((a.y + b.y) / 2),
  };
}

function pointsAreCollinear(a, b, c) {
  return (Math.abs(a.x - b.x) <= 1 && Math.abs(b.x - c.x) <= 1) || (Math.abs(a.y - b.y) <= 1 && Math.abs(b.y - c.y) <= 1);
}

function removeDuplicatePoints(points) {
  return points.filter((point, index) => index === 0 || Math.abs(point.x - points[index - 1].x) > 1 || Math.abs(point.y - points[index - 1].y) > 1);
}

function normalizeWirePoints(wire) {
  const from = getPinPoint(wire.from);
  const to = getPinPoint(wire.to);
  if (!from || !to || !Array.isArray(wire.points)) return;

  let allPoints = removeDuplicatePoints([from, ...wire.points, to]);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < allPoints.length - 1; i++) {
      if (pointsAreCollinear(allPoints[i - 1], allPoints[i], allPoints[i + 1])) {
        allPoints.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  wire.points = allPoints.slice(1, -1);
}

function addWireHandle(point, options) {
  const { wire, wireIndex, segmentIndex, minor = false } = options;
  const handle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const size = minor ? 10 : 14;
  handle.setAttribute("class", `wire-handle${minor ? " minor" : ""}`);
  handle.setAttribute("x", point.x - size / 2);
  handle.setAttribute("y", point.y - size / 2);
  handle.setAttribute("width", size);
  handle.setAttribute("height", size);
  handle.setAttribute("rx", 1.5);
  handle.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    const routePoints = routePointsForWire(wire);
    const pointA = routePoints[segmentIndex];
    const pointB = routePoints[segmentIndex + 1];
    const horizontal = isHorizontalSegment(pointA, pointB);
    const preparedSegmentIndex = prepareEndpointSegmentDrag(wire, segmentIndex, horizontal);
    segmentDrag = {
      wireIndex,
      segmentIndex: preparedSegmentIndex,
      horizontal,
      startX: event.clientX,
      startY: event.clientY,
      points: ensureWirePoints(wire).map((routePoint) => ({ ...routePoint })),
    };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    insertRoutePoint(wire, screenToCircuitPoint(event));
    updateWireReadout();
    renderEditor();
  });
  dynamicWires.appendChild(handle);
}

function prepareEndpointSegmentDrag(wire, segmentIndex, horizontal) {
  const points = ensureWirePoints(wire);
  const from = getPinPoint(wire.from);
  const to = getPinPoint(wire.to);
  if (!from || !to) return segmentIndex;

  const routePoints = [from, ...points, to];
  const lastSegmentIndex = routePoints.length - 2;

  if (segmentIndex === 0) {
    const first = points[0] ?? to;
    const anchor = horizontal
      ? { x: Math.round((from.x + first.x) / 2), y: Math.round(from.y) }
      : { x: Math.round(from.x), y: Math.round((from.y + first.y) / 2) };
    const movingStart = horizontal
      ? { x: anchor.x, y: Math.round(first.y) }
      : { x: Math.round(first.x), y: anchor.y };
    points.unshift(anchor, movingStart);
    return 2;
  }

  if (segmentIndex === lastSegmentIndex) {
    const oldPointCount = points.length;
    const last = points[points.length - 1] ?? from;
    const anchor = horizontal
      ? { x: Math.round((last.x + to.x) / 2), y: Math.round(to.y) }
      : { x: Math.round(to.x), y: Math.round((last.y + to.y) / 2) };
    const movingEnd = horizontal
      ? { x: anchor.x, y: Math.round(last.y) }
      : { x: Math.round(last.x), y: anchor.y };
    points.push(movingEnd, anchor);
    return oldPointCount;
  }

  return segmentIndex;
}

function pinPartId(pinId) {
  return pinId.split(":")[0];
}

function capturePartWireAttachments(partId) {
  const attachments = [];
  wires.forEach((wire, wireIndex) => {
    const routePoints = routePointsForWire(wire);
    if (routePoints.length < 2) return;

    if (pinPartId(wire.from) === partId) {
      attachments.push({
        wireIndex,
        endpoint: "from",
        horizontal: isHorizontalSegment(routePoints[0], routePoints[1]),
      });
    }

    if (pinPartId(wire.to) === partId) {
      attachments.push({
        wireIndex,
        endpoint: "to",
        horizontal: isHorizontalSegment(routePoints[routePoints.length - 2], routePoints[routePoints.length - 1]),
      });
    }
  });
  return attachments;
}

function keepEndpointSegmentOrthogonal(attachment) {
  const wire = wires[attachment.wireIndex];
  if (!wire) return;

  const from = getPinPoint(wire.from);
  const to = getPinPoint(wire.to);
  if (!from || !to) return;

  let points = Array.isArray(wire.points) ? wire.points : ensureWirePoints(wire);
  if (points.length === 0) {
    wire.points = defaultRoutePointsForWire(wire);
    points = wire.points;
  }
  if (points.length === 0) return;

  if (attachment.endpoint === "from") {
    const stub = pinStubPoint(wire.from);
    points[0] = stub;
    if (points[1] && !pointsShareAxis(points[0], points[1])) {
      points.splice(
        1,
        0,
        attachment.horizontal
          ? { x: points[1].x, y: points[0].y }
          : { x: points[0].x, y: points[1].y }
      );
    }
    return;
  }

  const lastIndex = points.length - 1;
  const stub = pinStubPoint(wire.to);
  points[lastIndex] = stub;
  if (points[lastIndex - 1] && !pointsShareAxis(points[lastIndex - 1], points[lastIndex])) {
    points.splice(
      lastIndex,
      0,
      attachment.horizontal
        ? { x: points[lastIndex - 1].x, y: points[lastIndex].y }
        : { x: points[lastIndex].x, y: points[lastIndex - 1].y }
    );
  }
}

function keepAttachedWiresOrthogonal(attachments) {
  attachments.forEach(keepEndpointSegmentOrthogonal);
}

function normalizeAttachedWires(attachments) {
  const normalizedWireIndexes = new Set();
  attachments.forEach(({ wireIndex }) => {
    if (normalizedWireIndexes.has(wireIndex)) return;
    const wire = wires[wireIndex];
    if (!wire) return;
    wire.points = routeWireAroundComponents(wire, wire.points, true);
    normalizeWirePoints(wire);
    normalizedWireIndexes.add(wireIndex);
  });
}

function routeVia(from, to, points) {
  return points.map((point) => ({
    x: Math.round(point.x),
    y: Math.round(point.y),
  }));
}

function verticalLane(from, to, x) {
  return routeVia(from, to, [
    { x, y: from.y },
    { x, y: to.y },
  ]);
}

function peripheralRoute(from, to, x, y) {
  return routeVia(from, to, [
    { x, y: from.y },
    { x, y },
    { x: to.x, y },
  ]);
}

function resetPartLayout() {
  Object.assign(parts, {
    esp: { x: 70, y: 520 },
    mux: { x: 520, y: 685 },
    ac1: { x: 1010, y: 70 },
    fan1: { x: 1680, y: 90 },
    acs1: { x: 1080, y: 360 },
    zmpt1: { x: 1080, y: 690 },
    relay1: { x: 1480, y: 395 },
    ac2: { x: 1010, y: 1040 },
    fan2: { x: 1680, y: 1070 },
    acs2: { x: 1080, y: 1190 },
    zmpt2: { x: 1080, y: 1515 },
    relay2: { x: 1480, y: 1240 },
    rail: { x: 0, y: 0 },
  });
}

function routeForWire(wire, index) {
  const from = getPinPoint(wire.from);
  const to = getPinPoint(wire.to);
  if (!from || !to) return [];

  const key = `${wire.from}->${wire.to}`;
  if (key === "esp:5V->rail:V5_TOP") {
    return routeWireAroundComponents(wire, routeVia(from, to, [{ x: 34, y: from.y }, { x: 34, y: 210 }, { x: to.x, y: 210 }]), true);
  }
  if (key === "esp:GND->rail:GND_TOP") {
    return routeWireAroundComponents(wire, routeVia(from, to, [{ x: 58, y: from.y }, { x: 58, y: 235 }, { x: to.x, y: 235 }]), true);
  }
  if (wire.from.startsWith("rail:") || wire.to.startsWith("rail:")) {
    return routeWireAroundComponents(wire, [], true);
  }
  const espMuxRoutes = {
    "esp:3V3->mux:VCC": [{ x: 34, y: from.y }, { x: 34, y: 470 }, { x: 455, y: 470 }, { x: 455, y: to.y }],
    "esp:GND->mux:GND": [{ x: 58, y: from.y }, { x: 58, y: 1115 }, { x: 410, y: 1115 }, { x: 410, y: to.y }],
    "esp:GND->mux:VEE": [{ x: 58, y: from.y }, { x: 58, y: 1145 }, { x: 385, y: 1145 }, { x: 385, y: to.y }],
    "esp:GND->mux:INH": [{ x: 58, y: from.y }, { x: 58, y: 1175 }, { x: 360, y: 1175 }, { x: 360, y: to.y }],
    "esp:36->mux:COM": [{ x: 350, y: from.y }, { x: 350, y: to.y }],
    "esp:2->mux:A": [{ x: 380, y: from.y }, { x: 380, y: 460 }, { x: 650, y: 460 }, { x: 650, y: to.y }],
    "esp:42->mux:B": [{ x: 405, y: from.y }, { x: 405, y: 435 }, { x: 675, y: 435 }, { x: 675, y: to.y }],
    "esp:41->mux:C": [{ x: 430, y: from.y }, { x: 430, y: 410 }, { x: 700, y: 410 }, { x: 700, y: to.y }],
  };
  if (espMuxRoutes[key]) {
    return routeWireAroundComponents(wire, routeVia(from, to, espMuxRoutes[key]), true);
  }

  const laneMap = {
    "mux:C0->acs1:OUT": { x: 735 },
    "mux:C1->zmpt1:OUT": { x: 775 },
    "mux:C2->acs2:OUT": { x: 815 },
    "mux:C3->zmpt2:OUT": { x: 855 },
  };
  if (laneMap[key]) {
    return routeWireAroundComponents(wire, verticalLane(from, to, laneMap[key].x), false);
  }

  const controlRoutes = {
    "esp:39->relay1:IN": [{ x: 460, y: from.y }, { x: 460, y: 300 }, { x: 1340, y: 300 }, { x: 1340, y: to.y }],
    "esp:38->relay2:IN": [{ x: 430, y: from.y }, { x: 430, y: 1165 }, { x: 1340, y: 1165 }, { x: 1340, y: to.y }],
  };
  if (controlRoutes[key]) {
    return routeWireAroundComponents(wire, routeVia(from, to, controlRoutes[key]), true);
  }

  const powerTargets = {
    "esp:5V->acs1:VCC": { x: 40, y: 270 },
    "esp:5V->zmpt1:VCC": { x: 62, y: 310 },
    "esp:5V->relay1:VCC": { x: 84, y: 350 },
    "esp:5V->acs2:VCC": { x: 106, y: 1710 },
    "esp:5V->zmpt2:VCC": { x: 128, y: 1750 },
    "esp:5V->relay2:VCC": { x: 150, y: 1790 },
    "esp:GND->acs1:GND": { x: 190, y: 250 },
    "esp:GND->zmpt1:GND": { x: 212, y: 292 },
    "esp:GND->relay1:GND": { x: 234, y: 334 },
    "esp:GND->acs2:GND": { x: 256, y: 1692 },
    "esp:GND->zmpt2:GND": { x: 278, y: 1734 },
    "esp:GND->relay2:GND": { x: 300, y: 1776 },
  };
  if (powerTargets[key]) {
    const { x, y } = powerTargets[key];
    return routeWireAroundComponents(wire, peripheralRoute(from, to, x, y), true);
  }

  const acRoutes = {
    "ac1:L->relay1:NO": [{ x: 940, y: from.y }, { x: 940, y: 315 }, { x: 1420, y: 315 }, { x: 1420, y: to.y }],
    "relay1:COM->acs1:LINE_IN": [{ x: 1665, y: from.y }, { x: 1665, y: 600 }, { x: 1040, y: 600 }, { x: 1040, y: to.y }],
    "acs1:LINE_OUT->fan1:L": [{ x: 1300, y: from.y }, { x: 1300, y: 300 }, { x: 1740, y: 300 }, { x: 1740, y: to.y }],
    "ac1:N->fan1:N": [{ x: 1250, y: from.y }, { x: 1250, y: 35 }, { x: 1875, y: 35 }, { x: 1875, y: to.y }, { x: to.x, y: to.y }],
    "ac1:L->zmpt1:AC_L": [{ x: 930, y: from.y }, { x: 930, y: to.y }],
    "ac1:N->zmpt1:AC_N": [{ x: 1260, y: from.y }, { x: 1260, y: to.y }],
    "ac2:L->relay2:NO": [{ x: 940, y: from.y }, { x: 940, y: 1170 }, { x: 1420, y: 1170 }, { x: 1420, y: to.y }],
    "relay2:COM->acs2:LINE_IN": [{ x: 1665, y: from.y }, { x: 1665, y: 1430 }, { x: 1040, y: 1430 }, { x: 1040, y: to.y }],
    "acs2:LINE_OUT->fan2:L": [{ x: 1300, y: from.y }, { x: 1300, y: 1365 }, { x: 1740, y: 1365 }, { x: 1740, y: to.y }],
    "ac2:N->fan2:N": [{ x: 1250, y: from.y }, { x: 1250, y: 995 }, { x: 1875, y: 995 }, { x: 1875, y: to.y }, { x: to.x, y: to.y }],
    "ac2:L->zmpt2:AC_L": [{ x: 930, y: from.y }, { x: 930, y: to.y }],
    "ac2:N->zmpt2:AC_N": [{ x: 1260, y: from.y }, { x: 1260, y: to.y }],
  };
  if (acRoutes[key]) {
    return routeWireAroundComponents(wire, routeVia(from, to, acRoutes[key]), true);
  }

  return routeWireAroundComponents(wire, defaultRoutePoints(from, to).map((point, pointIndex) => ({
    x: point.x + pointIndex * 12 + index * 2,
    y: point.y + pointIndex * 12,
  })), true);
}

function autoRouteAll({ resetLayout = false } = {}) {
  if (resetLayout) {
    resetPartLayout();
  }
  wires.forEach((wire, index) => {
    wire.points = routeForWire(wire, index);
  });
  selectedPin = null;
  selectedWireIndex = null;
  previewWire.setAttribute("d", "");
  updateWireReadout();
  renderEditor();
}

function isWireActive(wire) {
  if (!running) return false;
  if (wire.classes.includes("signal")) return true;
  if (wire.classes.includes("load1")) return loads[0].relay;
  if (wire.classes.includes("load2")) return loads[1].relay;
  return false;
}

function renderParts() {
  Object.entries(parts).forEach(([partId, part]) => {
    const element = document.querySelector(`[data-part="${partId}"]`);
    if (!element) return;
    element.style.left = `${part.x}px`;
    element.style.top = `${part.y}px`;
  });
}

function initPinAnchors() {
  Object.entries(pinMap).forEach(([partId, pins]) => {
    Object.entries(pins).forEach(([pinName, pin]) => {
      const pinId = `${partId}:${pinName}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `pin-anchor ${pin.kind}${partId === "esp" ? " esp-pin-anchor" : ""}`;
      button.dataset.pin = pinId;
      button.dataset.label = pin.label || pinName;
      const direction = pinDirection(pinId);
      button.dataset.side = direction.x < 0 ? "left" : direction.x > 0 ? "right" : direction.y < 0 ? "top" : "bottom";
      button.title = pinLabel(pinId);
      button.setAttribute("aria-label", pinLabel(pinId));
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        handlePinClick(pinId);
      });
      circuit.appendChild(button);
      pinAnchorElements.set(pinId, button);
    });
  });
}

function renderPinAnchors() {
  pinAnchorElements.forEach((button, pinId) => {
    const point = getPinPoint(pinId);
    if (!point) return;
    const [partId, pinName] = pinId.split(":");
    if (partId === "esp") {
      const pin = pinMap.esp[pinName];
      button.style.left = `${point.x + (pin.x > 100 ? -44 : 0)}px`;
      button.style.top = `${point.y - 10}px`;
    } else {
      button.style.left = `${point.x - 7}px`;
      button.style.top = `${point.y - 7}px`;
    }
    button.classList.toggle("selected", selectedPin === pinId);
  });
}

function renderWires() {
  dynamicWires.textContent = "";
  wireLabels.textContent = "";
  wires.forEach((wire, index) => {
    if (wire.hidden) return;
    const from = getPinPoint(wire.from);
    const to = getPinPoint(wire.to);
    if (!from || !to) return;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const classes = ["wire", wire.color, ...wire.classes];
    if (index === selectedWireIndex) classes.push("selected");
    if (isWireActive(wire)) classes.push("active");
    path.setAttribute("class", classes.join(" "));
    path.setAttribute("d", wirePath(wire, from, to));
    path.setAttribute("stroke", wireColors[wire.color] || wireColors.red);
    path.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || wireMode) return;
      event.stopPropagation();
      selectedWireIndex = index;
      selectedPin = null;
      const points = ensureWirePoints(wire);
      wireDrag = {
        index,
        startX: event.clientX,
        startY: event.clientY,
        points: points.map((point) => ({ ...point })),
      };
      path.setPointerCapture(event.pointerId);
      updateWireReadout();
      renderPinAnchors();
      renderWires();
    });
    path.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedWireIndex = index;
      selectedPin = null;
      ensureWirePoints(wire);
      updateWireReadout();
      renderPinAnchors();
      renderWires();
    });
    path.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      selectedWireIndex = index;
      selectedPin = null;
      insertRoutePoint(wire, screenToCircuitPoint(event));
      updateWireReadout();
      renderEditor();
    });
    dynamicWires.appendChild(path);

    if (index === selectedWireIndex) {
      renderWireEndpointLabels(wire, from, to);
      const routePoints = routePointsForWire(wire);
      routePoints.slice(0, -1).forEach((point, segmentIndex) => {
        const nextPoint = routePoints[segmentIndex + 1];
        const handlePoint = segmentHandlePosition(point, nextPoint);
        const handle = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        handle.setAttribute("class", "wire-handle");
        handle.setAttribute("x", handlePoint.x - 7);
        handle.setAttribute("y", handlePoint.y - 7);
        handle.setAttribute("width", 14);
        handle.setAttribute("height", 14);
        handle.setAttribute("rx", 1.5);
        handle.addEventListener("pointerdown", (event) => {
          event.stopPropagation();
          const horizontal = isHorizontalSegment(point, nextPoint);
          const preparedSegmentIndex = prepareEndpointSegmentDrag(wire, segmentIndex, horizontal);
          segmentDrag = {
            wireIndex: index,
            segmentIndex: preparedSegmentIndex,
            horizontal,
            startX: event.clientX,
            startY: event.clientY,
            points: ensureWirePoints(wire).map((routePoint) => ({ ...routePoint })),
          };
          handle.setPointerCapture(event.pointerId);
        });
        handle.addEventListener("dblclick", (event) => {
          event.stopPropagation();
          insertRoutePoint(wire, screenToCircuitPoint(event));
          updateWireReadout();
          renderEditor();
        });
        dynamicWires.appendChild(handle);
      });
    }
  });
}

function renderWireEndpointLabels(wire, from, to) {
  addWireLabel(pinLabel(wire.from), from, -8, -26);
  addWireLabel(pinLabel(wire.to), to, 12, -26);
}

function addWireLabel(text, point, dx, dy) {
  const width = Math.max(42, text.length * 7 + 12);
  const height = 20;
  const x = Math.round(point.x + dx);
  const y = Math.round(point.y + dy);
  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  rect.setAttribute("class", "wire-label-box");
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", width);
  rect.setAttribute("height", height);
  rect.setAttribute("rx", 4);
  label.setAttribute("class", "wire-label-text");
  label.setAttribute("x", x + 6);
  label.setAttribute("y", y + 14);
  label.textContent = text;
  group.appendChild(rect);
  group.appendChild(label);
  wireLabels.appendChild(group);
}

function renderEditor() {
  renderParts();
  renderPinAnchors();
  renderWires();
}

function updateWireReadout() {
  if (selectedPin) {
    wireReadout.textContent = `${pinLabel(selectedPin)} selected`;
  } else if (selectedWireIndex !== null && wires[selectedWireIndex]) {
    const wire = wires[selectedWireIndex];
    const segmentCount = Math.max(1, routePointsForWire(wire).length - 1);
    wireReadout.textContent = `${pinLabel(wire.from)} → ${pinLabel(wire.to)}. ${segmentCount} straight segment${segmentCount === 1 ? "" : "s"}.`;
  } else {
    wireReadout.textContent = "No pin selected";
  }
}

function inferWireClasses(from, to) {
  const endpoints = `${from} ${to}`;
  const classes = ["manual"];
  if (endpoints.includes("relay1") || endpoints.includes("fan1") || endpoints.includes("acs1") || endpoints.includes("zmpt1") || endpoints.includes("ac1")) {
    classes.push("load1");
  }
  if (endpoints.includes("relay2") || endpoints.includes("fan2") || endpoints.includes("acs2") || endpoints.includes("zmpt2") || endpoints.includes("ac2")) {
    classes.push("load2");
  }
  if (selectedWireColor === "green") classes.push("control");
  if (selectedWireColor === "purple") classes.push("signal");
  if (selectedWireColor === "red") classes.push("live");
  return classes;
}

function handlePinClick(pinId) {
  selectedWireIndex = null;
  if (!wireMode) {
    selectedPin = pinId;
    wireMode = true;
    wireButton.classList.add("active");
    document.body.classList.add("wire-mode");
    updateWireReadout();
    renderPinAnchors();
    return;
  }

  if (!selectedPin) {
    selectedPin = pinId;
    updateWireReadout();
    renderPinAnchors();
    return;
  }

  if (selectedPin === pinId) {
    selectedPin = null;
    previewWire.setAttribute("d", "");
    updateWireReadout();
    renderPinAnchors();
    return;
  }

  wires.push({
    from: selectedPin,
    to: pinId,
    color: selectedWireColor,
    classes: inferWireClasses(selectedPin, pinId),
    points: [],
  });
  selectedWireIndex = wires.length - 1;
  appendSerial(`Wire connected: ${pinLabel(selectedPin)} -> ${pinLabel(pinId)}`);
  selectedPin = null;
  previewWire.setAttribute("d", "");
  updateWireReadout();
  renderEditor();
}

function screenToCircuitPoint(event) {
  const rect = circuit.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / zoom,
    y: (event.clientY - rect.top) / zoom,
  };
}

function updatePreviewWire(event) {
  if (!wireMode || !selectedPin) {
    previewWire.setAttribute("d", "");
    return;
  }
  const from = getPinPoint(selectedPin);
  const to = screenToCircuitPoint(event);
  previewWire.setAttribute("d", makeOrthogonalPath(from, to));
  previewWire.setAttribute("stroke", wireColors[selectedWireColor] || wireColors.red);
}

function deleteSelectedWire() {
  if (selectedWireIndex === null || !wires[selectedWireIndex]) return;
  const [removed] = wires.splice(selectedWireIndex, 1);
  appendSerial(`Wire deleted: ${pinLabel(removed.from)} -> ${pinLabel(removed.to)}`);
  selectedWireIndex = null;
  updateWireReadout();
  renderEditor();
}

function moveSegmentTo(event) {
  if (!segmentDrag) return;
  const wire = wires[segmentDrag.wireIndex];
  if (!wire) return;
  const delta = (segmentDrag.horizontal ? event.clientY - segmentDrag.startY : event.clientX - segmentDrag.startX) / zoom;
  const points = segmentDrag.points.map((point) => ({ ...point }));
  const firstRouteIndex = segmentDrag.segmentIndex - 1;
  const secondRouteIndex = segmentDrag.segmentIndex;

  if (firstRouteIndex >= 0 && points[firstRouteIndex]) {
    if (segmentDrag.horizontal) {
      points[firstRouteIndex].y = Math.round(segmentDrag.points[firstRouteIndex].y + delta);
    } else {
      points[firstRouteIndex].x = Math.round(segmentDrag.points[firstRouteIndex].x + delta);
    }
  }
  if (secondRouteIndex < points.length && points[secondRouteIndex]) {
    if (segmentDrag.horizontal) {
      points[secondRouteIndex].y = Math.round(segmentDrag.points[secondRouteIndex].y + delta);
    } else {
      points[secondRouteIndex].x = Math.round(segmentDrag.points[secondRouteIndex].x + delta);
    }
  }

  wire.points = points;
  renderEditor();
}

function moveWireBy(event) {
  if (!wireDrag) return;
  const wire = wires[wireDrag.index];
  if (!wire?.points) return;
  const dx = (event.clientX - wireDrag.startX) / zoom;
  const dy = (event.clientY - wireDrag.startY) / zoom;
  wire.points = wireDrag.points.map((point) => ({
    x: Math.round(point.x + dx),
    y: Math.round(point.y + dy),
  }));
  renderEditor();
}

function settleWireRoute(wireIndex) {
  const wire = wires[wireIndex];
  if (!wire) return;
  wire.points = routeWireAroundComponents(wire, wire.points, true);
  normalizeWirePoints(wire);
}

function initPartDragging() {
  let drag = null;

  document.querySelectorAll(".part").forEach((partElement) => {
    partElement.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const partId = partElement.dataset.part;
      if (!parts[partId]) return;
      drag = {
        partId,
        startX: event.clientX,
        startY: event.clientY,
        x: parts[partId].x,
        y: parts[partId].y,
        wireAttachments: capturePartWireAttachments(partId),
      };
      partElement.classList.add("dragging");
      partElement.setPointerCapture(event.pointerId);
      selectedPin = null;
      selectedWireIndex = null;
      updateWireReadout();
      renderPinAnchors();
    });

    partElement.addEventListener("pointermove", (event) => {
      if (!drag || drag.partId !== partElement.dataset.part) return;
      parts[drag.partId].x = Math.round(drag.x + (event.clientX - drag.startX) / zoom);
      parts[drag.partId].y = Math.round(drag.y + (event.clientY - drag.startY) / zoom);
      keepAttachedWiresOrthogonal(drag.wireAttachments);
      renderEditor();
    });

    partElement.addEventListener("pointerup", (event) => {
      if (!drag) return;
      partElement.classList.remove("dragging");
      partElement.releasePointerCapture(event.pointerId);
      normalizeAttachedWires(drag.wireAttachments);
      drag = null;
      updateWireReadout();
      renderEditor();
    });
  });
}

function instantSample(index, timestampMs) {
  const load = loads[index];
  if (!load.relay) {
    return {
      voltage: 0,
      current: 0,
      power: 0,
    };
  }

  const theta = 2 * Math.PI * acFrequencyHz * (timestampMs / 1000);
  const voltage = voltageRms * Math.SQRT2 * Math.sin(theta);
  const current = loadCurrentRms(index) * Math.SQRT2 * Math.sin(theta);
  return {
    voltage,
    current,
    power: voltage * current,
  };
}

function loadCurrentRms(index) {
  const load = loads[index];
  if (!load?.relay) return 0;
  return voltageRms / Math.max(load.resistanceOhms, 1);
}

function startMeasurementWindow(index, timestampMs) {
  activeWindow = {
    loadIndex: index,
    startMs: timestampMs,
    lastSampleMs: timestampMs,
    sumV2: 0,
    sumI2: 0,
    sumP: 0,
    samples: 0,
  };
  waveformHistory[index] = [];
  pavgHistory[index] = [];
  renderWaveformChart(index);
  renderPavgChart(index);
}

function completeMeasurementWindow(timestampMs) {
  if (!activeWindow) {
    return null;
  }

  sampleActiveLoad(timestampMs, true);

  const index = activeWindow.loadIndex;
  const samples = Math.max(1, activeWindow.samples);
  const elapsedMs = Math.max(1, timestampMs - activeWindow.startMs);
  const vrms = Math.sqrt(activeWindow.sumV2 / samples);
  const irms = Math.sqrt(activeWindow.sumI2 / samples);
  const pavgWatts = activeWindow.sumP / samples;
  const va = vrms * irms;

  loads[index].wh += pavgWatts * (elapsedMs / 3600000);
  pavgHistory[index].push({ elapsedMs, pavg: pavgWatts });
  renderPavgChart(index);

  return {
    loadIndex: index,
    elapsedMs,
    samples: activeWindow.samples,
    vrms,
    irms,
    pavgWatts,
    va,
    wh: loads[index].wh,
  };
}

function chartPointString(samples, key, minValue, maxValue, chartHeight = 72) {
  const left = 10;
  const top = 10;
  const width = 220;
  const height = chartHeight;
  const span = Math.max(0.001, maxValue - minValue);
  return samples
    .map((sample, index) => {
      const x = left + (samples.length === 1 ? width : (index / (samples.length - 1)) * width);
      const ratio = Math.max(0, Math.min(1, (sample[key] - minValue) / span));
      const y = top + (1 - ratio) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function waveformPointString(samples, key, maxAbsValue) {
  const left = 10;
  const width = 220;
  const lane = key === "voltage"
    ? { top: 10, mid: 30, amplitude: 18 }
    : { top: 68, mid: 88, amplitude: 18 };
  const scale = lane.amplitude / Math.max(0.001, maxAbsValue);
  return samples
    .map((sample, index) => {
      const x = left + (samples.length === 1 ? width : (index / (samples.length - 1)) * width);
      const y = lane.mid - sample[key] * scale;
      return `${x.toFixed(1)},${Math.max(lane.top, Math.min(lane.top + 40, y)).toFixed(1)}`;
    })
    .join(" ");
}

function renderWaveformChart(index) {
  const samples = waveformHistory[index];
  const chart = document.querySelector(`[data-waveform-chart="${index}"]`);
  const readout = document.querySelector(`#chartReadout${index}`);
  if (!chart || !readout) return;

  const voltageLine = chart.querySelector('[data-chart-line="voltage"]');
  const currentLine = chart.querySelector('[data-chart-line="current"]');

  if (samples.length === 0) {
    voltageLine.setAttribute("points", "");
    currentLine.setAttribute("points", "");
    readout.textContent = !loads[index].relay ? "Relay OFF" : activeWindow?.loadIndex === index ? "Sampling..." : "No live window";
    return;
  }

  const maxVoltage = Math.max(1, voltageRms * Math.SQRT2);
  const maxCurrent = Math.max(0.001, (voltageRms / Math.max(loads[index].resistanceOhms, 1)) * Math.SQRT2);
  voltageLine.setAttribute("points", waveformPointString(samples, "voltage", maxVoltage));
  currentLine.setAttribute("points", waveformPointString(samples, "current", maxCurrent));

  const latest = samples[samples.length - 1];
  readout.textContent = `${latest.voltage.toFixed(1)}V / ${latest.current.toFixed(3)}A`;
}

function renderPavgChart(index) {
  const samples = pavgHistory[index];
  const chart = document.querySelector(`[data-pavg-chart="${index}"]`);
  const readout = document.querySelector(`#pavgReadout${index}`);
  if (!chart || !readout) return;

  const pavgLine = chart.querySelector("[data-pavg-line]");
  if (samples.length === 0) {
    pavgLine.setAttribute("points", "");
    readout.textContent = "0.00W";
    return;
  }

  const maxPavg = Math.max(1, ...samples.map((sample) => sample.pavg)) * 1.15;
  pavgLine.setAttribute("points", chartPointString(samples, "pavg", 0, maxPavg, 56));

  const latest = samples[samples.length - 1];
  readout.textContent = `${latest.pavg.toFixed(2)}W`;
}

function renderMeasurementCharts() {
  for (let i = 0; i < loads.length; i++) {
    renderWaveformChart(i);
    renderPavgChart(i);
  }
}

function clearLoadCharts(index) {
  waveformHistory[index] = [];
  pavgHistory[index] = [];
  renderWaveformChart(index);
  renderPavgChart(index);

  if (activeWindow?.loadIndex === index) {
    const now = performance.now();
    activeWindow.startMs = now;
    activeWindow.lastSampleMs = now;
    activeWindow.sumV2 = 0;
    activeWindow.sumI2 = 0;
    activeWindow.sumP = 0;
    activeWindow.samples = 0;
  }
}

function sampleActiveLoad(timestampMs, forceRender = false) {
  if (!activeWindow) return;
  if (!loads[activeWindow.loadIndex].relay) {
    activeWindow.lastSampleMs = timestampMs;
    if (forceRender || timestampMs - lastGraphRenderMs >= graphRenderIntervalMs) {
      renderWaveformChart(activeWindow.loadIndex);
      renderPavgChart(activeWindow.loadIndex);
      lastGraphRenderMs = timestampMs;
    }
    return;
  }

  let sampleTime = activeWindow.lastSampleMs + graphSampleIntervalMs;
  let latestSample = null;
  while (sampleTime <= timestampMs) {
    const sample = instantSample(activeWindow.loadIndex, sampleTime);
    activeWindow.sumV2 += sample.voltage * sample.voltage;
    activeWindow.sumI2 += sample.current * sample.current;
    activeWindow.sumP += sample.power;
    activeWindow.samples++;

    const elapsedMs = sampleTime - activeWindow.startMs;
    latestSample = {
      elapsedMs,
      voltage: sample.voltage,
      current: sample.current,
    };
    waveformHistory[activeWindow.loadIndex].push(latestSample);
    while (
      waveformHistory[activeWindow.loadIndex].length > 0 &&
      waveformHistory[activeWindow.loadIndex][0].elapsedMs < elapsedMs - waveformDisplayMs
    ) {
      waveformHistory[activeWindow.loadIndex].shift();
    }

    if (activeWindow.samples % 8 === 0) {
      pavgHistory[activeWindow.loadIndex].push({
        elapsedMs,
        pavg: activeWindow.sumP / activeWindow.samples,
      });
    }

    activeWindow.lastSampleMs = sampleTime;
    sampleTime += graphSampleIntervalMs;
  }

  if (latestSample && (forceRender || timestampMs - lastGraphRenderMs >= graphRenderIntervalMs)) {
    renderWaveformChart(activeWindow.loadIndex);
    renderPavgChart(activeWindow.loadIndex);
    lastGraphRenderMs = timestampMs;
  }
}

function printMeasurement(m) {
  if (!m) return;
  appendSerial(
      `LOAD${m.loadIndex + 1}` +
      `  Vrms=${m.vrms.toFixed(2)}V` +
      `  Irms=${m.irms.toFixed(3)}A` +
      `  Pavg=${m.pavgWatts.toFixed(2)}W` +
      `  VA=${m.va.toFixed(2)}` +
      `  Wh=${m.wh.toFixed(5)}` +
      `  kWh=${(m.wh / 1000).toFixed(8)}` +
      `  Samples=${m.samples}` +
      `  Relay=${loads[m.loadIndex].relay ? "ON" : "OFF"}`
  );
}

function updateVisualState() {
  document.body.classList.toggle("running", running);
  document.body.classList.toggle("wire-mode", wireMode);
  statusDot.classList.toggle("running", running);
  runIcon.textContent = running ? "■" : "▶";
  runButton.title = running ? "Stop simulation" : "Start simulation";
  runButton.setAttribute("aria-label", running ? "Stop simulation" : "Start simulation");
  serialState.textContent = running ? "running" : "stopped";
  runtimeText.textContent = formatTime(runtimeMs);
  voltageText.textContent = `${voltageRms.toFixed(0)}V`;

  loads.forEach((load, index) => {
    document.querySelector(`.fan${index + 1}`).classList.toggle("active", running && load.relay);
    document.querySelector(`.relay${index + 1}`).classList.toggle("active", load.relay);
    document.querySelectorAll(`.wire.load${index + 1}`).forEach((wire) => {
      wire.classList.toggle("active", load.relay);
    });
    document.querySelectorAll(`.wire.control.load${index + 1}`).forEach((wire) => {
      wire.classList.toggle("active", load.relay);
    });

    const irms = loadCurrentRms(index);
    const pavgWatts = voltageRms * irms;
    const va = voltageRms * irms;
    document.querySelector(`#loadStats${index}`).innerHTML =
      `Relay: <strong>${load.relay ? "ON" : "OFF"}</strong><br>` +
      `R fan: ${load.resistanceOhms.toFixed(1)} ohm<br>` +
      `Irms: ${irms.toFixed(3)} A<br>` +
      `Pavg: ${pavgWatts.toFixed(2)} W<br>` +
      `VA: ${va.toFixed(2)}<br>` +
      `Wh: ${load.wh.toFixed(5)}`;
  });

  circuit.style.transform = `scale(${zoom})`;
  renderWires();
}

function tick() {
  if (!running) return;
  const now = performance.now();
  const measurementResult = completeMeasurementWindow(now);
  runtimeMs += measurementResult?.elapsedMs || sampleWindowMs;
  printMeasurement(measurementResult);
  currentLoadIndex = (currentLoadIndex + 1) % loads.length;
  startMeasurementWindow(currentLoadIndex, now);
  updateVisualState();
}

function graphLoop(timestampMs) {
  if (!running) return;
  sampleActiveLoad(timestampMs);
  animationFrame = window.requestAnimationFrame(graphLoop);
}

function start() {
  if (running) return;
  running = true;
  const now = performance.now();
  lastTick = now;
  currentLoadIndex = 0;
  startMeasurementWindow(currentLoadIndex, now);
  appendSerial("Simulation started");
  timer = window.setInterval(tick, sampleWindowMs);
  animationFrame = window.requestAnimationFrame(graphLoop);
  updateVisualState();
}

function stop() {
  if (!running) return;
  running = false;
  window.clearInterval(timer);
  if (animationFrame !== null) {
    window.cancelAnimationFrame(animationFrame);
  }
  timer = null;
  animationFrame = null;
  appendSerial("Simulation stopped");
  updateVisualState();
}

function setAllRelays(value) {
  loads.forEach((load) => {
    load.relay = value;
  });
  if (!value) {
    for (let i = 0; i < loads.length; i++) {
      clearLoadCharts(i);
    }
  }
}

function toggleAllRelays() {
  loads.forEach((load) => {
    load.relay = !load.relay;
  });
  for (let i = 0; i < loads.length; i++) {
    if (!loads[i].relay) {
      clearLoadCharts(i);
    }
  }
}

function resetEnergy() {
  loads.forEach((load) => {
    load.wh = 0;
  });
  waveformHistory.forEach((samples) => {
    samples.length = 0;
  });
  pavgHistory.forEach((samples) => {
    samples.length = 0;
  });
  runtimeMs = 0;
  currentLoadIndex = 0;
  activeWindow = null;
  if (running) {
    startMeasurementWindow(currentLoadIndex, performance.now());
  }
  renderMeasurementCharts();
  appendSerial("Energy counters reset");
  updateVisualState();
}

function handleCommand(rawCommand) {
  const command = rawCommand.trim().toLowerCase();
  if (!command) return;

  appendSerial(`> ${command}`);

  if (command === "on") {
    setAllRelays(true);
    appendSerial("All relays ON");
  } else if (command === "off") {
    setAllRelays(false);
    appendSerial("All relays OFF");
  } else if (command === "toggle") {
    toggleAllRelays();
    appendSerial("All relays toggled");
  } else if (command === "reset") {
    resetEnergy();
    return;
  } else if (/^(on|off|toggle)[12]$/.test(command)) {
    const index = Number(command.at(-1)) - 1;
    if (command.startsWith("on")) loads[index].relay = true;
    if (command.startsWith("off")) loads[index].relay = false;
    if (command.startsWith("toggle")) loads[index].relay = !loads[index].relay;
    if (!loads[index].relay) {
      clearLoadCharts(index);
    }
    appendSerial(`Relay ${index + 1} ${loads[index].relay ? "ON" : "OFF"}`);
  } else if (command === "help") {
    printHelp();
  } else {
    appendSerial("Unknown command");
    printHelp();
  }

  updateVisualState();
}

function printHelp() {
  appendSerial("");
  appendSerial("Commands: on | off | toggle | reset | on1 | off1 | toggle1 | on2 | off2 | toggle2 | help");
  appendSerial("Output: LOAD Vrms Irms Pavg VA Wh kWh Relay");
  appendSerial("");
}

function setZoom(value) {
  zoom = Math.max(0.42, Math.min(1.12, value));
  updateVisualState();
}

function fitCircuit() {
  const stageWidth = canvasStage.clientWidth;
  const stageHeight = canvasStage.clientHeight;
  const scaleX = stageWidth / 2200;
  const scaleY = stageHeight / 1900;
  setZoom(Math.min(scaleX, scaleY) * 0.94);
  canvasStage.scrollTo({ left: 0, top: 0, behavior: "smooth" });
}

function startStagePan(event) {
  if (event.button !== 2) return;
  event.preventDefault();
  event.stopPropagation();
  stagePan = {
    pointerId: event.pointerId ?? null,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: canvasStage.scrollLeft,
    scrollTop: canvasStage.scrollTop,
  };
  canvasStage.classList.add("panning");
  if (event.pointerId !== undefined && canvasStage.setPointerCapture) {
    try {
      canvasStage.setPointerCapture(event.pointerId);
    } catch {
      // Mouse fallback below still handles panning if pointer capture is unavailable.
    }
  }
}

function moveStagePan(event) {
  if (!stagePan) return;
  if (stagePan.pointerId !== null && event.pointerId !== undefined && event.pointerId !== stagePan.pointerId) return;
  event.preventDefault();
  canvasStage.scrollLeft = stagePan.scrollLeft - (event.clientX - stagePan.startX);
  canvasStage.scrollTop = stagePan.scrollTop - (event.clientY - stagePan.startY);
}

function stopStagePan(event) {
  if (!stagePan) return;
  if (stagePan.pointerId !== null && event.pointerId !== undefined && event.pointerId !== stagePan.pointerId) return;
  if (event.pointerId !== undefined && canvasStage.hasPointerCapture?.(event.pointerId)) {
    canvasStage.releasePointerCapture(event.pointerId);
  }
  stagePan = null;
  canvasStage.classList.remove("panning");
}

function isCanvasStageEvent(event) {
  return event.target === canvasStage || canvasStage.contains(event.target);
}

function preventCanvasContextMenu(event) {
  if (!isCanvasStageEvent(event)) return;
  event.preventDefault();
  event.stopPropagation();
}

runButton.addEventListener("click", () => {
  if (running) stop();
  else start();
});

resetButton.addEventListener("click", resetEnergy);
fitButton.addEventListener("click", fitCircuit);
zoomInButton.addEventListener("click", () => setZoom(zoom + 0.08));
zoomOutButton.addEventListener("click", () => setZoom(zoom - 0.08));
wireButton.addEventListener("click", () => {
  wireMode = !wireMode;
  if (!wireMode) {
    selectedPin = null;
    previewWire.setAttribute("d", "");
  }
  document.body.classList.toggle("wire-mode", wireMode);
  wireButton.classList.toggle("active", wireMode);
  updateWireReadout();
  renderPinAnchors();
});
deleteWireButton.addEventListener("click", deleteSelectedWire);
autoRouteButton.addEventListener("click", () => {
  autoRouteAll({ resetLayout: true });
  fitCircuit();
  appendSerial("Circuit auto-routed");
});

document.addEventListener("contextmenu", preventCanvasContextMenu, true);
canvasStage.addEventListener("contextmenu", preventCanvasContextMenu);
canvasStage.addEventListener("pointerdown", startStagePan);
canvasStage.addEventListener("pointermove", moveStagePan);
canvasStage.addEventListener("pointerup", stopStagePan);
canvasStage.addEventListener("pointercancel", stopStagePan);
canvasStage.addEventListener("mousedown", startStagePan);
window.addEventListener("mousemove", (event) => {
  if (!stagePan || !(event.buttons & 2)) return;
  moveStagePan(event);
});
window.addEventListener("mouseup", stopStagePan);
canvasStage.addEventListener("pointermove", updatePreviewWire);
canvasStage.addEventListener("click", (event) => {
  if (event.target !== canvasStage && event.target !== circuit) return;
  selectedPin = null;
  selectedWireIndex = null;
  previewWire.setAttribute("d", "");
  updateWireReadout();
  renderPinAnchors();
  renderWires();
});

window.addEventListener("pointermove", (event) => {
  moveSegmentTo(event);
  moveWireBy(event);
});

window.addEventListener("pointerup", () => {
  if (segmentDrag) {
    settleWireRoute(segmentDrag.wireIndex);
  }
  if (wireDrag) {
    settleWireRoute(wireDrag.index);
  }
  segmentDrag = null;
  wireDrag = null;
  updateWireReadout();
  renderEditor();
});

canvasStage.addEventListener(
  "wheel",
  (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? 0.06 : -0.06));
  },
  { passive: false }
);

window.addEventListener("keydown", (event) => {
  if (event.key === "Delete" || event.key === "Backspace") {
    deleteSelectedWire();
  }
  if (event.key === "Escape") {
    selectedPin = null;
    selectedWireIndex = null;
    wireMode = false;
    document.body.classList.remove("wire-mode");
    wireButton.classList.remove("active");
    previewWire.setAttribute("d", "");
    updateWireReadout();
    renderPinAnchors();
    renderWires();
  }
});

serialForm.addEventListener("submit", (event) => {
  event.preventDefault();
  handleCommand(serialInput.value);
  serialInput.value = "";
});

document.querySelectorAll("[data-command]").forEach((button) => {
  button.addEventListener("click", () => handleCommand(button.dataset.command));
});

voltageRange.addEventListener("input", () => {
  voltageRms = Number(voltageRange.value);
  updateVisualState();
});

document.querySelectorAll("[data-resistance]").forEach((input) => {
  input.addEventListener("input", () => {
    loads[Number(input.dataset.resistance)].resistanceOhms = Number(input.value);
    updateVisualState();
  });
});

document.querySelectorAll("[data-wire-color]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedWireColor = button.dataset.wireColor;
    document.querySelectorAll("[data-wire-color]").forEach((swatch) => {
      swatch.classList.toggle("active", swatch === button);
    });
    if (wireMode && selectedPin) {
      previewWire.setAttribute("stroke", wireColors[selectedWireColor] || wireColors.red);
    }
  });
});

initPinAnchors();
initPartDragging();
autoRouteAll({ resetLayout: true });
appendSerial("AC Power Monitoring ESP32-S3 Local Web Simulator");
appendSerial("This runs locally in the browser and mirrors the project Serial Monitor behavior.");
printHelp();
fitCircuit();
renderMeasurementCharts();
updateVisualState();
