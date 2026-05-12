import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const HEIGHTMAP_SEGMENTS = 128;
const HEIGHTMAP_SIZE = 400;

export class Terrain {
  heightData: Float32Array;
  readonly segments = HEIGHTMAP_SEGMENTS;
  readonly size = HEIGHTMAP_SIZE;
  onHeightDataChanged: (() => void) | null = null;
  private scene: THREE.Scene;
  private mapGroup: THREE.Group | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  readonly ready: Promise<void>;
  private resolveReady!: () => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.heightData = new Float32Array((this.segments + 1) * (this.segments + 1));
    this.ready = new Promise(resolve => { this.resolveReady = resolve; });
  }

  setRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    this.loadMap();
  }

  private async loadMap(): Promise<void> {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/map.glb`);
      this.mapGroup = gltf.scene;

      // Flip model right-side-up and scale to match real-world size
      this.mapGroup.rotation.x = Math.PI;
      this.mapGroup.scale.setScalar(0.5);
      this.mapGroup.updateMatrixWorld(true);

      // Compute bounds after rotation, center XZ and put ground at Y=0
      const box = new THREE.Box3().setFromObject(this.mapGroup);
      const center = box.getCenter(new THREE.Vector3());
      console.log(`[Terrain] Bounds after flip: Y ${box.min.y.toFixed(1)} to ${box.max.y.toFixed(1)}, center ${center.x.toFixed(1)},${center.y.toFixed(1)},${center.z.toFixed(1)}`);

      this.mapGroup.position.set(-center.x, 0, -center.z);

      let meshCount = 0;
      this.mapGroup.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) meshCount++;
      });

      this.scene.add(this.mapGroup);
      console.log(`[Terrain] Map loaded: ${meshCount} meshes, bounds Y ${box.min.y.toFixed(1)} to ${box.max.y.toFixed(1)}`);

      this.buildHeightmapGPU(box);
    } catch (e) {
      console.error('[Terrain] Failed to load map:', e);
    }
  }

  private buildHeightmapGPU(box: THREE.Box3): void {
    if (!this.renderer || !this.mapGroup) return;

    const vertSize = this.segments + 1;
    const halfSize = this.size / 2;
    const camTop = box.max.y + 10;
    const camFar = camTop - box.min.y + 10;

    const ortho = new THREE.OrthographicCamera(
      -halfSize, halfSize, halfSize, -halfSize, 0.1, camFar,
    );
    ortho.position.set(0, camTop, 0);
    ortho.lookAt(0, 0, 0);
    ortho.updateMatrixWorld(true);

    const depthMat = new THREE.ShaderMaterial({
      uniforms: { camNear: { value: 0.1 }, camFar: { value: camFar } },
      vertexShader: `
        varying float vDepth;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vDepth = -mvPos.z;
          gl_Position = projectionMatrix * mvPos;
        }`,
      fragmentShader: `
        uniform float camNear;
        uniform float camFar;
        varying float vDepth;
        void main() {
          float d = (vDepth - camNear) / (camFar - camNear);
          gl_FragColor = vec4(d, d, d, 1.0);
        }`,
    });

    const rt = new THREE.WebGLRenderTarget(vertSize, vertSize, {
      type: THREE.FloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });

    // Render into a clean scene with only the map (avoids sky sphere etc.)
    const depthScene = new THREE.Scene();
    const mapClone = this.mapGroup.clone(true);
    mapClone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).material = depthMat;
      }
    });
    depthScene.add(mapClone);

    this.renderer.setRenderTarget(rt);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.render(depthScene, ortho);
    this.renderer.setRenderTarget(null);

    const pixels = new Float32Array(vertSize * vertSize * 4);
    this.renderer.readRenderTargetPixels(rt, 0, 0, vertSize, vertSize, pixels);
    rt.dispose();
    depthMat.dispose();

    const NO_HIT = -99999;
    for (let iy = 0; iy < vertSize; iy++) {
      const srcRow = (vertSize - 1 - iy);
      for (let ix = 0; ix < vertSize; ix++) {
        const d = pixels[(srcRow * vertSize + ix) * 4];
        if (d > 0) {
          this.heightData[iy * vertSize + ix] = camTop - d * camFar;
        } else {
          this.heightData[iy * vertSize + ix] = NO_HIT;
        }
      }
    }

    // Find ground height at center (drone spawn point) and make it the zero reference
    const mid = Math.floor(vertSize / 2);
    const groundY = this.heightData[mid * vertSize + mid];
    console.log(`[Terrain] Ground at center: ${groundY.toFixed(2)}m, adjusting model`);

    for (let i = 0; i < this.heightData.length; i++) {
      if (this.heightData[i] === NO_HIT) {
        this.heightData[i] = 0;
      } else {
        this.heightData[i] -= groundY;
      }
    }

    // Flatten a small pad around spawn so the drone doesn't tip over
    const padRadius = 3.0;
    const blendRadius = 6.0;
    const cellSize = this.size / this.segments;
    for (let iy = 0; iy < vertSize; iy++) {
      for (let ix = 0; ix < vertSize; ix++) {
        const dx = (ix - mid) * cellSize;
        const dy = (iy - mid) * cellSize;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < padRadius) {
          this.heightData[iy * vertSize + ix] = 0;
        } else if (dist < blendRadius) {
          const t = (dist - padRadius) / (blendRadius - padRadius);
          this.heightData[iy * vertSize + ix] *= t * t * (3 - 2 * t);
        }
      }
    }

    // Shift the visual model up so its ground matches Y=0
    this.mapGroup!.position.y = -groundY;

    const heights = Array.from(this.heightData);
    console.log(`[Terrain] Heightmap: range ${Math.min(...heights).toFixed(1)}-${Math.max(...heights).toFixed(1)}m`);
    this.onHeightDataChanged?.();
    this.resolveReady();
  }

  getHeightAtWorld(worldX: number, worldZ: number): number {
    const halfSize = this.size / 2;
    const u = (worldX + halfSize) / this.size;
    const v = (-worldZ + halfSize) / this.size;

    if (u < 0 || u > 1 || v < 0 || v > 1) return 0;

    const fx = u * this.segments;
    const fy = v * this.segments;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const ix1 = Math.min(ix + 1, this.segments);
    const iy1 = Math.min(iy + 1, this.segments);
    const tx = fx - ix;
    const ty = fy - iy;

    const vertSize = this.segments + 1;
    const h00 = this.heightData[iy * vertSize + ix];
    const h10 = this.heightData[iy * vertSize + ix1];
    const h01 = this.heightData[iy1 * vertSize + ix];
    const h11 = this.heightData[iy1 * vertSize + ix1];

    return (h00 * (1 - tx) + h10 * tx) * (1 - ty) + (h01 * (1 - tx) + h11 * tx) * ty;
  }

  getHeightNED(north: number, east: number): number {
    return this.getHeightAtWorld(north, -east);
  }
}
