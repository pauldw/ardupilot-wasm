// Motor model: PWM -> RPM -> thrust and torque
// Ported from accurate-drone-model/motor.py

import * as C from './config';

export class Motor {
  position: [number, number, number];
  direction: number; // +1 CW, -1 CCW
  omega = 0; // current angular velocity [rad/s]
  omegaTarget = 0;

  constructor(position: [number, number, number], direction: number) {
    this.position = position;
    this.direction = direction;
  }

  setPwm(pwmUs: number): void {
    const clamped = Math.max(C.PWM_MIN, Math.min(C.PWM_MAX, pwmUs));
    const normalized = (clamped - C.PWM_MIN) / (C.PWM_MAX - C.PWM_MIN);
    this.omegaTarget = normalized * C.MOTOR_MAX_OMEGA;
  }

  update(dt: number): void {
    this.omega += (this.omegaTarget - this.omega) * dt / C.MOTOR_TAU;
  }

  get thrust(): number {
    return C.MOTOR_KT * this.omega * this.omega;
  }

  get reactionTorque(): number {
    return -this.direction * C.MOTOR_KQ * this.omega * this.omega;
  }
}

export class MotorSet {
  motors: Motor[];

  constructor() {
    this.motors = C.MOTOR_POSITIONS.map(
      (pos, i) => new Motor(pos, C.MOTOR_DIRECTIONS[i])
    );
  }

  setPwm(pwmValues: number[]): void {
    for (let i = 0; i < this.motors.length; i++) {
      this.motors[i].setPwm(pwmValues[i]);
    }
  }

  update(dt: number): void {
    for (const motor of this.motors) {
      motor.update(dt);
    }
  }

  getForcesAndTorques(): { force: number[]; torque: number[] } {
    let totalThrust = 0;
    const torque = [0, 0, 0];

    for (const motor of this.motors) {
      const t = motor.thrust;
      totalThrust += t;

      // Torque from thrust offset: tau = r x F
      // Thrust along -z (upward in NED), F = [0, 0, -t]
      torque[0] += -motor.position[1] * t; // roll
      torque[1] += motor.position[0] * t;  // pitch
      torque[2] += motor.reactionTorque;    // yaw
    }

    return {
      force: [0, 0, -totalThrust],
      torque,
    };
  }

  get omegas(): number[] {
    return this.motors.map(m => m.omega);
  }
}
