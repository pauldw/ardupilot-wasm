import { SimLoop } from './sim-loop';
import { Drone } from './drone';

const sim = new SimLoop();

const cmdLog = document.getElementById('cmd-log') as HTMLDivElement;
const cmdInput = document.getElementById('cmd-input') as HTMLTextAreaElement;

const history: string[] = [];
let historyIdx = -1;

function print(msg: string): void {
  const line = document.createElement('div');
  line.textContent = msg;
  cmdLog.appendChild(line);
  cmdLog.scrollTop = cmdLog.scrollHeight;
}

function printHtml(html: string): void {
  const line = document.createElement('div');
  line.innerHTML = html;
  cmdLog.appendChild(line);
  cmdLog.scrollTop = cmdLog.scrollHeight;
}

const drone = new Drone(sim, print);

// Expose drone and mavlink utilities on window for advanced usage
(window as any).drone = drone;
(window as any).sim = sim;

sim.onMavlinkMessage = (msg) => {
  if (msg.type === 'STATUSTEXT') {
    print(`[AP] ${msg.text}`);
  }
};

async function evalCommand(code: string): Promise<void> {
  printHtml(`<span style="color:#0f0">» ${escapeHtml(code)}</span>`);

  try {
    // Wrap in async function so `await` works at top level
    const asyncFn = new Function('drone', 'sim', 'print', 'sleep',
      `return (async () => { ${code.includes('\n') || code.includes('return') ? code : `return (${code})`} })()`
    );
    const result = await asyncFn(drone, sim, print, (ms: number) => drone.sleep(ms));
    if (result !== undefined) {
      print(formatResult(result));
    }
  } catch (e: any) {
    // If the expression-return form failed with a syntax error, try as statements
    if (e instanceof SyntaxError) {
      try {
        const asyncFn = new Function('drone', 'sim', 'print', 'sleep',
          `return (async () => { ${code} })()`
        );
        const result = await asyncFn(drone, sim, print, (ms: number) => drone.sleep(ms));
        if (result !== undefined) {
          print(formatResult(result));
        }
      } catch (e2: any) {
        printHtml(`<span style="color:#f44">${escapeHtml(e2.toString())}</span>`);
      }
    } else {
      printHtml(`<span style="color:#f44">${escapeHtml(e.toString())}</span>`);
    }
  }
}

function formatResult(val: unknown): string {
  if (val === null) return 'null';
  if (val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

cmdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const code = cmdInput.value.trim();
    if (code) {
      history.push(code);
      historyIdx = history.length;
      evalCommand(code);
    }
    cmdInput.value = '';
  } else if (e.key === 'ArrowUp' && cmdInput.selectionStart === 0) {
    e.preventDefault();
    if (historyIdx > 0) {
      historyIdx--;
      cmdInput.value = history[historyIdx];
    }
  } else if (e.key === 'ArrowDown' && cmdInput.selectionStart === cmdInput.value.length) {
    e.preventDefault();
    if (historyIdx < history.length - 1) {
      historyIdx++;
      cmdInput.value = history[historyIdx];
    } else {
      historyIdx = history.length;
      cmdInput.value = '';
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const val = cmdInput.value;
    const cursor = cmdInput.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/(drone\.\w*)$/);
    if (match) {
      const partial = match[1];
      const prefix = partial.replace('drone.', '');
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(drone))
        .filter(m => m !== 'constructor' && m.startsWith(prefix));
      if (methods.length === 1) {
        const completed = 'drone.' + methods[0];
        cmdInput.value = before.slice(0, -partial.length) + completed + val.slice(cursor);
        cmdInput.selectionStart = cmdInput.selectionEnd = cursor + (completed.length - partial.length);
      } else if (methods.length > 1) {
        print(methods.map(m => 'drone.' + m).join('  '));
      }
    }
  }
});

print('ArduPilot WASM Simulator - JavaScript Console');

sim.initPhysics(print).then(() => {
  sim.startRenderLoop();

  print('Loading ArduPilot WASM...');
  sim.initWasm(print).then((ok) => {
    if (ok) {
      print('ArduPilot flight controller active');
      print('Type drone.help() for commands, or any JavaScript');
      print('Quick start: await drone.mode("guided")');
    } else {
      print('Running in standalone physics mode');
    }
  });
}).catch((e) => {
  print(`MuJoCo init failed: ${e}. Physics unavailable.`);
  console.error('MuJoCo init failed:', e);
});
