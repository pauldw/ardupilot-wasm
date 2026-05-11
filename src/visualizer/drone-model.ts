import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as C from '../physics/config';

const PROP_NAMES_TO_MOTOR: Record<string, number> = {
  'Front Right Propeller': 0,
  'Front_Right_Propeller': 0,
  'Back Left Propeller': 1,
  'Back_Left_Propeller': 1,
  'Front Left Propeller': 2,
  'Front_Left_Propeller': 2,
  'Back Right Propeller': 3,
  'Back_Right_Propeller': 3,
};

export class DroneModel {
  group: THREE.Group;
  private propellers: (THREE.Object3D | null)[] = [null, null, null, null];
  private propAngles = [0, 0, 0, 0];
  private loaded = false;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this._loadModel();
  }

  private _loadModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      'drone.glb',
      (gltf) => {
        const model = gltf.scene;

        // glTF from Blender: forward=-Z (Blender +Y becomes glTF -Z), up=+Y
        // We want forward=+X in Three.js local space
        // Rotate +90° around Y to map -Z forward → +X forward
        model.rotation.y = Math.PI / 2;

        // Find propeller meshes by name
        model.traverse((child) => {
          for (const [name, motorIdx] of Object.entries(PROP_NAMES_TO_MOTOR)) {
            if (child.name === name || child.name.includes(name.replace(/ /g, '_')) || child.name.includes(name.replace(/_/g, ' '))) {
              this.propellers[motorIdx] = child;
              break;
            }
          }
        });

        // If exact names didn't match, try partial matching
        if (this.propellers.some(p => p === null)) {
          model.traverse((child) => {
            const n = child.name.toLowerCase();
            if (!n.includes('propeller') && !n.includes('prop')) return;
            if (n.includes('front') && n.includes('right') && !this.propellers[0]) {
              this.propellers[0] = child;
            } else if (n.includes('back') && n.includes('left') && !this.propellers[1]) {
              this.propellers[1] = child;
            } else if (n.includes('front') && n.includes('left') && !this.propellers[2]) {
              this.propellers[2] = child;
            } else if (n.includes('back') && n.includes('right') && !this.propellers[3]) {
              this.propellers[3] = child;
            }
          });
        }

        this.group.add(model);
        this.loaded = true;

        console.log('[DroneModel] GLB loaded, propellers found:',
          this.propellers.map((p, i) => `${i}: ${p ? p.name : 'MISSING'}`).join(', '));
      },
      undefined,
      (err) => {
        console.error('[DroneModel] Failed to load drone.glb:', err);
      }
    );
  }

  update(
    position: number[],
    rotationMatrix: number[][],
    motorOmegas: number[],
    dt = 1 / 60,
  ): void {
    // NED to Three.js: x=North→x, y=Up→-Down, z=→-East
    this.group.position.set(position[0], -position[2], -position[1]);

    const R = rotationMatrix;
    const m = new THREE.Matrix4();
    m.set(
      R[0][0], -R[0][2], -R[0][1], 0,
      -R[2][0], R[2][2], R[2][1], 0,
      -R[1][0], R[1][2], R[1][1], 0,
      0, 0, 0, 1
    );
    this.group.setRotationFromMatrix(m);

    // Animate propellers
    if (this.loaded) {
      for (let i = 0; i < 4; i++) {
        const prop = this.propellers[i];
        if (!prop) continue;
        const omega = motorOmegas[i] || 0;
        this.propAngles[i] += omega * dt * C.MOTOR_DIRECTIONS[i];
        prop.rotation.y = this.propAngles[i];
      }
    }
  }
}
