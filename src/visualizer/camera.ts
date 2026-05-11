import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraController {
  controls: OrbitControls;
  private camera: THREE.PerspectiveCamera;
  private followTarget: THREE.Vector3 = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, domElement: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI * 0.49;
  }

  update(dronePosition: number[]): void {
    // NED to Three.js
    this.followTarget.set(dronePosition[0], -dronePosition[2], -dronePosition[1]);

    const delta = new THREE.Vector3().subVectors(this.followTarget, this.controls.target);
    const lerpFactor = 0.05;
    const step = delta.multiplyScalar(lerpFactor);

    this.controls.target.add(step);
    this.camera.position.add(step);

    this.controls.update();
  }
}
