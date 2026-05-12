import type { SimLoop } from './sim-loop';
import type { ParsedMessage } from './mavlink/mavlink';
import {
  encodeArm,
  encodeForceArm,
  encodeDisarm,
  encodeForceDisarm,
  encodeSetMode,
  encodeTakeoff,
  encodeCommandLong,
  encodeGotoLocalNED,
  encodeGotoGlobalInt,
  encodeParamSet,
  encodeFrame,
  COPTER_MODES,
  COPTER_MODE_NAMES,
  MAV_CMD_COMPONENT_ARM_DISARM,
  MAV_CMD_NAV_TAKEOFF,
  MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN,
} from './mavlink/mavlink';

export class Drone {
  private sim: SimLoop;
  private removeListener: (() => void) | null = null;
  private waiters: ((msg: ParsedMessage) => void)[] = [];
  print: (msg: string) => void;

  constructor(sim: SimLoop, print: (msg: string) => void) {
    this.sim = sim;
    this.print = print;
    this.removeListener = sim.addMessageListener((msg) => {
      for (const w of this.waiters) w(msg);
    });
  }

  recv(type?: string, timeout = 5000): Promise<ParsedMessage | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(w => w !== waiter);
        resolve(null);
      }, timeout);
      const waiter = (msg: ParsedMessage) => {
        if (!type || msg.type === type) {
          clearTimeout(timer);
          this.waiters = this.waiters.filter(w => w !== waiter);
          resolve(msg);
        }
      };
      this.waiters.push(waiter);
    });
  }

  send(data: Uint8Array): void {
    this.sim.sendMavlink(data);
  }

  // --- High-level commands matching drone_console.py ---

  async arm(force = false): Promise<boolean> {
    this.send(force ? encodeForceArm() : encodeArm());
    const ack = await this.recv('COMMAND_ACK', 5000);
    if (ack && ack.type === 'COMMAND_ACK') {
      this.print(`arm: ${ack.resultText}`);
      return ack.result === 0;
    }
    this.print('arm: no response');
    return false;
  }

  async disarm(force = false): Promise<boolean> {
    this.send(force ? encodeForceDisarm() : encodeDisarm());
    const ack = await this.recv('COMMAND_ACK', 5000);
    if (ack && ack.type === 'COMMAND_ACK') {
      this.print(`disarm: ${ack.resultText}`);
      return ack.result === 0;
    }
    this.print('disarm: no response');
    return false;
  }

  async mode(name: string): Promise<boolean> {
    const pkt = encodeSetMode(name);
    if (!pkt) {
      this.print(`Unknown mode: ${name}. Available: ${COPTER_MODE_NAMES.join(', ')}`);
      return false;
    }
    this.send(pkt);
    const ack = await this.recv('COMMAND_ACK', 5000);
    if (ack && ack.type === 'COMMAND_ACK') {
      this.print(`mode ${name.toUpperCase()}: ${ack.resultText}`);
      return ack.result === 0;
    }
    this.print(`mode ${name.toUpperCase()}: no response`);
    return false;
  }

  async takeoff(alt: number): Promise<boolean> {
    this.send(encodeTakeoff(alt));
    const ack = await this.recv('COMMAND_ACK', 5000);
    if (ack && ack.type === 'COMMAND_ACK') {
      this.print(`takeoff ${alt}m: ${ack.resultText}`);
      return ack.result === 0;
    }
    this.print('takeoff: no response');
    return false;
  }

  goto(north: number, east: number, up: number): void {
    this.send(encodeGotoLocalNED(north, east, -up));
    this.print(`goto: N=${north} E=${east} U=${up}`);
  }

  goto_ned(x: number, y: number, z: number): void {
    this.send(encodeGotoLocalNED(x, y, z));
    this.print(`goto_ned: (${x}, ${y}, ${z})`);
  }

  goto_global(lat: number, lon: number, alt: number): void {
    this.send(encodeGotoGlobalInt(lat, lon, alt));
    this.print(`goto_global: (${lat.toFixed(7)}, ${lon.toFixed(7)}, ${alt.toFixed(1)}m)`);
  }

  async get_mode(): Promise<string | null> {
    const hb = await this.recv('HEARTBEAT', 5000);
    if (hb && hb.type === 'HEARTBEAT' && hb.vehicleType !== 6) {
      this.print(`mode: ${hb.modeName}`);
      return hb.modeName;
    }
    this.print('mode: no data');
    return null;
  }

  async get_gps(): Promise<void> {
    const msg = await this.recv('GPS_RAW_INT', 5000);
    if (msg && msg.type === 'GPS_RAW_INT') {
      this.print(`gps: (${msg.lat.toFixed(7)}, ${msg.lon.toFixed(7)}), alt: ${msg.alt.toFixed(1)}m, hdop: ${msg.eph}, sats: ${msg.satellitesVisible}`);
    } else {
      this.print('gps: no data');
    }
  }

  async get_global(): Promise<void> {
    const msg = await this.recv('GLOBAL_POSITION_INT', 5000);
    if (msg && msg.type === 'GLOBAL_POSITION_INT') {
      this.print(`global: (${msg.lat.toFixed(7)}, ${msg.lon.toFixed(7)}), alt: ${msg.alt.toFixed(1)}m, rel: ${msg.relativeAlt.toFixed(1)}m, hdg: ${msg.heading.toFixed(0)}°`);
    } else {
      this.print('global: no data');
    }
  }

  async get_ned(): Promise<{ x: number; y: number; z: number } | null> {
    const msg = await this.recv('LOCAL_POSITION_NED', 5000);
    if (msg && msg.type === 'LOCAL_POSITION_NED') {
      this.print(`ned: (${msg.x.toFixed(2)}, ${msg.y.toFixed(2)}, ${msg.z.toFixed(2)})`);
      return { x: msg.x, y: msg.y, z: msg.z };
    }
    this.print('ned: no data');
    return null;
  }

  async get_attitude(): Promise<void> {
    const msg = await this.recv('ATTITUDE', 5000);
    if (msg && msg.type === 'ATTITUDE') {
      const r = (msg.roll * 180 / Math.PI).toFixed(1);
      const p = (msg.pitch * 180 / Math.PI).toFixed(1);
      const y = (msg.yaw * 180 / Math.PI).toFixed(1);
      this.print(`attitude: roll=${r}° pitch=${p}° yaw=${y}°`);
    } else {
      this.print('attitude: no data');
    }
  }

  async get_battery(): Promise<void> {
    const msg = await this.recv('SYS_STATUS', 5000);
    if (msg && msg.type === 'SYS_STATUS') {
      let s = `battery: ${msg.voltageBattery.toFixed(2)}V`;
      if (msg.currentBattery >= 0) s += `, ${msg.currentBattery.toFixed(1)}A`;
      if (msg.batteryRemaining >= 0) s += `, ${msg.batteryRemaining}%`;
      this.print(s);
    } else {
      this.print('battery: no data');
    }
  }

  async get_home(): Promise<void> {
    const msg = await this.recv('HOME_POSITION', 5000);
    if (msg && msg.type === 'HOME_POSITION') {
      this.print(`home: (${msg.lat.toFixed(7)}, ${msg.lon.toFixed(7)}), alt: ${msg.alt.toFixed(1)}m`);
    } else {
      this.print('home: no data');
    }
  }

  async param_set(name: string, value: number): Promise<void> {
    this.send(encodeParamSet(name, value));
    this.print(`param_set: ${name} = ${value}`);
  }

  async param_get(name: string): Promise<number | null> {
    // PARAM_REQUEST_READ wire: param_index(i16), target_system(u8), target_comp(u8), param_id(char[16])
    const payload = new Uint8Array(20);
    const dv = new DataView(payload.buffer);
    dv.setInt16(0, -1, true);
    payload[2] = 1;
    payload[3] = 1;
    const enc = new TextEncoder();
    payload.set(enc.encode(name.slice(0, 16)), 4);
    this.send(encodeFrame(20, payload));

    const msg = await this.recv('PARAM_VALUE', 5000);
    if (msg && msg.type === 'PARAM_VALUE') {
      this.print(`${msg.paramId}: ${msg.paramValue}`);
      return msg.paramValue;
    }
    this.print(`param_get ${name}: no response`);
    return null;
  }

  command_long(command: number, p1 = 0, p2 = 0, p3 = 0, p4 = 0, p5 = 0, p6 = 0, p7 = 0): void {
    this.send(encodeCommandLong(command, p1, p2, p3, p4, p5, p6, p7));
  }

  async gimbal_pitch(angleDeg: number): Promise<void> {
    // MAV_CMD_DO_MOUNT_CONTROL (205): p1=pitch(deg), p2=roll(deg), p3=yaw(deg), p7=MAV_MOUNT_MODE
    this.send(encodeCommandLong(205, angleDeg, 0, 0, 0, 0, 0, 2));
    this.print(`gimbal pitch: ${angleDeg}°`);
  }

  get gimbal_angle(): number {
    return this.sim.gimbalServo.angleDeg;
  }

  gimbal_debug(): void {
    const pwm = this.sim.lastGimbalPwm;
    const angle = this.sim.gimbalServo.angleDeg;
    this.print(`gimbal: pwm=${pwm}, servo_angle=${angle.toFixed(1)}°`);
  }

  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  help(): void {
    this.print(`
Drone Console - JavaScript API for ArduPilot

Flight control:
  await drone.arm()           Arm motors
  await drone.arm(true)       Force arm (skip checks)
  await drone.disarm()        Disarm motors
  await drone.mode('guided')  Set flight mode
  await drone.takeoff(10)     Take off to 10m
  drone.goto(10, 5, 15)       Go to N=10 E=5 Up=15 (meters from home)
  drone.goto_ned(10, 5, -15)  Go to NED position
  drone.goto_global(lat, lon, alt)  Go to GPS coordinates

Telemetry:
  await drone.get_mode()      Get current flight mode
  await drone.get_ned()       Get local NED position
  await drone.get_global()    Get GPS position
  await drone.get_gps()       Get raw GPS data
  await drone.get_attitude()  Get roll/pitch/yaw
  await drone.get_battery()   Get battery status
  await drone.get_home()      Get home position

Camera gimbal:
  await drone.gimbal_pitch(-45)  Tilt camera down 45°
  drone.gimbal_angle              Get current gimbal angle

Parameters:
  await drone.param_get('ARMING_CHECK')   Read parameter
  await drone.param_set('ARMING_CHECK', 0)  Set parameter

Low-level:
  drone.send(data)                    Send raw MAVLink frame
  await drone.recv('HEARTBEAT', 5000) Wait for message type
  drone.command_long(cmd, p1...p7)    Send COMMAND_LONG
  await drone.sleep(1000)             Wait N milliseconds

Quick start:
  await drone.mode('guided')
  await drone.arm()
  await drone.takeoff(10)
  drone.goto(10, 5, 15)
`.trim());
  }
}
