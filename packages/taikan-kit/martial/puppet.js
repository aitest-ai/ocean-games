// 武術用的全身模擬人偶：鍵盤模擬、「怎麼玩」示範動畫與自動測試共用。
//
// 跟 src/puppet.js（只動上半身）不同，這個人偶有腿，而且用 3D 關節再投影到畫面：
// 正面出拳時手是「往鏡頭」伸，畫面上看起來手臂會變短、手肘抬到肩膀高度，
// 這正是單鏡頭要辨識的樣子，所以模擬測到的是真正的難點，不是作弊的側面動作。
//
// 身體座標：原點＝站直時兩肩中點，單位＝肩寬，x 向畫面右、y 向下、z 朝鏡頭（正值＝靠近鏡頭）。
// 輸出的 pose 跟鏡頭一樣是鏡像正規化座標（玩家自己的左手在畫面左邊）。
import { KEYPOINTS } from '../src/pose.js';

const ARM = [0.72, 0.68];   // 上臂、前臂
const LEG = [1.1, 1.05];    // 大腿、小腿
const CAM = 8;              // 鏡頭距離（肩寬）：約 2.5 公尺
const HIP_Y = 1.35, ANKLE_Y = 3.5;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => scale(a, 1 / (Math.hypot(...a) || 1));

