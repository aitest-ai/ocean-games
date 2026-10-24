// 球員人偶（可重用）：膠囊組成的簡單人形，手腳用「兩節 IK」接到指定的手、腳位置。
// 擺姿勢只要給：髖部高度與轉向、上半身轉向／前彎、雙手位置（上半身座標）、雙腳位置（人偶座標）。
// 姿勢可以互相內插，所以打擊、投球、捕手蹲姿都只要寫幾個關鍵姿勢。
//
// 人偶座標：原點在兩腳中間地面，+z = 面向前方，+x = 人偶自己的左手邊。
import * as THREE from './three.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Figure {
  constructor({ jersey = '#f2f2f2', pants = '#d9d9d9', cap = '#1d4f91', skin = '#e2b48c', shoes = '#222222', helmet = false, mitt = false, bat = false, scale = 1, castShadow = true } = {}) {
    const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.75, ...o });
    this.mats = { jersey: m(jersey), pants: m(pants), cap: m(cap, { roughness: 0.5 }), skin: m(skin, { roughness: 0.7 }), shoes: m(shoes), mitt: m('#6b3f1f'), bat: m('#c8a26b', { roughness: 0.45 }) };
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    // 國小高年級身材（約 145 公分）
    this.L = { hip: 0.74, torso: 0.44, shoulder: 0.165, upper: 0.25, fore: 0.23, thigh: 0.36, shin: 0.37, hipW: 0.09, head: 0.105 };
    const L = this.L;
    this.pelvis = new THREE.Group(); this.root.add(this.pelvis);
    this.torso = new THREE.Group(); this.pelvis.add(this.torso);
    const add = (parent, geo, mat) => { const x = new THREE.Mesh(geo, mat); x.castShadow = castShadow; parent.add(x); return x; };
    add(this.pelvis, new THREE.CapsuleGeometry(0.115, 0.08, 4, 10).rotateZ(Math.PI / 2), this.mats.pants).position.y = 0.0;
    const chest = add(this.torso, new THREE.CapsuleGeometry(0.135, L.torso - 0.2, 4, 12), this.mats.jersey);
    chest.position.y = L.torso / 2; chest.scale.set(1.15, 1, 0.78);
    this.headG = new THREE.Group(); this.headG.position.y = L.torso + 0.13; this.torso.add(this.headG);
    add(this.torso, new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), this.mats.skin).position.y = L.torso + 0.02;
    add(this.headG, new THREE.SphereGeometry(L.head, 16, 12), this.mats.skin);
    if (helmet) {
      const h = add(this.headG, new THREE.SphereGeometry(L.head * 1.12, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), this.mats.cap);
      h.position.y = 0.01;
      const flap = add(this.headG, new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), this.mats.cap); flap.rotation.z = Math.PI / 2; flap.position.set(helmet === 'right' ? -0.1 : 0.1, -0.03, 0);
      add(this.headG, new THREE.BoxGeometry(0.16, 0.012, 0.07), this.mats.cap).position.set(0, 0.035, 0.12);
    } else {
      add(this.headG, new THREE.SphereGeometry(L.head * 1.04, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), this.mats.cap).position.y = 0.02;
      add(this.headG, new THREE.BoxGeometry(0.15, 0.012, 0.1), this.mats.cap).position.set(0, 0.03, 0.12);
    }
    // 四肢：每節一個膠囊，每格依 IK 結果擺位置
    const seg = (r, len, mat) => { const g = new THREE.CapsuleGeometry(r, len, 4, 8); return add(this.root, g, mat); };
    this.limbs = {
      lUpper: seg(0.048, L.upper - 0.05, this.mats.jersey), lFore: seg(0.04, L.fore - 0.04, this.mats.skin),
      rUpper: seg(0.048, L.upper - 0.05, this.mats.jersey), rFore: seg(0.04, L.fore - 0.04, this.mats.skin),
      lThigh: seg(0.066, L.thigh - 0.07, this.mats.pants), lShin: seg(0.055, L.shin - 0.06, this.mats.pants),
      rThigh: seg(0.066, L.thigh - 0.07, this.mats.pants), rShin: seg(0.055, L.shin - 0.06, this.mats.pants),
    };
    this.lHand = add(this.root, new THREE.SphereGeometry(mitt ? 0.085 : 0.042, 10, 8), mitt ? this.mats.mitt : this.mats.skin);
    if (mitt) this.lHand.scale.set(1, 1.15, 0.6);
    this.rHand = add(this.root, new THREE.SphereGeometry(0.042, 10, 8), this.mats.skin);
    this.lFoot = add(this.root, new THREE.BoxGeometry(0.09, 0.07, 0.22), this.mats.shoes);
    this.rFoot = add(this.root, new THREE.BoxGeometry(0.09, 0.07, 0.22), this.mats.shoes);
    if (bat) {
      // 少棒球棒約 76 公分；握把在原點，往 +y 延伸
      const g = new THREE.CylinderGeometry(0.031, 0.016, 0.76, 12).translate(0, 0.38 - 0.06, 0);
      this.bat = add(this.root, g, this.mats.bat);
    }
    this.p = {};
    this.v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), d: new THREE.Vector3(), q: new THREE.Quaternion() };
  }

  // pose：{ hipY, hipX, hipZ, yaw, torsoYaw, bend, lean, headYaw, lHand, rHand, lFoot, rFoot, batTip }
  //   lHand / rHand / batTip：上半身座標（原點在胸口下方、+z 前、+x 自己的左邊）
  //   lFoot / rFoot：人偶座標的地面位置 [x, z]
  set(pose) {
    const P = (this.p = pose), L = this.L;
    this.pelvis.position.set(P.hipX || 0, P.hipY ?? L.hip, P.hipZ || 0);
    this.pelvis.rotation.set(0, P.yaw || 0, 0);
    this.torso.rotation.set(P.bend || 0, P.torsoYaw || 0, P.lean || 0, 'YXZ');
    this.headG.rotation.set(P.headPitch || 0, P.headYaw || 0, 0);
    this.root.updateMatrixWorld(true);
    const toRoot = (obj, local, out) => {
      out.set(...local);
      obj.localToWorld(out);
      return this.root.worldToLocal(out);
    };
    const v = this.v;
    // 手臂：肩膀 → 手
    for (const side of ['l', 'r']) {
      const sx = side === 'l' ? 1 : -1;
      const sh = toRoot(this.torso, [sx * L.shoulder, L.torso - 0.05, 0], v.a.clone());
      const hand = toRoot(this.torso, P[side + 'Hand'] || [sx * 0.2, 0.0, 0.05], v.b.clone());
      const pole = toRoot(this.torso, [sx * 0.6, -0.3, -0.4], v.c.clone());
      const elbow = ik(sh, hand, L.upper, L.fore, pole);
      place(this.limbs[side + 'Upper'], sh, elbow);
      place(this.limbs[side + 'Fore'], elbow, hand);
      (side === 'l' ? this.lHand : this.rHand).position.copy(hand);
      if (side === 'l') this._lh = hand; else this._rh = hand;
    }
    // 腳：髖 → 腳踝
    for (const side of ['l', 'r']) {
      const sx = side === 'l' ? 1 : -1;
      const hip = toRoot(this.pelvis, [sx * L.hipW, -0.02, 0], v.a.clone());
      const f = P[side + 'Foot'] || [sx * 0.15, 0];
      const ankle = new THREE.Vector3(f[0], 0.07, f[1]);
      const pole = hip.clone().add(new THREE.Vector3(Math.sin((P.yaw || 0) + (f[2] || 0)) * 0.6, 0, Math.cos((P.yaw || 0) + (f[2] || 0)) * 0.6));
      const knee = ik(hip, ankle, L.thigh, L.shin, pole);
      place(this.limbs[side + 'Thigh'], hip, knee);
      place(this.limbs[side + 'Shin'], knee, ankle);
      const foot = side === 'l' ? this.lFoot : this.rFoot;
      foot.position.set(f[0], 0.035, f[1]);
      foot.rotation.set(0, (P.yaw || 0) + (f[2] || 0), 0);
    }
    if (this.bat) {
      // 球棒握在兩手之間，指向 batTip（上半身座標）
      const grip = this._lh.clone().add(this._rh).multiplyScalar(0.5);
      const tip = toRoot(this.torso, P.batTip || [0, 0.8, -0.2], v.d.clone());
      const dir = tip.sub(grip).normalize();
      this.bat.position.copy(grip);
      this.bat.quaternion.setFromUnitVectors(UP, dir);
    }
  }

  // 球棒甜蜜點的世界座標（打擊判定的畫面用）
  batPoint(out = new THREE.Vector3(), along = 0.55) {
    if (!this.bat) return out;
    out.set(0, along, 0);
    return this.bat.localToWorld(out);
  }
  handWorld(side, out = new THREE.Vector3()) { return (side === 'l' ? this.lHand : this.rHand).getWorldPosition(out); }
}

