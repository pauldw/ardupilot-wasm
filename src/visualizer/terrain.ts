import * as THREE from 'three';

const TERRAIN_SIZE = 400;
const TERRAIN_SEGMENTS = 128;
const MAX_HEIGHT = 8;

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateHeightmap(segments: number, seed = 42): Float32Array {
  const size = segments + 1;
  const data = new Float32Array(size * size);
  const rand = seededRandom(seed);

  const octaves = [
    { freq: 1, amp: 1.0 },
    { freq: 2, amp: 0.5 },
    { freq: 4, amp: 0.25 },
    { freq: 8, amp: 0.1 },
  ];

  // Generate layered noise using cosine interpolation
  for (const { freq, amp } of octaves) {
    const gridSize = Math.max(2, Math.floor(freq * 4));
    const noise = new Float32Array((gridSize + 1) * (gridSize + 1));
    for (let i = 0; i < noise.length; i++) noise[i] = rand() * 2 - 1;

    for (let iy = 0; iy < size; iy++) {
      for (let ix = 0; ix < size; ix++) {
        const gx = (ix / size) * gridSize;
        const gy = (iy / size) * gridSize;
        const x0 = Math.floor(gx), y0 = Math.floor(gy);
        const x1 = Math.min(x0 + 1, gridSize), y1 = Math.min(y0 + 1, gridSize);
        const fx = gx - x0, fy = gy - y0;
        const sx = 0.5 - 0.5 * Math.cos(fx * Math.PI);
        const sy = 0.5 - 0.5 * Math.cos(fy * Math.PI);
        const n00 = noise[y0 * (gridSize + 1) + x0];
        const n10 = noise[y0 * (gridSize + 1) + x1];
        const n01 = noise[y1 * (gridSize + 1) + x0];
        const n11 = noise[y1 * (gridSize + 1) + x1];
        const v = (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy;
        data[iy * size + ix] += v * amp;
      }
    }
  }

  // Flatten center area (landing zone ~40m radius)
  const center = size / 2;
  const flatRadius = (40 / TERRAIN_SIZE) * size;
  const blendRadius = (60 / TERRAIN_SIZE) * size;
  for (let iy = 0; iy < size; iy++) {
    for (let ix = 0; ix < size; ix++) {
      const dx = ix - center, dy = iy - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < flatRadius) {
        data[iy * size + ix] = 0;
      } else if (dist < blendRadius) {
        const t = (dist - flatRadius) / (blendRadius - flatRadius);
        const smooth = t * t * (3 - 2 * t);
        data[iy * size + ix] *= smooth;
      }
    }
  }

  // Scale so max amplitude is MAX_HEIGHT, keeping center at 0
  let maxAbs = 0;
  for (let i = 0; i < data.length; i++) {
    if (Math.abs(data[i]) > maxAbs) maxAbs = Math.abs(data[i]);
  }
  const scale = maxAbs > 0 ? MAX_HEIGHT / maxAbs : 1;
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(0, data[i] * scale);
  }

  return data;
}

export class Terrain {
  mesh: THREE.Mesh;
  readonly heightData: Float32Array;
  readonly segments: number;
  readonly size: number;

  constructor(scene: THREE.Scene, grassTexture: THREE.Texture) {
    this.segments = TERRAIN_SEGMENTS;
    this.size = TERRAIN_SIZE;
    this.heightData = generateHeightmap(this.segments);

    const geo = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    const posAttr = geo.attributes.position;

    const vertSize = this.segments + 1;
    for (let i = 0; i < posAttr.count; i++) {
      const ix = i % vertSize;
      const iy = Math.floor(i / vertSize);
      posAttr.setZ(i, this.heightData[iy * vertSize + ix]);
    }
    geo.computeVertexNormals();

    grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
    grassTexture.repeat.set(40, 40);

    const mat = new THREE.MeshStandardMaterial({
      map: grassTexture,
      roughness: 0.95,
      metalness: 0.0,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  // Get terrain height at world position (Three.js coords: x=forward, z=right-ish)
  // The plane is rotated -90° around X, so plane local XY maps to world XZ
  getHeightAtWorld(worldX: number, worldZ: number): number {
    const halfSize = this.size / 2;
    // World XZ → plane local XY (before rotation)
    const localX = worldX;
    const localY = -worldZ; // plane rotation flips Z
    const u = (localX + halfSize) / this.size;
    const v = (-localY + halfSize) / this.size; // PlaneGeometry Y goes top-to-bottom

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

  // Get height using NED coordinates (north, east)
  // NED → Three.js: worldX = north, worldZ = -east
  getHeightNED(north: number, east: number): number {
    return this.getHeightAtWorld(north, -east);
  }
}
