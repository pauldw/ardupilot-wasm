// MAVLink v2 encoder/decoder for browser ↔ ArduPilot communication

const MAVLINK_STX = 0xFD;

// Message IDs
export const MSG_HEARTBEAT = 0;
export const MSG_SYS_STATUS = 1;
export const MSG_PARAM_VALUE = 22;
export const MSG_PARAM_SET = 23;
export const MSG_GPS_RAW_INT = 24;
export const MSG_ATTITUDE = 30;
export const MSG_GLOBAL_POSITION_INT = 33;
export const MSG_LOCAL_POSITION_NED = 32;
export const MSG_SET_MODE = 11;
export const MSG_COMMAND_LONG = 76;
export const MSG_COMMAND_ACK = 77;
export const MSG_SET_POSITION_TARGET_LOCAL_NED = 84;
export const MSG_SET_POSITION_TARGET_GLOBAL_INT = 86;
export const MSG_STATUSTEXT = 253;
export const MSG_HOME_POSITION = 242;

// CRC extras (per-message seed for integrity check)
const MSG_PARAM_REQUEST_READ = 20;
const MSG_REQUEST_DATA_STREAM = 66;

const CRC_EXTRA: Record<number, number> = {
  [MSG_HEARTBEAT]: 50,
  [MSG_SYS_STATUS]: 124,
  [MSG_SET_MODE]: 89,
  [MSG_PARAM_REQUEST_READ]: 214,
  [MSG_PARAM_VALUE]: 220,
  [MSG_PARAM_SET]: 168,
  [MSG_REQUEST_DATA_STREAM]: 148,
  [MSG_GPS_RAW_INT]: 24,
  [MSG_ATTITUDE]: 39,
  [MSG_LOCAL_POSITION_NED]: 185,
  [MSG_GLOBAL_POSITION_INT]: 104,
  [MSG_COMMAND_LONG]: 152,
  [MSG_COMMAND_ACK]: 143,
  [MSG_SET_POSITION_TARGET_LOCAL_NED]: 143,
  [MSG_SET_POSITION_TARGET_GLOBAL_INT]: 5,
  [MSG_HOME_POSITION]: 104,
  [MSG_STATUSTEXT]: 83,
};

// MAV_CMD values
export const MAV_CMD_COMPONENT_ARM_DISARM = 400;
export const MAV_CMD_NAV_TAKEOFF = 22;
export const MAV_CMD_DO_SET_MODE = 176;
export const MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN = 246;

// System/Component IDs
const GCS_SYSID = 255;
const GCS_COMPID = 190;
const TARGET_SYSID = 1;
const TARGET_COMPID = 1;

// Copter flight modes (ArduCopter specific custom_mode values)
export const COPTER_MODES: Record<string, number> = {
  STABILIZE: 0,
  ACRO: 1,
  ALT_HOLD: 2,
  AUTO: 3,
  GUIDED: 4,
  LOITER: 5,
  RTL: 6,
  CIRCLE: 7,
  LAND: 9,
  DRIFT: 11,
  SPORT: 13,
  FLIP: 14,
  POSHOLD: 16,
  BRAKE: 17,
  THROW: 18,
  SMART_RTL: 21,
  GUIDED_NOGPS: 20,
};

export const COPTER_MODE_NAMES = Object.keys(COPTER_MODES);

const COPTER_MODE_BY_NUM: Record<number, string> = {};
for (const [name, num] of Object.entries(COPTER_MODES)) {
  COPTER_MODE_BY_NUM[num] = name;
}
export { COPTER_MODE_BY_NUM };

const MAV_RESULT_NAMES: Record<number, string> = {
  0: 'ACCEPTED',
  1: 'TEMPORARILY_REJECTED',
  2: 'DENIED',
  3: 'UNSUPPORTED',
  4: 'FAILED',
  5: 'IN_PROGRESS',
  6: 'CANCELLED',
};

const MAV_TYPE_GCS = 6;
const MAV_AUTOPILOT_INVALID = 8;

let seq = 0;

function crc16Accumulate(byte: number, crc: number): number {
  let tmp = byte ^ (crc & 0xff);
  tmp ^= (tmp << 4) & 0xff;
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

function mavlinkCrc(buf: Uint8Array, crcExtra: number): number {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crc16Accumulate(buf[i], crc);
  }
  crc = crc16Accumulate(crcExtra, crc);
  return crc;
}

