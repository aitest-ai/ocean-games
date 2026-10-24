// 模擬人偶：用程式產生「假的骨架」，讓沒有鏡頭時（雲端、上課示範、自動測試）也能走完整條
// 「骨架 → 辨識 → 事件」流程。鍵盤模擬就是在操作這個人偶，所以測到的是真正的辨識邏輯。
import { KEYPOINTS } from './pose.js';

const U = 0.16; // 肩寬（佔畫面寬度的比例）

// 可重現的亂數（測試用）
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); };
}

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp2 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// 手部動畫：每個關鍵影格是 [時間比例, 左手腕, 右手腕]（身體座標，單位肩寬，y 向下）
const REST = { l: { x: -0.35, y: 0.9 }, r: { x: 0.35, y: 0.9 } };
const ANIMS = {
  'paddle-left': { ms: 520, keys: [[0, REST.l, REST.r], [0.3, { x: -0.95, y: -0.05 }, { x: -0.3, y: 0.0 }], [0.7, { x: -0.95, y: 1.3 }, { x: -0.3, y: 1.25 }], [1, REST.l, REST.r]] },
  'paddle-right': { ms: 520, keys: [[0, REST.l, REST.r], [0.3, { x: 0.3, y: 0.0 }, { x: 0.95, y: -0.05 }], [0.7, { x: 0.3, y: 1.25 }, { x: 0.95, y: 1.3 }], [1, REST.l, REST.r]] },
  'paddle-both': { ms: 560, keys: [[0, REST.l, REST.r], [0.3, { x: -0.85, y: -0.1 }, { x: 0.85, y: -0.1 }], [0.7, { x: -0.85, y: 1.25 }, { x: 0.85, y: 1.25 }], [1, REST.l, REST.r]] },
  'swing-left': { ms: 520, keys: [[0, REST.l, REST.r], [0.35, REST.l, { x: 1.0, y: 0.35 }], [0.7, REST.l, { x: -1.0, y: 0.45 }], [1, REST.l, REST.r]] },
  'swing-right': { ms: 520, keys: [[0, REST.l, REST.r], [0.35, { x: -1.0, y: 0.35 }, REST.r], [0.7, { x: 1.0, y: 0.45 }, REST.r], [1, REST.l, REST.r]] },
  'wave': { ms: 900, keys: [[0, REST.l, REST.r], [0.5, { x: -0.5, y: 0.2 }, { x: 0.5, y: 0.25 }], [1, REST.l, REST.r]] }, // 小幅亂動：不該觸發任何事件
};

export class Puppet {
  constructor({ seed = 1, jitter = 0.003, cx = 0.5, cy = 0.42 } = {}) {
    this.rand = rng(seed);
    this.jitter = jitter;
    this.cx = cx; this.cy = cy;
    this.hold = { leanL: false, leanR: false, crouch: false, raiseL: false, raiseR: false };
    this.lean = 0; this.crouch = 0; this.raiseL = 0; this.raiseR = 0;
    this.anim = null; this.jumpAt = -1e9;
    this.t = 0;
  }

  // 觸發一次性的動作：paddle-left / paddle-right / paddle-both / swing-left / swing-right / jump / wave
  trigger(name, t = this.t) {
    if (name === 'jump') { this.jumpAt = t; return; }
    if (ANIMS[name]) this.anim = { name, at: t };
  }

  set(key, on) { this.hold[key] = on; }

