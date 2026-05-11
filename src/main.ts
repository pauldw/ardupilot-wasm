import { SimLoop } from './sim-loop';
import {
  encodeArm,
  encodeDisarm,
  encodeForceArm,
  encodeSetMode,
  encodeTakeoff,
  encodeGotoLocalNED,
  COPTER_MODE_NAMES,
} from './mavlink/mavlink';

const sim = new SimLoop();

const cmdInput = document.getElementById('cmd-input') as HTMLInputElement;
const cmdLog = document.getElementById('cmd-log') as HTMLDivElement;

function log(msg: string): void {
  const line = document.createElement('div');
  line.textContent = msg;
  cmdLog.appendChild(line);
  cmdLog.scrollTop = cmdLog.scrollHeight;
}

function handleCommand(raw: string): void {
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 0) return;
  const cmd = parts[0].toLowerCase();

  switch (cmd) {
    case 'arm': {
      const force = parts[1]?.toLowerCase() === 'force';
      sim.sendMavlink(force ? encodeForceArm() : encodeArm());
      log(force ? 'Sending FORCE ARM command...' : 'Sending ARM command...');
      break;
    }
    case 'disarm':
      sim.sendMavlink(encodeDisarm());
      log('Sending DISARM command...');
      break;
    case 'mode': {
      const modeName = parts[1]?.toUpperCase();
      if (!modeName) {
        log(`Usage: mode <MODE>. Available: ${COPTER_MODE_NAMES.join(', ')}`);
        break;
      }
      const pkt = encodeSetMode(modeName);
      if (pkt) {
        sim.sendMavlink(pkt);
        log(`Sending MODE ${modeName}...`);
      } else {
        log(`Unknown mode: ${modeName}. Available: ${COPTER_MODE_NAMES.join(', ')}`);
      }
      break;
    }
    case 'takeoff': {
      const alt = parseFloat(parts[1] ?? '10');
      if (isNaN(alt) || alt <= 0) {
        log('Usage: takeoff <altitude_meters>');
        break;
      }
      sim.sendMavlink(encodeTakeoff(alt));
      log(`Sending TAKEOFF to ${alt}m...`);
      break;
    }
    case 'goto': {
      const n = parseFloat(parts[1] ?? '');
      const e = parseFloat(parts[2] ?? '');
      const u = parseFloat(parts[3] ?? '');
      if (isNaN(n) || isNaN(e) || isNaN(u)) {
        log('Usage: goto <north> <east> <up>  (meters from home)');
        break;
      }
      sim.sendMavlink(encodeGotoLocalNED(n, e, -u));
      log(`Sending GOTO N=${n} E=${e} U=${u}...`);
      break;
    }
    case 'hover': {
      if (!sim['wasmMode']) {
        const hoverPwm = 1520;
        sim.setPwm([hoverPwm, hoverPwm, hoverPwm, hoverPwm]);
        sim.setArmed(true);
        log(`Hover: all motors at ${hoverPwm}`);
      } else {
        log('In WASM mode, use: mode guided → arm → takeoff 10');
      }
      break;
    }
    case 'help':
      log('Commands:');
      log('  arm [force]     - Arm the motors (force bypasses checks)');
      log('  disarm          - Disarm the motors');
      log('  mode <MODE>     - Set flight mode (GUIDED, STABILIZE, etc.)');
      log('  takeoff <alt>   - Take off to altitude (meters)');
      log('  goto <n> <e> <u> - Go to position (meters from home)');
      log('');
      log('Quick start: mode guided → arm → takeoff 10');
      break;
    default:
      log(`Unknown: ${cmd}. Type "help" for commands.`);
  }
}

cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const cmd = cmdInput.value;
    if (cmd.trim()) {
      log(`> ${cmd}`);
      handleCommand(cmd);
    }
    cmdInput.value = '';
  }
});

log('ArduPilot WASM Simulator');
log('Loading WASM module...');

sim.startRenderLoop();

sim.onMavlinkMessage = (msg) => {
  switch (msg.type) {
    case 'command_ack':
      log(`ACK: command ${msg.command} → ${msg.resultText}`);
      break;
    case 'statustext':
      log(`[AP] ${msg.text}`);
      break;
    case 'heartbeat':
      break;
  }
};

sim.initWasm(log).then((ok) => {
  if (ok) {
    log('ArduPilot flight controller active');
    log('Type "help" for commands');
    log('Quick start: mode guided → arm → takeoff 10');
  } else {
    log('Running in standalone physics mode (no flight controller)');
    log('Type "help" for available commands');
  }
});
