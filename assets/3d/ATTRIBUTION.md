# 3D Asset Attribution

This simulator stores runtime assets locally so `web-simulator.html` can be served as a static page.

## Bundled Assets

- `assets/3d/models/fan.glb`
  - Source: Simple Cooling Fan 3D Model Free glb Download, Get3DModels
  - URL: https://www.get3dmodels.com/tools-and-gadgets/simple-cooling-fan/
  - Direct download URL used: https://www.get3dmodels.com/download/Large-fan_by_get3dmodels.glb
  - Note: retained as a downloaded reference asset. The current 3D view uses a procedural household pedestal fan in `web-simulator-3d.js` so the device reads as a home fan rather than a small electronics cooling fan.

- `vendor/three/`
  - Three.js r172, MIT License
  - URL: https://threejs.org/
  - Download source: https://unpkg.com/three@0.172.0/

## Visual References Not Bundled

These pages were checked as visual references, but their anonymous direct model downloads were not available from this environment. The simulator therefore uses procedural low-poly replacements for these parts.

- ESP32 reference: https://sketchfab.com/3d-models/esp32-78c2b5a932a1463bbc6e8ada630a0545
- Light switch reference: https://sketchfab.com/3d-models/light-switch-a45fb4b8dce9416eabf12679af914b99
- Relay module reference: https://sketchfab.com/3d-models/relay-module-with-terminal-block-2d9d92cf8bb446428c984d6a463a9e56
