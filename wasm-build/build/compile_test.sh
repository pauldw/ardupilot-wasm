#!/bin/bash
# Test compilation of ArduPilot source files with Emscripten
set -e
source /Users/pwalker/Development/emsdk/emsdk_env.sh 2>/dev/null

ARDUPILOT="$HOME/Development/ardupilot-wasm-src"
WASM_BUILD="$HOME/Development/ardupilot-wasm/wasm-build"
OUT="/tmp/ardupilot-wasm-test"
mkdir -p "$OUT"

CXXFLAGS="-std=c++17 -O2 -fno-exceptions -fno-rtti \
  -D__AP_LINE__=__LINE__ \
  -DAP_SIM_ENABLED=1 \
  -DARDUPILOT_BUILD \
  -include $WASM_BUILD/build/wasm_config.h \
  -I$ARDUPILOT/libraries \
  -I$ARDUPILOT \
  -I$WASM_BUILD/build/generated \
  -I$WASM_BUILD/hal \
  -Wno-macro-redefined \
  -Wno-unused-private-field \
  -Wno-unused-variable \
  -Wno-unused-function"

compile_file() {
    local src="$1"
    local name=$(basename "$src" .cpp)
    echo -n "  $name... "
    if em++ $CXXFLAGS -c "$src" -o "$OUT/${name}.o" 2>"$OUT/${name}.err"; then
        echo "OK"
        return 0
    else
        echo "FAIL"
        head -5 "$OUT/${name}.err"
        return 1
    fi
}

echo "=== Testing core library compilation ==="

FILES=(
    "$ARDUPILOT/libraries/AP_Math/AP_Math.cpp"
    "$ARDUPILOT/libraries/AP_Math/vector2.cpp"
    "$ARDUPILOT/libraries/AP_Math/vector3.cpp"
    "$ARDUPILOT/libraries/AP_Math/matrix3.cpp"
    "$ARDUPILOT/libraries/AP_Math/quaternion.cpp"
    "$ARDUPILOT/libraries/AP_Math/location.cpp"
    "$ARDUPILOT/libraries/AP_Math/polygon.cpp"
    "$ARDUPILOT/libraries/AP_Math/control.cpp"
    "$ARDUPILOT/libraries/AP_Common/AP_Common.cpp"
    "$ARDUPILOT/libraries/AP_Param/AP_Param.cpp"
    "$ARDUPILOT/libraries/AP_InternalError/AP_InternalError.cpp"
    "$ARDUPILOT/libraries/AP_HAL/AP_HAL.cpp"
    "$ARDUPILOT/libraries/AP_HAL/utility/RingBuffer.cpp"
)

failed=0
for f in "${FILES[@]}"; do
    compile_file "$f" || ((failed++))
done

echo ""
echo "=== Results: $((${#FILES[@]} - failed))/${#FILES[@]} passed ==="
