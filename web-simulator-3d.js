import * as THREE from "three";
import { OrbitControls } from "./vendor/three/examples/jsm/controls/OrbitControls.js";

const canvas = document.querySelector("#scene3dCanvas");
const shell = document.querySelector("#scene3dShell");
const fallback = document.querySelector("#scene3dFallback");
const statusText = document.querySelector("#scene3dStatus");
const resetCameraButton = document.querySelector("#scene3dResetCamera");

const colors = {
  board: 0x244f43,
  boardDark: 0x15352f,
  pcb: 0x1f7a5e,
  pcbDark: 0x0d4c3e,
  metal: 0xbfc8cf,
  black: 0x111318,
  plastic: 0x222832,
  relayBlue: 0x1a62c6,
  switchPlate: 0xdfe6ee,
  switchLever: 0xf7f8fa,
  red: 0xf5222d,
  blue: 0x2898dd,
  blackWire: 0x050505,
  purple: 0x7e3fb2,
  orange: 0xffae42,
  green: 0x35c253,
  tray: 0x3a414b,
};

const sceneState = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  clickable: [],
  wireHitTargets: [],
  loadViews: [],
  dynamicWires: [],
  fanTemplate: null,
  controlPins: {},
  hoverSwitch: null,
  hoverWire: null,
  selectedWire: null,
  running: false,
  lastTime: 0,
};

const loadLayout = [
  { index: 0, x: -1.25, z: -1.45, label: "Load 1" },
  { index: 1, x: 2.15, z: -1.45, label: "Load 2" },
  { index: 2, x: -1.25, z: 1.45, label: "Load 3" },
  { index: 3, x: 2.15, z: 1.45, label: "Load 4" },
];

const materialCache = new Map();
const underBoardWireY = 0.074;

function material(name, options) {
  if (!materialCache.has(name)) {
    materialCache.set(name, new THREE.MeshStandardMaterial(options));
  }
  return materialCache.get(name);
}

function boxMesh(width, height, depth, mat, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
  mesh.position.set(position[0], position[1], position[2]);
  return mesh;
}

function cylinderMesh(radiusTop, radiusBottom, height, radialSegments, mat, position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments), mat);
  mesh.position.set(position[0], position[1], position[2]);
  return mesh;
}

function addLabel(parent, text, position, scale = 0.34) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas2d = document.createElement("canvas");
  const context = canvas2d.getContext("2d");
  canvas2d.width = Math.round(256 * pixelRatio);
  canvas2d.height = Math.round(72 * pixelRatio);
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, 256, 72);
  context.fillStyle = "rgba(14, 17, 22, 0.78)";
  context.strokeStyle = "rgba(255, 255, 255, 0.16)";
  context.lineWidth = 2;
  roundRect(context, 8, 10, 240, 46, 7);
  context.fill();
  context.stroke();
  context.font = "700 24px Arial, Helvetica, sans-serif";
  context.fillStyle = "#eef4fb";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 128, 33);

  const texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      })
  );
  sprite.position.set(position[0], position[1], position[2]);
  sprite.scale.set(scale * 2.6, scale * 0.72, 1);
  parent.add(sprite);
  return sprite;
}

function addMiniLabel(parent, text, position, scale = 0.1) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const canvas2d = document.createElement("canvas");
  const context = canvas2d.getContext("2d");
  canvas2d.width = Math.round(128 * pixelRatio);
  canvas2d.height = Math.round(42 * pixelRatio);
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, 128, 42);
  context.fillStyle = "rgba(9, 12, 16, 0.82)";
  context.fillRect(4, 7, 120, 28);
  context.font = "700 18px Arial, Helvetica, sans-serif";
  context.fillStyle = "#eef4fb";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 64, 21);

  const texture = new THREE.CanvasTexture(canvas2d);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
      })
  );
  sprite.position.set(position[0], position[1], position[2]);
  sprite.scale.set(scale * 2.4, scale * 0.78, 1);
  parent.add(sprite);
  return sprite;
}

function addPinTerminal(parent, name, position, color, label = name, radius = 0.04) {
  const pin = cylinderMesh(
      radius,
      radius,
      0.052,
      20,
      material(`pin-${color.toString(16)}`, {
        color,
        metalness: 0.18,
        roughness: 0.42,
      }),
      position
  );
  pin.userData.pinName = name;
  parent.add(pin);
  addMiniLabel(parent, label, [position[0], position[1] + 0.09, position[2]], 0.072);
  return pin;
}

function offsetPoint(point, dx = 0, dy = 0, dz = 0) {
  return [point[0] + dx, point[1] + dy, point[2] + dz];
}

function worldPoint(groupOrigin, point) {
  return [groupOrigin.x + point[0], groupOrigin.y + point[1], groupOrigin.z + point[2]];
}

function areSamePoint(a, b) {
  return Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001 && Math.abs(a[2] - b[2]) < 0.001;
}

function pushUniquePoint(points, point) {
  if (points.length === 0 || !areSamePoint(points[points.length - 1], point)) {
    points.push(point);
  }
}

