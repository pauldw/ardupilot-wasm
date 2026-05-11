declare function ArduPilotModule(config: Record<string, unknown>): Promise<EmscriptenModule>;

interface EmscriptenFS {
  writeFile(path: string, data: string | Uint8Array): void;
  mkdir(path: string): void;
}

interface EmscriptenModule {
  callMain(args: string[]): void;
  _wasm_get_send_buf(): number;
  _wasm_get_send_len(): number;
  _wasm_clear_send(): void;
  _wasm_get_recv_buf(): number;
  _wasm_set_recv_data(len: number): void;
  _wasm_get_recv_buf_size(): number;
  _wasm_uart_tx_available(): number;
  _wasm_uart_tx_read(outPtr: number, maxLen: number): number;
  _wasm_uart_rx_write(dataPtr: number, len: number): void;
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAPU16: Uint16Array;
  UTF8ToString(ptr: number): string;
  stringToUTF8(str: string, outPtr: number, maxBytesToWrite: number): void;
  lengthBytesUTF8(str: string): number;
  FS: EmscriptenFS;
  _onServoData?: () => void;
}

const SERVO_MAGIC = 18458;
const SERVO_PACKET_SIZE = 40;

export type SensorDataCallback = () => {
  timestamp: number;
  imu: { gyro: number[]; accel_body: number[] };
  position: number[];
  attitude: number[];
  velocity: number[];
} | null;

export class ArduPilotBridge {
  private module: EmscriptenModule | null = null;
  private sendBufPtr = 0;
  private recvBufPtr = 0;
  private recvBufSize = 0;
  private _started = false;
  private _lastPwm: number[] = new Array(16).fill(0);
  private _sensorCallback: SensorDataCallback | null = null;
  private _servoCount = 0;
  private _uartBufPtr = 0;

  get started(): boolean { return this._started; }
  get lastPwm(): number[] { return this._lastPwm; }
  get servoCount(): number { return this._servoCount; }

  set onSensorDataNeeded(cb: SensorDataCallback) {
    this._sensorCallback = cb;
  }

  async load(onLog?: (msg: string) => void): Promise<void> {
    const log = onLog ?? console.log;
    log('Loading ArduPilot WASM module...');

    this.module = await ArduPilotModule({
      locateFile: (path: string) => '/' + path,
      print: (text: string) => {
        console.log('[AP]', text);
        log(text);
      },
      printErr: (text: string) => {
        console.warn('[AP]', text);
      },
      noInitialRun: true,
    });

    this.sendBufPtr = this.module._wasm_get_send_buf();
    this.recvBufPtr = this.module._wasm_get_recv_buf();
    this.recvBufSize = this.module._wasm_get_recv_buf_size();
    this._uartBufPtr = this.module._malloc(1024);

    this.module._onServoData = () => {
      this.handleServoData();
    };

    log('WASM module loaded. Buffer pointers ready.');
  }

  start(): void {
    if (!this.module || this._started) return;
    this._started = true;

    const defaults = [
      'FRAME_CLASS 1',
      'FRAME_TYPE 1',
      'ARMING_CHECK 0',
      'INS_GYR_CAL 0',
      'FS_THR_ENABLE 0',
      'EK3_ENABLE 1',
      'EK2_ENABLE 0',
      'AHRS_EKF_TYPE 3',
      // Speed up GPS lock for sim
      'SIM_GPS1_LCKTIME 0',
      'SIM_GPS1_LAG_MS 0',
      'SIM_GPS1_HZ 10',
      'SIM_GPS1_NUMSATS 15',
      // Relax EKF checks for faster convergence
      'EK3_GPS_CHECK 0',
      // Mark accelerometers as calibrated
      'INS_ACCOFFS_X 0.001',
      'INS_ACCOFFS_Y 0.001',
      'INS_ACCOFFS_Z 0.001',
      'INS_ACCSCAL_X 1.001',
      'INS_ACCSCAL_Y 1.001',
      'INS_ACCSCAL_Z 1.001',
      'INS_ACC2OFFS_X 0.001',
      'INS_ACC2OFFS_Y 0.001',
      'INS_ACC2OFFS_Z 0.001',
      'INS_ACC2SCAL_X 1.001',
      'INS_ACC2SCAL_Y 1.001',
      'INS_ACC2SCAL_Z 1.001',
    ].join('\n');

    this.module.FS.writeFile('/defaults.parm', defaults);

    this.module.callMain([
      '--model', 'JSON',
      '--home', '-35.363261,149.165230,584,353',
      '--defaults', '/defaults.parm',
    ]);
  }

  sendMavlink(data: Uint8Array): void {
    if (!this.module || !this._uartBufPtr) return;
    this.module.HEAPU8.set(data, this._uartBufPtr);
    this.module._wasm_uart_rx_write(this._uartBufPtr, data.length);
  }

  readMavlink(): Uint8Array | null {
    if (!this.module || !this._uartBufPtr) return null;
    const avail = this.module._wasm_uart_tx_available();
    if (avail === 0) return null;
    const toRead = Math.min(avail, 1024);
    const got = this.module._wasm_uart_tx_read(this._uartBufPtr, toRead);
    if (got === 0) return null;
    return new Uint8Array(this.module.HEAPU8.buffer, this._uartBufPtr, got).slice();
  }

  private handleServoData(): void {
    if (!this.module) return;

    const len = this.module._wasm_get_send_len();
    if (len < SERVO_PACKET_SIZE) return;

    const buf = this.module.HEAPU8;
    const dv = new DataView(buf.buffer, this.sendBufPtr, SERVO_PACKET_SIZE);

    const magic = dv.getUint16(0, true);
    if (magic !== SERVO_MAGIC) {
      this.module._wasm_clear_send();
      return;
    }

    const pwm: number[] = [];
    for (let i = 0; i < 16; i++) {
      pwm.push(dv.getUint16(8 + i * 2, true));
    }
    this._lastPwm = pwm;
    this._servoCount++;
    this.module._wasm_clear_send();

    if (this._sensorCallback) {
      const sensor = this._sensorCallback();
      if (sensor) {
        this.writeSensorData(sensor);
      }
    }
  }

  private writeSensorData(data: {
    timestamp: number;
    imu: { gyro: number[]; accel_body: number[] };
    position: number[];
    attitude: number[];
    velocity: number[];
  }): void {
    if (!this.module) return;

    const lat = -35.363261 + data.position[0] / 111320.0;
    const lng = 149.165230 + data.position[1] / (111320.0 * Math.cos(-35.363261 * Math.PI / 180));
    const alt = 584.0 - data.position[2];

    const json = JSON.stringify({
      timestamp: data.timestamp,
      imu: {
        gyro: data.imu.gyro,
        accel_body: data.imu.accel_body,
      },
      latitude: lat,
      longitude: lng,
      altitude: alt,
      position: [data.position[0], data.position[1], data.position[2]],
      attitude: data.attitude,
      velocity: [data.velocity[0], data.velocity[1], data.velocity[2]],
    });

    const len = this.module.lengthBytesUTF8(json) + 1;
    if (len > this.recvBufSize) return;

    this.module.stringToUTF8(json, this.recvBufPtr, this.recvBufSize);
    this.module._wasm_set_recv_data(len);
  }
}
