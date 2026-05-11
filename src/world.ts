import type { SimLoop } from './sim-loop';

export class World {
  private sim: SimLoop;
  print: (msg: string) => void;

  constructor(sim: SimLoop, print: (msg: string) => void) {
    this.sim = sim;
    this.print = print;
  }

  wind_set(speedMs: number, directionDeg: number, gustIntensity = 0, variationRate = 1): void {
    this.sim.wind.baseSpeed = speedMs;
    this.sim.wind.baseDirection = (directionDeg * Math.PI) / 180;
    this.sim.wind.gustIntensity = gustIntensity;
    this.sim.wind.variationRate = variationRate;
    this.print(`wind: ${speedMs} m/s from ${directionDeg}°, gusts=${gustIntensity}, variation=${variationRate}`);
  }

  wind_get(): { speed: number; direction: number; gustIntensity: number; variationRate: number } {
    const speed = this.sim.wind.baseSpeed;
    const direction = (this.sim.wind.baseDirection * 180) / Math.PI;
    const gustIntensity = this.sim.wind.gustIntensity;
    const variationRate = this.sim.wind.variationRate;
    this.print(`wind: ${speed.toFixed(1)} m/s from ${direction.toFixed(0)}°, gusts=${gustIntensity.toFixed(1)}, variation=${variationRate.toFixed(1)}`);
    return { speed, direction, gustIntensity, variationRate };
  }

  wind_off(): void {
    this.sim.wind.baseSpeed = 0;
    this.sim.wind.gustIntensity = 0;
    this.print('wind: off');
  }

  help(): void {
    this.print(`
World API - Environment controls

Wind:
  world.wind_set(speed, dir)              Set wind speed (m/s) and direction (degrees)
  world.wind_set(speed, dir, gust, var)   Full wind config (gust intensity, variation rate)
  world.wind_get()                        Get current wind settings
  world.wind_off()                        Disable wind
`.trim());
  }
}