function routeUnderBoard(points) {
  if (points.length < 2) return points;
  const routed = [];
  const start = points[0];
  const end = points[points.length - 1];
  pushUniquePoint(routed, start);
  pushUniquePoint(routed, [start[0], underBoardWireY, start[2]]);
  for (const point of points.slice(1, -1)) {
    pushUniquePoint(routed, [point[0], underBoardWireY, point[2]]);
  }
  pushUniquePoint(routed, [end[0], underBoardWireY, end[2]]);
  pushUniquePoint(routed, end);
  return routed;
}

function createRoundedPath(vectors, cornerRadius = 0.085) {
  const path = new THREE.CurvePath();
  if (vectors.length < 2) return path;

  let currentStart = vectors[0].clone();
  for (let i = 1; i < vectors.length - 1; i++) {
    const previous = vectors[i - 1];
    const corner = vectors[i];
    const next = vectors[i + 1];
    const toPrevious = previous.clone().sub(corner);
    const toNext = next.clone().sub(corner);
    const previousLength = toPrevious.length();
    const nextLength = toNext.length();

    if (previousLength < 0.001 || nextLength < 0.001) continue;

    const previousDirection = toPrevious.normalize();
    const nextDirection = toNext.normalize();
    if (Math.abs(previousDirection.dot(nextDirection)) > 0.998) continue;

    const radius = Math.min(cornerRadius, previousLength * 0.38, nextLength * 0.38);
    if (radius < 0.008) continue;

    const bendStart = corner.clone().add(previousDirection.multiplyScalar(radius));
    const bendEnd = corner.clone().add(nextDirection.multiplyScalar(radius));
    if (currentStart.distanceTo(bendStart) > 0.001) {
      path.add(new THREE.LineCurve3(currentStart, bendStart));
    }
    path.add(new THREE.QuadraticBezierCurve3(bendStart, corner.clone(), bendEnd));
    currentStart = bendEnd;
  }

  const last = vectors[vectors.length - 1];
  if (currentStart.distanceTo(last) > 0.001) {
    path.add(new THREE.LineCurve3(currentStart, last));
  }
  return path;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function createPcb(width, depth, label) {
  const group = new THREE.Group();
  group.add(boxMesh(width, 0.08, depth, material("pcb", { color: colors.pcb, roughness: 0.72 }), [0, 0.08, 0]));
  group.add(boxMesh(width - 0.12, 0.035, depth - 0.12, material("pcbDark", { color: colors.pcbDark, roughness: 0.78 }), [0, 0.145, 0]));
  addLabel(group, label, [0, 0.32, depth / 2 + 0.15], 0.26);
  return group;
}

function addPinRows(group, xOffset, count, depth, side = 1) {
  const pinMat = material("goldPins", { color: 0xd7b244, metalness: 0.25, roughness: 0.42 });
  const step = depth / (count + 1);
  for (let i = 0; i < count; i++) {
    const pin = boxMesh(0.05, 0.045, 0.13, pinMat, [xOffset, 0.19, -depth / 2 + step * (i + 1)]);
    pin.rotation.y = side > 0 ? 0 : Math.PI;
    group.add(pin);
  }
}

function createEsp32() {
  const group = createPcb(0.92, 1.86, "ESP32-S3");
  group.add(boxMesh(0.52, 0.12, 0.56, material("shield", { color: 0xb9c0c7, metalness: 0.35, roughness: 0.36 }), [0, 0.24, -0.28]));
  group.add(boxMesh(0.34, 0.12, 0.22, material("usb", { color: 0xcfd5da, metalness: 0.45, roughness: 0.32 }), [0, 0.23, 0.81]));
  group.add(boxMesh(0.62, 0.045, 0.26, material("antenna", { color: 0x272b31, roughness: 0.75 }), [0, 0.205, -0.77]));
  addPinRows(group, -0.39, 14, 1.5, -1);
  addPinRows(group, 0.39, 14, 1.5, 1);
  return group;
}

function createMux() {
  const group = new THREE.Group();
  group.add(boxMesh(0.46, 0.12, 0.86, material("icBody", { color: 0x111111, roughness: 0.68 }), [0, 0.16, 0]));
  group.add(cylinderMesh(0.07, 0.07, 0.012, 24, material("icDot", { color: 0x6f7680, roughness: 0.5 }), [0, 0.228, -0.31]));
  group.children[group.children.length - 1].rotation.x = Math.PI / 2;
  const pinMat = material("icPins", { color: colors.metal, metalness: 0.4, roughness: 0.35 });
  for (let i = 0; i < 8; i++) {
    const z = -0.34 + i * 0.097;
    group.add(boxMesh(0.13, 0.035, 0.03, pinMat, [-0.31, 0.14, z]));
    group.add(boxMesh(0.13, 0.035, 0.03, pinMat, [0.31, 0.14, z]));
  }
  addLabel(group, "CD4051", [0, 0.36, 0.58], 0.22);
  return group;
}

function createSensor(label) {
  const group = createPcb(0.72, 0.62, label);
  group.add(boxMesh(0.46, 0.2, 0.18, material("terminalGreen", { color: 0x43a047, roughness: 0.58 }), [0, 0.28, -0.18]));
  group.add(boxMesh(0.28, 0.08, 0.22, material("sensorChip", { color: colors.black, roughness: 0.65 }), [0.06, 0.24, 0.13]));
  addPinRows(group, 0, 3, 0.34, 1);
  return group;
}

function createRelay() {
  const group = createPcb(0.76, 0.68, "Relay");
  group.add(boxMesh(0.46, 0.27, 0.36, material("relayBlue", { color: colors.relayBlue, roughness: 0.6 }), [0.03, 0.31, -0.02]));
  group.add(boxMesh(0.18, 0.18, 0.38, material("terminalGreen", { color: 0x43a047, roughness: 0.58 }), [-0.28, 0.27, -0.04]));
  group.add(boxMesh(0.16, 0.18, 0.38, material("terminalBlue", { color: 0x2f7fe7, roughness: 0.58 }), [0.31, 0.27, -0.04]));
  const led = cylinderMesh(0.055, 0.055, 0.035, 24, material("relayLedOff", { color: 0x224b2e, emissive: 0x000000, roughness: 0.4 }), [-0.22, 0.38, 0.25]);
  led.rotation.x = Math.PI / 2;
  group.add(led);
  group.userData.relayLed = led;
  return group;
}

function createAcSource() {
  const group = new THREE.Group();
  const body = cylinderMesh(0.26, 0.26, 0.12, 48, material("acBody", { color: 0xe5e8eb, roughness: 0.5 }), [0, 0.16, 0]);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  group.add(boxMesh(0.08, 0.035, 0.28, material("acSlot", { color: colors.black, roughness: 0.6 }), [-0.09, 0.23, 0]));
  group.add(boxMesh(0.08, 0.035, 0.28, material("acSlot", { color: colors.black, roughness: 0.6 }), [0.09, 0.23, 0]));
  addLabel(group, "AC 220V", [0, 0.42, 0.38], 0.22);
  return group;
}

function createSwitch(index) {
  const group = new THREE.Group();
  const plate = boxMesh(0.74, 0.11, 0.54, material("switchPlate", { color: colors.switchPlate, roughness: 0.45 }), [0, 0.22, 0]);
  const rocker = boxMesh(0.38, 0.1, 0.36, material("switchLever", { color: colors.switchLever, roughness: 0.38 }), [0, 0.32, 0]);
  const border = boxMesh(0.84, 0.04, 0.64, material("switchBorder", { color: 0x98a2ad, roughness: 0.5 }), [0, 0.14, 0]);
  plate.userData.switchIndex = index;
  rocker.userData.switchIndex = index;
  border.userData.switchIndex = index;
  group.add(border, plate, rocker);
  addPinTerminal(group, "SIG", [-0.25, 0.22, -0.38], colors.orange, "SIG", 0.035);
  addPinTerminal(group, "GND", [0.25, 0.22, -0.38], colors.blackWire, "GND", 0.035);
  group.userData.rocker = rocker;
  group.userData.switchIndex = index;
  sceneState.clickable.push(plate, rocker, border);
  addLabel(group, `S${index + 1}`, [0, 0.62, 0.45], 0.2);
  return group;
}

function createHouseFan() {
  const group = new THREE.Group();
  const shellMat = material("homeFanShell", { color: 0x4b5563, roughness: 0.52 });
  const guardMat = material("homeFanGuard", { color: 0xd8dde2, metalness: 0.24, roughness: 0.35 });
  const bladeMat = material("homeFanBlade", { color: 0xf3f6fb, roughness: 0.42 });
  const darkMat = material("homeFanMotor", { color: 0x1c2430, roughness: 0.5 });

  const base = cylinderMesh(0.3, 0.36, 0.08, 40, shellMat, [0, 0.09, 0.34]);
  group.add(base);
  const pole = cylinderMesh(0.035, 0.045, 0.72, 24, guardMat, [0, 0.45, 0.22]);
  group.add(pole);
  group.add(boxMesh(0.18, 0.12, 0.18, darkMat, [0, 0.81, 0.1]));

  const head = new THREE.Group();
  head.position.set(0, 0.9, -0.05);
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.018, 10, 72), guardMat);
  const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.012, 8, 60), guardMat);
  const smallRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.01, 8, 48), guardMat);
  head.add(outerRing, innerRing, smallRing);
  for (let i = 0; i < 16; i++) {
    const spoke = boxMesh(0.84, 0.008, 0.012, guardMat, [0, 0, 0]);
    spoke.rotation.z = (i / 16) * Math.PI;
    head.add(spoke);
  }

  const rotor = new THREE.Group();
  rotor.position.z = -0.015;
  for (let i = 0; i < 5; i++) {
    const angle = i * ((Math.PI * 2) / 5);
    const blade = boxMesh(0.13, 0.034, 0.028, bladeMat, [Math.cos(angle) * 0.16, Math.sin(angle) * 0.16, 0]);
    blade.scale.set(1.8, 0.55, 1);
    blade.rotation.z = angle + 0.34;
    rotor.add(blade);
  }
  const hub = cylinderMesh(0.105, 0.105, 0.065, 32, darkMat, [0, 0, -0.025]);
  hub.rotation.x = Math.PI / 2;
  rotor.add(hub);
  head.add(rotor);

  const backMotor = cylinderMesh(0.16, 0.18, 0.19, 32, darkMat, [0, 0, 0.1]);
  backMotor.rotation.x = Math.PI / 2;
  head.add(backMotor);
  group.add(head);
  addPinTerminal(group, "L", [-0.17, 0.18, 0.66], colors.red, "L", 0.038);
  addPinTerminal(group, "N", [0.17, 0.18, 0.66], colors.blue, "N", 0.038);
  group.userData.rotor = rotor;
  group.userData.spinAxis = "z";
  return group;
}

