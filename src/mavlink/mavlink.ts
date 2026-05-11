// Minimal MAVLink v2 encoder for browser → ArduPilot communication

const MAVLINK_STX = 0xFD;

// Message IDs
const MSG_HEARTBEAT = 0;
const MSG_SET_MODE = 11;
const MSG_PARAM_SET = 23;
const MSG_COMMAND_LONG = 76;
const MSG_SET_POSITION_TARGET_LOCAL_NED = 84;

// CRC extras (per-message seed for integrity check)
const CRC_EXTRA: Record<number, number> = {
  [MSG_HEARTBEAT]: 50,
  [MSG_SET_MODE]: 89,
  [MSG_PARAM_SET]: 168,
  [MSG_COMMAND_LONG]: 152,
  [MSG_SET_POSITION_TARGET_LOCAL_NED]: 143,
};

// MAV_CMD values
const MAV_CMD_COMPONENT_ARM_DISARM = 400;
const MAV_CMD_NAV_TAKEOFF = 22;

// MAV_TYPE, MAV_AUTOPILOT, MAV_MODE, MAV_STATE
const MAV_TYPE_GCS = 6;
const MAV_AUTOPILOT_INVALID = 8;

// System/Component IDs
const GCS_SYSID = 255;
const GCS_COMPID = 190;
const TARGET_SYSID = 1;
const TARGET_COMPID = 1;

// Copter flight modes (ArduCopter specific custom_mode values)
const COPTER_MODES: Record<string, number> = {
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

function encodeFrame(msgId: number, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(12 + payload.length);
  const s = seq++ & 0xff;

  frame[0] = MAVLINK_STX;
  frame[1] = payload.length;
  frame[2] = 0; // incompat flags
  frame[3] = 0; // compat flags
  frame[4] = s;
  frame[5] = GCS_SYSID;
  frame[6] = GCS_COMPID;
  frame[7] = msgId & 0xff;
  frame[8] = (msgId >> 8) & 0xff;
  frame[9] = (msgId >> 16) & 0xff;
  frame.set(payload, 10);

  // CRC is computed over bytes 1..9+payload (skip STX)
  const crcBuf = frame.subarray(1, 10 + payload.length);
  const crc = mavlinkCrc(crcBuf, CRC_EXTRA[msgId] ?? 0);
  frame[10 + payload.length] = crc & 0xff;
  frame[10 + payload.length + 1] = (crc >> 8) & 0xff;

  return frame;
}

function floatToBytes(val: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, val, true);
  return new Uint8Array(buf);
}

function uint32ToBytes(val: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, val, true);
  return new Uint8Array(buf);
}

function uint16ToBytes(val: number): Uint8Array {
  const buf = new ArrayBuffer(2);
  new DataView(buf).setUint16(0, val, true);
  return new Uint8Array(buf);
}

export function encodeHeartbeat(): Uint8Array {
  // HEARTBEAT: type(u8), autopilot(u8), base_mode(u8), custom_mode(u32), system_status(u8), mavlink_version(u8)
  // Wire order: custom_mode(u32), type(u8), autopilot(u8), base_mode(u8), system_status(u8), mavlink_version(u8)
  const payload = new Uint8Array(9);
  const dv = new DataView(payload.buffer);
  dv.setUint32(0, 0, true); // custom_mode
  payload[4] = MAV_TYPE_GCS;
  payload[5] = MAV_AUTOPILOT_INVALID;
  payload[6] = 0; // base_mode
  payload[7] = 0; // system_status
  payload[8] = 3; // mavlink_version
  return encodeFrame(MSG_HEARTBEAT, payload);
}

export function encodeSetMode(mode: string): Uint8Array | null {
  const customMode = COPTER_MODES[mode.toUpperCase()];
  if (customMode === undefined) return null;

  // SET_MODE: custom_mode(u32), target_system(u8), base_mode(u8)
  const payload = new Uint8Array(6);
  const dv = new DataView(payload.buffer);
  dv.setUint32(0, customMode, true);
  payload[4] = TARGET_SYSID;
  payload[5] = 1 | 128; // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED | MAV_MODE_FLAG_SAFETY_ARMED ... just set 0x81
  // Actually base_mode should be 0x81 (custom enabled) for mode switch to work
  // 0x01 = CUSTOM_MODE, 0x80 = currently the flag for testing
  // ArduPilot mainly checks custom_mode and ignores base_mode in SET_MODE
  payload[5] = 0x01; // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED
  return encodeFrame(MSG_SET_MODE, payload);
}

export function encodeCommandLong(
  command: number,
  param1 = 0, param2 = 0, param3 = 0, param4 = 0,
  param5 = 0, param6 = 0, param7 = 0,
): Uint8Array {
  // COMMAND_LONG wire order:
  // param1..param7 (float each = 28 bytes), command(u16), target_system(u8),
  // target_component(u8), confirmation(u8) = total 33 bytes
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
  payload[32] = 0; // confirmation
  return encodeFrame(MSG_COMMAND_LONG, payload);
}

export function encodeArm(): Uint8Array {
  return encodeCommandLong(MAV_CMD_COMPONENT_ARM_DISARM, 1, 0, 0, 0, 0, 0, 0);
}