export function encodeFrame(msgId: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(12 + payload.length);
  const s = seq++ & 0xff;

  frame[0] = MAVLINK_STX;
  frame[1] = payload.length;
  frame[2] = 0;
  frame[3] = 0;
  frame[4] = s;
  frame[5] = GCS_SYSID;
  frame[6] = GCS_COMPID;
  frame[7] = msgId & 0xff;
  frame[8] = (msgId >> 8) & 0xff;
  frame[9] = (msgId >> 16) & 0xff;
  frame.set(payload, 10);

  const crcBuf = frame.subarray(1, 10 + payload.length);
  const crc = mavlinkCrc(crcBuf, CRC_EXTRA[msgId] ?? 0);
  frame[10 + payload.length] = crc & 0xff;
  frame[10 + payload.length + 1] = (crc >> 8) & 0xff;

  return frame;
}

export function encodeHeartbeat(): Uint8Array {
  const payload = new Uint8Array(9);
  const dv = new DataView(payload.buffer);
  dv.setUint32(0, 0, true);
  payload[4] = MAV_TYPE_GCS;
  payload[5] = MAV_AUTOPILOT_INVALID;
  payload[6] = 0;
  payload[7] = 0;
  payload[8] = 3;
  return encodeFrame(MSG_HEARTBEAT, payload);
}

export function encodeSetMode(mode: string): Uint8Array | null {
  const customMode = COPTER_MODES[mode.toUpperCase()];
  if (customMode === undefined) return null;
  return encodeCommandLong(MAV_CMD_DO_SET_MODE, 1, customMode);
}

export function encodeCommandLong(
  command: number,
  param1 = 0, param2 = 0, param3 = 0, param4 = 0,
  param5 = 0, param6 = 0, param7 = 0,
): Uint8Array {
  const payload = new Uint8Array(33);
  const dv = new DataView(payload.buffer);
  dv.setFloat32(0, param1, true);
  dv.setFloat32(4, param2, true);
  dv.setFloat32(8, param3, true);
  dv.setFloat32(12, param4, true);
  dv.setFloat32(16, param5, true);
  dv.setFloat32(20, param6, true);
  dv.setFloat32(24, param7, true);
  dv.setUint16(28, command, true);
  payload[30] = TARGET_SYSID;
  payload[31] = TARGET_COMPID;
  payload[32] = 0;
  return encodeFrame(MSG_COMMAND_LONG, payload);
}

export function encodeArm(): Uint8Array {
  return encodeCommandLong(MAV_CMD_COMPONENT_ARM_DISARM, 1);
}

export function encodeForceArm(): Uint8Array {
  return encodeCommandLong(MAV_CMD_COMPONENT_ARM_DISARM, 1, 21196);
}

export function encodeDisarm(): Uint8Array {
  return encodeCommandLong(MAV_CMD_COMPONENT_ARM_DISARM, 0);
}

export function encodeForceDisarm(): Uint8Array {
  return encodeCommandLong(MAV_CMD_COMPONENT_ARM_DISARM, 0, 21196);
}

export function encodeTakeoff(altitudeM: number): Uint8Array {
  return encodeCommandLong(MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, altitudeM);
}

export function encodeGotoLocalNED(north: number, east: number, down: number): Uint8Array {
  const payload = new Uint8Array(53);
  const dv = new DataView(payload.buffer);
  dv.setUint32(0, 0, true);
  dv.setFloat32(4, north, true);
  dv.setFloat32(8, east, true);
  dv.setFloat32(12, down, true);
  dv.setUint16(48, 0x0DF8, true);
  payload[50] = TARGET_SYSID;
  payload[51] = TARGET_COMPID;
  payload[52] = 1; // MAV_FRAME_LOCAL_NED
  return encodeFrame(MSG_SET_POSITION_TARGET_LOCAL_NED, payload);
}

export function encodeGotoGlobalInt(lat: number, lon: number, alt: number): Uint8Array {
  const payload = new Uint8Array(53);
  const dv = new DataView(payload.buffer);
  dv.setUint32(0, 0, true); // time_boot_ms
  dv.setInt32(4, Math.round(lat * 1e7), true);
  dv.setInt32(8, Math.round(lon * 1e7), true);
  dv.setFloat32(12, alt, true);
  dv.setUint16(48, 0x0DF8, true);
  payload[50] = TARGET_SYSID;
  payload[51] = TARGET_COMPID;
  payload[52] = 6; // MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
  return encodeFrame(MSG_SET_POSITION_TARGET_GLOBAL_INT, payload);
}