function cloneFanAsset() {
  return createHouseFan();
}

function replaceFanModelsWithAsset() {
  for (const view of sceneState.loadViews) {
    view.fanSlot.clear();
    const fan = cloneFanAsset();
    view.fanSlot.add(fan);
    view.fanRotor = fan.userData.rotor || fan;
    view.fanSpinAxis = fan.userData.spinAxis || "z";
  }
}

function createWire(points, color, loadIndex, role, radius = 0.018, label = "") {
  const routedPoints = routeUnderBoard(points);
  const vectors = routedPoints.map((point) => new THREE.Vector3(point[0], point[1], point[2]));
  const path = createRoundedPath(vectors);
  const geometry = new THREE.TubeGeometry(path, Math.max(8, routedPoints.length * 8), radius, 8, false);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0,
    roughness: 0.38,
    metalness: 0.05,
    transparent: true,
    opacity: 0.62,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.userData = {
    loadIndex,
    role,
    baseColor: color,
    label: label || `Load ${loadIndex + 1} ${role.toUpperCase()}`,
  };
  const hitGeometry = new THREE.TubeGeometry(path, Math.max(8, routedPoints.length * 8), Math.max(radius * 2.7, 0.035), 8, false);
  const hitMesh = new THREE.Mesh(
      hitGeometry,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        depthWrite: false,
        opacity: 0,
        transparent: true,
      })
  );
  hitMesh.userData.wireTarget = mesh;
  mesh.add(hitMesh);
  sceneState.wireHitTargets.push(hitMesh);
  sceneState.dynamicWires.push(mesh);
  return mesh;
}

