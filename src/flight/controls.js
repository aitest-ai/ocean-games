// 身體 → 操縱：身體左右傾 = 副翼（傾斜轉彎）；雙手一起抬高／放低 = 機頭往上／往下轉。
// 直接讀骨架（kit.lastPose），鏡頭和鍵盤模擬（模擬人偶）走同一條路，可以在 node 測試。
//
// 為什麼要自己算，不直接用輸入層的 kit.state.lean：
//   輸入層的傾斜會在玩家靜止時「慢慢重新歸零」（適合衝浪那種短暫傾斜）；飛機轉彎時要一直傾斜好幾秒，
//   所以這裡用「校正時量到的中立姿勢」當零點，不會漂。
//
// 處理順序（每個值）：原始值 → 用個人校正換成 -1~1 → 濾波（One Euro：不動時穩、動得快時跟得上）
//   → 預測（往前推 lead 秒，抵銷鏡頭延遲；限制最多推 0.2）→ 死區 → 曲線（中間細、兩邊快）→ 上限 ±1
import { OneEuro } from '../../packages/taikan-kit/src/filter.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const vis = (k, th = 0.4) => !!k && (k.v ?? 1) >= th;

// 預設校正值（沒有校正過時用）：剛好對應鍵盤模擬人偶的動作範圍
//   roll：肩膀連線的角度（弧度，右傾為正）；hand：雙手腕平均高度（相對兩肩中點，單位 = 肩寬，往下為正）
export const DEFAULT_CALIB = { roll0: 0, rollL: 0.26, rollR: 0.26, hand0: 0.85, handUp: 0.25, handDown: 1.35, source: 'default' };

export const SHAPE = { leanDead: 0.12, pitchDead: 0.2, rest: 0.4 }; // rest：手比「放低」還低 0.4 肩寬 = 手放在腿上，當作中間

// 從一個 pose 取出原始量
export function measure(pose) {
  const kp = pose?.kp;
  if (!kp || !vis(kp.leftShoulder, 0.5) || !vis(kp.rightShoulder, 0.5)) return null;
  const L = kp.leftShoulder, R = kp.rightShoulder;
  const sw = Math.max(Math.hypot(R.x - L.x, R.y - L.y), 0.03);
  const my = (L.y + R.y) / 2;
  const roll = Math.atan2(R.y - L.y, R.x - L.x);
  const hs = [kp.leftWrist, kp.rightWrist].filter((k) => vis(k));
  const hand = hs.length === 2 ? hs.reduce((a, k) => a + (k.y - my) / sw, 0) / 2 : null; // 兩隻手都要看得到
  return { roll, hand, sw };
}

const shape = (x, dead) => {
  const a = Math.abs(x);
  if (a <= dead) return 0;
  const u = clamp((a - dead) / (1 - dead), 0, 1);
  return Math.sign(x) * (0.45 * u + 0.55 * u * u); // 中間比較細（好微調），推到底時跟線性一樣
};

export class BodyControls {
  constructor({ calib = DEFAULT_CALIB, lead = 0.08 } = {}) {
    this.calib = { ...DEFAULT_CALIB, ...calib };
    this.lead = lead;
    this.reset();
  }

  reset() {
    this.f = { lean: new OneEuro({ minCutoff: 1.2, beta: 0.6 }), pitch: new OneEuro({ minCutoff: 1.2, beta: 0.6 }) };
    this.prev = { lean: null, pitch: null, t: null };
    this.vel = { lean: 0, pitch: 0 };
    this.lean = 0; this.pitch = 0;
    this.rawLean = 0; this.rawPitch = 0;
    this.handsSeen = false; this.handsRest = false; this.seen = false;
    this.lastT = null;
  }

  // 個人校正值換成 -1 ~ 1
  normLean(roll) { const r = roll - this.calib.roll0; return clamp(r >= 0 ? r / this.calib.rollR : r / this.calib.rollL, -1.3, 1.3); }
  normPitch(hand) {
    const c = this.calib;
    if (hand > c.handDown + SHAPE.rest) return null; // 手放在腿上：不算
    return clamp(hand <= c.hand0 ? (c.hand0 - hand) / (c.hand0 - c.handUp) : -(hand - c.hand0) / (c.handDown - c.hand0), -1.3, 1.3);
  }

  // 每收到一個新 pose 呼叫一次（t = 毫秒）
  feed(pose, t = pose?.t) {
    if (t === this.lastT) return;
    const m = measure(pose);
    this.seen = !!m;
    if (!m) { this.handsSeen = false; this.decay(t); return; }
    const dt = this.lastT === null ? 1 / 30 : clamp((t - this.lastT) / 1000, 1e-3, 0.25);
    this.lastT = t;
    const nl = this.normLean(m.roll);
    const np = m.hand === null ? null : this.normPitch(m.hand);
    this.handsSeen = m.hand !== null; this.handsRest = m.hand !== null && np === null;
    this.rawLean = nl; this.rawPitch = np ?? 0;
    this.lean = this.process('lean', nl, t, dt, SHAPE.leanDead);
    this.pitch = np === null ? this.process('pitch', 0, t, dt, SHAPE.pitchDead) : this.process('pitch', np, t, dt, SHAPE.pitchDead);
  }

  process(k, x, t, dt, dead) {
    const y = this.f[k].filter(x, t);
    // 速度（再平滑一次）→ 往前預測 lead 秒
    if (this.prev[k] !== null) this.vel[k] += ((y - this.prev[k]) / dt - this.vel[k]) * 0.25;
    this.prev[k] = y;
    const pred = y + clamp(this.vel[k] * this.lead, -0.2, 0.2);
    return clamp(shape(pred, dead), -1, 1);
  }

