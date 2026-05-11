export interface PhysicsBody {
  position: number[];
  velocity: number[];
  quaternion: number[];
  omegaBody: number[];
  readonly mass: number;
  readonly I: number[];
  readonly Iinv: number[];
  externalForceWorld: number[];
  externalTorqueBody: number[];
  groundHeightNED: ((north: number, east: number) => number) | null;
  collisionCheck: ((north: number, east: number, down: number) => { pushNorth: number; pushEast: number } | null) | null;
  readonly altitude: number;
  readonly eulerDeg: [number, number, number];
  readonly rotationMatrix: number[][];
  update(dt: number, forceBody: number[], torqueBody: number[], windVelocity?: number[]): void;
}
