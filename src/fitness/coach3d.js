// 示範人偶與怪獸的 3D 小舞台（three.js，MIT；人偶重用 src/land/figure.js）。
//
// 示範人偶的動作直接來自「合成人體」（packages/taikan-kit/src/exercise/synth.js）：
// 鍵盤模擬、自動測試、示範動畫都是同一套動作，所以人偶示範的就是辨識器要看的標準動作。
// 怪獸全部用基本幾何形狀組成（不用任何外部模型或圖片）。
import * as THREE from '../land/three.js';
import { Figure } from '../land/figure.js';
import { MOTIONS, buildJoints, torsoFrame, BODY } from '../../packages/taikan-kit/src/exercise/synth.js';
import { MONSTERS } from './levels.js';
import { DEMOS, DEMO_YAW, SEATED_DEMOS } from './demos.js';

const K = 0.74 / (BODY.ankle + BODY.shin + BODY.thigh); // 合成人體（成人）→ figure.js 的身材比例
const UP = new THREE.Vector3(0, 1, 0);

// figure.js 的腳永遠踩在地上；健身動作要抬腳（側抬腿、踏步、伸展），所以這裡擴充一下（不改原檔）
class FitFigure extends Figure {
  set(pose) {
    super.set(pose);
    const L = this.L;
    for (const side of ['l', 'r']) {
      const lift = pose[side + 'FootY'];
      if (!(lift > 0.08)) continue;
      const sx = side === 'l' ? 1 : -1;
      const hip = new THREE.Vector3(sx * L.hipW, -0.02, 0);
      this.pelvis.localToWorld(hip); this.root.worldToLocal(hip);
      const f = pose[side + 'Foot'];
      const ankle = new THREE.Vector3(f[0], lift, f[1]);
      const pole = pose[side + 'KneeDir'] ? new THREE.Vector3(...pose[side + 'KneeDir']).add(hip) : hip.clone().add(new THREE.Vector3(0, 0, 0.6));
      const knee = ik(hip, ankle, L.thigh, L.shin, pole);
      place(this.limbs[side + 'Thigh'], hip, knee);
      place(this.limbs[side + 'Shin'], knee, ankle);
      const foot = side === 'l' ? this.lFoot : this.rFoot;
      foot.position.copy(ankle).add(new THREE.Vector3(0, -0.035, 0.03));
    }
  }
}
function ik(a, b, l1, l2, pole) {
  const d = b.clone().sub(a);
  let len = Math.min(d.length(), (l1 + l2) * 0.999);
  len = Math.max(len, Math.abs(l1 - l2) + 1e-3);
  const dir = d.normalize();
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(l1 * l1 - x * x, 0));
  const tp = pole.clone().sub(a);
  const perp = tp.sub(dir.clone().multiplyScalar(tp.dot(dir))).normalize();
  if (!isFinite(perp.x)) perp.set(0, 0, 1);
  return a.clone().add(dir.multiplyScalar(x)).add(perp.multiplyScalar(h));
}
function place(mesh, p, q) {
  mesh.position.copy(p).add(q).multiplyScalar(0.5);
  const d = q.clone().sub(p);
  if (d.lengthSq() > 1e-8) mesh.quaternion.setFromUnitVectors(UP, d.normalize());
}

// 手臂幾乎伸直時，把手放到人偶手臂的全長（兩邊身材比例不同，不然手肘會彎得很奇怪）
const ARM_FIG = 0.25 + 0.23, ARM_SYN = (BODY.upper + BODY.fore) * K;
function reach(h, sx) {
  const sh = [sx * 0.165, 0.39, 0];
  const d = [h[0] - sh[0], h[1] - sh[1], h[2] - sh[2]], L = Math.hypot(...d);
  if (L < ARM_SYN * 0.85) return h;
  const k = (ARM_FIG * 0.995) / L;
  return [sh[0] + d[0] * k, sh[1] + d[1] * k, sh[2] + d[2] * k];
}

// 合成人體的姿勢 → figure.js 的姿勢
export function specToFigure(spec) {
  const j = buildJoints(spec);
  const { up, lat, fwd } = torsoFrame(spec);
  const P = spec.pelvis;
  const local = (w) => { const v = [w[0] - P[0], w[1] - P[1], w[2] - P[2]]; return [lat[0] * v[0] + lat[1] * v[1] + lat[2] * v[2], up[0] * v[0] + up[1] * v[1] + up[2] * v[2], fwd[0] * v[0] + fwd[1] * v[1] + fwd[2] * v[2]].map((x) => x * K); };
  return {
    hipX: P[0] * K, hipY: P[1] * K, hipZ: P[2] * K,
    bend: spec.pitch || 0, lean: -(spec.roll || 0), headPitch: spec.head || 0,
    lHand: reach(local(j.leftWrist), 1), rHand: reach(local(j.rightWrist), -1),
    lFoot: [spec.lFoot[0] * K, spec.lFoot[2] * K], rFoot: [spec.rFoot[0] * K, spec.rFoot[2] * K],
    lFootY: spec.lFoot[1] * K, rFootY: spec.rFoot[1] * K,
    lKneeDir: spec.lKnee, rKneeDir: spec.rKnee,
  };
}

