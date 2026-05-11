#ifdef __EMSCRIPTEN__
/*
  WASM UART bridge — shared ring buffers for MAVLink communication between
  JavaScript and ArduPilot's serial port 0.

  JS writes to uart_rx_buf (data going INTO ArduPilot).
  JS reads from uart_tx_buf (data coming OUT of ArduPilot).
*/

#include <cstdint>
#include <cstring>
#include <emscripten.h>

static uint8_t uart_tx_buf[16384];
static volatile uint32_t uart_tx_head = 0;
static volatile uint32_t uart_tx_tail = 0;

static uint8_t uart_rx_buf[16384];
static volatile uint32_t uart_rx_head = 0;
static volatile uint32_t uart_rx_tail = 0;

static constexpr uint32_t BUF_MASK = 16384 - 1;

extern "C" {

// --- TX: ArduPilot → JS ---

EMSCRIPTEN_KEEPALIVE
void wasm_uart_tx_write(const uint8_t *data, uint32_t len) {
    for (uint32_t i = 0; i < len; i++) {
        uint32_t next = (uart_tx_head + 1) & BUF_MASK;
        if (next == uart_tx_tail) break; // full
        uart_tx_buf[uart_tx_head] = data[i];
        uart_tx_head = next;
    }
}

EMSCRIPTEN_KEEPALIVE
uint32_t wasm_uart_tx_available(void) {
    return (uart_tx_head - uart_tx_tail) & BUF_MASK;
}

EMSCRIPTEN_KEEPALIVE
uint32_t wasm_uart_tx_read(uint8_t *out, uint32_t max_len) {
    uint32_t count = 0;
    while (count < max_len && uart_tx_tail != uart_tx_head) {
        out[count++] = uart_tx_buf[uart_tx_tail];
        uart_tx_tail = (uart_tx_tail + 1) & BUF_MASK;
    }
    return count;
}

EMSCRIPTEN_KEEPALIVE
uint8_t* wasm_uart_tx_buf_ptr(void) { return uart_tx_buf; }

EMSCRIPTEN_KEEPALIVE
uint32_t wasm_uart_tx_head_val(void) { return uart_tx_head; }

EMSCRIPTEN_KEEPALIVE
uint32_t wasm_uart_tx_tail_val(void) { return uart_tx_tail; }

// --- RX: JS → ArduPilot ---

EMSCRIPTEN_KEEPALIVE
void wasm_uart_rx_write(const uint8_t *data, uint32_t len) {
    for (uint32_t i = 0; i < len; i++) {
        uint32_t next = (uart_rx_head + 1) & BUF_MASK;
        if (next == uart_rx_tail) break; // full
        uart_rx_buf[uart_rx_head] = data[i];
        uart_rx_head = next;
    }
}

EMSCRIPTEN_KEEPALIVE
uint32_t wasm_uart_rx_available(void) {
    return (uart_rx_head - uart_rx_tail) & BUF_MASK;
}

EMSCRIPTEN_KEEPALIVE
uint32_t wasm_uart_rx_read(uint8_t *out, uint32_t max_len) {
    uint32_t count = 0;
    while (count < max_len && uart_rx_tail != uart_rx_head) {
        out[count++] = uart_rx_buf[uart_rx_tail];
        uart_rx_tail = (uart_rx_tail + 1) & BUF_MASK;
    }
    return count;
}

// Convenience: write directly from JS heap pointer
EMSCRIPTEN_KEEPALIVE
void wasm_uart_rx_write_from_heap(uint32_t heap_ptr, uint32_t len) {
    // This is called from JS — heap_ptr is a pointer into HEAPU8
    wasm_uart_rx_write(reinterpret_cast<const uint8_t*>(heap_ptr), len);
}

} // extern "C"

// Called by the patched UARTDriver to move data in/out of ArduPilot's ring buffers
void wasm_uart_push_to_ardupilot(uint8_t *out, uint32_t max_len, uint32_t &bytes_read) {
    bytes_read = 0;
    while (bytes_read < max_len && uart_rx_tail != uart_rx_head) {
        out[bytes_read++] = uart_rx_buf[uart_rx_tail];
        uart_rx_tail = (uart_rx_tail + 1) & BUF_MASK;
    }
}

void wasm_uart_pull_from_ardupilot(const uint8_t *data, uint32_t len) {
    wasm_uart_tx_write(data, len);
}

#endif // __EMSCRIPTEN__
