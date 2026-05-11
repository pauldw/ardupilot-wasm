import * as THREE from 'three';
import * as C from '../physics/config';

const TERRAIN_SIZE = 400;
const TERRAIN_SEGMENTS = 128;
const MAX_HEIGHT = 8;
const TILE_ZOOM = 18;
const ELEV_ZOOM = 14;

// --- Tile math ---

function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return { x, y };
}

function tileToLatLon(tx: number, ty: number, zoom: number): { lat: number; lon: number } {
  const n = 2 ** zoom;
  const lon = tx / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / n)));
  return { lat: latRad * 180 / Math.PI, lon };
}

function metersPerPixel(lat: number, zoom: number): number {
  return 156543.03 * Math.cos(lat * Math.PI / 180) / (2 ** zoom);
}

// --- Satellite imagery ---

async function loadSatelliteTexture(lat: number, lon: number): Promise<THREE.Texture | null> {
  try {
    const tile = latLonToTile(lat, lon, TILE_ZOOM);
    const mpp = metersPerPixel(lat, TILE_ZOOM);
    const tilesNeeded = Math.ceil(TERRAIN_SIZE / (256 * mpp) / 2) + 1;

    const canvas = document.createElement('canvas');
    const totalTiles = tilesNeeded * 2 + 1;
    canvas.width = totalTiles * 256;
    canvas.height = totalTiles * 256;
    const ctx = canvas.getContext('2d')!;

    const promises: Promise<void>[] = [];
    for (let dy = -tilesNeeded; dy <= tilesNeeded; dy++) {
      for (let dx = -tilesNeeded; dx <= tilesNeeded; dx++) {
        const tx = tile.x + dx;
        const ty = tile.y + dy;
        const px = (dx + tilesNeeded) * 256;
        const py = (dy + tilesNeeded) * 256;
        promises.push(
          loadTileImage(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${TILE_ZOOM}/${ty}/${tx}`)
            .then(img => { ctx.drawImage(img, px, py); })
            .catch(() => {})
        );
      }
    }
    await Promise.all(promises);

    // Compute pixel offset of home location within the tile grid
    const nwCorner = tileToLatLon(tile.x - tilesNeeded, tile.y - tilesNeeded, TILE_ZOOM);
    const seCorner = tileToLatLon(tile.x + tilesNeeded + 1, tile.y + tilesNeeded + 1, TILE_ZOOM);

    const uHome = (lon - nwCorner.lon) / (seCorner.lon - nwCorner.lon);
    const vHome = (nwCorner.lat - lat) / (nwCorner.lat - seCorner.lat);

    const terrainPx = TERRAIN_SIZE / mpp;
    const halfPx = terrainPx / 2;
    const cx = uHome * canvas.width;
    const cy = vHome * canvas.height;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = 1024;
    cropCanvas.height = 1024;
    const cropCtx = cropCanvas.getContext('2d')!;
    cropCtx.drawImage(
      canvas,
      cx - halfPx, cy - halfPx, terrainPx, terrainPx,
      0, 0, 1024, 1024
    );

    const tex = new THREE.CanvasTexture(cropCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  } catch (e) {
    console.warn('[Terrain] Satellite imagery failed:', e);
    return null;
  }
}

function loadTileImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// --- Elevation data (Mapzen Terrarium tiles on AWS) ---

async function loadElevationData(lat: number, lon: number, segments: number): Promise<Float32Array | null> {
  try {
    const tile = latLonToTile(lat, lon, ELEV_ZOOM);
    const mpp = metersPerPixel(lat, ELEV_ZOOM);
    const tilesNeeded = Math.ceil(TERRAIN_SIZE / (256 * mpp) / 2) + 1;

    const canvas = document.createElement('canvas');
    const totalTiles = tilesNeeded * 2 + 1;
    canvas.width = totalTiles * 256;
    canvas.height = totalTiles * 256;
    const ctx = canvas.getContext('2d')!;

    const promises: Promise<void>[] = [];
    for (let dy = -tilesNeeded; dy <= tilesNeeded; dy++) {
      for (let dx = -tilesNeeded; dx <= tilesNeeded; dx++) {
        const tx = tile.x + dx;
        const ty = tile.y + dy;
        const px = (dx + tilesNeeded) * 256;
        const py = (dy + tilesNeeded) * 256;
        promises.push(
          loadTileImage(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ELEV_ZOOM}/${tx}/${ty}.png`)
            .then(img => { ctx.drawImage(img, px, py); })
            .catch(() => {})
        );
      }
    }
    await Promise.all(promises);

    // Crop to terrain extent
    const nwCorner = tileToLatLon(tile.x - tilesNeeded, tile.y - tilesNeeded, ELEV_ZOOM);
    const seCorner = tileToLatLon(tile.x + tilesNeeded + 1, tile.y + tilesNeeded + 1, ELEV_ZOOM);

    const uHome = (lon - nwCorner.lon) / (seCorner.lon - nwCorner.lon);
    const vHome = (nwCorner.lat - lat) / (nwCorner.lat - seCorner.lat);

    const terrainPx = TERRAIN_SIZE / mpp;
    const halfPx = terrainPx / 2;
    const cx = uHome * canvas.width;
    const cy = vHome * canvas.height;

    const sampleSize = segments + 1;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = sampleSize;
    cropCanvas.height = sampleSize;
    const cropCtx = cropCanvas.getContext('2d')!;
    cropCtx.drawImage(
      canvas,
      cx - halfPx, cy - halfPx, terrainPx, terrainPx,
      0, 0, sampleSize, sampleSize
    );

    const imageData = cropCtx.getImageData(0, 0, sampleSize, sampleSize);
    const pixels = imageData.data;
    const heightData = new Float32Array(sampleSize * sampleSize);

    // Terrarium encoding: elevation = (R * 256 + G + B / 256) - 32768
    const homeIdx = Math.floor(sampleSize / 2) * sampleSize + Math.floor(sampleSize / 2);
    const homeR = pixels[homeIdx * 4];
    const homeG = pixels[homeIdx * 4 + 1];
    const homeB = pixels[homeIdx * 4 + 2];
    const homeElev = (homeR * 256 + homeG + homeB / 256) - 32768;

    for (let i = 0; i < sampleSize * sampleSize; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      const elev = (r * 256 + g + b / 256) - 32768;
      heightData[i] = Math.max(0, elev - homeElev);
    }

    console.log(`[Terrain] Elevation loaded: home=${homeElev.toFixed(1)}m, range=${Math.min(...heightData).toFixed(1)}-${Math.max(...heightData).toFixed(1)}m`);
    return heightData;
  } catch (e) {
    console.warn('[Terrain] Elevation data failed:', e);
    return null;
  }
}

