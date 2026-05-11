import * as C from './config';
import { quatToRotationMatrix, quatToEuler } from './rigid-body';

const MAX_TERRAIN_HEIGHT = 8;

export class MuJoCoBody {
  position: number[] = [0, 0, 0];
  velocity: number[] = [0, 0, 0];
  quaternion: number[] = [1, 0, 0, 0];
  omegaBody: number[] = [0, 0, 0];

  readonly mass = C.MASS;
  readonly I = C.INERTIA;
  readonly Iinv = C.INERTIA.map(v => 1.0 / v);

  groundHeightNED: ((north: number, east: number) => number) | null = null;
  collisionCheck: ((north: number, east: number, down: number) => { pushNorth: number; pushEast: number } | null) | null = null;
  externalForceWorld: number[] = [0, 0, 0];
  externalTorqueBody: number[] = [0, 0, 0];

  private mj: any = null;
  private model: any = null;
  private data: any = null;
  private droneBodyId = 1;
  private initialized = false;

  async init(
    terrainInfo?: { heightmap: Float32Array; size: number; segments: number },
    onLog?: (msg: string) => void,
  ): Promise<void> {
    onLog?.('Loading MuJoCo physics engine...');
    const loadMujoco = (await import('@mujoco/mujoco')).default;
    this.mj = await loadMujoco();
    onLog?.('MuJoCo loaded, creating simulation...');

    // Write model files to virtual filesystem
    this.mj.FS.mkdir('/model');
    this.mj.FS.writeFile('/model/hull.obj', this.generateHullOBJ());
    const xml = this.buildMJCF(!!terrainInfo);
    this.mj.FS.writeFile('/model/drone.xml', xml);
    this.model = this.mj.MjModel.mj_loadXML('/model/drone.xml');
    this.data = new this.mj.MjData(this.model);

    if (terrainInfo) {
      this.setHeightfieldData(terrainInfo);
    }

    // Initial position: body frame origin at bottom of drone, on ground
    this.data.qpos[0] = 0;
    this.data.qpos[1] = 0;
    this.data.qpos[2] = 0;
    this.data.qpos[3] = 1;
    this.data.qpos[4] = 0;
    this.data.qpos[5] = 0;
    this.data.qpos[6] = 0;

    this.mj.mj_forward(this.model, this.data);
    this.readState();
    this.initialized = true;
    onLog?.('MuJoCo physics ready');
  }

  private buildMJCF(hasHeightfield: boolean): string {
    const L = C.ARM_LENGTH;
    // Body frame origin at bottom of drone
    // CoM roughly at center of mass — motors at z≈0.13, body center ~0.10
    const Z = 0.10; // offset from bottom to CoM
    const hfieldAsset = hasHeightfield
      ? `<hfield name="terrain" nrow="129" ncol="129" size="200 200 ${MAX_TERRAIN_HEIGHT} 0.01"/>`
      : '';
    const groundGeom = hasHeightfield
      ? `<geom type="hfield" hfield="terrain" friction="1 0.5 0.1" rgba="0.3 0.5 0.3 0"/>`
      : `<geom type="plane" size="200 200 0.1" friction="1 0.5 0.1" rgba="0.3 0.5 0.3 0"/>`;

    return `<mujoco model="f450">
  <option timestep="${C.PHYSICS_DT}" integrator="RK4" gravity="0 0 -${C.GRAVITY}" cone="elliptic" impratio="10" noslip_iterations="3">
    <flag energy="disable"/>
  </option>

  <default>
    <geom condim="4" friction="1 0.02 0.01" solimp="0.95 0.99 0.001 0.5 2" solref="0.008 1"/>
  </default>

  <asset>
    <mesh name="drone_hull" file="hull.obj" refpos="0 0 0" refquat="1 0 0 0"/>
    ${hfieldAsset}
  </asset>

  <worldbody>
    ${groundGeom}

    <body name="drone" pos="0 0 0">
      <freejoint name="root"/>
      <inertial pos="0 0 ${Z}" mass="${C.MASS}" diaginertia="${C.INERTIA[0]} ${C.INERTIA[1]} ${C.INERTIA[2]}"/>

      <!-- Convex hull of the drone mesh — handles all contact orientations -->
      <geom name="hull" type="mesh" mesh="drone_hull" mass="0" rgba="0.2 0.2 0.2 0"/>

      <site name="imu" pos="0 0 ${Z}"/>
    </body>
  </worldbody>

  <sensor>
    <gyro name="gyro" site="imu"/>
    <accelerometer name="accel" site="imu"/>
  </sensor>
</mujoco>`;
  }

  setHeightfieldData(info: { heightmap: Float32Array; size: number; segments: number }): void {
    const nrow = info.segments + 1;
    const ncol = info.segments + 1;
    const hfData = this.model.hfield_data;

    // MuJoCo mjModel hfield_data (runtime): row 0 = y_min, col 0 = x_min
    // Terrain heightData[iy * vertSize + ix]: ix=0 → worldX=-200 (x_min), iy=0 → worldZ=-200 (y_min)
    // Direct 1:1 mapping — no axis reversal needed
    for (let row = 0; row < nrow; row++) {
      for (let col = 0; col < ncol; col++) {
        hfData[row * ncol + col] = info.heightmap[row * ncol + col] / MAX_TERRAIN_HEIGHT;
      }
    }
  }