function createWireTray(points, width = 0.12) {
  const group = new THREE.Group();
  const mat = material("wireTray", { color: colors.tray, roughness: 0.75 });
  for (let i = 0; i < points.length - 1; i++) {
    const start = new THREE.Vector3(points[i][0], points[i][1], points[i][2]);
    const end = new THREE.Vector3(points[i + 1][0], points[i + 1][1], points[i + 1][2]);
    const delta = end.clone().sub(start);
    const length = Math.max(delta.length(), 0.001);
    const tray = boxMesh(width, 0.035, length, mat);
    tray.position.copy(start.add(end).multiplyScalar(0.5));
    tray.position.y -= 0.035;
    tray.rotation.y = Math.atan2(delta.x, delta.z);
    group.add(tray);
  }
  return group;
}

function buildWorkbench() {
  const scene = sceneState.scene;
  const tableMat = material("bench", { color: 0x252b31, roughness: 0.88 });
  const table = boxMesh(8.9, 0.16, 6.1, tableMat, [0, -0.08, 0]);
  scene.add(table);

  const gridMat = material("benchGrid", { color: 0x3c444e, roughness: 0.72 });
  for (let x = -4; x <= 4; x += 1) {
    scene.add(boxMesh(0.012, 0.012, 5.72, gridMat, [x, 0.015, 0]));
  }
  for (let z = -2.5; z <= 2.5; z += 1) {
    scene.add(boxMesh(8.32, 0.012, 0.012, gridMat, [0, 0.016, z]));
  }

  const controlTray = createWireTray([
    [-3.05, 0.06, -2.34],
    [-3.05, 0.06, 2.34],
  ], 0.22);
  scene.add(controlTray);
  addLabel(scene, "Control + sensor bus", [-3.15, 0.36, 2.78], 0.3);
}