export function encodeParamSet(paramId: string, value: number): Uint8Array {
  const payload = new Uint8Array(23);
  const dv = new DataView(payload.buffer);
  dv.setFloat32(0, value, true);
  payload[4] = TARGET_SYSID;
  payload[5] = TARGET_COMPID;
  const enc = new TextEncoder();
  const idBytes = enc.encode(paramId.slice(0, 16));
  payload.set(idBytes, 6);
  payload[22] = 9; // MAV_PARAM_TYPE_REAL32
  return encodeFrame(MSG_PARAM_SET, payload);
}

// --- Parsed message types ---

export interface ParsedHeartbeat {
  type: 'HEARTBEAT';
  msgId: 0;
  vehicleType: number;
  customMode: number;
  modeName: string;
  baseMode: number;
  armed: boolean;
}

export interface ParsedCommandAck {
  type: 'COMMAND_ACK';
  msgId: 77;
  command: number;
  result: number;
  resultText: string;
}

export interface ParsedStatusText {
  type: 'STATUSTEXT';
  msgId: 253;
  severity: number;
  text: string;
}

export interface ParsedSysStatus {
  type: 'SYS_STATUS';
  msgId: 1;
  voltageBattery: number;
  currentBattery: number;
  batteryRemaining: number;
}

export interface ParsedGpsRawInt {
  type: 'GPS_RAW_INT';
  msgId: 24;
  fixType: number;
  lat: number;
  lon: number;
  alt: number;
  eph: number;
  epv: number;
  satellitesVisible: number;
}

export interface ParsedAttitude {
  type: 'ATTITUDE';
  msgId: 30;
  roll: number;
  pitch: number;
  yaw: number;
  rollspeed: number;
  pitchspeed: number;
  yawspeed: number;
}

export interface ParsedLocalPositionNed {
  type: 'LOCAL_POSITION_NED';
  msgId: 32;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface ParsedGlobalPositionInt {
  type: 'GLOBAL_POSITION_INT';
  msgId: 33;
  lat: number;
  lon: number;
  alt: number;
  relativeAlt: number;
  heading: number;
}

export interface ParsedParamValue {
  type: 'PARAM_VALUE';
  msgId: 22;
  paramId: string;
  paramValue: number;
  paramCount: number;
  paramIndex: number;
}

export interface ParsedHomePosition {
  type: 'HOME_POSITION';
  msgId: 242;
  lat: number;
  lon: number;
  alt: number;
}

export type ParsedMessage =
  | ParsedHeartbeat
  | ParsedCommandAck
  | ParsedStatusText
  | ParsedSysStatus
  | ParsedGpsRawInt
  | ParsedAttitude
  | ParsedLocalPositionNed
  | ParsedGlobalPositionInt
  | ParsedParamValue
  | ParsedHomePosition;

export class MavlinkParser {
  private buf = new Uint8Array(0);

  feed(data: Uint8Array): ParsedMessage[] {
    const combined = new Uint8Array(this.buf.length + data.length);
    combined.set(this.buf);
    combined.set(data, this.buf.length);
    this.buf = combined;

    const messages: ParsedMessage[] = [];

    while (this.buf.length >= 12) {
      const stxIdx = this.buf.indexOf(MAVLINK_STX);
      if (stxIdx === -1) {
        this.buf = new Uint8Array(0);
        break;
      }
      if (stxIdx > 0) {
        this.buf = this.buf.slice(stxIdx);
      }

      if (this.buf.length < 12) break;

      const payloadLen = this.buf[1];
      const frameLen = 12 + payloadLen;
      if (this.buf.length < frameLen) break;

      const msgId = this.buf[7] | (this.buf[8] << 8) | (this.buf[9] << 16);
      const payload = this.buf.slice(10, 10 + payloadLen);

      const crcExtra = CRC_EXTRA[msgId];
      if (crcExtra !== undefined) {
        const crcBuf = this.buf.slice(1, 10 + payloadLen);
        const computed = mavlinkCrc(crcBuf, crcExtra);
        const received = this.buf[10 + payloadLen] | (this.buf[10 + payloadLen + 1] << 8);
        if (computed !== received) {
          this.buf = this.buf.slice(1);
          continue;
        }
      }

      const parsed = this.parsePayload(msgId, payload);
      if (parsed) messages.push(parsed);

      this.buf = this.buf.slice(frameLen);
    }

    if (this.buf.length > 4096) {
      this.buf = this.buf.slice(this.buf.length - 1024);
    }

    return messages;
  }

