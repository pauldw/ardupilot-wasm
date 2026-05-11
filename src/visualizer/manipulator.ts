import * as THREE from 'three';
import { quatToRotationMatrix } from '../physics/rigid-body';
import type { PhysicsBody } from '../physics/physics-body';

const SPRING_K = 20;       // N/m — soft grab, like holding with fingers
const DAMPING = 15;        // N/(m/s) — velocity damping on the spring
const MAX_FORCE = 25;      // N — reasonable hand force on a 1.2kg object
const MAX_TORQUE = 0.5;    // N·m — clamp to prevent unrealistic spin-up
const GRAB_ANG_DAMP = 0.08; // N·m/(rad/s) — hand resists drone rotation

export class Manipulator {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private droneGroup: THREE.Group;
  private body: PhysicsBody;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private active = false;
  private grabPointBody: number[] = [0, 0, 0]; // grab point in body frame (NED)
  private grabDistance = 0; // distance from camera at grab time
  private dragPlane = new THREE.Plane();

  private shiftHeld = false;

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    droneGroup: THREE.Group,
    body: PhysicsBody,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.droneGroup = droneGroup;
    this.body = body;

    domElement.addEventListener('mousedown', this.onMouseDown, true);
    domElement.addEventListener('mousemove', this.onMouseMove, true);
    domElement.addEventListener('mouseup', this.onMouseUp, true);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      this.shiftHeld = true;
      this.domElement.style.cursor = 'grab';
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Shift') {
      this.shiftHeld = false;
      if (!this.active) this.domElement.style.cursor = '';
    }
  };

  private onMouseDown = (e: MouseEvent) => {
    if (!this.shiftHeld) return;

    this.updateMouse(e);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const intersects = this.raycaster.intersectObject(this.droneGroup, true);
    if (intersects.length === 0) return;

    e.preventDefault();
    e.stopPropagation();
    this.active = true;
    this.domElement.style.cursor = 'grabbing';

    // Convert intersection point from Three.js world to NED
    const hitWorld = intersects[0].point;
    const hitNED = this.threeToNED(hitWorld);

    // Convert to body frame
    const R = quatToRotationMatrix(this.body.quaternion);
    const rel = [
      hitNED[0] - this.body.position[0],
      hitNED[1] - this.body.position[1],
      hitNED[2] - this.body.position[2],
    ];
    // World-to-body: R^T * rel
    this.grabPointBody = [
      R[0][0] * rel[0] + R[1][0] * rel[1] + R[2][0] * rel[2],
      R[0][1] * rel[0] + R[1][1] * rel[1] + R[2][1] * rel[2],
      R[0][2] * rel[0] + R[1][2] * rel[1] + R[2][2] * rel[2],
    ];

    // Store grab distance for drag plane
    this.grabDistance = hitWorld.distanceTo(this.camera.position);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.active) {
      if (this.shiftHeld) {
        this.domElement.style.cursor = 'grab';
      }
      return;
    }
    this.updateMouse(e);
  };

  private onMouseUp = (_e: MouseEvent) => {
    if (this.active) {
      this.active = false;
      this.body.externalForceWorld = [0, 0, 0];
      this.body.externalTorqueBody = [0, 0, 0];
      this.domElement.style.cursor = this.shiftHeld ? 'grab' : '';
    }
  };

  private updateMouse(e: MouseEvent) {
    const rect = this.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private threeToNED(v: THREE.Vector3): number[] {
    // Three.js (x, y, z) → NED (x=north, y=east, z=down)
    // Three.x = NED north, Three.y = -NED down, Three.z = -NED east
    return [v.x, -v.z, -v.y];
  }

  private nedToThree(ned: number[]): THREE.Vector3 {
    return new THREE.Vector3(ned[0], -ned[2], -ned[1]);
  }

  update(): void {
    if (!this.active) return;

    const R = quatToRotationMatrix(this.body.quaternion);

    // Body-frame grab point → world (NED)
    const grabWorld = [
      R[0][0] * this.grabPointBody[0] + R[0][1] * this.grabPointBody[1] + R[0][2] * this.grabPointBody[2] + this.body.position[0],
      R[1][0] * this.grabPointBody[0] + R[1][1] * this.grabPointBody[1] + R[1][2] * this.grabPointBody[2] + this.body.position[1],
      R[2][0] * this.grabPointBody[0] + R[2][1] * this.grabPointBody[1] + R[2][2] * this.grabPointBody[2] + this.body.position[2],
    ];

    // Project mouse onto a plane at grab distance, perpendicular to camera
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const camDir = this.raycaster.ray.direction.clone();
    this.dragPlane.setFromNormalAndCoplanarPoint(
      this.camera.getWorldDirection(new THREE.Vector3()),
      this.camera.position.clone().add(camDir.multiplyScalar(this.grabDistance))
    );

    const targetThree = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, targetThree)) return;

    const targetNED = this.threeToNED(targetThree);

    // Spring force: F = k * (target - grabPoint) - damping * velocity
    const force = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      force[i] = SPRING_K * (targetNED[i] - grabWorld[i]) - DAMPING * this.body.velocity[i];
    }

    // Clamp force magnitude
    const forceMag = Math.sqrt(force[0] * force[0] + force[1] * force[1] + force[2] * force[2]);
    if (forceMag > MAX_FORCE) {
      const s = MAX_FORCE / forceMag;
      force[0] *= s; force[1] *= s; force[2] *= s;
    }

    this.body.externalForceWorld = force;

    // Torque = r × F (in world frame), then convert to body frame
    const r = [
      grabWorld[0] - this.body.position[0],
      grabWorld[1] - this.body.position[1],
      grabWorld[2] - this.body.position[2],
    ];
    const torqueWorld = [
      r[1] * force[2] - r[2] * force[1],
      r[2] * force[0] - r[0] * force[2],
      r[0] * force[1] - r[1] * force[0],
    ];
    // World-to-body: R^T * torque
    const torqueBody = [
      R[0][0] * torqueWorld[0] + R[1][0] * torqueWorld[1] + R[2][0] * torqueWorld[2],
      R[0][1] * torqueWorld[0] + R[1][1] * torqueWorld[1] + R[2][1] * torqueWorld[2],
      R[0][2] * torqueWorld[0] + R[1][2] * torqueWorld[1] + R[2][2] * torqueWorld[2],
    ];

    // Physical angular damping: hand resists rotation (τ = -b * ω)
    for (let i = 0; i < 3; i++) {
      torqueBody[i] -= GRAB_ANG_DAMP * this.body.omegaBody[i];
    }

    // Clamp torque magnitude
    const torqueMag = Math.sqrt(torqueBody[0] ** 2 + torqueBody[1] ** 2 + torqueBody[2] ** 2);
    if (torqueMag > MAX_TORQUE) {
      const s = MAX_TORQUE / torqueMag;
      torqueBody[0] *= s; torqueBody[1] *= s; torqueBody[2] *= s;
    }

    this.body.externalTorqueBody = torqueBody;
  }

  get isGrabbing(): boolean {
    return this.active;
  }

  get isShiftHeld(): boolean {
    return this.shiftHeld;
  }
}