function buildControlArea() {
  const scene = sceneState.scene;
  const base = boxMesh(1.58, 0.06, 4.96, material("controlPad", { color: 0x20262d, roughness: 0.82 }), [-3.82, 0.035, 0]);
  scene.add(base);

  const esp = createEsp32();
  esp.position.set(-3.95, 0.04, -0.93);
  scene.add(esp);

  const mux = createMux();
  mux.position.set(-3.84, 0.06, 1.32);
  scene.add(mux);

  sceneState.controlPins = {
    esp5v: [-3.55, 0.33, -0.28],
    espGnd: [-3.55, 0.33, 0.04],
    relayGpio: [
      [-3.55, 0.34, -1.04],
      [-3.55, 0.34, -0.86],
      [-3.55, 0.34, -0.68],
      [-3.55, 0.34, -0.5],
    ],
    switchGpio: [
      [-4.36, 0.34, -1.04],
      [-4.36, 0.34, -0.86],
      [-4.36, 0.34, -0.68],
      [-4.36, 0.34, -0.5],
    ],
    muxCurrent: [
      [-3.47, 0.31, 1.0],
      [-3.47, 0.31, 1.16],
      [-3.47, 0.31, 1.32],
      [-3.47, 0.31, 1.48],
    ],
    muxVoltage: [-4.18, 0.31, 1.58],
  };

  addPinTerminal(scene, "5V", sceneState.controlPins.esp5v, colors.red, "5V", 0.035);
  addPinTerminal(scene, "GND", sceneState.controlPins.espGnd, colors.blackWire, "GND", 0.035);
  sceneState.controlPins.relayGpio.forEach((pin, index) => {
    addPinTerminal(scene, `R${index + 1}`, pin, colors.green, `R${index + 1}`, 0.03);
  });
  sceneState.controlPins.switchGpio.forEach((pin, index) => {
    addPinTerminal(scene, `S${index + 1}`, pin, colors.orange, `S${index + 1}`, 0.03);
  });
  sceneState.controlPins.muxCurrent.forEach((pin, index) => {
    addPinTerminal(scene, `C${index}`, pin, colors.purple, `C${index}`, 0.03);
  });
  addPinTerminal(scene, "C7", sceneState.controlPins.muxVoltage, colors.purple, "C7", 0.03);
}

