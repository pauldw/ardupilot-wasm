import * as THREE from 'three';
import * as C from '../physics/config';

const RENDER_W = 640;
const RENDER_H = 400;
const DISTORT_GRID_X = 32;
const DISTORT_GRID_Y = 20;
const PIP_MARGIN = 12;

const DISTORTION_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DISTORTION_FRAG = `
uniform sampler2D tScene;
varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(tScene, vUv);
}`;

export class PipCamera {
  private camera: THREE.PerspectiveCamera;
  private renderTarget: THREE.WebGLRenderTarget;
  private distortScene: THREE.Scene;
  private distortCamera: THREE.OrthographicCamera;
  private label: HTMLDivElement;
  private pipW: number;
  private pipH: number;
  private hfov: number;
  private currentTilt = 0;

  constructor() {
    const aspect = C.CAMERA_RES_X / C.CAMERA_RES_Y;
    const sensorH = C.CAMERA_SENSOR_DIAG_MM / Math.sqrt(1 + aspect * aspect);
    const vfovRad = 2 * Math.atan(sensorH / (2 * C.CAMERA_FOCAL_MM));
    const vfovDeg = vfovRad * 180 / Math.PI;

    this.pipW = C.CAMERA_PIP_WIDTH;
    this.pipH = Math.round(C.CAMERA_PIP_WIDTH / aspect);
    this.hfov = 2 * Math.atan(sensorH * aspect / (2 * C.CAMERA_FOCAL_MM)) * 180 / Math.PI;

    this.renderTarget = new THREE.WebGLRenderTarget(RENDER_W, RENDER_H, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    const { scene, camera, overrender } = this.buildDistortionPass();
    this.distortScene = scene;
    this.distortCamera = camera;

    // Widen FBO camera FOV to cover barrel distortion overshoot at edges
    const overVfovRad = 2 * Math.atan(Math.tan(vfovRad / 2) * overrender);
    this.camera = new THREE.PerspectiveCamera(
      overVfovRad * 180 / Math.PI, aspect, 0.01, 5000,
    );

    this.label = document.createElement('div');
    this.label.id = 'pip-label';
    Object.assign(this.label.style, {
      position: 'fixed',
      top: `${PIP_MARGIN + this.pipH}px`,
      right: `${PIP_MARGIN}px`,
      width: `${this.pipW}px`,
      background: 'rgba(0,0,0,0.7)',
      color: '#0f0',
      fontSize: '10px',
      fontFamily: "'Courier New', monospace",
      padding: '2px 6px',
      textAlign: 'center',
      zIndex: '100',
      pointerEvents: 'none',
      borderRadius: '0 0 4px 4px',
    });
    document.body.appendChild(this.label);
  }

  private buildDistortionPass() {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const rawUvs: { srcU: number; srcV: number }[] = [];
    const indices: number[] = [];

    const aspect = C.CAMERA_RES_X / C.CAMERA_RES_Y;
    const sensorW = C.CAMERA_SENSOR_DIAG_MM * aspect / Math.sqrt(1 + aspect * aspect);
    const sensorH = C.CAMERA_SENSOR_DIAG_MM / Math.sqrt(1 + aspect * aspect);

    // First pass: compute distortion UVs and find max overshoot
    let maxOvershoot = 1.0;

    for (let j = 0; j <= DISTORT_GRID_Y; j++) {
      for (let i = 0; i <= DISTORT_GRID_X; i++) {
        const u = i / DISTORT_GRID_X;
        const v = j / DISTORT_GRID_Y;
        const sx = u * 2 - 1;
        const sy = v * 2 - 1;

        const px = (u - 0.5) * sensorW;
        const py = (v - 0.5) * sensorH;
        const r2 = (px * px + py * py) / (C.CAMERA_FOCAL_MM * C.CAMERA_FOCAL_MM);

        let ru2 = r2;
        for (let iter = 0; iter < 10; iter++) {
          const d = 1 + C.CAMERA_DISTORTION_K1 * ru2 + C.CAMERA_DISTORTION_K2 * ru2 * ru2;
          ru2 = r2 / (d * d);
        }

        const scale = Math.sqrt(ru2 / Math.max(r2, 1e-12));
        const srcU = 0.5 + (u - 0.5) * scale;
        const srcV = 0.5 + (v - 0.5) * scale;

        // Track how far UVs extend beyond [0,1]
        const ovU = Math.max(Math.abs(srcU - 0.5) * 2, 0);
        const ovV = Math.max(Math.abs(srcV - 0.5) * 2, 0);
        maxOvershoot = Math.max(maxOvershoot, ovU, ovV);

        positions.push(sx, sy, 0);
        rawUvs.push({ srcU, srcV });
      }
    }

    // Rescale UVs so they map into the wider FBO
    const overrender = maxOvershoot;
    const uvs: number[] = [];
    for (const { srcU, srcV } of rawUvs) {
      uvs.push(
        0.5 + (srcU - 0.5) / overrender,
        0.5 + (srcV - 0.5) / overrender,
      );
    }

    for (let j = 0; j < DISTORT_GRID_Y; j++) {
      for (let i = 0; i < DISTORT_GRID_X; i++) {
        const a = j * (DISTORT_GRID_X + 1) + i;
        const b = a + 1;
        const c = a + (DISTORT_GRID_X + 1);
        const d = c + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const material = new THREE.ShaderMaterial({
      vertexShader: DISTORTION_VERT,
      fragmentShader: DISTORTION_FRAG,
      uniforms: {
        tScene: { value: this.renderTarget.texture },
      },
      depthTest: false,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    const scene = new THREE.Scene();
    scene.add(mesh);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    return { scene, camera, overrender };
  }

  get fbo(): THREE.WebGLRenderTarget { return this.renderTarget; }
  get width(): number { return this.pipW; }
  get height(): number { return this.pipH; }
  get fboWidth(): number { return RENDER_W; }
  get fboHeight(): number { return RENDER_H; }

  renderToFBO(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    dronePos: number[],
    rotationMatrix: number[][],
    tiltDeg: number,
  ): void {
    this.currentTilt = tiltDeg;
    const R = rotationMatrix;
    const m = C.CAMERA_MOUNT_POS;

    const camN = dronePos[0] + R[0][0] * m[0] + R[0][1] * m[1] + R[0][2] * m[2];
    const camE = dronePos[1] + R[1][0] * m[0] + R[1][1] * m[1] + R[1][2] * m[2];
    const camD = dronePos[2] + R[2][0] * m[0] + R[2][1] * m[1] + R[2][2] * m[2];

    this.camera.position.set(camN, -camD, -camE);

    const tiltRad = tiltDeg * Math.PI / 180;
    const ct = Math.cos(tiltRad), st = Math.sin(tiltRad);

    const fN = R[0][0], fE = R[1][0], fD = R[2][0];
    const dN = R[0][2], dE = R[1][2], dD = R[2][2];

    // look = cos(tilt)*forward - sin(tilt)*down (positive tilt = pitch up)
    const lN = ct * fN - st * dN;
    const lE = ct * fE - st * dE;
    const lD = ct * fD - st * dD;

    this.camera.up.set(
      -st * fN - ct * dN,
      st * fD + ct * dD,
      st * fE + ct * dE,
    );
    this.camera.lookAt(camN + lN, -camD - lD, -camE - lE);
    this.camera.updateMatrixWorld();

    renderer.setRenderTarget(this.renderTarget);
    renderer.clear();
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(null);
  }

  renderOverlay(renderer: THREE.WebGLRenderer): void {
    const cssW = renderer.domElement.clientWidth;
    const cssH = renderer.domElement.clientHeight;
    const vpX = cssW - PIP_MARGIN - this.pipW;
    const vpY = cssH - PIP_MARGIN - this.pipH;

    renderer.setViewport(vpX, vpY, this.pipW, this.pipH);
    renderer.setScissor(vpX, vpY, this.pipW, this.pipH);
    renderer.setScissorTest(true);

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.distortScene, this.distortCamera);
    renderer.autoClear = prevAutoClear;

    renderer.setViewport(0, 0, cssW, cssH);
    renderer.setScissorTest(false);

    this.label.textContent = `CAM ${this.hfov.toFixed(0)}° FOV | Tilt ${this.currentTilt.toFixed(1)}°`;
  }
}