  private generateHullOBJ(): string {
    // Dimensions matched to drone.glb visual model (not physics config)
    const L = 0.095;    // motor distance from center in GLB
    const R = 0.055;    // prop radius in GLB
    const zBot = 0;     // landing gear bottom
    const zTop = 0.20;  // top of drone body (GLB Y max ≈ 0.202)

    // MuJoCo body frame (Z-up, origin at bottom of drone)
    const motors = [
      [L, -L], [-L, L], [L, L], [-L, -L],
    ];

    const verts: number[][] = [];

    // Bottom: 4 arm tips + center
    for (const [mx, my] of motors) {
      verts.push([mx, my, zBot]);
    }
    verts.push([0, 0, zBot]);

    // Top: sample 8 points around each prop circle
    for (const [mx, my] of motors) {
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        verts.push([mx + R * Math.cos(a), my + R * Math.sin(a), zTop]);
      }
    }

    // Center top
    verts.push([0, 0, zTop]);

    // Write OBJ — MuJoCo uses convex hull of all vertices for collision
    const lines: string[] = [];
    for (const [x, y, z] of verts) {
      lines.push(`v ${x.toFixed(5)} ${y.toFixed(5)} ${z.toFixed(5)}`);
    }

    // Minimal triangulation (MuJoCo ignores faces, uses convex hull)
    // Bottom fan
    lines.push('f 1 2 5');
    lines.push('f 2 3 5');
    lines.push('f 3 4 5');
    lines.push('f 4 1 5');

    // Connect bottom to top ring
    const topStart = 6;
    const topEnd = verts.length;
    for (let i = topStart; i < topEnd - 1; i++) {
      lines.push(`f 1 ${i} ${i + 1}`);
    }
    lines.push(`f 1 ${topEnd - 1} ${topStart}`);

