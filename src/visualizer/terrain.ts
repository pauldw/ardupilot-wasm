import * as THREE from 'three';

const HEIGHTMAP_SEGMENTS = 128;
const HEIGHTMAP_SIZE = 400;

export class Terrain {
  heightData: Float32Array;
  readonly segments = HEIGHTMAP_SEGMENTS;
  readonly size = HEIGHTMAP_SIZE;
  onHeightDataChanged: (() => void) | null = null;
  readonly ready: Promise<void>;

  constructor(_scene: THREE.Scene) {
    this.heightData = new Float32Array((this.segments + 1) * (this.segments + 1));
    this.ready = Promise.resolve();
  }

  setRenderer(_renderer: THREE.WebGLRenderer): void {
    this.onHeightDataChanged?.();
  }

  getHeightAtWorld(_worldX: number, _worldZ: number): number {
    return 0;
  }

  getHeightNED(_north: number, _east: number): number {
    return 0;
  }
}