// 兩節 IK：從 root 伸到 target，關節往 pole 方向彎
export function ik(root, target, [l1, l2], pole) {
  const d = sub(target, root);
  const dist = Math.min(Math.max(Math.hypot(...d), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const dir = norm(d);
  const end = add(root, scale(dir, dist));
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  const p = norm(sub(pole, scale(dir, dot(pole, dir))));
  return { mid: add(add(root, scale(dir, a)), scale(p, h)), end };
}

// 一次性動作：出拳、提膝（時間比例 → 0~1 的伸展量）
const ANIMS = {
  'punch-left': { ms: 460 }, 'punch-right': { ms: 460 },
  'knee-left': { ms: 900 }, 'knee-right': { ms: 900 },
};
// 出拳曲線：0.3 前伸到底、停一下、收回
const punchCurve = (u) => (u < 0.3 ? ease(u / 0.3) : u < 0.55 ? 1 : 1 - ease((u - 0.55) / 0.45));
const kneeCurve = (u) => (u < 0.35 ? ease(u / 0.35) : u < 0.65 ? 1 : 1 - ease((u - 0.65) / 0.35));

export class MartialPuppet {
  // yaw：從斜前方看（弧度）。鏡頭模擬一律 0（正面）；示範動畫用 0.5 左右，讓「往前出拳」看得出手臂伸出去
  constructor({ seed = 1, jitter = 0.003, cx = 0.5, cy = 0.33, size = 0.115, yaw = 0 } = {}) {
    this.rand = rng(seed);
    Object.assign(this, { jitter, cx, cy, size, yaw });
    // 按住類：wide 腳張開、down 往下蹲、up 站起來、leanFwd 上身前傾、kneesIn 膝蓋內夾、raiseL/R 舉手
    this.hold = { wide: false, down: false, up: false, leanFwd: false, kneesIn: false, raiseL: false, raiseR: false };
    this.seated = false;
    this.width = 0; this.depth = 0; this.lean = 0; this.raiseL = 0; this.raiseR = 0;
    this.targetDepth = null; // 示範動畫直接指定蹲的深度（0~1）
    this.anims = [];
    this.t = 0;
  }

  set(key, on) { this.hold[key] = on; }
  trigger(name, t = this.t) { if (ANIMS[name]) { this.anims = this.anims.filter((a) => a.name !== name); this.anims.push({ name, at: t }); } }
  gauss() { const u = Math.max(this.rand(), 1e-9), v = this.rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  amount(name, t) {
    const a = this.anims.find((x) => x.name === name);
    if (!a) return 0;
    const u = (t - a.at) / ANIMS[name].ms;
    if (u >= 1) { this.anims = this.anims.filter((x) => x !== a); return 0; }
    return name.startsWith('punch') ? punchCurve(u) : kneeCurve(u);
  }

  // 推進到時間 t（毫秒），回傳 pose（另附 pose.body：3D 關節，給場景或除錯用）
  step(t) {
    const dt = Math.min(Math.max((t - this.t) / 1000, 0), 0.1);
    this.t = t;
    const H = this.hold;
    const approach = (cur, target, rate) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
    this.width = approach(this.width, H.wide || this.targetDepth > 0 ? 1 : 0, 6);
    if (this.targetDepth !== null) this.depth = approach(this.depth, this.targetDepth, 4);
    else if (H.down && this.width > 0.5) this.depth = Math.min(this.depth + dt * 0.45, 1.2);
    else if (H.up || this.width < 0.5) this.depth = Math.max(this.depth - dt * 0.8, 0);
    this.lean = approach(this.lean, H.leanFwd ? 1 : 0, 6);
    this.raiseL = approach(this.raiseL, H.raiseL ? 1 : 0, 12);
    this.raiseR = approach(this.raiseR, H.raiseR ? 1 : 0, 12);

    const J = {};
    const seated = this.seated;
    // 骨盆：坐著時整個上半身下移；馬步時依深度下移
    const drop = seated ? 0.95 : this.depth * 0.78;
    const hipY = HIP_Y + drop;
    const hips = { left: [-0.32, hipY, 0], right: [0.32, hipY, 0] };
    // 上半身往前傾（朝鏡頭）：繞髖部中點旋轉
    const phi = this.lean * 0.55, cp = Math.cos(phi), sp = Math.sin(phi);
    const upper = ([x, y, z]) => {
      const dy = y + drop - hipY, dz = z;
      return [x, hipY + dy * cp + dz * sp, dz * cp - dy * sp];
    };
    const sh = { left: upper([-0.5, 0, 0]), right: upper([0.5, 0, 0]) };
    J.nose = upper([0, -0.62, 0.15]);
    J.leftEye = upper([-0.12, -0.74, 0.12]); J.rightEye = upper([0.12, -0.74, 0.12]);
    J.leftEar = upper([-0.33, -0.66, 0]); J.rightEar = upper([0.33, -0.66, 0]);
    J.leftShoulder = sh.left; J.rightShoulder = sh.right;

    // 手臂：預設「抱拳收腰」；出拳＝往鏡頭伸直（手肘留一點彎）；舉手＝舉過頭
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      const S = sh[side];
      const chamber = upper([s * 0.55, 1.12, -0.12]);
      const punch = add(S, [-s * 0.3, 0.1, 1.3]);
      const up = upper([s * 0.45, -1.35, 0.1]);
      const p = this.amount('punch-' + side, t);
      const r = side === 'left' ? this.raiseL : this.raiseR;
      let w = mix3(chamber, punch, p);
      w = mix3(w, up, ease(r));
      // 手肘：收腰時往後、出拳時往下、舉手時往外
      const pole = norm(add(add(scale([s * 0.5, 0, -1], 1 - p), scale([s * 0.4, 1, 0], p)), scale([s, 0, 0], r)));
      const a = ik(S, w, ARM, pole);
      J[side + 'Elbow'] = a.mid; J[side + 'Wrist'] = a.end;
    }

    // 腿：腳張開（馬步寬度約兩倍肩寬）、膝蓋往外推並朝前，內夾時往內
    for (const side of ['left', 'right']) {
      const s = side === 'left' ? -1 : 1;
      const hip = hips[side];
      J[side + 'Hip'] = hip;
      const k = this.amount('knee-' + side, t);
      if (seated) {
        J[side + 'Knee'] = [s * 0.42, hipY, 1.1];
        J[side + 'Ankle'] = mix3([s * 0.46, ANKLE_Y, 1.15], [s * 0.42, hipY + 0.55, 1.6], k);
        continue;
      }
      const fw = lerp(0.34, 1.05, ease(this.width));
      let ankle = [s * fw, ANKLE_Y, 0];
      // 從腳踝往上解：小腿接近垂直、膝蓋朝前並對準腳尖（往外）；內夾時膝蓋往內倒
      const out = H.kneesIn ? -1.2 : 0.75;
      let pole = norm([s * out, -1, 0.5]);
      if (k > 0) {
        // 提膝：膝蓋抬到接近髖部高度、往前
        ankle = mix3(ankle, [s * 0.34, hipY + 0.95, 0.75], k);
        pole = norm(mix3(pole, [0, -0.3, 1], k));
      }
      const l = ik(ankle, hip, [LEG[1], LEG[0]], pole);
      J[side + 'Knee'] = l.mid; J[side + 'Ankle'] = ankle;
    }

    // 投影到鏡像畫面：近大遠小
    const kp = {};
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    for (const name of KEYPOINTS) {
      const [x0, y, z0] = J[name];
      const x = x0 * cy + z0 * sy, z = z0 * cy - x0 * sy;
      const s = CAM / (CAM - z);
      const px = this.cx + x * this.size * s + this.gauss() * this.jitter;
      const py = this.cy + y * this.size * s + this.gauss() * this.jitter;
      const inFrame = px > 0.005 && px < 0.995 && py > 0.005 && py < 0.995;
      kp[name] = { x: px, y: py, v: inFrame ? 0.95 : 0.05 };
    }
    return { t, kp, body: J };
  }
}

// 腳本：[[時間ms, 動作], ...] → pose 序列（自動測試用）
// 動作：'punch-left' 等一次性動作、'hold:wide:on'、'depth:0.6'（直接指定深度）、'seated:on'
export function scriptMartial(script, { durationMs, fps = 30, seed = 1, jitter = 0.003, ...opts } = {}) {
  const pup = new MartialPuppet({ seed, jitter, ...opts });
  const out = [];
  const queue = [...script].sort((a, b) => a[0] - b[0]);
  for (let t = 0; t <= durationMs; t += 1000 / fps) {
    while (queue.length && queue[0][0] <= t) applyAction(pup, queue.shift()[1], t);
    out.push(pup.step(t));
  }
  return out;
}

export function applyAction(pup, a, t) {
  if (a.startsWith('hold:')) { const [, k, v] = a.split(':'); pup.set(k, v === 'on'); }
  else if (a.startsWith('depth:')) pup.targetDepth = a === 'depth:off' ? null : Number(a.slice(6));
  else if (a.startsWith('seated:')) pup.seated = a === 'seated:on';
  else pup.trigger(a, t);
}
