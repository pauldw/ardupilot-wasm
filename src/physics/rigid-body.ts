// Rigid body dynamics with quaternion attitude representation
// Ported from accurate-drone-model/physics.py

import * as C from './config';

// Quaternion utilities (scalar-first: [w, x, y, z])

export function quatMultiply(q1: number[], q2: number[]): number[] {
  const [w1, x1, y1, z1] = q1;
  const [w2, x2, y2, z2] = q2;
  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
  ];
}

export function quatNormalize(q: number[]): number[] {
  const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function quatToRotationMatrix(q: number[]): number[][] {
  const [w, x, y, z] = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
    [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
    [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
  ];
}

export function quatFromEuler(roll: number, pitch: number, yaw: number): number[] {
  const cr = Math.cos(roll / 2), sr = Math.sin(roll / 2);
  const cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  return [
    cr * cp * cy + sr * sp * sy,
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
  ];
}

export function quatToEuler(q: number[]): [number, number, number] {
  const [w, x, y, z] = q;
  const sinr_cosp = 2 * (w * x + y * z);
  const cosr_cosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  let sinp = 2 * (w * y - z * x);
  sinp = Math.max(-1, Math.min(1, sinp));
  const pitch = Math.asin(sinp);

  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return [roll, pitch, yaw];
}

function mat3MulVec(m: number[][], v: number[]): number[] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function cross(a: number[], b: number[]): number[] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export class RigidBody {
  position: number[];
  velocity: number[];
  quaternion: number[];
  omegaBody: number[]; // angular velocity in body frame [p, q, r]

  readonly mass: number;
  readonly I: number[]; // diagonal inertia
  readonly Iinv: number[]; // inverse diagonal inertia

  constructor() {
    this.position = [0, 0, -C.INITIAL_ALTITUDE]; // NED: negative z = up
    this.velocity = [0, 0, 0];
    this.quaternion = [1, 0, 0, 0];
    this.omegaBody = [0, 0, 0];
    this.mass = C.MASS;
    this.I = C.INERTIA;
    this.Iinv = C.INERTIA.map(v => 1.0 / v);
  }

  update(dt: number, forceBody: number[], torqueBody: number[], windVelocity?: number[]): void {
    const R = quatToRotationMatrix(this.quaternion);

    // Body-frame force to world frame
    const forceWorld = mat3MulVec(R, forceBody);

    // Gravity (NED: positive z is down)
    forceWorld[2] += this.mass * C.GRAVITY;

    // Aerodynamic drag
    const wind = windVelocity ?? [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      forceWorld[i] -= C.LINEAR_DRAG_COEFF * (this.velocity[i] - wind[i]);
    }

    // Translational dynamics
    for (let i = 0; i < 3; i++) {
      const accel = forceWorld[i] / this.mass;
      this.velocity[i] += accel * dt;
      this.position[i] += this.velocity[i] * dt;
    }

    // Ground contact
    const groundLimit = -C.LANDING_GEAR_HEIGHT;
    if (this.position[2] >= groundLimit) {
      this.position[2] = groundLimit;
      if (this.velocity[2] > 0) this.velocity[2] = 0;
      this.velocity[0] *= 0.8;
      this.velocity[1] *= 0.8;
      const lateralSpeed = Math.sqrt(
        this.velocity[0] * this.velocity[0] + this.velocity[1] * this.velocity[1]
      );
      if (lateralSpeed < 0.05) {
        this.velocity[0] = 0;
        this.velocity[1] = 0;
      }
      this.omegaBody[0] *= 0.8;
      this.omegaBody[1] *= 0.8;
      this.omegaBody[2] *= 0.8;
    }

    // Rotational dynamics: I * omega_dot = torque - omega x (I * omega)
    const Iomega = [
      this.I[0] * this.omegaBody[0],
      this.I[1] * this.omegaBody[1],
      this.I[2] * this.omegaBody[2],
    ];
    const gyroscopic = cross(this.omegaBody, Iomega);
    for (let i = 0; i < 3; i++) {
      const omegaDot = this.Iinv[i] * (torqueBody[i] - gyroscopic[i]);
      this.omegaBody[i] += omegaDot * dt;
    }

    // Quaternion integration: dq/dt = 0.5 * q * [0, omega]
    const omegaQuat = [0, this.omegaBody[0], this.omegaBody[1], this.omegaBody[2]];
    const qDot = quatMultiply(this.quaternion, omegaQuat);
    for (let i = 0; i < 4; i++) {
      this.quaternion[i] += 0.5 * qDot[i] * dt;
    }
    this.quaternion = quatNormalize(this.quaternion);
  }

  get altitude(): number {
    return -this.position[2]; // NED: negative z = height
  }

  get eulerDeg(): [number, number, number] {
    const [r, p, y] = quatToEuler(this.quaternion);
    return [r * 180 / Math.PI, p * 180 / Math.PI, y * 180 / Math.PI];
  }

  get rotationMatrix(): number[][] {
    return quatToRotationMatrix(this.quaternion);
  }
}
