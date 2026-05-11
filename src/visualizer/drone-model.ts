import * as THREE from 'three';
import * as C from '../physics/config';

const BODY_COLOR = 0x2e2e33;
const ARM_COLOR = 0xb53333;
const MOTOR_HOUSING = 0x242429;
const LANDING_GEAR_COLOR = 0x3d3d40;
const PROP_DISC_COLOR = 0x292929;
const FWD_COLOR = 0xffdb33;
const BATTERY_COLOR = 0x1f1f24;

function makeBoxPrism(
  cornersTop: THREE.Vector3[],
  cornersBot: THREE.Vector3[],
  color: number,
  shade = 0.7
): THREE.Group {
  const group = new THREE.Group();
  const c = new THREE.Color(color);
  const cDark = new THREE.Color(color).multiplyScalar(shade);
  const cMid = new THREE.Color(color).multiplyScalar((shade + 1) / 2);
  const n = cornersTop.length;

  // Top face
  const topShape = new THREE.Shape();
  topShape.moveTo(cornersTop[0].x, cornersTop[0].y);
  for (let i = 1; i < n; i++) topShape.lineTo(cornersTop[i].x, cornersTop[i].y);
  const topGeo = new THREE.ShapeGeometry(topShape);
  const topVerts = topGeo.attributes.position;
  for (let i = 0; i < topVerts.count; i++) {
    const x = topVerts.getX(i);
    const y = topVerts.getY(i);
    topVerts.setXYZ(i, x, y, cornersTop[0].z);
  }
  group.add(new THREE.Mesh(topGeo, new THREE.MeshStandardMaterial({ color: c, flatShading: true })));

  // Bottom face
  const botShape = new THREE.Shape();
  botShape.moveTo(cornersBot[0].x, cornersBot[0].y);
  for (let i = n - 1; i >= 1; i--) botShape.lineTo(cornersBot[i].x, cornersBot[i].y);
  const botGeo = new THREE.ShapeGeometry(botShape);
  const botVerts = botGeo.attributes.position;
  for (let i = 0; i < botVerts.count; i++) {
    const x = botVerts.getX(i);
    const y = botVerts.getY(i);
    botVerts.setXYZ(i, x, y, cornersBot[0].z);
  }
  group.add(new THREE.Mesh(botGeo, new THREE.MeshStandardMaterial({ color: cDark, flatShading: true })));

  // Side faces
  const sideGeo = new THREE.BufferGeometry();
  const positions: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const t0 = cornersTop[i], t1 = cornersTop[j];
    const b0 = cornersBot[i], b1 = cornersBot[j];
    positions.push(t0.x, t0.y, t0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z);
    positions.push(t0.x, t0.y, t0.z, b1.x, b1.y, b1.z, t1.x, t1.y, t1.z);
  }
  sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  sideGeo.computeVertexNormals();
  group.add(new THREE.Mesh(sideGeo, new THREE.MeshStandardMaterial({ color: cMid, flatShading: true })));

  return group;
}

export class DroneModel {
  group: THREE.Group;
  propDiscs: THREE.Mesh[] = [];
  private propAngles = [0, 0, 0, 0];
  private propBlades: THREE.Group[] = [];
  private shadow: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.group = new THREE.Group();

