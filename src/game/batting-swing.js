// 揮棒的「高低」與「力道」：從輸入層每一格送來的骨架（kit 的 pose 事件＋ kit.state.hands）在遊戲這邊累積，
// 不改輸入層（taikan-kit）。純計算，可以在 node 裡測試。
//
// 用到的只有「雙手中點相對兩肩」的位置（單位＝肩寬；側身站時輸入層改用肩到髖 ÷ 1.5），y 向下為正：
//   ・擊球瞬間的雙手高度（bat 事件那一格）                 → 球棒大約在哪個高度（高／中／低）
//   ・擊球前約 0.12 秒雙手的移動方向（往上撈／平／往下壓）  → 揮棒軌跡（挑／平／劈）
//   ・從起動到擊球的最大速度                               → 力道
// 鏡頭看不到球棒，也量不到前後距離，所以不估「擊球點前後」與「內外角」（那兩個由規則算，見 batting-logic.js）。
// 每個人的身高、站姿、鏡頭擺的高度都不同，所以三個數字都跟「個人基準」（揮棒測試量到的平常值）比。

// 可調門檻
export const SWING_TUNE = {
  planeDeg: 20,      // 跟平常比，往上超過幾度算「挑」、往下超過幾度算「劈」
  metersPerUnit: 0.3, // 雙手比平常高 1 個肩寬 ≈ 球棒高 30 公分（國小高年級的肩寬約 30 公分）
  midZoneM: 0.75,     // 平常的高度＝好球帶中間
  minFrames: 3,       // 擊球前至少要有幾格骨架才算數（太少就不看高低）
};

// 沒做過揮棒測試時用的基準。鍵盤：模擬人偶平揮量到的值；鏡頭：人偶影像經 MediaPipe（正面、側身平均）
export const DEFAULT_BASE = {
  keyboard: { h: -0.13, slope: -12, speed: 9.4 },
  camera: { h: -0.57, slope: -30, speed: 9.5 },
};

// 一格骨架 → 樣本 { t, x, y, n }（n＝看得到幾隻手腕）
export function sampleFromHands(t, hands) {
  const l = hands?.left, r = hands?.right;
  if (!l && !r) return null;
  const m = l && r ? { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 } : (l || r);
  return { t, x: m.x, y: m.y, n: (l ? 1 : 0) + (r ? 1 : 0) };
}

// 樣本序列＋ bat 事件 → 揮棒特徵 { h（擊球瞬間雙手高度，＋＝高）, slope（度，＋＝往上）, speed（肩寬/秒）, frames, ok }
export function swingFeatures(samples, { t, onset = null }) {
  const pts = samples.filter((s) => s && s.t <= t + 1 && s.t >= t - 600);
  if (!pts.length) return { ok: false, frames: 0 };
  const c = pts[pts.length - 1];
  const pre = pts.filter((s) => s.t >= t - 130);
  let slope = null, speed = 0;
  if (pre.length >= 2) {
    const a = pre[0], dt = Math.max((c.t - a.t) / 1000, 1e-3);
    const vx = (c.x - a.x) / dt, vy = (c.y - a.y) / dt;
    slope = (Math.atan2(-vy, Math.abs(vx)) * 180) / Math.PI;
  }
  const from = onset != null ? onset - 40 : t - 400;
  const seg = pts.filter((s) => s.t >= from);
  for (let i = 1; i < seg.length; i++) {
    const dt = (seg[i].t - seg[i - 1].t) / 1000;
    if (dt > 0.005) speed = Math.max(speed, Math.hypot(seg[i].x - seg[i - 1].x, seg[i].y - seg[i - 1].y) / dt);
  }
  return { h: -c.y, slope, speed, frames: pre.length, ok: pre.length >= SWING_TUNE.minFrames && slope !== null };
}

