// 動作定義：每個動作怎麼量、怎麼算一下、檢查哪些姿勢、在哪個視角可信。
//
// 加新動作只要在這裡加一筆（說明見 docs/fitness.md「之後怎麼加新動作」）：
//   views      這個視角下「算次數」有多可信（0 = 這個視角看不到這個動作，會請玩家轉身）
//   metric     一格姿勢 → 用力程度（以個人目標為 1）
//   thresholds 遲滯門檻（見 counter.js）
//   track      動作進行中要記下的值（例如蹲到最低時上半身的角度）
//   checks     姿勢檢查：每項都有「各視角的可信度」，可信度不夠的項目不提示、介面標「這個角度看不到」
//
// 單一鏡頭沒有深度：只檢查「在畫面平面上」的動作。往鏡頭方向（前後）的偏差從正面看不出來，
// 所以這類檢查在正面的可信度一律設 0；膝蓋內夾、背部圓弧這類容易誤判的項目不做提示。
import { avg2, clamp } from './features.js';

const lerp01 = (x, a, b) => clamp((x - a) / (b - a), 0, 1);

// ── 深蹲 ──
const squat = {
  id: 'squat', name: '深蹲', icon: '🏋️', unit: '下',
  // 正面：看得到「髖往下掉多少」；側面：還看得到膝蓋角度與上半身前傾，最準
  views: { front: 0.85, angled: 0.95, side: 1 },
  bestView: 'side',
  placement: '手機放在你的<b>側面</b>（或斜前方 45°）約 2.5 公尺、高度到膝蓋～腰，<b>從頭到腳都要入鏡</b>。正面也可以算次數，但看不到上半身有沒有太往前倒。',
  needs: ['hips', 'nearLeg'],
  calib: { key: 'squat', reps: 3, def: 0.4, min: 0.25, max: 0.55, minCount: 0.15, unit: '%', show: (v) => `${Math.round(v * 100)}%`,
    prompt: '做 3 下「舒服的」深蹲：蹲到你覺得穩、不會痛的深度就好，不用勉強。' },
  thresholds: (target) => ({ start: Math.max(0.07 / target, 0.18), count: Math.max(0.15 / target, 0.6), release: Math.max(0.045 / target, 0.11), minMs: 600, bounce: 0.3 }),
  // 用力程度 = 「髖到腳踝的高度」少了幾成。用軀幹長（側面）或肩寬（正面）當尺，所以離鏡頭遠近不影響
  metric(f, ctx) {
    const q = this.ratio(f, ctx);
    if (q == null) return null;
    return (1 - q.value / q.base) / ctx.target;
  },
  ratio(f, { base, view }) {
    if (f.h == null || !base) return null;
    if (view === 'front' && f.swx && base.q0S) return { value: f.h / f.swx, base: base.q0S, key: 'q0S' };
    if (f.T && base.q0T) return { value: f.h / f.T, base: base.q0T, key: 'q0T' };
    return null;
  },
  // 站著不動時，慢慢更新「站直」的基準（玩家往前挪、換位置也跟得上）
  adapt(f, ctx) {
    const q = this.ratio(f, ctx);
    if (!q) return;
    if (q.value > q.base * 0.95 && q.value < q.base * 1.08) ctx.base[q.key] += (q.value - q.base) * 0.03;
    if (ctx.view === 'front' && f.swx && f.h && !ctx.base.q0S) ctx.base.q0S = f.h / f.swx;
  },
  track(acc, f, m, ctx) {
    const drop = m * ctx.target;
    if (acc.peakDrop == null || drop > acc.peakDrop) { acc.peakDrop = drop; acc.atPeak = { trunk: f.trunk, knee: ctx.view === 'front' ? null : f.knee, shift: f.shift }; }
    acc.maxShift = Math.max(acc.maxShift ?? 0, Math.abs((f.shift ?? 0) - (ctx.base.shift0 ?? 0)));
  },
  checks: [
    { code: 'depth', label: '蹲的深度', weight: 2, joints: ['hips', 'nearLeg'], views: { front: 0.85, angled: 0.95, side: 1 }, on: ['rep', 'partial'],
      how: '髖到腳踝的高度少了幾成，和你校正時的「舒服深度」比。側面另外看膝蓋角度。',
      score: (r, ctx) => clamp((r.peakDrop ?? 0) / (ctx.target * 0.9), 0, 1),
      value: (r) => `${Math.round((r.peakDrop ?? 0) * 100)}%${r.atPeak?.knee ? `・膝 ${Math.round(r.atPeak.knee)}°` : ''}`,
      hint: '再蹲低一點點，在不會痛的範圍內就好', good: '深度剛好！' },
    { code: 'trunk', label: '上半身前傾', weight: 1, joints: ['shoulders', 'hips'], views: { front: 0, angled: 0.6, side: 1 },
      how: '蹲到最低時，肩膀和髖的連線和垂直線的夾角。正面看不出前後傾，所以只在側面／斜角檢查；斜角只會少報、不會多報。',
      score: (r) => (r.atPeak?.trunk == null ? null : 1 - lerp01(Math.abs(r.atPeak.trunk), 55, 72) * 0.7),
      value: (r) => (r.atPeak?.trunk == null ? '—' : `${Math.round(Math.abs(r.atPeak.trunk))}°`),
      hint: '胸口抬高、眼睛看前方，上半身不要太往前倒', good: '上半身很穩' },
    { code: 'balance', label: '重心左右', weight: 1, joints: ['hips', 'ankles'], views: { front: 1, angled: 0, side: 0 },
      how: '蹲下時髖的中心有沒有偏向某一隻腳（以肩寬為單位）。側面看不到左右偏移；斜角時「屁股往後坐」會看起來像往旁邊偏，所以也不檢查。',
      score: (r) => 1 - lerp01(r.maxShift ?? 0, 0.16, 0.36) * 0.7,
      value: (r) => `${Math.round((r.maxShift ?? 0) * 100)}%`,
      hint: '重心放在兩腳中間，兩邊一樣出力', good: '左右很平均' },
    { code: 'tempo', label: '速度', weight: 1, joints: ['hips'], views: { front: 1, angled: 1, side: 1 },
      how: '從開始往下蹲到站直花了多久（用影格拍攝的時間計算）。',
      score: (r) => lerp01(r.durationMs, 900, 1500) * 0.6 + 0.4,
      value: (r) => `${(r.durationMs / 1000).toFixed(1)} 秒`,
      hint: '慢一點：大約 2 秒蹲下、1 秒站起來', good: '速度剛好' },
  ],
  // 只顯示在除錯畫面、不提示（單鏡頭不可靠）
  experimental: [
    { code: 'kneeIn', label: '膝蓋內夾（實驗，不提示）', why: '正面看膝蓋往內，可能是真的內夾，也可能只是髖轉動或鏡頭角度造成；沒有深度資訊無法分辨，所以不提示。' },
    { code: 'back', label: '背部圓弧（不檢查）', why: '關節點只有肩膀和髖，看不到脊椎的彎曲。' },
    { code: 'heel', label: '腳跟離地（不檢查）', why: '目前的關節點沒有腳跟與腳尖。' },
  ],
  howto: [
    { title: '站好', text: '雙腳約與肩同寬、腳尖微微朝外' },
    { title: '往下蹲', text: '屁股往後坐，像要坐椅子，膝蓋跟腳尖同方向' },
    { title: '站起來', text: '腳掌踩穩、站直，算一下' },
  ],
};