// --- Procedural fallback ---

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

// --- Terrain class ---

export class Terrain {
  mesh: THREE.Mesh;
  heightData: Float32Array;
  readonly segments: number;
  readonly size: number;
  onHeightDataChanged: (() => void) | null = null;
  private scene: THREE.Scene;
  private fallbackTextures: THREE.Texture[];

  constructor(scene: THREE.Scene, ...fallbackTextures: THREE.Texture[]) {
    this.segments = TERRAIN_SEGMENTS;
    this.size = TERRAIN_SIZE;
    this.scene = scene;
    this.fallbackTextures = fallbackTextures;
    this.heightData = generateHeightmap(this.segments);

    const geo = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    this.applyHeightData(geo);

    const mat = this.createFallbackMaterial();
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);

    this.loadRealData();
  }

  private applyHeightData(geo: THREE.PlaneGeometry): void {
    const posAttr = geo.attributes.position;
    const vertSize = this.segments + 1;
    for (let i = 0; i < posAttr.count; i++) {
      const ix = i % vertSize;
      const iy = Math.floor(i / vertSize);
      posAttr.setZ(i, this.heightData[iy * vertSize + ix]);
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();
  }

  private createFallbackMaterial(): THREE.MeshStandardMaterial {
    const [grassTex1, grassTex2, groundTex] = this.fallbackTextures;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.0 });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.grass1 = { value: grassTex1 };
      shader.uniforms.grass2 = { value: grassTex2 };
      shader.uniforms.ground = { value: groundTex };

      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        'varying vec3 vWorldPos;\nvoid main() {'
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;'
      );

      shader.fragmentShader =
        `uniform sampler2D grass1;
uniform sampler2D grass2;
uniform sampler2D ground;
varying vec3 vWorldPos;
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        vec2 wuv = vWorldPos.xz;
        float n1 = vnoise(wuv * 0.03);
        vec2 offset1 = vec2(n1 * 0.5, n1 * 0.3);
        vec4 g1 = mix(
          texture2D(grass1, wuv * 0.12 + offset1),
          texture2D(grass1, wuv * 0.73),
          0.35
        );
        vec2 ruv = vec2(wuv.x * 0.8 - wuv.y * 0.6, wuv.x * 0.6 + wuv.y * 0.8);
        vec4 g2 = texture2D(grass2, ruv * 0.19);
        vec4 gnd = texture2D(ground, wuv * 0.27);
        float n2 = vnoise(wuv * 0.05);
        float n3 = vnoise(wuv * 0.11);
        vec4 grass = mix(g1, g2, 0.3 + 0.2 * n2);
        vec4 sampledDiffuseColor = mix(grass, gnd, 0.12 * n3);
        diffuseColor *= sampledDiffuseColor;
        `
      );
    };

    return mat;
  }

  private async loadRealData(): Promise<void> {
    const [satTex, elevData] = await Promise.all([
      loadSatelliteTexture(C.HOME_LAT, C.HOME_LON),
      loadElevationData(C.HOME_LAT, C.HOME_LON, this.segments),
    ]);

    if (satTex) {
      const mat = new THREE.MeshStandardMaterial({
        map: satTex,
        roughness: 0.95,
        metalness: 0.0,
      });
      this.mesh.material = mat;
      console.log('[Terrain] Satellite imagery applied');
    }

    if (elevData) {
      this.heightData = elevData;
      this.applyHeightData(this.mesh.geometry as THREE.PlaneGeometry);
      this.onHeightDataChanged?.();
      console.log('[Terrain] Real elevation data applied');
    }
  }

  getHeightAtWorld(worldX: number, worldZ: number): number {
    const halfSize = this.size / 2;
    const localX = worldX;
    const localY = -worldZ;
    const u = (localX + halfSize) / this.size;
    const v = (-localY + halfSize) / this.size;

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
