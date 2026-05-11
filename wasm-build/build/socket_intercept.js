// Emscripten JS library to intercept socket operations for ArduPilot WASM
// Routes UDP sendto/recvfrom through JavaScript buffers instead of WebSocket

var WasmSocketBridge = {
  // Buffers for communication
  _pwm_buffer: null,      // Binary PWM packet from ArduPilot
  _sensor_buffer: null,   // JSON sensor data to ArduPilot
  _sensor_ready: false,
  _pwm_callback: null,
  _bound_port: 0,
  _peer_addr: null,
  _peer_port: 0,

  $WasmSocketBridge: {
    pwm_data: null,
    sensor_data: null,
    sensor_ready: false,
    callbacks: {},

    init: function() {
      this.pwm_data = null;
      this.sensor_data = null;
      this.sensor_ready = false;
    },

    setSensorData: function(jsonString) {
      this.sensor_data = jsonString;
      this.sensor_ready = true;
    },

    getPwmData: function() {
      var data = this.pwm_data;
      this.pwm_data = null;
      return data;
    },

    onPwmReceived: function(callback) {
      this.callbacks.onPwm = callback;
    }
  },
};

mergeInto(LibraryManager.library, WasmSocketBridge);