    // Body plate: octagonal prism (NED body frame: x=fwd, y=right, z=down)
    // We build in NED then convert to Three.js at the end
    const bodyR = 0.045;
    const bodyZt = -0.012;
    const bodyZb = 0.004;
    const bodyTop: THREE.Vector3[] = [];
    const bodyBot: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const x = bodyR * Math.cos(a);
      const y = bodyR * Math.sin(a);
      bodyTop.push(new THREE.Vector3(x, y, bodyZt));
      bodyBot.push(new THREE.Vector3(x, y, bodyZb));
    }
    this.group.add(this._nedToThree(makeBoxPrism(bodyTop, bodyBot, BODY_COLOR)));

    // Battery box underneath
    const batHw = 0.030, batHd = 0.018, batZt = 0.004, batZb = 0.022;
    const batTop = [
      new THREE.Vector3(-batHd, -batHw, batZt),
      new THREE.Vector3(batHd, -batHw, batZt),
      new THREE.Vector3(batHd, batHw, batZt),
      new THREE.Vector3(-batHd, batHw, batZt),
    ];
    const batBot = batTop.map(v => new THREE.Vector3(v.x, v.y, batZb));
    this.group.add(this._nedToThree(makeBoxPrism(batTop, batBot, BATTERY_COLOR)));

    // Arms and motors
    const armHw = 0.012;
    const armZt = -0.004;
    const armZb = 0.004;

    for (let mi = 0; mi < 4; mi++) {
      const mp = C.MOTOR_POSITIONS[mi];
      const mpXY = [mp[0], mp[1]];
      const armLen = Math.sqrt(mpXY[0] * mpXY[0] + mpXY[1] * mpXY[1]);
      if (armLen < 0.001) continue;

      const armDir = [mpXY[0] / armLen, mpXY[1] / armLen];
      const perp = [-armDir[1], armDir[0]];
      const armStartXY = [armDir[0] * 0.04, armDir[1] * 0.04];

      const s1 = [armStartXY[0] + perp[0] * armHw, armStartXY[1] + perp[1] * armHw];
      const s2 = [armStartXY[0] - perp[0] * armHw, armStartXY[1] - perp[1] * armHw];
      const e1 = [mpXY[0] + perp[0] * armHw, mpXY[1] + perp[1] * armHw];
      const e2 = [mpXY[0] - perp[0] * armHw, mpXY[1] - perp[1] * armHw];

      const armTop = [
        new THREE.Vector3(s1[0], s1[1], armZt),
        new THREE.Vector3(s2[0], s2[1], armZt),
        new THREE.Vector3(e2[0], e2[1], armZt),
        new THREE.Vector3(e1[0], e1[1], armZt),
      ];
      const armBot = armTop.map(v => new THREE.Vector3(v.x, v.y, armZb));
      this.group.add(this._nedToThree(makeBoxPrism(armTop, armBot, ARM_COLOR)));

      // Motor housing cylinder
      const motorZt = -0.020;
      const motorZb2 = armZt;
      this.group.add(this._nedCylinder(mpXY, 0.018, motorZt, motorZb2, 12, MOTOR_HOUSING));

      // Prop disc (transparent, visible when spinning fast)
      const propR = 0.12;
      const propZ = motorZt - 0.002;
      const discGeo = new THREE.CircleGeometry(propR, 32);
      const discMat = new THREE.MeshStandardMaterial({
        color: PROP_DISC_COLOR,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      // NED to Three.js: disc at (mp[0], -mp[2]+propZ offset, -mp[1])
      disc.position.set(mp[0], -propZ, -mp[1]);
      disc.rotation.x = -Math.PI / 2;
      this.group.add(disc);
      this.propDiscs.push(disc);

      // Blade geometry (visible when spinning slowly)
      const bladeGroup = new THREE.Group();
      const bladeHw = 0.012;
      const bladeMat = new THREE.MeshStandardMaterial({ color: 0x3d3d40, flatShading: true });
      for (let blade = 0; blade < 2; blade++) {
        const ba = blade * Math.PI;
        const bladeGeo = new THREE.BufferGeometry();
        const cos_a = Math.cos(ba), sin_a = Math.sin(ba);
        const perpB = [-sin_a, cos_a];
        // Blade from center to tip
        const positions = [
          // Triangle 1
          perpB[0] * bladeHw * 0.3, perpB[1] * bladeHw * 0.3, 0,
          propR * cos_a + perpB[0] * bladeHw, propR * sin_a + perpB[1] * bladeHw, 0,
          propR * cos_a - perpB[0] * bladeHw, propR * sin_a - perpB[1] * bladeHw, 0,
          // Triangle 2
          perpB[0] * bladeHw * 0.3, perpB[1] * bladeHw * 0.3, 0,
          -perpB[0] * bladeHw * 0.3, -perpB[1] * bladeHw * 0.3, 0,
          propR * cos_a - perpB[0] * bladeHw, propR * sin_a - perpB[1] * bladeHw, 0,
          // Other half
          -perpB[0] * bladeHw * 0.3, -perpB[1] * bladeHw * 0.3, 0,
          -propR * cos_a + perpB[0] * bladeHw, -propR * sin_a + perpB[1] * bladeHw, 0,
          -propR * cos_a - perpB[0] * bladeHw, -propR * sin_a - perpB[1] * bladeHw, 0,
          -perpB[0] * bladeHw * 0.3, -perpB[1] * bladeHw * 0.3, 0,
          perpB[0] * bladeHw * 0.3, perpB[1] * bladeHw * 0.3, 0,
          -propR * cos_a + perpB[0] * bladeHw, -propR * sin_a + perpB[1] * bladeHw, 0,
        ];
        bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        bladeGeo.computeVertexNormals();
        bladeGroup.add(new THREE.Mesh(bladeGeo, bladeMat));
      }
      bladeGroup.position.set(mp[0], -propZ, -mp[1]);
      bladeGroup.rotation.x = -Math.PI / 2;
      this.group.add(bladeGroup);
      this.propBlades.push(bladeGroup);
    }

    // Landing gear: two sets of legs + skids under motors 0 and 1
    for (const idx of [0, 1]) {
      const mp = C.MOTOR_POSITIONS[idx];
      const mpNorm = Math.sqrt(mp[0] * mp[0] + mp[1] * mp[1]);
      const ad = [mp[0] / mpNorm, mp[1] / mpNorm];
      const gearDrop = 0.06;
      const gearLen = 0.12;
      const legHw = 0.004;

      const legTopPos = [mp[0] * 0.6, mp[1] * 0.6, 0];
      const legBotPos = [legTopPos[0], legTopPos[1], gearDrop];
      const skidEnd = [legBotPos[0] + ad[0] * gearLen, legBotPos[1] + ad[1] * gearLen, gearDrop];

      const segments: [number[], number[]][] = [
        [legTopPos, legBotPos],
        [legBotPos, skidEnd],
      ];

      for (const [s, e] of segments) {
        const dx = e[0] - s[0], dy = e[1] - s[1], dz = e[2] - s[2];
        const segLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (segLen < 1e-6) continue;

        const segDir = [dx / segLen, dy / segLen, dz / segLen];
        const up = [0, 0, -1];
        let side = [
          segDir[1] * up[2] - segDir[2] * up[1],
          segDir[2] * up[0] - segDir[0] * up[2],
          segDir[0] * up[1] - segDir[1] * up[0],
        ];
        const sn = Math.sqrt(side[0] * side[0] + side[1] * side[1] + side[2] * side[2]);
        if (sn < 1e-6) {
          side = [-ad[1], ad[0], 0];
        } else {
          side = [side[0] / sn, side[1] / sn, side[2] / sn];
        }

        const top = [
          new THREE.Vector3(s[0] + side[0] * legHw + up[0] * legHw, s[1] + side[1] * legHw + up[1] * legHw, s[2] + side[2] * legHw + up[2] * legHw),
          new THREE.Vector3(s[0] - side[0] * legHw + up[0] * legHw, s[1] - side[1] * legHw + up[1] * legHw, s[2] - side[2] * legHw + up[2] * legHw),
          new THREE.Vector3(e[0] - side[0] * legHw + up[0] * legHw, e[1] - side[1] * legHw + up[1] * legHw, e[2] - side[2] * legHw + up[2] * legHw),
          new THREE.Vector3(e[0] + side[0] * legHw + up[0] * legHw, e[1] + side[1] * legHw + up[1] * legHw, e[2] + side[2] * legHw + up[2] * legHw),
        ];
        const bot = top.map(v => new THREE.Vector3(
          v.x - up[0] * legHw * 2,
          v.y - up[1] * legHw * 2,
          v.z - up[2] * legHw * 2,
        ));
        this.group.add(this._nedToThree(makeBoxPrism(top, bot, LANDING_GEAR_COLOR)));
      }
    }

    // Forward indicator: triangular prism on top of body
    const fwdZ = bodyZt - 0.002;
    const fwdTop = [
      new THREE.Vector3(0.05, 0.006, fwdZ),
      new THREE.Vector3(0.05, -0.006, fwdZ),
      new THREE.Vector3(0.08, 0.0, fwdZ),
    ];
    const fwdBot = fwdTop.map(v => new THREE.Vector3(v.x, v.y, fwdZ + 0.004));
    this.group.add(this._nedToThree(makeBoxPrism(fwdTop, fwdBot, FWD_COLOR)));

    // Shadow
    const shadowGeo = new THREE.CircleGeometry(0.3, 24);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x0a1905,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    scene.add(this.shadow);

    scene.add(this.group);
  }

  private _nedToThree(obj: THREE.Object3D): THREE.Object3D {
    // NED (x=fwd, y=right, z=down) → Three.js (x=fwd, y=up, z=back-ish)
    // Apply transform: Three.x = NED.x, Three.y = -NED.z, Three.z = -NED.y
    const wrapper = new THREE.Group();
    wrapper.scale.set(1, 1, 1);
    // Rotate to convert NED to Three.js Y-up
    wrapper.rotation.set(-Math.PI / 2, 0, 0);
    // But we need: x→x, y→-z(NED), z→-y(NED)
    // rotation of -90° around X converts (x,y,z) to (x,-z,y)
    // but NED z is down, Three y is up, so: Three.y = -NED.z → we need -z from NED
    // After -90° X rotation: new_y = -old_z, new_z = old_y
    // So NED (x, y, z) → Three (x, -z, y) which gives: fwd=fwd, up=-down=up, right→back
    // That's (NED.x, -NED.z, NED.y) = (fwd, up, right) — correct for Three.js!
    wrapper.add(obj);
    return wrapper;
  }

  private _nedCylinder(
    centerXY: number[], radius: number, zTop: number, zBot: number,
    segments: number, color: number
  ): THREE.Object3D {
    const height = zBot - zTop; // NED: zBot > zTop means cylinder goes downward
    const geo = new THREE.CylinderGeometry(radius, radius, Math.abs(height), segments);
    const mat = new THREE.MeshStandardMaterial({ color, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    // In NED, center of cylinder is at (centerXY, (zTop+zBot)/2)
    // Convert to Three.js: x=NED.x, y=-NED.z, z=-NED.y
    const nedZ = (zTop + zBot) / 2;
    mesh.position.set(centerXY[0], -nedZ, -centerXY[1]);
    return mesh;
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

    // Animate props
    const maxOmega = C.MOTOR_MAX_OMEGA;
    for (let i = 0; i < 4; i++) {
      const omega = motorOmegas[i] || 0;
      const omegaFrac = maxOmega > 0 ? Math.abs(omega) / maxOmega : 0;

      this.propAngles[i] += omega * dt * C.MOTOR_DIRECTIONS[i];

      // Disc visibility: transparent at low speed, semi-transparent blur at high speed
      const discMat = this.propDiscs[i].material as THREE.MeshStandardMaterial;
      if (omegaFrac > 0.25) {
        discMat.opacity = 0.15 + 0.35 * Math.min(1, omegaFrac);
        this.propBlades[i].visible = false;
      } else if (omegaFrac > 0.01) {
        discMat.opacity = 0;
        this.propBlades[i].visible = true;
        this.propBlades[i].rotation.z = this.propAngles[i];
      } else {
        discMat.opacity = 0;
        this.propBlades[i].visible = true;
        this.propBlades[i].rotation.z = this.propAngles[i];
      }
    }

    // Shadow
    this.shadow.position.set(position[0], 0.01, -position[1]);
    const alt = -position[2];
    const shadowSize = Math.max(0.15, 0.30 - alt * 0.005);
    this.shadow.scale.set(shadowSize / 0.3, shadowSize / 0.3, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
      0,
      Math.min(0.5, 0.5 - alt * 0.015)
    );
  }
}
