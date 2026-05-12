type LoadItem = {
  label: string;
  loaded: number;
  total: number;
  done: boolean;
  el: HTMLDivElement;
  fill: HTMLDivElement;
  status: HTMLSpanElement;
};

const items = new Map<string, LoadItem>();
const container = document.getElementById('loading-items')!;
const screen = document.getElementById('loading-screen')!;
let allDoneResolve: (() => void) | null = null;
const allDonePromise = new Promise<void>(r => { allDoneResolve = r; });

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function registerAsset(id: string, label: string): void {
  const el = document.createElement('div');
  el.className = 'load-item';
  el.innerHTML = `
    <div class="load-item-label">
      <span>${label}</span>
      <span class="load-status">0%</span>
    </div>
    <div class="load-item-bar"><div class="load-item-fill"></div></div>
  `;
  container.appendChild(el);
  items.set(id, {
    label,
    loaded: 0,
    total: 0,
    done: false,
    el,
    fill: el.querySelector('.load-item-fill')!,
    status: el.querySelector('.load-status')!,
  });
}

export function updateAsset(id: string, loaded: number, total: number): void {
  const item = items.get(id);
  if (!item) return;
  item.loaded = loaded;
  item.total = total;
  if (total > 0) {
    const pct = Math.min(100, (loaded / total) * 100);
    item.fill.style.width = `${pct}%`;
    item.status.textContent = `${formatSize(loaded)} / ${formatSize(total)}`;
  }
}

export function updateAssetPercent(id: string, pct: number): void {
  const item = items.get(id);
  if (!item) return;
  item.el.classList.remove('indeterminate');
  const clamped = Math.min(100, Math.max(0, pct));
  item.fill.style.width = `${clamped}%`;
  item.status.textContent = `${Math.round(clamped)}%`;
}

export function startAsset(id: string): void {
  const item = items.get(id);
  if (!item) return;
  item.el.classList.add('indeterminate');
  item.status.textContent = 'loading...';
}

export function completeAsset(id: string): void {
  const item = items.get(id);
  if (!item) return;
  item.done = true;
  item.fill.style.width = '100%';
  item.el.classList.remove('indeterminate');
  item.el.classList.add('done');
  item.status.textContent = 'done';
  checkAllDone();
}

function checkAllDone(): void {
  for (const item of items.values()) {
    if (!item.done) return;
  }
  setTimeout(() => {
    screen.classList.add('fade-out');
    setTimeout(() => { screen.style.display = 'none'; }, 600);
    allDoneResolve?.();
  }, 300);
}

export function waitForAll(): Promise<void> {
  return allDonePromise;
}

export async function fetchWithProgress(url: string, id: string): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  const total = parseInt(resp.headers.get('content-length') || '0', 10);
  if (!resp.body || total === 0) {
    const buf = await resp.arrayBuffer();
    completeAsset(id);
    return buf;
  }
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    updateAsset(id, loaded, total);
  }
  completeAsset(id);
  const result = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}