// ── 開合跳 ──
const jack = {
  id: 'jack', name: '開合跳', icon: '⭐', unit: '下',
  // 手腳都是往左右張開：正面看最清楚；側面幾乎看不出來
  views: { front: 1, angled: 0.6, side: 0 },
  bestView: 'front',
  placement: '手機放在你的<b>正前方</b>約 2.5～3 公尺，<b>從頭到腳、雙手舉高都要入鏡</b>。',
  needs: ['shoulders', 'wrists', 'hips', 'ankles'],
  calib: null,
  thresholds: () => ({ start: 0.18, count: 0.5, release: 0.14, minMs: 300, bounce: 0.35 }),
  // 用力程度 = 手舉起來的程度 和 腳張開的程度 取比較小的那個（兩個都要做到才算）
  metric(f, ctx) {
    const arm = avg2(f.armL, f.armR), sp = f.spread;
    if (arm == null || sp == null) return null;
    const a = clamp((arm - 25) / (150 - 25), 0, 1.2);
    const l = clamp((sp - (ctx.base.spread0 ?? 0.75)) / 1.0, 0, 1.2);
    return Math.min(a, l);
  },
  adapt(f, ctx) { if (f.spread != null && f.spread < 1.3) ctx.base.spread0 += (f.spread - ctx.base.spread0) * 0.03; },
  track(acc, f, m, ctx) {
    acc.armL = Math.max(acc.armL ?? 0, f.armL ?? 0); acc.armR = Math.max(acc.armR ?? 0, f.armR ?? 0);
    acc.legs = Math.max(acc.legs ?? 0, (f.spread ?? 0) - (ctx.base.spread0 ?? 0.75));
  },
  checks: [
    { code: 'arms', label: '手舉多高', weight: 1, joints: ['shoulders', 'wrists'], views: { front: 1, angled: 0.7, side: 0 }, on: ['rep', 'partial'],
      how: '手臂和身體側邊的夾角（0° 垂下、180° 頭頂），兩手取比較低的那隻。',
      score: (r) => lerp01(Math.min(r.armL, r.armR), 95, 145),
      value: (r) => `${Math.round(Math.min(r.armL, r.armR))}°`,
      hint: '雙手舉到頭頂上方', good: '手舉得很高！' },
    { code: 'legs', label: '腳張開', weight: 1, joints: ['ankles', 'hips'], views: { front: 1, angled: 0.5, side: 0 }, on: ['rep', 'partial'],
      how: '兩腳腳踝的距離比站著時多了幾個肩寬。',
      score: (r) => lerp01(r.legs, 0.45, 0.85),
      value: (r) => `+${r.legs.toFixed(1)} 肩寬`,
      hint: '腳再張開一點，大約肩膀的兩倍寬', good: '腳張得很開' },
    { code: 'sym', label: '兩手一樣高', weight: 0.5, joints: ['shoulders', 'wrists'], views: { front: 1, angled: 0.4, side: 0 },
      how: '左右手最高點的角度差。',
      score: (r) => 1 - lerp01(Math.abs(r.armL - r.armR), 25, 55) * 0.7,
      value: (r) => `差 ${Math.round(Math.abs(r.armL - r.armR))}°`,
      hint: '兩隻手一起舉、一樣高', good: '左右對稱' },
  ],
  experimental: [
    { code: 'landing', label: '落地輕不輕（不檢查）', why: '鏡頭看不出腳落地的力道；家裡請穿鞋、在止滑的地面跳，或改用低衝擊版（不跳，左右輪流踏出去）。' },
  ],
  howto: [
    { title: '併腳站好', text: '雙手放在身體兩側' },
    { title: '跳開', text: '腳張開約肩膀兩倍寬，同時雙手從旁邊舉到頭頂' },
    { title: '跳回來', text: '腳併攏、手放下，算一下' },
  ],
};