export function encodeDisarm(): Uint8Array {
  return encodeCommandLong(MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 0, 0, 0, 0, 0);
}

export function encodeTakeoff(altitudeM: number): Uint8Array {
  return encodeCommandLong(MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, altitudeM);
}

export function encodeGotoLocalNED(north: number, east: number, down: number): Uint8Array {
  // SET_POSITION_TARGET_LOCAL_NED wire order:
  // time_boot_ms(u32), x(f32), y(f32), z(f32), vx(f32), vy(f32), vz(f32),
  // afx(f32), afy(f32), afz(f32), yaw(f32), yaw_rate(f32),
  // type_mask(u16), target_system(u8), target_component(u8), coordinate_frame(u8)
  // = 53 bytes
  const payload = new Uint8Array(53);
  const dv = new DataView(payload.buffer);
  dv.setUint32(0, 0, true); // time_boot_ms
  dv.setFloat32(4, north, true); // x (north)
  dv.setFloat32(8, east, true);  // y (east)
  dv.setFloat32(12, down, true); // z (down, so negative = up)
  // vx, vy, vz, afx, afy, afz, yaw, yaw_rate = 0
  // type_mask: ignore velocity, accel, yaw, yaw_rate — only use position
  // 0b0000_1111_1111_1000 = 0x0FF8
  dv.setUint16(48, 0x0DF8, true);
  payload[50] = TARGET_SYSID;
  payload[51] = TARGET_COMPID;
  payload[52] = 1; // MAV_FRAME_LOCAL_NED
  return encodeFrame(MSG_SET_POSITION_TARGET_LOCAL_NED, payload);
}

export function encodeForceArm(): Uint8Array {
  return encodeCommandLong(MAV_CMD_COMPONENT_ARM_DISARM, 1, 21196, 0, 0, 0, 0, 0);
}

export function encodeParamSet(paramId: string, value: number): Uint8Array {
  // PARAM_SET wire order: param_value(f32), target_system(u8), target_component(u8),
  // param_id(char[16]), param_type(u8) = 23 bytes
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

export const COPTER_MODE_NAMES = Object.keys(COPTER_MODES);

// Reverse lookup: custom_mode number → name
const COPTER_MODE_BY_NUM: Record<number, string> = {};
for (const [name, num] of Object.entries(COPTER_MODES)) {
  COPTER_MODE_BY_NUM[num] = name;
}

// Additional message IDs for parsing responses
const MSG_COMMAND_ACK = 77;
const MSG_STATUSTEXT = 253;
const MSG_SYS_STATUS = 1;

// CRC extras for messages we want to parse
const CRC_EXTRA_PARSE: Record<number, number> = {
  [MSG_HEARTBEAT]: 50,
  [MSG_COMMAND_ACK]: 143,
  [MSG_STATUSTEXT]: 83,
  [MSG_SYS_STATUS]: 124,
};

export interface ParsedHeartbeat {
  type: 'heartbeat';
  vehicleType: number;
  customMode: number;
  modeName: string;
  baseMode: number;
  armed: boolean;
}

export interface ParsedCommandAck {
  type: 'command_ack';
  command: number;
  result: number;
  resultText: string;
}

export interface ParsedStatusText {
  type: 'statustext';
  severity: number;
  text: string;
}

export type ParsedMessage = ParsedHeartbeat | ParsedCommandAck | ParsedStatusText;

const MAV_RESULT_NAMES: Record<number, string> = {
  0: 'ACCEPTED',
  1: 'TEMPORARILY_REJECTED',
  2: 'DENIED',
  3: 'UNSUPPORTED',
  4: 'FAILED',
  5: 'IN_PROGRESS',
  6: 'CANCELLED',
};

export class MavlinkParser {
  private buf = new Uint8Array(0);

  feed(data: Uint8Array): ParsedMessage[] {
    // Append new data to buffer
    const combined = new Uint8Array(this.buf.length + data.length);
    combined.set(this.buf);
    combined.set(data, this.buf.length);
    this.buf = combined;

    const messages: ParsedMessage[] = [];

    while (this.buf.length >= 12) {
      // Find STX
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

      // Verify CRC if we know the CRC extra
      const crcExtra = CRC_EXTRA_PARSE[msgId] ?? CRC_EXTRA[msgId];
      if (crcExtra !== undefined) {
        const crcBuf = this.buf.slice(1, 10 + payloadLen);
        const computed = mavlinkCrc(crcBuf, crcExtra);
        const received = this.buf[10 + payloadLen] | (this.buf[10 + payloadLen + 1] << 8);
        if (computed !== received) {
          // Bad CRC, skip this byte and try again
          this.buf = this.buf.slice(1);
          continue;
        }
      }

      // Parse known messages
      const parsed = this.parsePayload(msgId, payload);
      if (parsed) messages.push(parsed);

      this.buf = this.buf.slice(frameLen);
    }

    // Trim buffer if it's getting too large (prevent memory leak from garbage data)
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
          type: 'heartbeat',
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
          type: 'command_ack',
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
        return { type: 'statustext', severity, text };
      }
      default:
        return null;
    }
  }
}
