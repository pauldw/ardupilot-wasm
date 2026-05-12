import * as C from './physics/config';
import { MotorSet } from './physics/motor';
import { MuJoCoBody } from './physics/mujoco-body';
import { quatToEuler } from './physics/rigid-body';
import { Wind } from './physics/wind';
import { ServoModel } from './physics/servo';
import { createScene } from './visualizer/scene';
import { DroneModel } from './visualizer/drone-model';
import { CameraController } from './visualizer/camera';
import { HUD } from './visualizer/hud';
import { PipCamera } from './visualizer/pip-camera';
import { YoloDetector } from './visualizer/yolo-detector';
import { Manipulator } from './visualizer/manipulator';
import { ArduPilotBridge } from './wasm/ardupilot-bridge';
import { encodeHeartbeat, encodeFrame, MavlinkParser } from './mavlink/mavlink';
import type { ParsedMessage } from './mavlink/mavlink';

export class SimLoop {
  body: MuJoCoBody;
  motors: MotorSet;
  wind: Wind;
  gimbalServo: ServoModel;
  simTime = 0;

  get terrain() { return this.scene.terrain; }
  private scene: ReturnType<typeof createScene>;
  private drone: DroneModel;
  private cameraCtrl: CameraController;
  private hud: HUD;
  private pipCamera: PipCamera;
  private manipulator: Manipulator;
  private pwmValues = [1000, 1000, 1000, 1000];
  lastGimbalPwm = 0;
  private mode = 'STABILIZE';
  private armed = false;
  private running = true;
  private physicsPaused = false;

  yoloDetector: YoloDetector;
  private bridge: ArduPilotBridge | null = null;
  private wasmMode = false;
  private mavParser = new MavlinkParser();
  private onMessage: ((msg: ParsedMessage) => void) | null = null;

  constructor() {
    this.body = new MuJoCoBody();
    this.motors = new MotorSet();
    this.wind = new Wind(2, 45, 1.0, 1.0);
    this.gimbalServo = new ServoModel();

    this.scene = createScene();
    this.drone = new DroneModel(this.scene.scene);
    this.pipCamera = new PipCamera();
    this.yoloDetector = new YoloDetector(
      this.pipCamera.fboWidth, this.pipCamera.fboHeight,
      this.pipCamera.width, this.pipCamera.height,
      12,
    );
    this.yoloDetector.load(`${import.meta.env.BASE_URL}yolov8n/model.json`);
    this.cameraCtrl = new CameraController(
      this.scene.camera,
      this.scene.renderer.domElement
    );
    this.hud = new HUD();
    this.manipulator = new Manipulator(
      this.scene.camera,
      this.scene.renderer.domElement,
      this.drone.group,
      this.body,
    );

    // Connect terrain and colliders to physics
    this.body.groundHeightNED = (north, east) =>
      -this.scene.terrain.getHeightNED(north, east);
    this.body.collisionCheck = (north, east, down) =>
      this.scene.environment.checkCollision(north, east, down);

    this.scene.terrain.onHeightDataChanged = () => {
      this.body.setHeightfieldData({
        heightmap: this.scene.terrain.heightData,
        size: this.scene.terrain.size,
        segments: this.scene.terrain.segments,
      });
    };

  }

  async initPhysics(onLog?: (msg: string) => void): Promise<void> {
    await this.body.init(
      {
        heightmap: this.scene.terrain.heightData,
        size: this.scene.terrain.size,
        segments: this.scene.terrain.segments,
      },
      onLog,
    );
  }

  async initWasm(onLog?: (msg: string) => void): Promise<boolean> {
    try {
      this.bridge = new ArduPilotBridge();
      await this.bridge.load(onLog);

      // Register the synchronous callback: when ArduPilot sends servo data,
      // we step physics with the new PWM values and return sensor data.
      this.bridge.onSensorDataNeeded = () => {
        const pwm = this.bridge!.lastPwm;
        this.pwmValues = pwm.slice(0, 4);
        this.armed = this.pwmValues.some(p => p > 1050);

        this.motors.setPwm(this.armed ? this.pwmValues : [1000, 1000, 1000, 1000]);
        this.motors.update(C.PHYSICS_DT);

        // Update gimbal servo from ArduPilot mount output
        const gimbalPwm = pwm[C.GIMBAL_SERVO_CHANNEL] || 1500;
        this.lastGimbalPwm = gimbalPwm;
        this.gimbalServo.update(gimbalPwm, C.PHYSICS_DT);

        const { force, torque } = this.motors.getForcesAndTorques();
        const windVel = this.wind.getVelocity(this.simTime);
        this.body.update(C.PHYSICS_DT, force, torque, windVel);
        this.simTime += C.PHYSICS_DT;

        return this.getSensorData();
      };

      this.bridge.start();
      this.wasmMode = true;

      // Send heartbeats so ArduPilot recognizes a GCS connection
      setInterval(() => {
        if (this.bridge) {
          this.bridge.sendMavlink(encodeHeartbeat());
        }
      }, 1000);

      // Request data streams from ArduPilot
      // REQUEST_DATA_STREAM (msg 66): req_message_rate(u16), target_sys(u8), target_comp(u8), req_stream_id(u8), start_stop(u8)
      const requestStream = (streamId: number, rateHz: number) => {
        const payload = new Uint8Array(6);
        const dv = new DataView(payload.buffer);
        dv.setUint16(0, rateHz, true);
        payload[2] = 1; // target_system
        payload[3] = 1; // target_component
        payload[4] = streamId;
        payload[5] = 1; // start
        this.bridge!.sendMavlink(encodeFrame(66, payload));
      };
      setTimeout(() => {
        requestStream(6, 4);   // POSITION (LOCAL_POSITION_NED, GLOBAL_POSITION_INT)
        requestStream(10, 4);  // EXTRA1 (ATTITUDE)
        requestStream(2, 2);   // EXTENDED_STATUS (SYS_STATUS, GPS_RAW_INT)
        requestStream(1, 2);   // RAW_SENSORS
      }, 2000);

      // Poll for MAVLink responses from ArduPilot
      setInterval(() => {
        if (this.bridge) {
          const data = this.bridge.readMavlink();
          if (data) {
            const messages = this.mavParser.feed(data);
            for (const msg of messages) {
              this.handleParsedMessage(msg);
            }
          }
        }
      }, 50);

      onLog?.('ArduPilot WASM started - lockstep active');
      return true;
    } catch (e) {
      console.error('WASM init failed:', e);
      onLog?.(`WASM init failed: ${e}. Running standalone physics.`);
      this.bridge = null;
      this.wasmMode = false;
      return false;
    }
  }