// ── 側抬腿（站姿髖外展） ──
// 為什麼選它當第三個動作：腿往旁邊抬、上半身有沒有歪，都發生在「正面的畫面平面」上，
// 單一鏡頭看得最準。最常見的錯誤是「上半身往另一邊倒來假裝抬得高」，正好可以可靠地檢查。
const legRaise = {
  id: 'legRaise', name: '側抬腿', icon: '🦵', unit: '下', perSide: true,
  views: { front: 1, angled: 0.5, side: 0 },
  bestView: 'front',
  placement: '手機放在你的<b>正前方</b>約 2.5 公尺，<b>從頭到腳都要入鏡</b>。可以一手扶著椅背或牆（椅子放在你旁邊、不要擋住腳）。',
  needs: ['hips', 'ankles', 'shoulders'],
  calib: { key: 'legRaise', reps: 2, def: 35, min: 20, max: 45, minCount: 14, unit: '°', show: (v) => `${Math.round(v)}°`,
    prompt: '左右腳各往旁邊抬 2 下，抬到「上半身還能保持直立」的高度就好。' },
  thresholds: (target) => ({ start: Math.max(7 / target, 0.2), count: Math.max(14 / target, 0.6), release: Math.max(5 / target, 0.14), minMs: 600, bounce: 0.35 }),
  legs(f, ctx) {
    const b = ctx.base;
    return { L: f.legL == null ? null : f.legL - (b.legL0 ?? 0), R: f.legR == null ? null : f.legR - (b.legR0 ?? 0) };
  },
  metric(f, ctx) {
    const { L, R } = this.legs(f, ctx);
    if (L == null && R == null) return null;
    return Math.max(L ?? -99, R ?? -99) / ctx.target;
  },
  adapt(f, ctx) {
    if (f.legL != null && Math.abs(f.legL - ctx.base.legL0) < 4) ctx.base.legL0 += (f.legL - ctx.base.legL0) * 0.03;
    if (f.legR != null && Math.abs(f.legR - ctx.base.legR0) < 4) ctx.base.legR0 += (f.legR - ctx.base.legR0) * 0.03;
  },
  track(acc, f, m, ctx) {
    const { L, R } = this.legs(f, ctx);
    const side = (L ?? -99) >= (R ?? -99) ? 'left' : 'right';
    const a = side === 'left' ? L : R;
    if (acc.peakDeg == null || a > acc.peakDeg) {
      acc.peakDeg = a; acc.side = side;
      // 代償：上半身往「站著那隻腳」那邊倒（鏡像畫面：抬左腳時往畫面右邊倒 = trunk 為正）
      acc.lean = f.trunk == null ? null : (side === 'left' ? f.trunk : -f.trunk);
    }
    if (f.trunk != null) acc.maxLean = Math.max(acc.maxLean ?? -99, side === 'left' ? f.trunk : -f.trunk);
  },
  checks: [
    { code: 'height', label: '腿抬多高', weight: 1.5, joints: ['hips', 'ankles'], views: { front: 1, angled: 0.6, side: 0 }, on: ['rep', 'partial'],
      how: '抬起那隻腳（髖→腳踝）和垂直線的夾角，和你校正時的高度比。',
      score: (r, ctx) => clamp((r.peakDeg ?? 0) / (ctx.target * 0.9), 0, 1),
      value: (r) => `${Math.round(r.peakDeg ?? 0)}°`,
      hint: '腿再往旁邊抬高一點點，不用勉強', good: '抬得剛好！' },
    { code: 'lean', label: '上半身直立', weight: 1.5, joints: ['shoulders', 'hips'], views: { front: 1, angled: 0.6, side: 0 },
      how: '肩膀中點和髖中點的連線往旁邊歪了幾度（和站直時比）。往另一邊倒是最常見的「偷抬高」。',
      score: (r) => (r.maxLean == null ? null : 1 - lerp01(r.maxLean, 9, 18) * 0.8),
      value: (r) => (r.maxLean == null ? '—' : `${Math.max(0, Math.round(r.maxLean))}°`),
      hint: '上半身保持直立，腿抬低一點也沒關係', good: '身體很直！' },
    { code: 'tempo', label: '速度', weight: 1, joints: ['hips'], views: { front: 1, angled: 1, side: 1 },
      how: '抬起到放下花了多久（用影格拍攝的時間計算）。',
      score: (r) => lerp01(r.durationMs, 700, 1300) * 0.6 + 0.4,
      value: (r) => `${(r.durationMs / 1000).toFixed(1)} 秒`,
      hint: '慢慢抬、慢慢放，不要用甩的', good: '控制得很好' },
  ],
  experimental: [
    { code: 'forward', label: '腿往前踢（不檢查）', why: '腿往前或往後偏是「朝鏡頭方向」的動作，正面看不出來。' },
  ],
  howto: [
    { title: '站直', text: '雙手叉腰，或一手扶椅背' },
    { title: '往旁邊抬', text: '腿伸直、腳尖朝前，往旁邊抬起' },
    { title: '慢慢放下', text: '上半身保持直立，左右輪流' },
  ],
};

export const EXERCISES = { squat, jack, legRaise };
export const VIEW_NAMES = { front: '正面', angled: '斜角', side: '側面' };
