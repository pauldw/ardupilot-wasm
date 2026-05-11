#!/bin/bash
set -e
source /Users/pwalker/Development/emsdk/emsdk_env.sh 2>/dev/null

ARDUPILOT="$HOME/Development/ardupilot-wasm-src"
WASM_BUILD="$HOME/Development/ardupilot-wasm/wasm-build"
OUT="$WASM_BUILD/output"

compile_file() {
    local src="$1"
    local obj="$2"
    echo -n "  $(basename $src)... "
    if em++ -std=c++17 -O2 -fno-exceptions \
        -D__AP_LINE__=__LINE__ \
        -DAP_SIM_ENABLED=1 \
        -include "$WASM_BUILD/build/wasm_config.h" \
        -I"$ARDUPILOT/libraries" \
        -I"$ARDUPILOT" \
        -I"$WASM_BUILD/build/generated" \
        -w \
        -c "$src" -o "$obj" 2>&1; then
        echo "OK"
    else
        echo "FAIL"
        return 1
    fi
}

# Only recompile changed files
for arg in "$@"; do
    case "$arg" in
        HAL_SITL_Class)
            compile_file "$ARDUPILOT/libraries/AP_HAL_SITL/HAL_SITL_Class.cpp" "$OUT/AP_HAL_SITL__HAL_SITL_Class.o"
            ;;
        SITL_State)
            compile_file "$ARDUPILOT/libraries/AP_HAL_SITL/SITL_State.cpp" "$OUT/AP_HAL_SITL__SITL_State.o"
            ;;
        Socket_wasm)
            compile_file "$ARDUPILOT/libraries/AP_HAL/utility/Socket_wasm.cpp" "$OUT/Socket_wasm.o"
            ;;
        *)
            echo "Unknown target: $arg"
            ;;
    esac
done

echo ""
echo "=== Relinking ==="
bash "$WASM_BUILD/build/link.sh"