  gauss() { const u = Math.max(this.rand(), 1e-9), v = this.rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // 推進到時間 t（毫秒）並回傳 pose
  step(t) {
    const dt = Math.min(Math.max((t - this.t) / 1000, 0), 0.1);
    this.t = t;
    const H = this.hold;
    const approach = (cur, target, rate) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
    this.lean = approach(this.lean, (H.leanR ? 1 : 0) - (H.leanL ? 1 : 0), 7);
    this.crouch = approach(this.crouch, H.crouch ? 1 : 0, 8);
    this.raiseL = approach(this.raiseL, H.raiseL ? 1 : 0, 12);
    this.raiseR = approach(this.raiseR, H.raiseR ? 1 : 0, 12);

    // 手腕位置
    let l = REST.l, r = REST.r;
    if (this.anim) {
      const A = ANIMS[this.anim.name];
      const u = (t - this.anim.at) / A.ms;
      if (u >= 1) this.anim = null;
      else {
        let i = 0;
        while (i < A.keys.length - 2 && u > A.keys[i + 1][0]) i++;
        const [t0, l0, r0] = A.keys[i], [t1, l1, r1] = A.keys[i + 1];
        const s = ease((u - t0) / (t1 - t0));
        l = lerp2(l0, l1, s); r = lerp2(r0, r1, s);
      }
    }
    l = lerp2(l, { x: -0.45, y: -1.7 }, ease(this.raiseL));
    r = lerp2(r, { x: 0.45, y: -1.7 }, ease(this.raiseR));

    // 身體：傾斜 = 上半身繞髖部旋轉；蹲低 = 上半身下移；跳躍 = 全身上移（拋物線）
    const ju = (t - this.jumpAt) / 450;
    const jumpUp = ju > 0 && ju < 1 ? 4 * ju * (1 - ju) * 0.65 : 0;
    const ang = this.lean * 0.33; // 約 19°
    const hip = { x: 0, y: 1.35 };
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // 身體座標 → 鏡像畫面座標（上半身繞髖旋轉）
    const upper = (p) => {
      const dx = p.x - hip.x, dy = p.y - hip.y;
      const q = { x: hip.x + dx * ca - dy * sa, y: hip.y + dx * sa + dy * ca };
      return { x: this.cx + q.x * U, y: this.cy + (q.y + this.crouch * 1.0 - jumpUp) * U };
    };
    const lower = (p) => ({ x: this.cx + p.x * U, y: this.cy + (p.y - jumpUp) * U });

    const elbow = (sh, wr, out) => {
      // 簡易兩節手臂：手肘在肩、腕中點往外側推
      const m = { x: (sh.x + wr.x) / 2, y: (sh.y + wr.y) / 2 };
      const d = Math.hypot(wr.x - sh.x, wr.y - sh.y);
      const bend = Math.sqrt(Math.max(1.45 * 1.45 / 4 - (d * d) / 4, 0));
      return { x: m.x + out * bend * 0.8, y: m.y + bend * 0.4 };
    };
    const ls = { x: -0.5, y: 0 }, rs = { x: 0.5, y: 0 };
    const body = {
      nose: upper({ x: 0, y: -0.62 }), leftEye: upper({ x: -0.12, y: -0.74 }), rightEye: upper({ x: 0.12, y: -0.74 }),
      leftEar: upper({ x: -0.33, y: -0.66 }), rightEar: upper({ x: 0.33, y: -0.66 }),
      leftShoulder: upper(ls), rightShoulder: upper(rs),
      leftElbow: upper(elbow(ls, l, -1)), rightElbow: upper(elbow(rs, r, 1)),
      leftWrist: upper(l), rightWrist: upper(r),
      leftHip: lower({ x: -0.32, y: 1.35 }), rightHip: lower({ x: 0.32, y: 1.35 }),
      leftKnee: lower({ x: -0.33 - this.crouch * 0.3, y: 2.45 }), rightKnee: lower({ x: 0.33 + this.crouch * 0.3, y: 2.45 }),
      leftAnkle: lower({ x: -0.34, y: 3.5 }), rightAnkle: lower({ x: 0.34, y: 3.5 }),
    };
    const kp = {};
    for (const name of KEYPOINTS) {
      const p = body[name];
      kp[name] = { x: p.x + this.gauss() * this.jitter, y: p.y + this.gauss() * this.jitter, v: p.y < 1 ? 0.95 : 0.3 };
    }
    return { t, kp };
  }
}

// 腳本：[[時間ms, 動作], ...] → 一段 pose 序列（產生預錄檔與自動測試用）
// 動作：'paddle-left' 等一次性動作，或 'hold:leanL:on' / 'hold:leanL:off'
export function scriptPoses(script, { durationMs, fps = 30, seed = 1, jitter = 0.003 } = {}) {
  const pup = new Puppet({ seed, jitter });
  const out = [];
  const queue = [...script].sort((a, b) => a[0] - b[0]);
  for (let t = 0; t <= durationMs; t += 1000 / fps) {
    while (queue.length && queue[0][0] <= t) {
      const [, a] = queue.shift();
      if (a.startsWith('hold:')) { const [, k, v] = a.split(':'); pup.set(k, v === 'on'); }
      else pup.trigger(a, t);
    }
    out.push(pup.step(t));
  }
  return out;
}