function buildLoadPod(config) {
  const { index, x, z, label } = config;
  const scene = sceneState.scene;
  const origin = new THREE.Vector3(x, 0, z);
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const podBase = boxMesh(3.04, 0.05, 2.56, material(`podBase${index}`, { color: 0x1d242b, roughness: 0.82 }), [0.28, 0.03, 0]);
  group.add(podBase);
  addLabel(group, label, [-0.83, 0.35, -1.04], 0.25);

  const ac = createAcSource();
  ac.position.set(-0.94, 0.02, -0.86);
  group.add(ac);

  const sensor = createSensor("ACS712");
  sensor.position.set(-0.56, 0.04, 0.04);
  group.add(sensor);

  const voltageSensor = createSensor("ZMPT101B");
  voltageSensor.position.set(-0.56, 0.04, 0.75);
  group.add(voltageSensor);

  const relay = createRelay();
  relay.position.set(0.2, 0.04, 0.12);
  group.add(relay);

  const devicePad = boxMesh(1.38, 0.045, 1.98, material(`devicePad${index}`, { color: 0x28303a, roughness: 0.82 }), [1.18, 0.06, -0.08]);
  group.add(devicePad);

  const fanSlot = new THREE.Group();
  fanSlot.position.set(1.18, 0.07, -0.66);
  const fan = cloneFanAsset();
  fanSlot.add(fan);
  group.add(fanSlot);

  const wallSwitch = createSwitch(index);
  wallSwitch.position.set(1.18, 0.05, 0.69);
  group.add(wallSwitch);

  const pins = {
    acL: [-1.04, 0.29, -0.61],
    acN: [-0.84, 0.29, -0.61],
    acsIn: [-0.83, 0.35, -0.14],
    acsOutLine: [-0.3, 0.35, -0.14],
    acsVcc: [-0.8, 0.31, 0.4],
    acsOut: [-0.56, 0.31, 0.4],
    acsGnd: [-0.32, 0.31, 0.4],
    zmptL: [-0.83, 0.35, 0.57],
    zmptN: [-0.3, 0.35, 0.57],
    zmptVcc: [-0.8, 0.31, 1.11],
    zmptOut: [-0.56, 0.31, 1.11],
    zmptGnd: [-0.32, 0.31, 1.11],
    relayVcc: [-0.14, 0.43, -0.08],
    relayGnd: [-0.14, 0.43, 0.12],
    relayIn: [-0.14, 0.43, 0.31],
    relayNo: [0.59, 0.43, -0.09],
    relayCom: [0.59, 0.43, 0.12],
    relayNc: [0.59, 0.43, 0.31],
    fanL: [1.01, 0.25, 0],
    fanN: [1.35, 0.25, 0],
    switchSig: [0.93, 0.27, 0.31],
    switchGnd: [1.43, 0.27, 0.31],
  };

  [
    ["acL", colors.red, "L"],
    ["acN", colors.blue, "N"],
    ["acsIn", colors.red, "L IN"],
    ["acsOutLine", colors.red, "L OUT"],
    ["acsVcc", colors.red, "VCC"],
    ["acsOut", colors.purple, "OUT"],
    ["acsGnd", colors.blackWire, "GND"],
    ["zmptL", colors.red, "L"],
    ["zmptN", colors.blue, "N"],
    ["zmptVcc", colors.red, "VCC"],
    ["zmptOut", colors.purple, "OUT"],
    ["zmptGnd", colors.blackWire, "GND"],
    ["relayVcc", colors.red, "VCC"],
    ["relayGnd", colors.blackWire, "GND"],
    ["relayIn", colors.green, "IN"],
    ["relayNo", colors.red, "NO"],
    ["relayCom", colors.red, "COM"],
    ["relayNc", 0x9098a3, "NC"],
    ["fanL", colors.red, "L"],
    ["fanN", colors.blue, "N"],
    ["switchSig", colors.orange, "SIG"],
    ["switchGnd", colors.blackWire, "GND"],
  ].forEach(([pinName, pinColor, pinLabel]) => {
    addPinTerminal(group, pinName, pins[pinName], pinColor, pinLabel, 0.032);
  });

  group.add(createWireTray([
    [-1.08, 0.06, -1.16],
    [0.74, 0.06, -1.16],
    [0.74, 0.06, 1.14],
  ], 0.12));
  group.add(createWireTray([
    [0.78, 0.06, 0.98],
    [1.62, 0.06, 0.98],
  ], 0.08));
  group.add(createWireTray([
    [0.72, 0.06, -0.1],
    [1.54, 0.06, -0.1],
  ], 0.08));

  const localWires = [
    createWire([pins.acL, [-1.12, 0.35, -1.16], [-0.83, 0.35, -1.16], pins.acsIn], colors.red, index, "ac", 0.018, `${label}: AC.L -> ACS712.L_IN`),
    createWire([pins.acsOutLine, [-0.02, 0.35, -0.14], [-0.02, 0.35, 0.12], pins.relayCom], colors.red, index, "ac", 0.018, `${label}: ACS712.L_OUT -> Relay.COM`),
    createWire([pins.relayNo, [0.78, 0.38, -0.09], [0.78, 0.32, -0.1], pins.fanL], colors.red, index, "ac", 0.018, `${label}: Relay.NO -> Fan.L`),
    createWire([pins.acN, [1.35, 0.29, -1.16], pins.fanN], colors.blue, index, "ac", 0.018, `${label}: AC.N -> Fan.N`),
    createWire([pins.acL, [-1.16, 0.42, -0.44], [-1.16, 0.42, 0.57], pins.zmptL], colors.red, index, "ac", 0.014, `${label}: AC.L -> ZMPT101B.L`),
    createWire([pins.acN, [-1.02, 0.38, -0.48], [-1.02, 0.38, 0.57], pins.zmptN], colors.blue, index, "ac", 0.014, `${label}: AC.N -> ZMPT101B.N`),
    createWire([pins.relayNc, [0.72, 0.43, 0.31], [0.78, 0.36, 0.4]], 0x8c949e, index, "unused", 0.012, `${label}: Relay.NC spare`),
    createWire([pins.switchSig, [0.82, 0.31, 0.31], [0.82, 0.31, 0.98], [-0.2, 0.31, 0.98]], colors.orange, index, "switch", 0.015, `${label}: Switch.SIG underside exit`),
    createWire([pins.switchGnd, [1.56, 0.27, 0.31], [1.56, 0.27, 1.14], [-0.04, 0.27, 1.14]], colors.blackWire, index, "ground", 0.015, `${label}: Switch.GND underside exit`),
    createWire([pins.relayVcc, [-0.34, 0.36, -0.08], [-0.34, 0.36, -0.72], [-0.72, 0.36, -0.72]], colors.red, index, "control", 0.014, `${label}: Relay.VCC underside exit`),
    createWire([pins.relayGnd, [-0.24, 0.31, 0.12], [-0.24, 0.31, 1.0], [-0.06, 0.31, 1.0]], colors.blackWire, index, "ground", 0.014, `${label}: Relay.GND underside exit`),
    createWire([pins.relayIn, [-0.04, 0.39, 0.31], [-0.04, 0.39, 0.82]], colors.green, index, "relay", 0.014, `${label}: Relay.IN underside exit`),
    createWire([pins.acsVcc, [-0.8, 0.36, 0.26], [-0.9, 0.36, 0.26]], colors.red, index, "control", 0.013, `${label}: ACS712.VCC underside exit`),
    createWire([pins.acsGnd, [-0.32, 0.33, 0.56], [-0.15, 0.33, 0.56]], colors.blackWire, index, "ground", 0.013, `${label}: ACS712.GND underside exit`),
    createWire([pins.acsOut, [-0.56, 0.39, 0.58], [-0.74, 0.39, 0.58]], colors.purple, index, "signal", 0.013, `${label}: ACS712.OUT underside exit`),
    createWire([pins.zmptVcc, [-0.8, 0.36, 0.96], [-0.96, 0.36, 0.96]], colors.red, index, "control", 0.013, `${label}: ZMPT101B.VCC underside exit`),
    createWire([pins.zmptGnd, [-0.32, 0.33, 1.24], [-0.12, 0.33, 1.24]], colors.blackWire, index, "ground", 0.013, `${label}: ZMPT101B.GND underside exit`),
    createWire([pins.zmptOut, [-0.56, 0.39, 1.28], [-0.74, 0.39, 1.28]], colors.purple, index, "signal", 0.013, `${label}: ZMPT101B.OUT underside exit`),
  ];
  localWires.forEach((wire) => group.add(wire));

  scene.add(group);

  const rowLane = z + (z < 0 ? 1.04 : -1.04);
  const controlX = -3.05;
  scene.add(createWireTray([
    [controlX, 0.06, rowLane],
    [x - 0.96, 0.06, rowLane],
  ], 0.16));

  const wp = (pinName) => worldPoint(origin, pins[pinName]);
  const control = sceneState.controlPins;
  const lanePoint = (pinName, y = 0.36, offset = 0) => [worldPoint(origin, pins[pinName])[0], y, rowLane + offset];
  const routeFromControl = (from, pinName, color, role, offset = 0, radius = 0.012, routeLabel = "") => {
    scene.add(createWire([
      from,
      [controlX + offset, from[1], rowLane + offset],
      [worldPoint(origin, pins[pinName])[0] - 0.12, from[1], rowLane + offset],
      lanePoint(pinName, from[1], offset),
      wp(pinName),
    ], color, index, role, radius, routeLabel));
  };

  routeFromControl(control.esp5v, "relayVcc", colors.red, "control", -0.18, 0.012, `${label}: ESP.5V -> Relay.VCC`);
  routeFromControl(control.espGnd, "relayGnd", colors.blackWire, "ground", -0.1, 0.012, `${label}: ESP.GND -> Relay.GND`);
  routeFromControl(control.relayGpio[index], "relayIn", colors.green, "relay", 0, 0.012, `${label}: ESP.R${index + 1} -> Relay.IN`);
  routeFromControl(control.esp5v, "acsVcc", colors.red, "control", 0.1, 0.011, `${label}: ESP.5V -> ACS712.VCC`);
  routeFromControl(control.espGnd, "acsGnd", colors.blackWire, "ground", 0.18, 0.011, `${label}: ESP.GND -> ACS712.GND`);
  routeFromControl(control.muxCurrent[index], "acsOut", colors.purple, "signal", 0.26, 0.011, `${label}: MUX.C${index} -> ACS712.OUT`);
  routeFromControl(control.esp5v, "zmptVcc", colors.red, "control", 0.34, 0.011, `${label}: ESP.5V -> ZMPT101B.VCC`);
  routeFromControl(control.espGnd, "zmptGnd", colors.blackWire, "ground", 0.42, 0.011, `${label}: ESP.GND -> ZMPT101B.GND`);
  routeFromControl(control.muxVoltage, "zmptOut", colors.purple, "signal", 0.5, 0.011, `${label}: MUX.C7 -> ZMPT101B.OUT`);
  routeFromControl(control.switchGpio[index], "switchSig", colors.orange, "switch", 0.58, 0.011, `${label}: ESP.S${index + 1} -> Switch.SIG`);
  routeFromControl(control.espGnd, "switchGnd", colors.blackWire, "ground", 0.66, 0.011, `${label}: ESP.GND -> Switch.GND`);

  sceneState.loadViews.push({
    index,
    group,
    relayLed: relay.userData.relayLed,
    switchRocker: wallSwitch.userData.rocker,
    fanSlot,
    fanRotor: fan.userData.rotor || fan,
    fanSpinAxis: fan.userData.spinAxis || "z",
  });
}

