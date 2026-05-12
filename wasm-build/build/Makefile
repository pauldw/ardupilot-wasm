SHELL := /bin/bash

# Paths
ARDUPILOT := $(HOME)/Development/ardupilot-wasm-src
WASM_BUILD := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))..
BUILD_DIR := $(WASM_BUILD)/output
EMSDK_ENV := $(HOME)/Development/emsdk/emsdk_env.sh

# Emscripten compiler (sourced from emsdk)
EMCC := source $(EMSDK_ENV) > /dev/null 2>&1 && em++
EMAR := source $(EMSDK_ENV) > /dev/null 2>&1 && emar

# Force-include our WASM config before anything else
WASM_CONFIG := $(WASM_BUILD)/build/wasm_config.h

# Include paths
INCLUDES := \
	-I$(ARDUPILOT)/libraries \
	-I$(ARDUPILOT) \
	-I$(WASM_BUILD)/hal \
	-I$(WASM_BUILD)/glue \
	-I$(WASM_BUILD)/build/generated \
	-include $(WASM_CONFIG)

# Compiler flags
CXXFLAGS := \
	-std=c++17 \
	-O2 \
	-fno-exceptions \
	-fno-rtti \
	-DARDUPILOT_BUILD \
	-DSKETCH_MAIN=ArduCopter_main \
	-DAP_SIM_ENABLED=1 \
	-D__AP_LINE__=__LINE__ \
	-Wno-unused-private-field \
	-Wno-unused-variable \
	-Wno-unused-function \
	-Wno-missing-field-initializers \
	-Wno-deprecated-declarations \
	$(INCLUDES)

# Emscripten-specific flags
EMFLAGS := \
	-s ASYNCIFY=1 \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s INITIAL_MEMORY=67108864 \
	-s MAXIMUM_MEMORY=268435456 \
	-s EXPORTED_FUNCTIONS='["_main","_wasm_get_send_buf","_wasm_get_send_len","_wasm_clear_send","_wasm_get_recv_buf","_wasm_set_recv_data","_wasm_get_recv_buf_size","_wasm_uart_tx_available","_wasm_uart_tx_read","_wasm_uart_rx_write","_malloc","_free"]' \
	-s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","callMain","HEAPU8","HEAPU16","HEAPF32","HEAPF64","UTF8ToString","stringToUTF8","lengthBytesUTF8","FS"]' \
	-s MODULARIZE=1 \
	-s EXPORT_NAME='ArduPilotModule' \
	-s ASYNCIFY_STACK_SIZE=65536 \
	-s FILESYSTEM=1 \
	-s FORCE_FILESYSTEM=1 \
	-s INVOKE_RUN=0