  // 看不到人：慢慢回到中間（不會突然翻過去）
  decay(t) {
    this.lean *= 0.9; this.pitch *= 0.8;
    if (Math.abs(this.lean) < 0.01) this.lean = 0;
    if (Math.abs(this.pitch) < 0.01) this.pitch = 0;
    void t;
  }
}

// ── 校正：站好中立姿勢 → 往左傾到最大 → 往右 → 雙手抬高 → 放低 ──
// 每一步前 1 秒是「換姿勢」不記錄，之後取 80 百分位（不受偶爾的大動作影響）
export const CALIB_STEPS = [
  { key: 'neutral', sec: 3, text: '坐好（或站好），雙手像握方向盤一樣放在胸前，不要動', short: '中立姿勢' },
  { key: 'left', sec: 3, text: '上半身往<b>左</b>傾，傾到舒服的最大，停住', short: '往左傾' },
  { key: 'right', sec: 3, text: '上半身往<b>右</b>傾，傾到舒服的最大，停住', short: '往右傾' },
  { key: 'up', sec: 3, text: '雙手一起<b>抬高到下巴</b>（不要舉過頭），停住', short: '雙手抬高', hands: true },
  { key: 'down', sec: 3, text: '雙手一起<b>放低到肚子</b>，停住', short: '雙手放低', hands: true },
];

const pct = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]; };

export class Calibrator {
  constructor({ hands = true } = {}) {
    this.steps = CALIB_STEPS.filter((s) => hands || !s.hands);
    this.i = 0; this.t = 0; this.samples = {}; this.done = false; this.result = null;
  }
  get step() { return this.steps[this.i]; }
  get progress() { return this.step ? clamp(this.t / this.step.sec, 0, 1) : 1; }

  // dt 秒；pose 可以是 null（看不到人時時間不前進）
  update(dt, pose) {
    if (this.done) return;
    const m = measure(pose);
    if (!m) return;
    this.t += dt;
    const S = this.step;
    if (this.t > 1) (this.samples[S.key] ||= []).push(m);
    if (this.t >= S.sec) { this.i++; this.t = 0; if (this.i >= this.steps.length) this.finish(); }
  }

  finish() {
    const s = this.samples, c = { ...DEFAULT_CALIB, source: 'measured' };
    const rolls = (k) => (s[k] || []).map((m) => m.roll);
    const hands = (k) => (s[k] || []).map((m) => m.hand).filter((h) => h !== null);
    c.roll0 = pct(rolls('neutral'), 0.5) ?? 0;
    // 最大傾斜量：太小（不到 5°）就用 5°，太大（超過 30°）就用 30°
    const lim = (v) => clamp(v ?? DEFAULT_CALIB.rollL, 5 * Math.PI / 180, 30 * Math.PI / 180);
    c.rollL = lim(pct(rolls('left').map((r) => c.roll0 - r), 0.8) * 0.85);
    c.rollR = lim(pct(rolls('right').map((r) => r - c.roll0), 0.8) * 0.85);
    const h0 = pct(hands('neutral'), 0.5);
    if (h0 !== null) {
      c.hand0 = h0;
      const up = pct(hands('up'), 0.2), down = pct(hands('down'), 0.8);
      c.handUp = up !== null && h0 - up > 0.15 ? h0 - (h0 - up) * 0.85 : h0 - 0.6;
      c.handDown = down !== null && down - h0 > 0.15 ? h0 + (down - h0) * 0.85 : h0 + 0.5;
    }
    this.result = c; this.done = true;
  }
}

// 鍵盤模擬：讓模擬人偶多兩個「按住」動作：雙手抬高（↑）、雙手放低（↓）——雙手在胸前，不會舉過頭
export function patchPuppetYoke(puppet) {
  puppet.hold.pitchUp = false; puppet.hold.pitchDown = false;
  const step = puppet.step.bind(puppet);
  let k = 0;
  puppet.step = (t) => {
    const dt = Math.min(Math.max((t - (puppet._yt ?? t)) / 1000, 0), 0.1); puppet._yt = t;
    const target = (puppet.hold.pitchUp ? 1 : 0) - (puppet.hold.pitchDown ? 1 : 0);
    k += (target - k) * (1 - Math.exp(-dt * 9));
    const pose = step(t);
    const kp = pose.kp, ls = kp.leftShoulder, rs = kp.rightShoulder;
    const U = Math.hypot(rs.x - ls.x, rs.y - ls.y) || 0.16;
    const cx = (ls.x + rs.x) / 2, cy = (ls.y + rs.y) / 2;
    const y = DEFAULT_CALIB.hand0 + (k >= 0 ? -k * (DEFAULT_CALIB.hand0 - DEFAULT_CALIB.handUp) : -k * (DEFAULT_CALIB.handDown - DEFAULT_CALIB.hand0));
    // 雙手握在胸前（只在沒有做其他手部動作時）
    if (!puppet.anim && !puppet.hold.raiseL && !puppet.hold.raiseR) {
      kp.leftWrist = { ...kp.leftWrist, x: cx - 0.38 * U, y: cy + y * U };
      kp.rightWrist = { ...kp.rightWrist, x: cx + 0.38 * U, y: cy + y * U };
      kp.leftElbow = { ...kp.leftElbow, x: cx - 0.62 * U, y: cy + (0.55 + y * 0.4) * U };
      kp.rightElbow = { ...kp.rightElbow, x: cx + 0.62 * U, y: cy + (0.55 + y * 0.4) * U };
    }
    return pose;
  };
  return puppet;
}
