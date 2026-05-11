#!/bin/bash
# Comprehensive ArduPilot WASM build
set -e
source /Users/pwalker/Development/emsdk/emsdk_env.sh 2>/dev/null

ARDUPILOT="$HOME/Development/ardupilot-wasm-src"
WASM_BUILD="$HOME/Development/ardupilot-wasm/wasm-build"
OUT="$WASM_BUILD/output"
mkdir -p "$OUT"

CXXFLAGS="-std=c++17 -O2 -fno-exceptions \
    -D__AP_LINE__=__LINE__ \
    -DAP_SIM_ENABLED=1 \
    -include $WASM_BUILD/build/wasm_config.h \
    -I$ARDUPILOT/libraries \
    -I$ARDUPILOT \
    -I$WASM_BUILD/build/generated \
    -w"

compile_file() {
    local src="$1"
    local name=$(basename "$src" .cpp)
    local dir=$(basename $(dirname "$src"))
    local objname="${dir}__${name}"

    if [ -f "$OUT/${objname}.o" ] && [ "$OUT/${objname}.o" -nt "$src" ]; then
        return 0  # Already compiled
    fi

    echo -n "  ${dir}/${name}... "
    if em++ $CXXFLAGS -c "$src" -o "$OUT/${objname}.o" 2>"$OUT/${objname}.err"; then
        echo "OK"
        return 0
    else
        echo "FAIL"
        grep "error:" "$OUT/${objname}.err" | head -3
        return 1
    fi
}

failed=0
total=0

compile_dir() {
    local dir="$1"
    local label="$2"
    shift 2
    local files=("$@")

    echo "=== $label ==="
    for f in "${files[@]}"; do
        if [ -f "$f" ]; then
            ((total++))
            compile_file "$f" || ((failed++))
        fi
    done
    echo ""
}

# AP_HAL_SITL
compile_dir "HAL" "AP_HAL_SITL" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/HAL_SITL_Class.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/Scheduler.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/UARTDriver.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/SITL_State.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/SITL_State_common.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/Storage.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/RCOutput.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/RCInput.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/GPIO.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/AnalogIn.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/Semaphores.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/Util.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/system.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/I2CDevice.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/SPIDevice.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/SITL_cmdline.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/DSP.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/ToneAlarm_SF.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/UART_utils.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/sitl_airspeed.cpp" \
    "$ARDUPILOT/libraries/AP_HAL_SITL/sitl_rangefinder.cpp"

# AP_HAL (base)
compile_dir "HAL_BASE" "AP_HAL (base)" \
    "$ARDUPILOT/libraries/AP_HAL/HAL.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/RCOutput.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/Scheduler.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/Semaphores.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/SIMState.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/Storage.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/system.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/UARTDriver.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/Util.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/Device.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/DSP.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/GPIO.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/CANIface.cpp" \
    "$ARDUPILOT/libraries/AP_HAL/utility/RingBuffer.cpp"

# AP_HAL_Empty (used for stubs)
compile_dir "HAL_EMPTY" "AP_HAL_Empty" \
    $(find "$ARDUPILOT/libraries/AP_HAL_Empty" -name "*.cpp")

# Core Math
compile_dir "MATH" "AP_Math" \
    $(find "$ARDUPILOT/libraries/AP_Math" -name "*.cpp")

# Core libraries
compile_dir "COMMON" "AP_Common + AP_Param + InternalError" \
    "$ARDUPILOT/libraries/AP_Common/AP_Common.cpp" \
    "$ARDUPILOT/libraries/AP_Common/AP_ExpandCore.cpp" \
    "$ARDUPILOT/libraries/AP_Common/c++.cpp" \
    "$ARDUPILOT/libraries/AP_Common/Location.cpp" \
    "$ARDUPILOT/libraries/AP_Common/sorting.cpp" \
    "$ARDUPILOT/libraries/AP_Common/NMEA.cpp" \
    $(find "$ARDUPILOT/libraries/AP_Param" -name "*.cpp") \
    "$ARDUPILOT/libraries/AP_InternalError/AP_InternalError.cpp"

# Scheduler
compile_dir "SCHED" "AP_Scheduler" \
    $(find "$ARDUPILOT/libraries/AP_Scheduler" -name "*.cpp")

# AHRS + EKF
compile_dir "AHRS" "AP_AHRS" \
    $(find "$ARDUPILOT/libraries/AP_AHRS" -name "*.cpp")

compile_dir "EKF2" "AP_NavEKF2" \
    $(find "$ARDUPILOT/libraries/AP_NavEKF2" -name "*.cpp")

compile_dir "EKF3" "AP_NavEKF3" \
    $(find "$ARDUPILOT/libraries/AP_NavEKF3" -name "*.cpp")

compile_dir "EKF" "AP_NavEKF + AP_DAL" \
    $(find "$ARDUPILOT/libraries/AP_NavEKF" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_DAL" -name "*.cpp")

# Sensors
compile_dir "SENSORS" "Sensors (IMU, Baro, Compass, GPS)" \
    $(find "$ARDUPILOT/libraries/AP_InertialSensor" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_Baro" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_Compass" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_GPS" -name "*.cpp")

# Motors + PID
compile_dir "MOTORS" "AP_Motors + AC_PID + AC_AttitudeControl" \
    $(find "$ARDUPILOT/libraries/AP_Motors" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AC_PID" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AC_AttitudeControl" -name "*.cpp")

# Navigation
compile_dir "NAV" "Navigation (WPNav, InertialNav, etc)" \
    $(find "$ARDUPILOT/libraries/AC_WPNav" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_InertialNav" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_Navigation" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_L1_Control" -name "*.cpp")

# MAVLink/GCS
compile_dir "GCS" "GCS_MAVLink" \
    $(find "$ARDUPILOT/libraries/GCS_MAVLink" -name "*.cpp")

# Vehicle support libraries
compile_dir "VEHICLE" "AP_Vehicle + BoardConfig" \
    $(find "$ARDUPILOT/libraries/AP_Vehicle" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_BoardConfig" -name "*.cpp")

# RC Channels + SRV_Channel
compile_dir "RC" "RC_Channel + SRV_Channel" \
    $(find "$ARDUPILOT/libraries/RC_Channel" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/SRV_Channel" -name "*.cpp")

# SITL Simulation
compile_dir "SITL" "SITL Library" \
    $(find "$ARDUPILOT/libraries/SITL" -name "*.cpp")

# Other needed libraries
compile_dir "OTHER" "Other needed libs" \
    $(find "$ARDUPILOT/libraries/AP_Arming" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_Mission" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_BattMonitor" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_RangeFinder" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_RTC" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_SerialManager" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_Declination" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_RCMapper" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_Filesystem" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/Filter" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/StorageManager" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_AccelCal" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_Notify" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_RAMTRON" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_Math" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_FlashStorage" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_JSON" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_SmartRTL" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_CSVReader" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_SurfaceDistance" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AC_Fence" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AC_InputManager" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_RSSI" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_Tuning" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_Logger" -name "*.cpp") \
    $(find "$ARDUPILOT/libraries/AP_ROMFS" -name "*.cpp") \
    "$ARDUPILOT/libraries/AP_OLC/AP_OLC.cpp"

# ArduCopter
compile_dir "COPTER" "ArduCopter" \
    $(find "$ARDUPILOT/ArduCopter" -name "*.cpp")

echo "=============================="
echo "Total: $total  Failed: $failed  Passed: $((total - failed))"
echo "=============================="
