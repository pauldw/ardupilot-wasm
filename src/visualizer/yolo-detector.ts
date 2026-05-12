import * as tf from '@tensorflow/tfjs';
import * as THREE from 'three';

const COCO_LABELS = [
  'person','bicycle','car','motorcycle','airplane','bus','train','truck','boat',
  'traffic light','fire hydrant','stop sign','parking meter','bench','bird','cat',
  'dog','horse','sheep','cow','elephant','bear','zebra','giraffe','backpack',
  'umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball',
  'kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket',
  'bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple',
  'sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake','chair',
  'couch','potted plant','bed','dining table','toilet','tv','laptop','mouse',
  'remote','keyboard','cell phone','microwave','oven','toaster','sink',
  'refrigerator','book','clock','vase','scissors','teddy bear','hair drier','toothbrush',
];

export interface Detection {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
  classId: number;
  label: string;
}

const CONF_THRESH = 0.25;
const IOU_THRESH = 0.45;
const MODEL_SIZE = 640;

export class YoloDetector {
  private model: tf.GraphModel | null = null;
  private pixelBuf: Uint8Array;
  private detections: Detection[] = [];
  private lastRunTime = 0;
  private running = false;
  private interval = 200;
  private overlay: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private fboW: number;
  private fboH: number;
  private pipW: number;
  private pipH: number;
  private padY: number;
  private loading = true;

  constructor(fboW: number, fboH: number, pipW: number, pipH: number, margin: number) {
    this.fboW = fboW;
    this.fboH = fboH;
    this.pipW = pipW;
    this.pipH = pipH;
    this.padY = Math.round((MODEL_SIZE - fboH) / 2);
    this.pixelBuf = new Uint8Array(fboW * fboH * 4);

    this.overlay = document.createElement('canvas');
    this.overlay.width = pipW;
    this.overlay.height = pipH;
    Object.assign(this.overlay.style, {
      position: 'fixed',
      top: `${margin}px`,
      right: `${margin}px`,
      width: `${pipW}px`,
      height: `${pipH}px`,
      pointerEvents: 'none',
      zIndex: '101',
    });
    document.body.appendChild(this.overlay);
    this.ctx = this.overlay.getContext('2d')!;
  }

  async load(url: string): Promise<void> {
    try {
      this.model = await tf.loadGraphModel(url);
      // Warm up with a dummy inference
      const dummy = tf.zeros<tf.Rank.R4>([1, MODEL_SIZE, MODEL_SIZE, 3]);
      const out = this.model.predict(dummy) as tf.Tensor;
      out.dispose();
      dummy.dispose();
      this.loading = false;
      console.log('YOLOv8n model loaded');
    } catch (e) {
      console.warn('Failed to load YOLO model:', e);
      this.loading = false;
    }
  }

  resize(pipW: number, pipH: number) {
    this.pipW = pipW;
    this.pipH = pipH;
    this.overlay.width = pipW;
    this.overlay.height = pipH;
    this.overlay.style.width = `${pipW}px`;
    this.overlay.style.height = `${pipH}px`;
  }

  maybeRun(renderer: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget, now: number): void {
    if (!this.model || this.running) return;
    if (now - this.lastRunTime < this.interval) return;
    this.lastRunTime = now;
    this.running = true;
    this.runInference(renderer, rt).finally(() => { this.running = false; });
  }

  private async runInference(renderer: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget): Promise<void> {
    renderer.readRenderTargetPixels(rt, 0, 0, this.fboW, this.fboH, this.pixelBuf);

    const input = tf.tidy(() => {
      const img = tf.tensor(this.pixelBuf, [this.fboH, this.fboW, 4], 'int32');
      const flipped = img.reverse(0);
      const rgb = flipped.slice([0, 0, 0], [-1, -1, 3]).cast('float32').div(255);
      const padded = rgb.pad(
        [[this.padY, MODEL_SIZE - this.fboH - this.padY], [0, 0], [0, 0]],
        0.4471,
      );
      return padded.expandDims(0);
    });

    try {
      const rawOut = this.model!.predict(input) as tf.Tensor;
      const transposed = tf.tidy(() => rawOut.squeeze([0]).transpose());
      const data = await transposed.data() as Float32Array;
      transposed.dispose();
      rawOut.dispose();

      this.detections = this.decodeDetections(data);
      this.drawOverlay();
    } finally {
      input.dispose();
    }
  }

  private decodeDetections(data: Float32Array): Detection[] {
    const numBoxes = 8400;
    const boxes: Detection[] = [];

    for (let i = 0; i < numBoxes; i++) {
      const offset = i * 84;
      let maxScore = 0;
      let maxClass = 0;
      for (let c = 0; c < 80; c++) {
        const s = data[offset + 4 + c];
        if (s > maxScore) { maxScore = s; maxClass = c; }
      }
      if (maxScore < CONF_THRESH) continue;

      let cx = data[offset] / MODEL_SIZE;
      let cy = (data[offset + 1] - this.padY) / this.fboH;
      let w = data[offset + 2] / MODEL_SIZE;
      let h = data[offset + 3] / this.fboH;

      boxes.push({ x: cx, y: cy, w, h, score: maxScore, classId: maxClass, label: COCO_LABELS[maxClass] });
    }

    return this.nms(boxes);
  }

  private nms(boxes: Detection[]): Detection[] {
    boxes.sort((a, b) => b.score - a.score);
    const kept: Detection[] = [];
    const suppressed = new Set<number>();

    for (let i = 0; i < boxes.length; i++) {
      if (suppressed.has(i)) continue;
      kept.push(boxes[i]);
      for (let j = i + 1; j < boxes.length; j++) {
        if (suppressed.has(j)) continue;
        if (boxes[i].classId !== boxes[j].classId) continue;
        if (this.iou(boxes[i], boxes[j]) > IOU_THRESH) suppressed.add(j);
      }
    }
    return kept;
  }

  private iou(a: Detection, b: Detection): number {
    const ax1 = a.x - a.w / 2, ay1 = a.y - a.h / 2;
    const ax2 = a.x + a.w / 2, ay2 = a.y + a.h / 2;
    const bx1 = b.x - b.w / 2, by1 = b.y - b.h / 2;
    const bx2 = b.x + b.w / 2, by2 = b.y + b.h / 2;
    const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
    const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
    const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
    const union = a.w * a.h + b.w * b.h - inter;
    return inter / (union + 1e-6);
  }

  private drawOverlay(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.pipW, this.pipH);

    for (const det of this.detections) {
      const x = (det.x - det.w / 2) * this.pipW;
      const y = (det.y - det.h / 2) * this.pipH;
      const w = det.w * this.pipW;
      const h = det.h * this.pipH;

      ctx.strokeStyle = '#0f0';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      const text = `${det.label} ${(det.score * 100).toFixed(0)}%`;
      ctx.font = 'bold 11px monospace';
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x, y - 14, tw + 6, 14);
      ctx.fillStyle = '#0f0';
      ctx.fillText(text, x + 3, y - 3);
    }
  }

  get lastDetections(): Detection[] { return this.detections; }
  get isLoaded(): boolean { return !!this.model; }
}
