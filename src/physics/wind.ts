// Wind model with base wind, direction drift, and turbulent gusts
// Ported from accurate-drone-model/wind.py

export class Wind {
  baseSpeed: number;
  baseDirection: number;
  gustIntensity: number;
  variationRate: number;
  private phases: number[];

  constructor(
    baseSpeed = 0,
    directionDeg = 0,
    gustIntensity = 0,
    variationRate = 1
  ) {
    this.baseSpeed = baseSpeed;
    this.baseDirection = (directionDeg * Math.PI) / 180;
    this.gustIntensity = gustIntensity;
    this.variationRate = variationRate;
    this.phases = Array.from({ length: 8 }, () => Math.random() * 2 * Math.PI);
  }

  getVelocity(t: number): [number, number, number] {
    if (this.baseSpeed === 0 && this.gustIntensity === 0) {
      return [0, 0, 0];
    }

    const vr = this.variationRate;
    const p = this.phases;

    const direction =
      this.baseDirection + 0.4 * Math.sin(0.3 * vr * t + p[0]);
    const speed =
      this.baseSpeed * (1.0 + 0.25 * Math.sin(0.2 * vr * t + p[1]));

    const gustN =
      this.gustIntensity *
      (0.5 * Math.sin(1.1 * vr * t + p[2]) +
        0.3 * Math.sin(3.7 * vr * t + p[3]) +
        0.2 * Math.sin(8.9 * vr * t + p[4]));
    const gustE =
      this.gustIntensity *
      (0.5 * Math.sin(0.9 * vr * t + p[5]) +
        0.3 * Math.sin(3.1 * vr * t + p[6]) +
        0.2 * Math.sin(7.3 * vr * t + p[7]));
    const gustD =
      this.gustIntensity * 0.3 * Math.sin(2.3 * vr * t + p[4]);

    const vn = speed * Math.cos(direction) + gustN;
    const ve = speed * Math.sin(direction) + gustE;

    return [vn, ve, gustD];
  }
}
