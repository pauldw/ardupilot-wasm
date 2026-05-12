# ArduPilot WASM Simulator

A browser-based drone flight simulator running the real ArduPilot flight controller compiled to WebAssembly. Features MuJoCo physics, Gaussian splat 3D environment, PIP drone camera with barrel distortion, and a JavaScript command interface -- all running entirely client-side with no server required.

**Live demo: [fvml.ca/ardupilot-wasm](https://fvml.ca/ardupilot-wasm)**

https://github.com/user-attachments/assets/21e69ca7-be1e-4c0a-95d6-b40ae6f45773

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. A loading screen shows progress for all assets (MuJoCo physics, Gaussian splat map, drone model, ArduPilot WASM, EKF initialization). Once loaded:

```js
await drone.mode('guided')
await drone.arm()
await drone.takeoff(10)
```

Or click **Run** in the built-in program editor to execute the default mission script.

## Architecture

```
Browser Tab
+-----------+     +----------+     +---------+
| JS Console|     | Three.js |     | HUD     |
| + Editor  |     | 3D Scene |     | Overlay |
+-----+-----+     +----+-----+     +---------+
      |                 |
      v                 ^ state
+-----+-----+     +----+------+
| ArduPilot |<--->| MuJoCo    |
| SITL(WASM)|     | Physics   |
+-----+-----+     +-----------+
  servo PWM --> motor model
  sensor JSON <-- rigid body
```

ArduPilot's flight controller runs in WASM via Emscripten. MuJoCo provides rigid body physics at 1000Hz. Communication uses the same lockstep protocol as ArduPilot's native JSON SITL backend, routed through shared memory buffers instead of UDP sockets.

## Commands

The console accepts any JavaScript. The `drone` object provides high-level commands:

| Command | Description |
|---------|-------------|
| `await drone.mode('guided')` | Set flight mode (guided, stabilize, alt_hold, loiter, rtl, land, etc.) |
| `await drone.arm()` | Arm motors (returns true/false) |
| `await drone.takeoff(alt)` | Take off to altitude in meters |
| `drone.goto(n, e, u)` | Fly to position (north, east, up) in meters from home |
| `drone.help()` | Show all available commands |

Commands that talk to ArduPilot return `boolean` indicating success/failure.

## Project Structure

```
src/
  main.ts                   Entry point, JS console, command history
  sim-loop.ts               Render loop, WASM/physics lockstep coordination
  drone.ts                  High-level drone command API
  world.ts                  World manipulation (wind, reset, etc.)
  loading.ts                Loading screen with per-asset progress tracking
  wasm/
    ardupilot-bridge.ts     WASM module loading, lockstep glue, sensor data
  mavlink/
    mavlink.ts              MAVLink v2 encoder/decoder
  physics/
    config.ts               F450 physical parameters
    motor.ts                PWM -> thrust/torque motor model with first-order lag
    mujoco-body.ts          MuJoCo rigid body wrapper
    rigid-body.ts           Quaternion utilities, ground contact
    wind.ts                 Multi-frequency turbulence model
    servo.ts                Servo model for gimbal
  visualizer/
    scene.ts                Gaussian splat environment, sky, lighting (Three.js + Spark)
    drone-model.ts          GLB drone model with animated propellers
    camera.ts               OrbitControls following drone
    hud.ts                  HTML overlay (altitude, speed, attitude, mode)
    pip-camera.ts           Picture-in-picture drone camera with barrel distortion
    editor.ts               CodeMirror program editor with run/stop controls
    manipulator.ts          Mouse-based drone grab/move interaction

public/
  ardupilot.js              Emscripten JS glue (pre-built)
  ardupilot.wasm            ArduPilot SITL binary (pre-built)
  drone.glb                 Drone 3D model
  models/splat.sog          Gaussian splat environment map
  textures/                 Sky panorama
  environment/              MuJoCo scene XML + meshes

wasm-build/
  build/
    compile_all.sh          Compiles all ArduPilot sources to .o files
    link.sh                 Links .o files into ardupilot.js + ardupilot.wasm
    rebuild_changed.sh      Incremental rebuild for modified sources
    wasm_config.h           Feature flags and WASM-specific defines
    generated/hwdef.h       Hardware definition for SITL board
  glue/
    wasm_entry.cpp          Exported C functions for JS interop
    wasm_uart.cpp           Ring buffer UART bridge (MAVLink port)
    wasm_stubs.cpp          Stubs for unsupported POSIX functionality
```

## WASM Build

The pre-built `public/ardupilot.wasm` is ready to use. To rebuild from source:

### Prerequisites

- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html) installed at `~/Development/emsdk`
- ArduPilot source with WASM patches at `~/Development/ardupilot-wasm-src`

### Building

```bash
# Compile all source files (~800 .cpp files, takes several minutes first time)
bash wasm-build/build/compile_all.sh

# Link into ardupilot.js + ardupilot.wasm and copy to public/
bash wasm-build/build/link.sh

# Incremental rebuild (after modifying specific files)
bash wasm-build/build/rebuild_changed.sh HAL_SITL_Class SITL_State Socket_wasm
```

## How It Works

1. **Loading**: Assets download in parallel with progress tracking. EKF initialization runs at 50x speed (~1s wall time vs 45s sim time)
2. **Lockstep loop**: ArduPilot's JSON SIM backend sends servo PWM packets via the WASM socket shim, which synchronously calls a JS callback
3. **Physics step**: JS receives PWM values, updates the motor model and MuJoCo rigid body, computes new sensor data (IMU, position, attitude)
4. **Sensor feedback**: Sensor data is written as JSON to the WASM recv buffer; ArduPilot reads it and advances its internal clock
5. **MAVLink**: Commands are encoded as MAVLink v2 frames and written to a ring buffer UART bridge; ArduPilot responses flow back through the same bridge
6. **Rendering**: Three.js renders the Gaussian splat environment and drone model at 60fps via EffectComposer (FXAA). PIP camera renders independently with barrel distortion

## Credits

- Gaussian splat scene: [Country Hotel Le Querce, Italy](https://superspl.at/scene/8f4c0957) via SuperSplat

## License

ArduPilot components are licensed under GPL v3. See the [ArduPilot repository](https://github.com/ArduPilot/ardupilot) for details.
