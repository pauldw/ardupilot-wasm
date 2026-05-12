import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { autocompletion, CompletionContext, type Completion } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, indentWithTab, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import type { Drone } from '../drone';
import type { SimLoop } from '../sim-loop';
import type { World } from '../world';

const DRONE_COMPLETIONS: Completion[] = [
  { label: 'drone.arm()', type: 'method', detail: 'Arm motors', boost: 10 },
  { label: 'drone.arm(true)', type: 'method', detail: 'Force arm' },
  { label: 'drone.disarm()', type: 'method', detail: 'Disarm motors', boost: 9 },
  { label: 'drone.mode(\'guided\')', type: 'method', detail: 'Set flight mode', boost: 11 },
  { label: 'drone.takeoff(10)', type: 'method', detail: 'Take off to altitude', boost: 8 },
  { label: 'drone.goto(north, east, up)', type: 'method', detail: 'Go to local position' },
  { label: 'drone.goto_ned(x, y, z)', type: 'method', detail: 'Go to NED position' },
  { label: 'drone.goto_global(lat, lon, alt)', type: 'method', detail: 'Go to GPS coords' },
  { label: 'drone.get_mode()', type: 'method', detail: 'Get current mode' },
  { label: 'drone.get_ned()', type: 'method', detail: 'Get local NED position' },
  { label: 'drone.get_global()', type: 'method', detail: 'Get GPS position' },
  { label: 'drone.get_gps()', type: 'method', detail: 'Get raw GPS data' },
  { label: 'drone.get_attitude()', type: 'method', detail: 'Get roll/pitch/yaw' },
  { label: 'drone.get_battery()', type: 'method', detail: 'Get battery status' },
  { label: 'drone.get_home()', type: 'method', detail: 'Get home position' },
  { label: 'drone.param_get(\'name\')', type: 'method', detail: 'Read parameter' },
  { label: 'drone.param_set(\'name\', value)', type: 'method', detail: 'Set parameter' },
  { label: 'drone.sleep(ms)', type: 'method', detail: 'Wait N milliseconds' },
  { label: 'drone.recv(\'type\', timeout)', type: 'method', detail: 'Wait for MAVLink message' },
  { label: 'drone.send(data)', type: 'method', detail: 'Send raw MAVLink' },
  { label: 'drone.command_long(cmd, p1, p2, p3, p4, p5, p6, p7)', type: 'method', detail: 'Send COMMAND_LONG' },
  { label: 'drone.gimbal_pitch(-45)', type: 'method', detail: 'Tilt camera down' },
  { label: 'drone.gimbal_angle', type: 'property', detail: 'Current gimbal angle' },
  { label: 'drone.help()', type: 'method', detail: 'Show help' },
];

const WORLD_COMPLETIONS: Completion[] = [
  { label: 'world.wind_set(speed, dir)', type: 'method', detail: 'Set wind speed & direction', boost: 10 },
  { label: 'world.wind_set(speed, dir, gust, variation)', type: 'method', detail: 'Full wind config' },
  { label: 'world.wind_get()', type: 'method', detail: 'Get current wind settings', boost: 9 },
  { label: 'world.wind_off()', type: 'method', detail: 'Disable wind', boost: 8 },
  { label: 'world.help()', type: 'method', detail: 'Show help' },
];

const GLOBAL_COMPLETIONS: Completion[] = [
  { label: 'await', type: 'keyword', boost: 5 },
  { label: 'sleep(ms)', type: 'function', detail: 'Wait N milliseconds', boost: 4 },
  { label: 'print(msg)', type: 'function', detail: 'Print to console', boost: 3 },
  { label: 'drone', type: 'variable', detail: 'Drone API', boost: 6 },
  { label: 'world', type: 'variable', detail: 'World/environment API', boost: 5 },
  { label: 'sim', type: 'variable', detail: 'SimLoop instance' },
];