function makeMonster(id) {
  const M = MONSTERS[id] || MONSTERS.slime;
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: M.body, roughness: 0.6, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1d2228', roughness: 0.7 });
  const add = (geo, m = mat, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  let eyeY = 0.55, eyeZ = 0.36, eyeX = 0.15;
  if (M.shape === 'blob') { add(new THREE.SphereGeometry(0.45, 24, 16)).scale.set(1.15, 0.8, 1); g.children[0].position.y = 0.36; eyeY = 0.45; eyeZ = 0.38; }
  else if (M.shape === 'remote') {
    add(new THREE.BoxGeometry(0.42, 0.95, 0.24), mat, 0, 0.5, 0); eyeY = 0.82; eyeZ = 0.13; eyeX = 0.1;
    ['#ff5a4f', '#5fd39a', '#ffd166', '#7fd4ff'].forEach((c, i) => add(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: c }), (i % 2 ? 0.08 : -0.08), 0.48 - Math.floor(i / 2) * 0.12, 0.125));
  } else if (M.shape === 'bag') {
    add(new THREE.BoxGeometry(0.75, 0.8, 0.35), mat, 0, 0.42, 0).scale.set(1, 1, 1);
    add(new THREE.ConeGeometry(0.4, 0.18, 4), mat, 0, 0.9, 0).rotation.y = Math.PI / 4; eyeY = 0.6; eyeZ = 0.18;
  } else if (M.shape === 'sofa') {
    add(new THREE.BoxGeometry(1.1, 0.32, 0.6), mat, 0, 0.22, 0);
    add(new THREE.BoxGeometry(1.1, 0.55, 0.18), mat, 0, 0.6, -0.22);
    add(new THREE.BoxGeometry(0.16, 0.42, 0.6), mat, 0.55, 0.36, 0); add(new THREE.BoxGeometry(0.16, 0.42, 0.6), mat, -0.55, 0.36, 0);
    eyeY = 0.7; eyeZ = -0.12; eyeX = 0.2;
  } else {
    add(new THREE.BoxGeometry(0.95, 0.65, 0.12), dark, 0, 0.75, 0);
    const face = add(new THREE.PlaneGeometry(0.85, 0.55), new THREE.MeshStandardMaterial({ color: M.body, emissive: new THREE.Color(M.body), emissiveIntensity: 0.6 }), 0, 0.75, 0.061);
    g.userData.face = face;
    add(new THREE.CylinderGeometry(0.03, 0.05, 0.4, 8), dark, 0, 0.25, 0);
    add(new THREE.CylinderGeometry(0.25, 0.28, 0.05, 16), dark, 0, 0.03, 0);
    eyeY = 0.8; eyeZ = 0.07; eyeX = 0.17;
  }
  const white = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 }), black = new THREE.MeshStandardMaterial({ color: '#111111' });
  for (const sx of [-1, 1]) {
    const e = add(new THREE.SphereGeometry(0.075, 14, 10), white, sx * eyeX, eyeY, eyeZ);
    if (M.eye === 'sleepy') e.scale.y = 0.45;
    const p = add(new THREE.SphereGeometry(0.035, 10, 8), black, sx * eyeX + (M.eye === 'shifty' ? 0.02 : 0), eyeY - (M.eye === 'sleepy' ? 0.01 : 0), eyeZ + 0.06);
    if (M.eye === 'grumpy') { const brow = add(new THREE.BoxGeometry(0.12, 0.02, 0.02), black, sx * eyeX, eyeY + 0.09, eyeZ + 0.04); brow.rotation.z = sx * 0.4; }
    void p;
  }
  g.userData.mat = mat;
  return g;
}