    return lines.join('\n');
  }

  update(dt: number, forceBody: number[], torqueBody: number[], windVelocity?: number[]): void {
    if (!this.initialized) return;

    // Get MuJoCo rotation matrix (body-to-world, row-major, 9 values per body)
    const bo = this.droneBodyId * 9;
    const R = [
      [this.data.xmat[bo], this.data.xmat[bo + 1], this.data.xmat[bo + 2]],
      [this.data.xmat[bo + 3], this.data.xmat[bo + 4], this.data.xmat[bo + 5]],
      [this.data.xmat[bo + 6], this.data.xmat[bo + 7], this.data.xmat[bo + 8]],
    ];

    // Convert NED body-frame force to MuJoCo body-frame: [fx, -fy, -fz]
    const mjFBody = [forceBody[0], -forceBody[1], -forceBody[2]];
    const mjTBody = [torqueBody[0], -torqueBody[1], -torqueBody[2]];

    // Rotate to MuJoCo world frame
    const mjFWorld = [
      R[0][0] * mjFBody[0] + R[0][1] * mjFBody[1] + R[0][2] * mjFBody[2],
      R[1][0] * mjFBody[0] + R[1][1] * mjFBody[1] + R[1][2] * mjFBody[2],
      R[2][0] * mjFBody[0] + R[2][1] * mjFBody[1] + R[2][2] * mjFBody[2],
    ];
    const mjTWorld = [
      R[0][0] * mjTBody[0] + R[0][1] * mjTBody[1] + R[0][2] * mjTBody[2],
      R[1][0] * mjTBody[0] + R[1][1] * mjTBody[1] + R[1][2] * mjTBody[2],
      R[2][0] * mjTBody[0] + R[2][1] * mjTBody[1] + R[2][2] * mjTBody[2],
    ];

    // Wind drag (NED wind → MJ world)
    const wind = windVelocity ?? [0, 0, 0];
    const mjWind = [wind[0], -wind[1], -wind[2]];
    const mjVel = [this.data.qvel[0], this.data.qvel[1], this.data.qvel[2]];
    for (let i = 0; i < 3; i++) {
      mjFWorld[i] -= C.LINEAR_DRAG_COEFF * (mjVel[i] - mjWind[i]);
    }

    // Rotational aerodynamic drag: τ = -b * ω (arms and prop discs resist rotation)
    const ROTATIONAL_DRAG = 0.005;
    const mjOmegaWorld = [this.data.qvel[3], this.data.qvel[4], this.data.qvel[5]];
    mjTWorld[0] -= ROTATIONAL_DRAG * mjOmegaWorld[0];
    mjTWorld[1] -= ROTATIONAL_DRAG * mjOmegaWorld[1];
    mjTWorld[2] -= ROTATIONAL_DRAG * mjOmegaWorld[2];

    // External forces from manipulator (NED world → MJ world)
    mjFWorld[0] += this.externalForceWorld[0];
    mjFWorld[1] += -this.externalForceWorld[1];
    mjFWorld[2] += -this.externalForceWorld[2];

    // External torque (NED body → MJ body → MJ world)
    const mjExtTBody = [
      this.externalTorqueBody[0],
      -this.externalTorqueBody[1],
      -this.externalTorqueBody[2],
    ];
    mjTWorld[0] += R[0][0] * mjExtTBody[0] + R[0][1] * mjExtTBody[1] + R[0][2] * mjExtTBody[2];
    mjTWorld[1] += R[1][0] * mjExtTBody[0] + R[1][1] * mjExtTBody[1] + R[1][2] * mjExtTBody[2];
    mjTWorld[2] += R[2][0] * mjExtTBody[0] + R[2][1] * mjExtTBody[1] + R[2][2] * mjExtTBody[2];

    // Apply via xfrc_applied [fx, fy, fz, tx, ty, tz] per body
    const fo = this.droneBodyId * 6;
    this.data.xfrc_applied[fo + 0] = mjFWorld[0];
    this.data.xfrc_applied[fo + 1] = mjFWorld[1];
    this.data.xfrc_applied[fo + 2] = mjFWorld[2];
    this.data.xfrc_applied[fo + 3] = mjTWorld[0];
    this.data.xfrc_applied[fo + 4] = mjTWorld[1];
    this.data.xfrc_applied[fo + 5] = mjTWorld[2];

    this.mj.mj_step(this.model, this.data);
    this.readState();

    // Post-step environment collision (objects not in MuJoCo world)
    if (this.collisionCheck) {
      const hit = this.collisionCheck(this.position[0], this.position[1], this.position[2]);
      if (hit) {
        this.position[0] += hit.pushNorth;
        this.position[1] += hit.pushEast;
        this.data.qpos[0] = this.position[0];
        this.data.qpos[1] = -this.position[1];

        const dotN = this.velocity[0] * hit.pushNorth + this.velocity[1] * hit.pushEast;
        const pushLen = Math.sqrt(hit.pushNorth * hit.pushNorth + hit.pushEast * hit.pushEast);
        if (pushLen > 0.001 && dotN < 0) {
          const nx = hit.pushNorth / pushLen;
          const ny = hit.pushEast / pushLen;
          this.velocity[0] -= nx * dotN * 1.5;
          this.velocity[1] -= ny * dotN * 1.5;
          this.data.qvel[0] = this.velocity[0];
          this.data.qvel[1] = -this.velocity[1];
        }
      }
    }
  }

  private readState(): void {
    // Position: MJ [x,y,z] → NED [x, -y, -z]
    this.position[0] = this.data.qpos[0];
    this.position[1] = -this.data.qpos[1];
    this.position[2] = -this.data.qpos[2];

    // Velocity: MJ [vx,vy,vz] → NED [vx, -vy, -vz]
    this.velocity[0] = this.data.qvel[0];
    this.velocity[1] = -this.data.qvel[1];
    this.velocity[2] = -this.data.qvel[2];

    // Quaternion: MJ [w,x,y,z] → NED [w, x, -y, -z]
    this.quaternion[0] = this.data.qpos[3];
    this.quaternion[1] = this.data.qpos[4];
    this.quaternion[2] = -this.data.qpos[5];
    this.quaternion[3] = -this.data.qpos[6];

    // Angular velocity: MJ qvel[3:6] is world-frame, convert to NED body-frame
    const bo = this.droneBodyId * 9;
    const R = [
      [this.data.xmat[bo], this.data.xmat[bo + 1], this.data.xmat[bo + 2]],
      [this.data.xmat[bo + 3], this.data.xmat[bo + 4], this.data.xmat[bo + 5]],
      [this.data.xmat[bo + 6], this.data.xmat[bo + 7], this.data.xmat[bo + 8]],
    ];
    // R^T * omega_world → omega_body (in MJ frame)
    const ow = [this.data.qvel[3], this.data.qvel[4], this.data.qvel[5]];
    const mjOmegaBody = [
      R[0][0] * ow[0] + R[1][0] * ow[1] + R[2][0] * ow[2],
      R[0][1] * ow[0] + R[1][1] * ow[1] + R[2][1] * ow[2],
      R[0][2] * ow[0] + R[1][2] * ow[1] + R[2][2] * ow[2],
    ];
    // MJ body → NED body: [p, -q, -r]
    this.omegaBody[0] = mjOmegaBody[0];
    this.omegaBody[1] = -mjOmegaBody[1];
    this.omegaBody[2] = -mjOmegaBody[2];
  }

  get altitude(): number {
    return -this.position[2];
  }

  get eulerDeg(): [number, number, number] {
    const [r, p, y] = quatToEuler(this.quaternion);
    return [r * 180 / Math.PI, p * 180 / Math.PI, y * 180 / Math.PI];
  }

  get rotationMatrix(): number[][] {
    return quatToRotationMatrix(this.quaternion);
  }
}
