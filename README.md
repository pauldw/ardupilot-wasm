# ArduPilot WASM Simulator

A browser-based drone flight simulator running the real ArduPilot flight controller compiled to WebAssembly. Includes a TypeScript physics engine (F450 quadcopter model), Three.js 3D visualization, and a MAVLink command interface -- all running entirely client-side with no server required.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Wait a few seconds for the EKF to initialize (you'll see GPS lock and EKF messages in the console), then:

```
mode guided
arm
takeoff 10
```

The drone will arm, take off, and hold at 10 meters altitude.

## Architecture

```
Browser Tab
+-----------+     +----------+     +---------+
| MAVLink   |     | Three.js |     | HUD     |
| CLI Input |     | 3D Scene |     | Overlay |
+-----+-----+     +----+-----+     +---------+
      |                 |
      v                 ^ state
+-----+-----+     +----+------+
| ArduPilot |<--->| Physics   |
| SITL(WASM)|     | Engine(TS)|
+-----+-----+     +-----------+
  servo PWM --> motor model
  sensor JSON <-- rigid body
```

ArduPilot's flight controller runs in WASM via Emscripten. The TypeScript physics engine simulates F450 quadcopter dynamics at 1000Hz. Communication uses the same lockstep protocol as ArduPilot's native JSON SITL backend, routed through shared memory buffers instead of UDP sockets.

## Commands

| Command | Description |
|---------|-------------|
| `arm [force]` | Arm motors (force bypasses preflight checks) |
| `disarm` | Disarm motors |
| `mode <MODE>` | Set flight mode (GUIDED, STABILIZE, ALT_HOLD, LOITER, RTL, LAND, etc.) |
| `takeoff <alt>` | Take off to altitude in meters |
| `goto <n> <e> <u>` | Fly to position in meters from home (north, east, up) |
| `help` | Show available commands |

Typical flight sequence: `mode guided` -> `arm` -> `takeoff 10` -> `goto 10 5 15`

## Project Structure

```
src/
  main.ts                   Entry point, command handling
  sim-loop.ts               Render loop, WASM/physics coordination
  wasm/
    ardupilot-bridge.ts     WASM module loading, lockstep glue, sensor data
  mavlink/
    mavlink.ts              MAVLink v2 encoder/decoder (heartbeat, arm, mode, goto, etc.)
  physics/
    config.ts               F450 physical parameters
    motor.ts                PWM -> thrust/torque motor model with first-order lag
    rigid-body.ts           Quaternion rigid body dynamics, ground contact
    wind.ts                 Multi-frequency turbulence model
  visualizer/
    scene.ts                Sky, ground, lighting (Three.js)
    drone-model.ts          Procedural drone mesh with spinning props
    camera.ts               OrbitControls following drone
    hud.ts                  HTML overlay (altitude, speed, attitude, mode)

public/
  ardupilot.js              Emscripten JS glue (pre-built)
  ardupilot.wasm            ArduPilot SITL binary (pre-built)
  textures/                 Sky panorama & grass ground textures

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
  hal/                      (empty -- HAL modifications are in ardupilot-wasm-src)
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

### Key WASM Modifications

The ArduPilot source (`ardupilot-wasm-src`) has these patches for WASM compatibility:

- **HAL_SITL_Class.cpp** -- Adaptive `emscripten_sleep` batching: runs 50 iterations per browser yield before arming (fast EKF init), drops to 1:1 after arming (smooth real-time flight)
- **UARTDriver.cpp** -- WASM UART bridge for MAVLink on port 0; GPS sim device creation for ports 3/4
- **Socket_wasm.cpp** -- Replaces POSIX sockets with shared memory buffers for the JSON SIM backend; triggers JS callbacks on servo data output
- **SITL_State.cpp** -- `emscripten_sleep` for cooperative scheduling in single-threaded WASM
- **GCS_Common.cpp** -- Debug logging for GCS backend initialization

## How It Works

1. **Lockstep loop**: ArduPilot's JSON SIM backend sends a servo PWM packet via the WASM socket shim, which synchronously calls a JS callback
2. **Physics step**: JS receives PWM values, updates the motor model and rigid body dynamics, computes new sensor data (IMU, position, attitude)
3. **Sensor feedback**: Sensor data is written as JSON to the WASM recv buffer; ArduPilot reads it and advances its internal clock
4. **MAVLink**: GCS commands (arm, mode, takeoff) are encoded as MAVLink v2 frames and written to a ring buffer UART bridge; ArduPilot responses flow back through the same bridge
5. **Rendering**: Three.js renders the drone state at 60fps, decoupled from the physics/WASM loop

## License

ArduPilot components are licensed under GPL v3. See the [ArduPilot repository](https://github.com/ArduPilot/ardupilot) for details.