function buildScene() {
  buildWorkbench();
  buildControlArea();
  loadLayout.forEach(buildLoadPod);
  statusText.textContent = "3D WebGL aktif - klik saklar di dekat kipas";
}

function addLights() {
  const scene = sceneState.scene;
  scene.add(new THREE.HemisphereLight(0xd9e7ff, 0x20242a, 1.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(2.5, 5.5, 3.8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x9dc5ff, 0.75);
  fill.position.set(-4.5, 3.2, -2.4);
  scene.add(fill);
}

function resetCamera() {
  sceneState.camera.position.set(4.95, 5.25, 6.45);
  sceneState.controls.target.set(-0.12, 0.12, 0.34);
  sceneState.controls.update();
}

function resizeRenderer() {
  if (!sceneState.renderer || !shell) return;
  const width = Math.max(1, shell.clientWidth);
  const height = Math.max(1, shell.clientHeight);
  sceneState.renderer.setSize(width, height, false);
  sceneState.camera.aspect = width / height;
  sceneState.camera.updateProjectionMatrix();
}

function getCurrentState() {
  return window.acPowerSim?.getState?.() || {
    running: false,
    loads: [],
  };
}

function updatePointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  sceneState.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  sceneState.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  sceneState.raycaster.setFromCamera(sceneState.pointer, sceneState.camera);
}

function selectWire(wire) {
  sceneState.selectedWire = wire;
  if (statusText) {
    statusText.textContent = `Kabel dipilih: ${wire.userData.label}`;
  }
}

function updateSwitchHover(event) {
  if (!sceneState.renderer) return;
  updatePointerFromEvent(event);
  const intersects = sceneState.raycaster.intersectObjects(sceneState.clickable, false);
  sceneState.hoverSwitch = intersects[0]?.object?.userData?.switchIndex ?? null;
  if (sceneState.hoverSwitch !== null) {
    sceneState.hoverWire = null;
    canvas.style.cursor = "pointer";
    return;
  }

  const wireIntersects = sceneState.raycaster.intersectObjects(sceneState.wireHitTargets, false);
  sceneState.hoverWire = wireIntersects[0]?.object?.userData?.wireTarget ?? null;
  canvas.style.cursor = sceneState.hoverWire ? "pointer" : "grab";
}

function handleSwitchClick(event) {
  if (!sceneState.renderer) return;
  updateSwitchHover(event);
  if (sceneState.hoverSwitch !== null) {
    event.preventDefault();
    event.stopPropagation();
    window.acPowerSim?.toggleWallSwitch?.(sceneState.hoverSwitch);
    return;
  }

  if (sceneState.hoverWire) {
    event.preventDefault();
    event.stopPropagation();
    selectWire(sceneState.hoverWire);
    return;
  }

  sceneState.selectedWire = null;
  if (statusText) {
    statusText.textContent = "3D WebGL aktif - kabel bawah board + kipas rumah";
  }
}

function isWireActive(wire, state) {
  const load = state.loads[wire.userData.loadIndex];
  if (!load) return false;
  if (wire.userData.role === "ac") return Boolean(state.running && load.energized);
  if (wire.userData.role === "relay") return Boolean(load.relay);
  if (wire.userData.role === "switch") return Boolean(load.wallSwitch);
  if (wire.userData.role === "signal") return Boolean(state.running);
  return false;
}

function syncFromSimulator() {
  const state = getCurrentState();
  sceneState.running = Boolean(state.running);

  for (const view of sceneState.loadViews) {
    const load = state.loads[view.index];
    if (!load) continue;
    view.switchRocker.rotation.x = load.wallSwitch ? -0.22 : 0.22;
    view.switchRocker.position.y = load.wallSwitch ? 0.285 : 0.255;
    const ledMat = view.relayLed.material;
    ledMat.color.set(load.relay ? 0x44ff74 : 0x224b2e);
    ledMat.emissive.set(load.relay ? 0x22cc55 : 0x000000);
    ledMat.emissiveIntensity = load.relay ? 0.85 : 0;
  }
}

function animate(time) {
  const state = getCurrentState();
  const delta = Math.min(0.05, (time - sceneState.lastTime) / 1000 || 0.016);
  sceneState.lastTime = time;
  sceneState.controls.update();

  for (const view of sceneState.loadViews) {
    const load = state.loads[view.index];
    if (load?.energized && state.running) {
      if (view.fanSpinAxis === "z") {
        view.fanRotor.rotation.z += delta * 10.5;
      } else {
        view.fanRotor.rotation.y += delta * 8.5;
      }
    }
  }

  const pulse = (Math.sin(time * 0.006) + 1) * 0.5;
  for (const wire of sceneState.dynamicWires) {
    const active = isWireActive(wire, state);
    const selected = wire === sceneState.selectedWire;
    wire.material.color.setHex(selected ? 0xfff06a : wire.userData.baseColor);
    wire.material.emissive.setHex(selected ? 0xfff06a : wire.userData.baseColor);
    wire.material.opacity = selected ? 1 : active ? 1 : 0.46;
    wire.material.emissiveIntensity = selected ? 0.85 + pulse * 0.55 : active ? 0.22 + pulse * 0.32 : 0;
  }

  sceneState.renderer.render(sceneState.scene, sceneState.camera);
  window.requestAnimationFrame(animate);
}

function loadFanAsset() {
  statusText.textContent = "3D WebGL aktif - kabel bawah board + kipas rumah";
}

function showFallback(message) {
  if (fallback) {
    fallback.textContent = message;
    fallback.hidden = false;
  }
  if (statusText) {
    statusText.textContent = message;
  }
}

function init3d() {
  if (!canvas || !shell) return;

  try {
    sceneState.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
  } catch {
    showFallback("WebGL tidak tersedia. Gunakan mode 2D.");
    return;
  }

  sceneState.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.55));
  sceneState.renderer.outputColorSpace = THREE.SRGBColorSpace;

  sceneState.scene = new THREE.Scene();
  sceneState.scene.background = new THREE.Color(0x171b20);
  sceneState.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  sceneState.controls = new OrbitControls(sceneState.camera, canvas);
  sceneState.controls.enableDamping = true;
  sceneState.controls.dampingFactor = 0.08;
  sceneState.controls.maxPolarAngle = Math.PI * 0.48;
  sceneState.controls.minDistance = 3.6;
  sceneState.controls.maxDistance = 9.5;
  sceneState.controls.screenSpacePanning = true;

  addLights();
  buildScene();
  resetCamera();
  resizeRenderer();
  syncFromSimulator();
  loadFanAsset();

  const resizeObserver = new ResizeObserver(resizeRenderer);
  resizeObserver.observe(shell);
  window.addEventListener("resize", resizeRenderer);
  window.addEventListener("ac-power-state-change", syncFromSimulator);
  window.addEventListener("ac-power-3d-reset-camera", resetCamera);
  window.addEventListener("ac-power-view-mode-change", (event) => {
    if (event.detail?.mode === "3d") {
      resizeRenderer();
      resetCamera();
    }
  });
  resetCameraButton?.addEventListener("click", resetCamera);
  canvas.addEventListener("pointermove", updateSwitchHover);
  canvas.addEventListener("pointerdown", handleSwitchClick);
  canvas.addEventListener("pointerleave", () => {
    sceneState.hoverSwitch = null;
    sceneState.hoverWire = null;
    canvas.style.cursor = "grab";
  });

  window.requestAnimationFrame(animate);
}

init3d();
