import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Terrain } from './terrain';

interface AssetDef {
  file: string;
  count: number;
  minDist: number;   // minimum distance from center
  maxDist: number;    // maximum distance from center
  scaleMin: number;
  scaleMax: number;
  // Collider: cylinder (radius, height) or box (w, h, d)
  collider?: { type: 'cylinder'; radius: number; height: number }
    | { type: 'box'; width: number; height: number; depth: number };
}

const ASSETS: AssetDef[] = [
  // Trees — keep away from center landing zone
  { file: 'tree_default.glb', count: 40, minDist: 50, maxDist: 180, scaleMin: 1.8, scaleMax: 2.8,
    collider: { type: 'cylinder', radius: 0.4, height: 5 } },
  { file: 'tree_oak.glb', count: 30, minDist: 50, maxDist: 180, scaleMin: 2.0, scaleMax: 3.0,
    collider: { type: 'cylinder', radius: 0.5, height: 4 } },
  { file: 'tree_pineTallA.glb', count: 25, minDist: 60, maxDist: 180, scaleMin: 2.5, scaleMax: 4.0,
    collider: { type: 'cylinder', radius: 0.3, height: 6 } },
  { file: 'tree_pineRoundA.glb', count: 20, minDist: 50, maxDist: 180, scaleMin: 2.0, scaleMax: 3.5,
    collider: { type: 'cylinder', radius: 0.5, height: 5 } },
  { file: 'tree_tall.glb', count: 15, minDist: 60, maxDist: 180, scaleMin: 2.0, scaleMax: 3.0,
    collider: { type: 'cylinder', radius: 0.3, height: 5 } },
  { file: 'tree_small.glb', count: 30, minDist: 40, maxDist: 180, scaleMin: 1.5, scaleMax: 2.5,
    collider: { type: 'cylinder', radius: 0.3, height: 3 } },

  // Rocks — some closer
  { file: 'rock_largeA.glb', count: 15, minDist: 30, maxDist: 180, scaleMin: 1.5, scaleMax: 3.0,
    collider: { type: 'cylinder', radius: 1.2, height: 1.0 } },
  { file: 'rock_largeB.glb', count: 10, minDist: 35, maxDist: 180, scaleMin: 1.5, scaleMax: 2.5,
    collider: { type: 'cylinder', radius: 1.0, height: 0.8 } },
  { file: 'rock_tallA.glb', count: 8, minDist: 40, maxDist: 180, scaleMin: 1.0, scaleMax: 2.0,
    collider: { type: 'cylinder', radius: 0.6, height: 2.0 } },
  { file: 'rock_smallA.glb', count: 25, minDist: 15, maxDist: 180, scaleMin: 0.8, scaleMax: 1.5 },
  { file: 'rock_smallB.glb', count: 20, minDist: 15, maxDist: 180, scaleMin: 0.8, scaleMax: 1.5 },

  // Foliage — decorative, no colliders
  { file: 'grass.glb', count: 80, minDist: 10, maxDist: 150, scaleMin: 1.0, scaleMax: 2.0 },
  { file: 'grass_large.glb', count: 50, minDist: 15, maxDist: 150, scaleMin: 1.0, scaleMax: 1.8 },
  { file: 'flower_redA.glb', count: 30, minDist: 10, maxDist: 120, scaleMin: 1.0, scaleMax: 1.5 },
  { file: 'flower_yellowA.glb', count: 30, minDist: 10, maxDist: 120, scaleMin: 1.0, scaleMax: 1.5 },

  // Props
  { file: 'log.glb', count: 8, minDist: 25, maxDist: 150, scaleMin: 1.0, scaleMax: 1.5,
    collider: { type: 'box', width: 1.0, height: 0.4, depth: 0.3 } },
  { file: 'stump_round.glb', count: 10, minDist: 20, maxDist: 150, scaleMin: 1.0, scaleMax: 1.5,
    collider: { type: 'cylinder', radius: 0.25, height: 0.3 } },
];