function droneCompletions(context: CompletionContext) {
  const word = context.matchBefore(/[\w.]*$/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const text = word.text;

  if (text.startsWith('drone.')) {
    const prefix = text.slice(6);
    return {
      from: word.from,
      options: DRONE_COMPLETIONS.filter(c => {
        const method = c.label.slice(6);
        return method.startsWith(prefix);
      }),
    };
  }

  if (text.startsWith('world.')) {
    const prefix = text.slice(6);
    return {
      from: word.from,
      options: WORLD_COMPLETIONS.filter(c => {
        const method = c.label.slice(6);
        return method.startsWith(prefix);
      }),
    };
  }

  return {
    from: word.from,
    options: [
      ...GLOBAL_COMPLETIONS.filter(c => c.label.startsWith(text)),
      ...DRONE_COMPLETIONS.filter(c => c.label.startsWith(text)),
      ...WORLD_COMPLETIONS.filter(c => c.label.startsWith(text)),
    ],
  };
}

const DEFAULT_PROGRAM = `// Fly a simple mission
if (!await drone.mode('guided')) throw 'mode change failed'
if (!await drone.arm()) throw 'arming failed'
if (!await drone.takeoff(10)) throw 'takeoff failed'

// Wait until we reach target altitude
while (true) {
  const pos = await drone.get_ned()
  if (pos && pos.z < -9) break
  await sleep(500)
}
print('Reached 10m — flying north')

// Fly 20m north at 10m altitude
drone.goto(20, 0, 10)

// Wait until we arrive
while (true) {
  const pos = await drone.get_ned()
  if (pos && pos.x > 19) break
  await sleep(500)
}
print('Mission complete!')
`;

const editorTheme = EditorView.theme({
  '&': {
    fontSize: '13px',
    height: '100%',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "'Courier New', monospace",
  },
  '.cm-content': {
    caretColor: '#0f0',
  },
  '.cm-gutters': {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRight: '1px solid #333',
  },
});

export class ProgramEditor {
  private container: HTMLElement;
  private view: EditorView;
  private runBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private statusEl: HTMLElement;
  private running = false;
  private abortController: AbortController | null = null;
  private drone: Drone | null = null;
  private sim: SimLoop | null = null;
  private world: World | null = null;
  private printFn: (msg: string) => void;
  private collapsed = false;
  private editorWrap: HTMLElement;

  constructor(parent: HTMLElement, printFn: (msg: string) => void) {
    this.printFn = printFn;
    this.container = document.createElement('div');
    this.container.id = 'editor-panel';

    const toolbar = document.createElement('div');
    toolbar.id = 'editor-toolbar';

    const title = document.createElement('span');
    title.id = 'editor-title';
    title.textContent = 'Program';

    this.runBtn = document.createElement('button');
    this.runBtn.id = 'editor-run';
    this.runBtn.textContent = '▶ Run';
    this.runBtn.onclick = () => this.run();

    this.stopBtn = document.createElement('button');
    this.stopBtn.id = 'editor-stop';
    this.stopBtn.textContent = '■ Stop';
    this.stopBtn.disabled = true;
    this.stopBtn.onclick = () => this.stop();

    this.statusEl = document.createElement('span');
    this.statusEl.id = 'editor-status';

    const collapseBtn = document.createElement('button');
    collapseBtn.id = 'editor-collapse';
    collapseBtn.textContent = '▲';
    collapseBtn.onclick = () => this.toggleCollapse(collapseBtn);

    toolbar.append(title, this.runBtn, this.stopBtn, this.statusEl, collapseBtn);
    this.container.appendChild(toolbar);

    this.editorWrap = document.createElement('div');
    this.editorWrap.id = 'editor-wrap';
    this.container.appendChild(this.editorWrap);

    parent.prepend(this.container);

    const state = EditorState.create({
      doc: DEFAULT_PROGRAM,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        bracketMatching(),
        closeBrackets(),
        javascript(),
        autocompletion({ override: [droneCompletions] }),
        oneDark,
        editorTheme,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
          { key: 'Ctrl-Enter', run: () => { this.run(); return true; } },
          { key: 'Mod-Enter', run: () => { this.run(); return true; } },
        ]),
        EditorView.lineWrapping,
      ],
    });

    this.view = new EditorView({
      state,
      parent: this.editorWrap,
    });
  }

  bind(drone: Drone, sim: SimLoop, world: World): void {
    this.drone = drone;
    this.sim = sim;
    this.world = world;
  }

  private toggleCollapse(btn: HTMLElement): void {
    this.collapsed = !this.collapsed;
    this.editorWrap.style.display = this.collapsed ? 'none' : 'block';
    btn.textContent = this.collapsed ? '▼' : '▲';
  }

  private async run(): Promise<void> {
    if (this.running || !this.drone) return;

    this.running = true;
    this.abortController = new AbortController();
    this.runBtn.disabled = true;
    this.stopBtn.disabled = false;
    this.statusEl.textContent = 'Running...';
    this.statusEl.className = 'running';

    const code = this.view.state.doc.toString();
    const signal = this.abortController.signal;
    const drone = this.drone;
    const sim = this.sim;
    const world = this.world;
    const print = this.printFn;

    const sleep = (ms: number) => new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(new DOMException('Program stopped', 'AbortError')); return; }
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Program stopped', 'AbortError')); }, { once: true });
    });

    this.printFn('─── Program started ───');

    try {
      const fn = new Function('drone', 'sim', 'world', 'print', 'sleep', 'signal',
        `return (async () => { ${code} })()`
      );
      await fn(drone, sim, world, print, sleep, signal);
      this.printFn('─── Program finished ───');
      this.statusEl.textContent = 'Done';
      this.statusEl.className = 'done';
    } catch (e: any) {
      if (e.name === 'AbortError') {
        this.printFn('─── Program stopped ───');
        this.statusEl.textContent = 'Stopped';
        this.statusEl.className = 'stopped';
      } else {
        this.printFn(`Error: ${e.message ?? e}`);
        this.statusEl.textContent = 'Error';
        this.statusEl.className = 'error';
      }
    } finally {
      this.running = false;
      this.abortController = null;
      this.runBtn.disabled = false;
      this.stopBtn.disabled = true;
    }
  }

  private stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