  private parsePayload(msgId: number, payload: Uint8Array): ParsedMessage | null {
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

    switch (msgId) {
      case MSG_HEARTBEAT: {
        if (payload.length < 9) return null;
        const customMode = dv.getUint32(0, true);
        const vehicleType = payload[4];
        const baseMode = payload[6];
        return {
          type: 'HEARTBEAT',
          msgId: 0,
          vehicleType,
          customMode,
          modeName: COPTER_MODE_BY_NUM[customMode] ?? `UNKNOWN(${customMode})`,
          baseMode,
          armed: (baseMode & 0x80) !== 0,
        };
      }
      case MSG_COMMAND_ACK: {
        if (payload.length < 3) return null;
        const command = dv.getUint16(0, true);
        const result = payload[2];
        return {
          type: 'COMMAND_ACK',
          msgId: 77,
          command,
          result,
          resultText: MAV_RESULT_NAMES[result] ?? `UNKNOWN(${result})`,
        };
      }
      case MSG_STATUSTEXT: {
        if (payload.length < 2) return null;
        const severity = payload[0];
        const textBytes = payload.slice(1, 51);
        const nullIdx = textBytes.indexOf(0);
        const text = new TextDecoder().decode(nullIdx >= 0 ? textBytes.slice(0, nullIdx) : textBytes);
        return { type: 'STATUSTEXT', msgId: 253, severity, text };
      }
      case MSG_SYS_STATUS: {
        if (payload.length < 31) return null;
        return {
          type: 'SYS_STATUS',
          msgId: 1,
          voltageBattery: dv.getUint16(14, true) / 1000.0,
          currentBattery: dv.getInt16(16, true) / 100.0,
          batteryRemaining: dv.getInt8(30),
        };
      }
      case MSG_GPS_RAW_INT: {
        if (payload.length < 30) return null;
        return {
          type: 'GPS_RAW_INT',
          msgId: 24,
          fixType: payload[28],
          lat: dv.getInt32(8, true) / 1e7,
          lon: dv.getInt32(12, true) / 1e7,
          alt: dv.getInt32(16, true) / 1e3,
          eph: dv.getUint16(20, true),
          epv: dv.getUint16(22, true),
          satellitesVisible: payload[29],
        };
      }
      case MSG_ATTITUDE: {
        if (payload.length < 28) return null;
        return {
          type: 'ATTITUDE',
          msgId: 30,
          roll: dv.getFloat32(4, true),
          pitch: dv.getFloat32(8, true),
          yaw: dv.getFloat32(12, true),
          rollspeed: dv.getFloat32(16, true),
          pitchspeed: dv.getFloat32(20, true),
          yawspeed: dv.getFloat32(24, true),
        };
      }
      case MSG_LOCAL_POSITION_NED: {
        if (payload.length < 28) return null;
        return {
          type: 'LOCAL_POSITION_NED',
          msgId: 32,
          x: dv.getFloat32(4, true),
          y: dv.getFloat32(8, true),
          z: dv.getFloat32(12, true),
          vx: dv.getFloat32(16, true),
          vy: dv.getFloat32(20, true),
          vz: dv.getFloat32(24, true),
        };
      }
      case MSG_GLOBAL_POSITION_INT: {
        if (payload.length < 28) return null;
        return {
          type: 'GLOBAL_POSITION_INT',
          msgId: 33,
          lat: dv.getInt32(4, true) / 1e7,
          lon: dv.getInt32(8, true) / 1e7,
          alt: dv.getInt32(12, true) / 1e3,
          relativeAlt: dv.getInt32(16, true) / 1e3,
          heading: dv.getUint16(26, true) / 100,
        };
      }
      case MSG_PARAM_VALUE: {
        if (payload.length < 25) return null;
        const idBytes = payload.slice(4, 20);
        const nullIdx = idBytes.indexOf(0);
        const paramId = new TextDecoder().decode(nullIdx >= 0 ? idBytes.slice(0, nullIdx) : idBytes);
        return {
          type: 'PARAM_VALUE',
          msgId: 22,
          paramValue: dv.getFloat32(0, true),
          paramCount: dv.getUint16(20, true),
          paramIndex: dv.getUint16(22, true),
          paramId,
        };
      }
      case MSG_HOME_POSITION: {
        if (payload.length < 52) return null;
        return {
          type: 'HOME_POSITION',
          msgId: 242,
          lat: dv.getInt32(0, true) / 1e7,
          lon: dv.getInt32(4, true) / 1e7,
          alt: dv.getInt32(8, true) / 1e3,
        };
      }
      default:
        return null;
    }
  }
}
