#!/bin/bash
source /Users/pwalker/Development/emsdk/emsdk_env.sh 2>/dev/null

ARDUPILOT="$HOME/Development/ardupilot-wasm-src"
WASM_BUILD="$HOME/Development/ardupilot-wasm/wasm-build"
OUT="/tmp/ardupilot-wasm-hal"
mkdir -p "$OUT"

compile_file() {
    local src="$1"
    local name=$(basename "$src" .cpp)
    echo -n "  $name... "
    if em++ \
        -std=c++17 -O2 -fno-exceptions \
        -D__AP_LINE__=__LINE__ \
        -DAP_SIM_ENABLED=1 \
        -include "$WASM_BUILD/build/wasm_config.h" \
        -I"$ARDUPILOT/libraries" \
        -I"$ARDUPILOT" \
        -I"$WASM_BUILD/build/generated" \
        -w \
        -c "$src" \
        -o "$OUT/${name}.o" 2>"$OUT/${name}.err"; then
        echo "OK"
        return 0
    else
        echo "FAIL"
        grep "error:" "$OUT/${name}.err" | head -3
        return 1
    fi
}

echo "=== Compiling HAL SITL files ==="
for f in HAL_SITL_Class Scheduler UARTDriver SITL_State SITL_State_common Storage RCOutput RCInput GPIO AnalogIn Semaphores Util system I2CDevice SPIDevice SITL_cmdline DSP ToneAlarm_SF UART_utils; do
    src="$ARDUPILOT/libraries/AP_HAL_SITL/${f}.cpp"
    if [ -f "$src" ]; then
        compile_file "$src"
    else
        echo "  $f... NOT FOUND"
    fi
done