  private messageListeners: ((msg: ParsedMessage) => void)[] = [];

  addMessageListener(cb: (msg: ParsedMessage) => void): () => void {
    this.messageListeners.push(cb);
    return () => {
      this.messageListeners = this.messageListeners.filter(l => l !== cb);
    };
  }

  set onMavlinkMessage(cb: (msg: ParsedMessage) => void) {
    this.onMessage = cb;
  }

  private handleParsedMessage(msg: ParsedMessage): void {
    switch (msg.type) {
      case 'HEARTBEAT':
        if (msg.vehicleType !== 6) {
          this.mode = msg.modeName;
          this.armed = msg.armed;
        }
        break;
    }
    if (this.onMessage) this.onMessage(msg);
    for (const cb of this.messageListeners) cb(msg);
  }

  sendMavlink(data: Uint8Array): void {
    if (this.bridge) {
      this.bridge.sendMavlink(data);
    }
  }

  setPwm(values: number[]): void {
    if (!this.wasmMode) {
      this.pwmValues = values;
    }
  }

  setMode(mode: string): void {
    this.mode = mode;
  }

  setArmed(armed: boolean): void {
    if (!this.wasmMode) {
      this.armed = armed;
    }
  }

  step(dt: number): void {
    if (this.wasmMode) return;

    this.motors.setPwm(this.armed ? this.pwmValues : [1000, 1000, 1000, 1000]);
    this.motors.update(dt);

    const { force, torque } = this.motors.getForcesAndTorques();
    const windVel = this.wind.getVelocity(this.simTime);
    this.body.update(dt, force, torque, windVel);

    this.simTime += dt;
  }

  getSensorData(): {
    timestamp: number;
    imu: { gyro: number[]; accel_body: number[] };
    position: number[];
    attitude: number[];
    velocity: number[];
  } {
    const [roll, pitch, yaw] = quatToEuler(this.body.quaternion);

    return {
      timestamp: this.simTime,
      imu: {
        gyro: this.body.sensorGyro,
        accel_body: this.body.sensorAccel,
      },
      position: [...this.body.position],
      attitude: [roll, pitch, yaw],
      velocity: [...this.body.velocity],
    };
  }

  render(): void {
    const [roll, pitch, yaw] = this.body.eulerDeg;
    const speed = Math.sqrt(
      this.body.velocity[0] ** 2 +
      this.body.velocity[1] ** 2 +
      this.body.velocity[2] ** 2
    );

    this.drone.update(
      this.body.position,
      this.body.rotationMatrix,
      this.motors.omegas,
      1 / 60,
    );

    this.manipulator.update();
    this.cameraCtrl.controls.enabled = !this.manipulator.isGrabbing;
    this.cameraCtrl.update(this.body.position);

    this.hud.update({
      altitude: this.body.altitude,
      speed,
      roll,
      pitch,
      yaw,
      motorPwm: this.pwmValues,
      mode: this.mode,
      armed: this.armed,
      simTime: this.simTime,
    });

    this.scene.sky.position.copy(this.scene.camera.position);

    // Render PIP camera to its FBO (doesn't touch screen yet)
    this.pipCamera.renderToFBO(
      this.scene.renderer,
      this.scene.scene,
      this.body.position,
      this.body.rotationMatrix,
      this.gimbalServo.angleDeg,
    );

    // Main scene render
    this.scene.renderer.render(this.scene.scene, this.scene.camera);

    // PIP overlay on top of main scene
    this.pipCamera.renderOverlay(this.scene.renderer);

    // Run YOLO detection on PIP FBO (~5Hz)
    this.yoloDetector.maybeRun(
      this.scene.renderer, this.pipCamera.fbo, performance.now(),
    );
  }

  startRenderLoop(): void {
    const animate = () => {
      if (!this.running) return;
      requestAnimationFrame(animate);

      if (!this.wasmMode && !this.physicsPaused) {
        for (let i = 0; i < C.STEPS_PER_FRAME; i++) {
          this.step(C.PHYSICS_DT);
        }
      }

      this.render();
    };
    animate();
  }

  pausePhysics(): void {
    this.physicsPaused = true;
  }

  stop(): void {
    this.running = false;
  }
}
