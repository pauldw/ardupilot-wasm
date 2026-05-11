// WASM entry point for ArduPilot SITL
// Provides C functions callable from JavaScript

#include <AP_HAL/AP_HAL.h>
#include <AP_HAL_SITL/AP_HAL_SITL.h>
#include <AP_Vehicle/AP_Vehicle.h>
#include <SITL/SITL.h>
#include <emscripten.h>

extern const AP_HAL::HAL& hal;

static bool initialized = false;
static uint64_t sim_time_usec = 0;

extern "C" {

EMSCRIPTEN_KEEPALIVE
void ardupilot_init(void) {
    if (initialized) return;

    // Minimal argv for SITL
    static const char* argv[] = {
        "arducopter",
        "--model", "JSON",
        "--defaults", "",
        "--home", "-35.363261,149.165230,584,353",
        nullptr
    };
    int argc = 7;

    hal.run(argc, (char* const*)argv, AP_Vehicle::get_callbacks());
    initialized = true;
}

EMSCRIPTEN_KEEPALIVE
void ardupilot_step(uint32_t dt_usec) {
    if (!initialized) return;

    sim_time_usec += dt_usec;
    hal.scheduler->stop_clock(sim_time_usec);
}

EMSCRIPTEN_KEEPALIVE
void ardupilot_get_pwm(uint16_t* out, int count) {
    if (!initialized || !out) return;

    for (int i = 0; i < count && i < 16; i++) {
        out[i] = hal.rcout->read(i);
    }
}

EMSCRIPTEN_KEEPALIVE
void ardupilot_set_sensor_data(
    double timestamp,
    float gyro_x, float gyro_y, float gyro_z,
    float accel_x, float accel_y, float accel_z,
    double lat, double lon, double alt,
    float vn, float ve, float vd,
    float roll, float pitch, float yaw
) {
    if (!initialized) return;

    auto *sitl = AP::sitl();
    if (sitl == nullptr) return;

    auto &fdm = sitl->state;
    fdm.timestamp_us = (uint64_t)(timestamp * 1.0e6);
    fdm.gyro = {gyro_x, gyro_y, gyro_z};
    fdm.accel_body = {accel_x, accel_y, accel_z};
    fdm.latitude = lat;
    fdm.longitude = lon;
    fdm.altitude = alt;
    fdm.speedN = vn;
    fdm.speedE = ve;
    fdm.speedD = vd;
    fdm.rollDeg = degrees(roll);
    fdm.pitchDeg = degrees(pitch);
    fdm.yawDeg = degrees(yaw);
}

EMSCRIPTEN_KEEPALIVE
uint64_t ardupilot_get_time_usec(void) {
    return sim_time_usec;
}

} // extern "C"