// 兩節 IK：已知起點 a、終點 b、兩節長度，回傳中間關節（往 pole 那邊彎）
function ik(a, b, l1, l2, pole) {
  const d = b.clone().sub(a);
  let len = d.length();
  const maxLen = (l1 + l2) * 0.999;
  if (len > maxLen) { d.multiplyScalar(maxLen / len); len = maxLen; b = a.clone().add(d); }
  len = Math.max(len, Math.abs(l1 - l2) + 1e-3);
  const dir = d.clone().normalize();
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  const toPole = pole.clone().sub(a);
  const perp = toPole.sub(dir.clone().multiplyScalar(toPole.dot(dir))).normalize();
  if (!isFinite(perp.x)) perp.set(0, 0, 1);
  return a.clone().add(dir.multiplyScalar(x)).add(perp.multiplyScalar(h));
}

// 把一節膠囊放在 p→q 之間
function place(mesh, p, q) {
  mesh.position.copy(p).add(q).multiplyScalar(0.5);
  const d = q.clone().sub(p);
  if (d.lengthSq() < 1e-8) return;
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
}

// 姿勢內插（數字與陣列逐項內插）
export function mixPose(a, b, t) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? b[k], y = b[k] ?? a[k];
    out[k] = Array.isArray(x) ? x.map((v, i) => v + ((y[i] ?? v) - v) * t) : x + (y - x) * t;
  }
  return out;
}

// 依時間在一串關鍵姿勢間播放：keys = [[秒, pose], ...]
export function samplePose(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1] = keys[i + 1];
    if (t <= t1) { const u = (t - t0) / (t1 - t0); return mixPose(p0, p1, u * u * (3 - 2 * u)); }
  }
  return keys[keys.length - 1][1];
}
