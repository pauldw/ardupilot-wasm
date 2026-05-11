// Stub implementations for remaining undefined symbols in WASM build

#include <AP_HAL/AP_HAL.h>
#include <AP_HAL_SITL/UARTDriver.h>

// Force-enable AP_ExternalAHRS to get the real class definition for stubs
#undef AP_EXTERNAL_AHRS_ENABLED
#define AP_EXTERNAL_AHRS_ENABLED 1
#include <AP_ExternalAHRS/AP_ExternalAHRS.h>

namespace AP {
    AP_ExternalAHRS &externalAHRS() { static AP_ExternalAHRS e; return e; }
}

const AP_Param::GroupInfo AP_ExternalAHRS::var_info[] = { AP_GROUPEND };

AP_ExternalAHRS::AP_ExternalAHRS() {}
void AP_ExternalAHRS::init() {}
void AP_ExternalAHRS::update() {}
const char *AP_ExternalAHRS::get_name() const { return ""; }
int8_t AP_ExternalAHRS::get_port(AvailableSensor) const { return -1; }

// HALSITL UARTDriver methods not needed in WASM
namespace HALSITL {
    void UARTDriver::configure_parity(uint8_t) {}
    void UARTDriver::set_stop_bits(int) {}
    bool UARTDriver::set_speed(int) const { return true; }
}

extern "C" {
    int pthread_setname_np(pthread_t, const char*) { return 0; }
}