# Source files - ArduCopter core
COPTER_SRCS := \
	$(ARDUPILOT)/ArduCopter/Copter.cpp \
	$(ARDUPILOT)/ArduCopter/system.cpp \
	$(ARDUPILOT)/ArduCopter/sensors.cpp \
	$(ARDUPILOT)/ArduCopter/motors.cpp \
	$(ARDUPILOT)/ArduCopter/Attitude.cpp \
	$(ARDUPILOT)/ArduCopter/mode.cpp \
	$(ARDUPILOT)/ArduCopter/mode_stabilize.cpp \
	$(ARDUPILOT)/ArduCopter/mode_althold.cpp \
	$(ARDUPILOT)/ArduCopter/mode_guided.cpp \
	$(ARDUPILOT)/ArduCopter/mode_loiter.cpp \
	$(ARDUPILOT)/ArduCopter/mode_land.cpp \
	$(ARDUPILOT)/ArduCopter/mode_auto.cpp \
	$(ARDUPILOT)/ArduCopter/mode_rtl.cpp \
	$(ARDUPILOT)/ArduCopter/mode_acro.cpp \
	$(ARDUPILOT)/ArduCopter/mode_poshold.cpp \
	$(ARDUPILOT)/ArduCopter/mode_brake.cpp \
	$(ARDUPILOT)/ArduCopter/mode_circle.cpp \
	$(ARDUPILOT)/ArduCopter/mode_sport.cpp \
	$(ARDUPILOT)/ArduCopter/mode_drift.cpp \
	$(ARDUPILOT)/ArduCopter/mode_flip.cpp \
	$(ARDUPILOT)/ArduCopter/mode_throw.cpp \
	$(ARDUPILOT)/ArduCopter/mode_smart_rtl.cpp \
	$(ARDUPILOT)/ArduCopter/mode_guided_nogps.cpp \
	$(ARDUPILOT)/ArduCopter/mode_guided_custom.cpp \
	$(ARDUPILOT)/ArduCopter/navigation.cpp \
	$(ARDUPILOT)/ArduCopter/commands.cpp \
	$(ARDUPILOT)/ArduCopter/radio.cpp \
	$(ARDUPILOT)/ArduCopter/Parameters.cpp \
	$(ARDUPILOT)/ArduCopter/failsafe.cpp \
	$(ARDUPILOT)/ArduCopter/inertia.cpp \
	$(ARDUPILOT)/ArduCopter/takeoff.cpp \
	$(ARDUPILOT)/ArduCopter/takeoff_check.cpp \
	$(ARDUPILOT)/ArduCopter/land_detector.cpp \
	$(ARDUPILOT)/ArduCopter/crash_check.cpp \
	$(ARDUPILOT)/ArduCopter/ekf_check.cpp \
	$(ARDUPILOT)/ArduCopter/autoyaw.cpp \
	$(ARDUPILOT)/ArduCopter/RC_Channel_Copter.cpp \
	$(ARDUPILOT)/ArduCopter/GCS_Copter.cpp \
	$(ARDUPILOT)/ArduCopter/GCS_MAVLink_Copter.cpp \
	$(ARDUPILOT)/ArduCopter/AP_Arming_Copter.cpp \
	$(ARDUPILOT)/ArduCopter/AP_State.cpp \
	$(ARDUPILOT)/ArduCopter/events.cpp \
	$(ARDUPILOT)/ArduCopter/rate_thread.cpp \
	$(ARDUPILOT)/ArduCopter/surface_tracking.cpp \
	$(ARDUPILOT)/ArduCopter/baro_ground_effect.cpp \
	$(ARDUPILOT)/ArduCopter/Log.cpp \
	$(ARDUPILOT)/ArduCopter/UserCode.cpp \
	$(ARDUPILOT)/ArduCopter/UserParameters.cpp \
	$(ARDUPILOT)/ArduCopter/tuning.cpp

# AP_Mount (servo gimbal support)
MOUNT_SRCS := \
	$(ARDUPILOT)/libraries/AP_Mount/AP_Mount.cpp \
	$(ARDUPILOT)/libraries/AP_Mount/AP_Mount_Backend.cpp \
	$(ARDUPILOT)/libraries/AP_Mount/AP_Mount_Params.cpp \
	$(ARDUPILOT)/libraries/AP_Mount/AP_Mount_Servo.cpp

# WASM HAL and glue
WASM_SRCS := \
	$(WASM_BUILD)/glue/wasm_entry.cpp

# All sources
ALL_SRCS := $(COPTER_SRCS) $(MOUNT_SRCS) $(WASM_SRCS)
ALL_OBJS := $(patsubst %.cpp,$(BUILD_DIR)/%.o,$(notdir $(ALL_SRCS)))

# Output
TARGET := $(BUILD_DIR)/ardupilot.js

.PHONY: all clean test

all: $(TARGET)

# Compile each source file
# We use a pattern rule with vpath
vpath %.cpp $(sort $(dir $(ALL_SRCS)))

$(BUILD_DIR)/%.o: %.cpp | $(BUILD_DIR)
	@echo "CC $<"
	@$(EMCC) $(CXXFLAGS) -c $< -o $@

$(BUILD_DIR):
	mkdir -p $(BUILD_DIR)

$(TARGET): $(ALL_OBJS)
	@echo "LINK $@"
	@$(EMCC) $(CXXFLAGS) $(EMFLAGS) $^ -o $@

clean:
	rm -rf $(BUILD_DIR)

# Quick test - just try to compile one file to check setup
test:
	@echo "Testing emcc setup..."
	@$(EMCC) --version
	@echo "Testing compilation of a single file..."
	@mkdir -p $(BUILD_DIR)
	@$(EMCC) $(CXXFLAGS) -c $(ARDUPILOT)/libraries/AP_Math/AP_Math.cpp -o $(BUILD_DIR)/test_AP_Math.o
	@echo "Success!"
