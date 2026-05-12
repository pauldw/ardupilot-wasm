import * as C from './config';

export class ServoModel {
  private angle = 0;
  private velocity = 0;
  private lastPwm = 1500;
  private targetAngle = 0;
  private jitterTimer = 0;

  update(pwmUs: number, dt: number): void {
    if (Math.abs(pwmUs - this.lastPwm) < C.SERVO_DEADBAND_US) {
      pwmUs = this.lastPwm;
    } else {
      this.lastPwm = pwmUs;
    }

    const norm = Math.max(0, Math.min(1,
      (pwmUs - C.GIMBAL_PWM_MIN) / (C.GIMBAL_PWM_MAX - C.GIMBAL_PWM_MIN)));
    this.targetAngle = C.GIMBAL_PITCH_MIN + norm * (C.GIMBAL_PITCH_MAX - C.GIMBAL_PITCH_MIN);

    const rawError = this.targetAngle - this.angle;

    // Backlash: absorb small reversals
    let error = rawError;
    if (Math.abs(error) < C.SERVO_BACKLASH_DEG / 2) {
      error = 0;
    } else {
      error -= Math.sign(error) * C.SERVO_BACKLASH_DEG / 2;
    }

    // Second-order underdamped dynamics
    const wn = C.SERVO_NATURAL_FREQ;
    const zeta = C.SERVO_DAMPING_RATIO;
    const accel = wn * wn * error - 2 * zeta * wn * this.velocity;

    this.velocity += accel * dt;

    // Clamp slew rate
    const maxV = C.SERVO_MAX_SPEED;
    if (this.velocity > maxV) this.velocity = maxV;
    if (this.velocity < -maxV) this.velocity = -maxV;

    this.angle += this.velocity * dt;

    // Holding jitter: only when fully settled, applied at ~20Hz not 1000Hz
    if (Math.abs(rawError) < 0.5 && Math.abs(this.velocity) < 1) {
      this.jitterTimer += dt;
      if (this.jitterTimer > 0.05) {
        this.angle += gaussRandom() * C.SERVO_JITTER_STD_DEG;
        this.jitterTimer = 0;
      }
    } else {
      this.jitterTimer = 0;
    }

    // Clamp to range
    if (this.angle < C.GIMBAL_PITCH_MIN) { this.angle = C.GIMBAL_PITCH_MIN; this.velocity = 0; }
    if (this.angle > C.GIMBAL_PITCH_MAX) { this.angle = C.GIMBAL_PITCH_MAX; this.velocity = 0; }
  }

  get angleDeg(): number { return this.angle; }
}

function gaussRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