// 特徵＋個人基準 → 給判定用的揮棒描述 { plane: −1 劈／0 平／+1 挑, heightM, power, reliable, hRel, slopeRel }
export function describeSwing(f, base, { personal = false, tune = SWING_TUNE } = {}) {
  if (!f?.ok) return null;
  const hRel = f.h - base.h, slopeRel = f.slope - base.slope;
  const plane = slopeRel > tune.planeDeg ? 1 : slopeRel < -tune.planeDeg ? -1 : 0;
  const heightM = Math.min(Math.max(tune.midZoneM + Math.max(-1.6, Math.min(1.6, hRel)) * tune.metersPerUnit, 0.2), 1.35);
  const power = Math.min(Math.max(f.speed / base.speed, 0.4), 1.3);
  return { plane, heightM, power, reliable: personal, hRel: +hRel.toFixed(2), slopeRel: Math.round(slopeRel) };
}

// 揮棒測試的幾次揮棒 → 個人基準（中位數）
export function baselineFrom(features) {
  const ok = features.filter((f) => f?.ok);
  if (ok.length < 3) return null;
  const med = (k) => { const v = ok.map((f) => f[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  return { h: +med('h').toFixed(3), slope: Math.round(med('slope')), speed: +med('speed').toFixed(2), n: ok.length };
}

export const PLANE_LABEL = { '-1': '劈（往下壓）', 0: '平揮', 1: '挑（往上撈）' };

// ── 鍵盤模擬：讓模擬人偶揮出不同高低的棒 ──
// 跟釣魚遊戲一樣，從遊戲這邊包住人偶的 step／trigger（不改輸入層）：
//   trigger('bat-up' | 'bat-flat' | 'bat-down') → 記住這次的軌跡，再揮一般的 bat-left
//   step(t)：揮棒動畫進行中，把兩隻手腕往上／往下推（挑＝從低處往上撈、劈＝從高處往下壓）
// 人偶產生的骨架一樣經過輸入層的辨識器，所以測到的是跟鏡頭一樣的高低計算。
const BAT_MS = 560; // 人偶 bat-left 動畫長度（puppet.js）
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
export function patchBatPuppet(puppet, getPlane = () => 0) {
  if (puppet.__batPatched) return puppet;
  puppet.__batPatched = true;
  const trigger = puppet.trigger.bind(puppet), step = puppet.step.bind(puppet);
  let plane = 0, at = -1e9;
  puppet.trigger = (name, t = puppet.t) => {
    const m = /^bat-(up|flat|down)$/.exec(name);
    if (m) { plane = { up: 1, flat: 0, down: -1 }[m[1]]; at = t; return trigger('bat-left', t); }
    if (name === 'bat-left' || name === 'bat-right') { plane = getPlane(); at = t; }
    return trigger(name, t);
  };
  puppet.step = (t) => {
    const pose = step(t);
    const u = (t - at) / BAT_MS;
    if (!plane || u < 0 || u > 1) return pose;
    const kp = pose.kp, ls = kp.leftShoulder, rs = kp.rightShoulder;
    const U = Math.hypot(rs.x - ls.x, rs.y - ls.y) || 0.16;
    // 往後拉到往前揮之間（u 0.2～0.75）從「起點高度」移到「終點高度」，之後慢慢回到原位
    const s = ease((u - 0.2) / 0.55), back = 1 - ease((u - 0.8) / 0.2);
    // 挑：從腰的高度往上撈（擊球瞬間手比平常低、還在往上）；劈：從肩膀上方往下壓（擊球瞬間手比平常高、還在往下）
    const startY = plane > 0 ? 1.25 : -1.15, endY = plane > 0 ? 0.2 : -0.2; // 身體單位，＋＝往下
    const dy = (startY + (endY - startY) * s) * back * U;
    for (const k of ['leftWrist', 'rightWrist', 'leftElbow', 'rightElbow']) {
      if (kp[k]) kp[k] = { ...kp[k], y: kp[k].y + dy * (k.includes('Elbow') ? 0.5 : 1) };
    }
    return pose;
  };
  return puppet;
}
