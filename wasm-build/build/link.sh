#!/bin/bash
# Link ArduPilot WASM binary using the curated object file list
set -e
source /Users/pwalker/Development/emsdk/emsdk_env.sh 2>/dev/null

OUT="$HOME/Development/ardupilot-wasm/wasm-build/output"

echo "=== Linking from link_files2.txt ==="
OBJ_COUNT=$(wc -l < "$OUT/link_files2.txt" | tr -d ' ')
echo "Linking $OBJ_COUNT object files..."

em++ -O2 \
  -s ASYNCIFY=1 -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=67108864 -s MAXIMUM_MEMORY=268435456 \
  -s "EXPORTED_FUNCTIONS=[_main,_wasm_get_send_buf,_wasm_get_send_len,_wasm_clear_send,_wasm_get_recv_buf,_wasm_set_recv_data,_wasm_get_recv_buf_size,_wasm_uart_tx_available,_wasm_uart_tx_read,_wasm_uart_rx_write,_malloc,_free]" \
  -s "EXPORTED_RUNTIME_METHODS=[ccall,cwrap,callMain,HEAPU8,HEAPU16,HEAPF32,HEAPF64,UTF8ToString,stringToUTF8,lengthBytesUTF8,FS]" \
  -s MODULARIZE=1 -s "EXPORT_NAME=ArduPilotModule" -s ASYNCIFY_STACK_SIZE=65536 \
  -s FILESYSTEM=1 -s FORCE_FILESYSTEM=1 \
  -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
  -s INVOKE_RUN=0 \
  -o "$OUT/ardupilot.js" \
  $(cat "$OUT/link_files2.txt") 2>&1

echo ""
echo "=== Copying to public ==="
cp "$OUT/ardupilot.js" "$HOME/Development/ardupilot-wasm/public/ardupilot.js"
cp "$OUT/ardupilot.wasm" "$HOME/Development/ardupilot-wasm/public/ardupilot.wasm"
echo "Done!"
ls -lh "$HOME/Development/ardupilot-wasm/public/ardupilot.wasm"