export class CoachStage {
  constructor(canvas) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    this.camera.position.set(0.25, 1.15, 4.1);
    this.camera.lookAt(0.25, 0.75, 0);
    this.scene.add(new THREE.HemisphereLight('#dfefff', '#2a2f38', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(2, 4, 3); this.scene.add(sun);
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.02, 48), new THREE.MeshStandardMaterial({ color: '#24414f', roughness: 0.9 }));
    mat.position.y = -0.01; this.scene.add(mat);
    this.coach = new FitFigure({ jersey: '#2b8a6e', pants: '#24303c', cap: '#2a2a2a', skin: '#d9a77f', shoes: '#f2f2f2', scale: 1.15, castShadow: false });
    this.coach.root.position.set(-0.55, 0, 0);
    this.scene.add(this.coach.root);
    // 坐姿動作用的椅子（簡單方塊）
    const wood = new THREE.MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.8 });
    this.chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.4), wood); seat.position.set(0, 0.37, -0.06); this.chair.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.04), wood); back.position.set(0, 0.6, -0.27); this.chair.add(back);
    for (const [x, z] of [[-0.18, 0.1], [0.18, 0.1], [-0.18, -0.24], [0.18, -0.24]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.37, 0.03), wood); leg.position.set(x, 0.185, z); this.chair.add(leg); }
    this.chair.visible = false;
    this.coach.root.add(this.chair);
    this.monster = null; this.monsterId = null;
    this.demo = 'idle'; this.queue = []; this.cur = null; this.t = 0;
    this.fx = []; this.hitT = 0; this.defeatT = 0;
    this.calm = false; // 減少閃爍與晃動
  }

  setMonster(id) {
    if (this.monster) this.scene.remove(this.monster);
    this.monster = makeMonster(id); this.monsterId = id;
    this.monster.position.set(0.95, 0, -0.2);
    this.monster.rotation.y = -0.35;
    this.scene.add(this.monster);
    this.defeatT = 0; this.monster.visible = true;
  }

  setDemo(name) { if (name !== this.demo) { this.demo = name; this.queue = []; this.cur = null; this.chair.visible = SEATED_DEMOS.has(name); } }

  // 技能命中：從人偶飛向怪獸的光球
  attack(color = '#ffb547', big = false) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.12 : 0.08, 16, 12), new THREE.MeshBasicMaterial({ color }));
    this.scene.add(m);
    this.fx.push({ m, t: 0, dur: 0.35, from: new THREE.Vector3(-0.35, 1.0, 0.2), to: new THREE.Vector3(0.95, 0.55, -0.1) });
  }

  defeat() { this.defeatT = 0.001; }

  // 深蹲蓄力：0～1
  setCharge(c) {
    if (!this.orb) { this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0.85 })); this.orb.position.set(-0.55, 1.75, 0); this.scene.add(this.orb); }
    this.orb.visible = c > 0.05;
    this.orb.scale.setScalar(0.4 + c * 1.4);
  }

  update(dt) {
    this.t += dt;
    // 示範動作：排程播放 DEMOS 裡的動作
    const tm = this.t * 1000;
    if (this.cur && tm - this.cur.start >= this.cur.ms) this.cur = null;
    if (!this.cur) {
      if (!this.queue.length) this.queue = (DEMOS[this.demo] || DEMOS.idle).map(([n, o, ms]) => ({ n, o, ms: ms ?? (MOTIONS[n]?.ms || 800) }));
      const q = this.queue.shift();
      this.cur = { ...q, start: tm };
    }
    const u = (tm - this.cur.start) / this.cur.ms;
    const spec = this.cur.n === 'stand' ? MOTIONS.squat.make(0, { depth: 0 }) : MOTIONS[this.cur.n].make(u, this.cur.o);
    this.coach.set(specToFigure(spec));
    const yaw = DEMO_YAW[this.demo] ?? 0;
    this.coach.root.rotation.y += (yaw - this.coach.root.rotation.y) * Math.min(dt * 4, 1);
    // 怪獸：待機上下晃、被打到縮一下並發光、被打倒縮小旋轉
    const M = this.monster;
    if (M) {
      const bob = this.calm ? 0 : Math.sin(this.t * 2.2) * 0.03;
      let sq = 1;
      if (this.hitT > 0) { this.hitT = Math.max(this.hitT - dt, 0); sq = 1 - this.hitT * 0.6; }
      M.userData.mat.emissiveIntensity = this.calm ? 0 : this.hitT * 1.5;
      if (this.defeatT > 0) {
        this.defeatT += dt;
        const k = Math.max(1 - this.defeatT / 1.2, 0);
        M.scale.setScalar(k); M.rotation.y += dt * (this.calm ? 1 : 6);
        if (k === 0) M.visible = false;
      } else {
        M.position.y = bob;
        M.scale.set(1 + (1 - sq) * 0.5, sq, 1 + (1 - sq) * 0.5);
        M.position.x = 0.95 + (this.hitT > 0 && !this.calm ? Math.sin(this.t * 60) * 0.03 : 0);
      }
    }
    for (const f of this.fx) {
      f.t += dt;
      const k = Math.min(f.t / f.dur, 1);
      f.m.position.lerpVectors(f.from, f.to, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 0.25, 0));
      if (k >= 1 && !f.done) { f.done = true; this.hitT = 0.3; this.scene.remove(f.m); }
    }
    this.fx = this.fx.filter((f) => !f.done);
  }

  render() {
    const c = this.canvas, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    const pr = Math.min(devicePixelRatio || 1, 1.5);
    if (c.width !== Math.round(w * pr) || c.height !== Math.round(h * pr)) { this.renderer.setPixelRatio(pr); this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    this.renderer.render(this.scene, this.camera);
  }
}