export interface Collider {
  // Position in NED
  north: number;
  east: number;
  type: 'cylinder' | 'box';
  radius?: number;
  width?: number;
  depth?: number;
  height: number;
  groundHeight: number; // terrain height at this position (NED down, so negative)
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class Environment {
  colliders: Collider[] = [];
  private loaded = false;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this._loadAssets(scene, terrain);
  }

  private _loadAssets(scene: THREE.Scene, terrain: Terrain): void {
    const loader = new GLTFLoader();
    const rand = seededRandom(12345);
    let loadedCount = 0;
    const totalAssets = ASSETS.length;

    for (const def of ASSETS) {
      loader.load(
        `environment/${def.file}`,
        (gltf) => {
          const source = gltf.scene;

          for (let i = 0; i < def.count; i++) {
            // Random position in annular ring
            const angle = rand() * Math.PI * 2;
            const dist = def.minDist + rand() * (def.maxDist - def.minDist);
            const worldX = Math.cos(angle) * dist; // Three.js X
            const worldZ = Math.sin(angle) * dist; // Three.js Z

            const terrainH = terrain.getHeightAtWorld(worldX, worldZ);
            const scale = def.scaleMin + rand() * (def.scaleMax - def.scaleMin);
            const yRotation = rand() * Math.PI * 2;

            const instance = source.clone();
            instance.position.set(worldX, terrainH, worldZ);
            instance.scale.setScalar(scale);
            instance.rotation.y = yRotation;
            scene.add(instance);

            // Register collider
            if (def.collider) {
              // Three.js world → NED: north = worldX, east = -worldZ
              const north = worldX;
              const east = -worldZ;
              const groundNED = -terrainH; // NED down is positive
              const c: Collider = {
                north,
                east,
                type: def.collider.type,
                height: def.collider.height * scale,
                groundHeight: groundNED,
              };
              if (def.collider.type === 'cylinder') {
                c.radius = def.collider.radius * scale;
              } else {
                c.width = (def.collider as any).width * scale;
                c.depth = (def.collider as any).depth * scale;
              }
              this.colliders.push(c);
            }
          }

          loadedCount++;
          if (loadedCount === totalAssets) {
            this.loaded = true;
            console.log(`[Environment] Loaded ${this.colliders.length} colliders from ${totalAssets} asset types`);
          }
        },
        undefined,
        (err) => {
          console.warn(`[Environment] Failed to load ${def.file}:`, err);
          loadedCount++;
        }
      );
    }
  }

  // Check collision at NED position, returns push-out vector or null
  checkCollision(north: number, east: number, down: number): { pushNorth: number; pushEast: number } | null {
    for (const c of this.colliders) {
      const dn = north - c.north;
      const de = east - c.east;
      const topNED = c.groundHeight - c.height; // NED: up is more negative

      // Check vertical overlap (NED: down > groundHeight means below ground at that point)
      if (down > c.groundHeight || down < topNED) continue;

      if (c.type === 'cylinder') {
        const dist = Math.sqrt(dn * dn + de * de);
        const r = c.radius!;
        if (dist < r) {
          if (dist < 0.001) return { pushNorth: r, pushEast: 0 };
          const push = (r - dist);
          return { pushNorth: (dn / dist) * push, pushEast: (de / dist) * push };
        }
      } else {
        const hw = (c.width ?? 1) / 2;
        const hd = (c.depth ?? 1) / 2;
        if (Math.abs(dn) < hw && Math.abs(de) < hd) {
          const overlapN = hw - Math.abs(dn);
          const overlapE = hd - Math.abs(de);
          if (overlapN < overlapE) {
            return { pushNorth: Math.sign(dn) * overlapN, pushEast: 0 };
          } else {
            return { pushNorth: 0, pushEast: Math.sign(de) * overlapE };
          }
        }
      }
    }
    return null;
  }
}
