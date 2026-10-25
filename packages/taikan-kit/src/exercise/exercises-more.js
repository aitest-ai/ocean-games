// 階段三加的動作（格式同 exercises.js，說明見 docs/fitness.md「之後怎麼加新動作」）。
//
// 依「單鏡頭可不可靠」分三類：
//   站姿（可靠）：高抬腿、抬膝踏步、弓箭步、靠牆深蹲（維持）、坐到站
//   坐姿（無障礙）：坐姿抬膝、坐姿開合手
//   可信度中等：提踵（只能看「整個人往上多少」，手機一動就會不準，介面標「中」）
//   地板（實驗）：棒式（維持）、伏地挺身、臀橋——要求手機放側面、放低；身體不是橫的就不算。
//   仰臥起坐：之後再做（理由見文件）。
import { avg2, clamp } from './features.js';

const lerp01 = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
const median = (a) => { if (!a?.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const tempo = (min, ok, hint) => ({ code: 'tempo', label: '速度', weight: 1, joints: ['hips'], views: { front: 1, angled: 1, side: 1 },
  how: '一下花多久（用影格拍攝的時間計算）。', score: (r) => lerp01(r.durationMs, min, ok) * 0.6 + 0.4, value: (r) => `${(r.durationMs / 1000).toFixed(1)} 秒`, hint, good: '速度剛好' });

// 和深蹲一樣：「髖到腳踝的高度」少了幾成（正面用肩寬、其他用軀幹長當尺）
function drop(f, { base, view }) {
  if (f.h == null || !base) return null;
  if (view === 'front' && f.swx && base.q0S) return { value: f.h / f.swx, base: base.q0S, key: 'q0S' };
  if (f.T && base.q0T) return { value: f.h / f.T, base: base.q0T, key: 'q0T' };
  return null;
}
const dropMetric = (f, ctx) => { const q = drop(f, ctx); return q ? (1 - q.value / q.base) / ctx.target : null; };
function dropAdapt(f, ctx) { const q = drop(f, ctx); if (q && q.value > q.base * 0.95 && q.value < q.base * 1.08) ctx.base[q.key] += (q.value - q.base) * 0.03; }

// 膝蓋抬多高（0 = 站好時的位置，1 = 和髖一樣高），左右取比較高的那隻
function kneeLift(f, base) {
  const L = f.kyL != null && base.kyL0 ? 1 - f.kyL / base.kyL0 : null;
  const R = f.kyR != null && base.kyR0 ? 1 - f.kyR / base.kyR0 : null;
  return { L, R };
}

// ── 高抬腿 ──
const highKnees = {
  id: 'highKnees', name: '高抬腿', icon: '🏃', unit: '下', perSide: true,
  // 膝蓋往上是「垂直」的動作：正面、側面都看得到（側面另外看得到上半身有沒有往後仰）
  views: { front: 1, angled: 1, side: 0.9 },
  bestView: 'front',
  placement: '手機放在你的<b>正前方</b>約 2.5 公尺，<b>從頭到腳都要入鏡</b>。地面要止滑、穿鞋。',
  needs: ['hips', 'nearLeg'],
  calib: { key: 'highKnees', reps: 2, def: 0.7, min: 0.35, max: 0.95, minCount: 0.22, unit: '%', show: (v) => `${Math.round(v * 100)}%`, prompt: '左右膝蓋各抬 2 下，抬到舒服的高度就好。' },
  thresholds: (t) => ({ start: Math.max(0.12 / t, 0.2), count: Math.max(0.22 / t, 0.55), release: Math.max(0.07 / t, 0.12), minMs: 220, bounce: 0.4 }),
  metric(f, ctx) { const { L, R } = kneeLift(f, ctx.base); if (L == null && R == null) return null; return Math.max(L ?? -9, R ?? -9) / ctx.target; },
  adapt(f, ctx) { for (const k of ['L', 'R']) { const v = f['ky' + k]; if (v != null && Math.abs(v - ctx.base['ky' + k + '0']) < 0.06) ctx.base['ky' + k + '0'] += (v - ctx.base['ky' + k + '0']) * 0.03; } },
  track(acc, f, m, ctx) {
    const { L, R } = kneeLift(f, ctx.base);
    const side = (L ?? -9) >= (R ?? -9) ? 'left' : 'right';
    const v = side === 'left' ? L : R;
    if (acc.lift == null || v > acc.lift) { acc.lift = v; acc.side = side; }
    acc.maxTrunk = Math.max(acc.maxTrunk ?? 0, Math.abs(f.trunk ?? 0));
  },
  checks: [
    { code: 'height', label: '膝蓋抬多高', weight: 1.5, joints: ['hips', 'nearLeg'], views: { front: 1, angled: 1, side: 1 }, on: ['rep', 'partial'],
      how: '膝蓋往上抬了多少（和髖一樣高 = 100%），和你的舒服高度比。', score: (r, ctx) => clamp((r.lift ?? 0) / (ctx.target * 0.9), 0, 1),
      value: (r) => `${Math.round((r.lift ?? 0) * 100)}%`, hint: '膝蓋再抬高一點點', good: '抬得很高！' },
    { code: 'upright', label: '上半身直立', weight: 1, joints: ['shoulders', 'hips'], views: { front: 0, angled: 0.6, side: 1 },
      how: '抬腿時上半身有沒有往後仰或往前彎（側面才看得到）。', score: (r) => 1 - lerp01(r.maxTrunk ?? 0, 14, 28) * 0.7,
      value: (r) => `${Math.round(r.maxTrunk ?? 0)}°`, hint: '上半身保持直立，不要往後仰', good: '身體很直' },
  ],
  experimental: [{ code: 'landing', label: '落地輕不輕（不檢查）', why: '鏡頭看不出落地的力道。膝蓋或腳踝不舒服請改做「抬膝踏步」。' }],
  howto: [{ title: '原地站好', text: '雙手放在身體兩側' }, { title: '抬膝', text: '左右膝蓋輪流往上抬，手跟著擺' }, { title: '輕輕落地', text: '用腳掌前段著地' }],
};

// ── 抬膝踏步（高抬腿的低衝擊版：不跳、抬低一點） ──
const march = {
  ...highKnees, id: 'march', name: '抬膝踏步', icon: '🚶',
  calib: null, target: 0.45,
  placement: highKnees.placement.replace('地面要止滑、穿鞋。', '不用跳，一腳一直踩在地上。'),
  thresholds: () => ({ start: 0.25, count: 0.55, release: 0.15, minMs: 300, bounce: 0.4 }),
  checks: [{ ...highKnees.checks[0], hint: '膝蓋再抬高一點點（不用跳）' }, highKnees.checks[1]],
  howto: [{ title: '原地站好', text: '不用跳' }, { title: '抬膝', text: '左右輪流把膝蓋抬到腰的高度附近' }, { title: '一腳在地上', text: '低衝擊，膝蓋比較不吃力' }],
};

// ── 弓箭步 ──
const lunge = {
  id: 'lunge', name: '弓箭步', icon: '🤺', unit: '下',
  // 往前跨、往下蹲都是「前後」方向：側面最準；正面兩腳會疊在一起
  views: { front: 0.5, angled: 0.9, side: 1 },
  bestView: 'side',
  placement: '手機放在你的<b>側面</b>約 2.5～3 公尺（往前跨一大步也要在畫面裡），<b>從頭到腳都要入鏡</b>。左右腳輪流往前跨。',
  needs: ['hips', 'nearLeg'],
  calib: { key: 'lunge', reps: 2, def: 0.3, min: 0.18, max: 0.45, minCount: 0.12, unit: '%', show: (v) => `${Math.round(v * 100)}%`, prompt: '做 2 下舒服的弓箭步（往前跨、往下蹲），不用勉強。' },
  thresholds: (t) => ({ start: Math.max(0.06 / t, 0.18), count: Math.max(0.12 / t, 0.6), release: Math.max(0.04 / t, 0.12), minMs: 700, bounce: 0.3 }),
  metric: dropMetric, adapt: dropAdapt,
  track(acc, f, m, ctx) {
    const d = m * ctx.target;
    if (acc.peakDrop == null || d > acc.peakDrop) { acc.peakDrop = d; acc.knee = ctx.view === 'front' ? null : Math.min(f.kneeL ?? 180, f.kneeR ?? 180); }
    acc.maxTrunk = Math.max(acc.maxTrunk ?? 0, Math.abs(f.trunk ?? 0));
  },
  checks: [
    { code: 'depth', label: '蹲的深度', weight: 2, joints: ['hips', 'nearLeg'], views: { front: 0.5, angled: 0.9, side: 1 }, on: ['rep', 'partial'],
      how: '髖往下掉多少（和你的舒服深度比）；側面另外顯示前腳膝蓋角度。', score: (r, ctx) => clamp((r.peakDrop ?? 0) / (ctx.target * 0.9), 0, 1),
      value: (r) => `${Math.round((r.peakDrop ?? 0) * 100)}%${r.knee && r.knee < 179 ? `・膝 ${Math.round(r.knee)}°` : ''}`, hint: '再往下蹲一點，後腳膝蓋往地板靠近（不用碰地）', good: '深度剛好！' },
    { code: 'upright', label: '上半身直立', weight: 1, joints: ['shoulders', 'hips'], views: { front: 0, angled: 0.6, side: 1 },
      how: '往下蹲時上半身和垂直線的夾角（超過約 20° 開始扣分）。正面看不出前後傾。', score: (r) => 1 - lerp01(r.maxTrunk ?? 0, 20, 35) * 0.7,
      value: (r) => `${Math.round(r.maxTrunk ?? 0)}°`, hint: '上半身保持直立，像有一條線把頭往上拉', good: '上半身很穩' },
    tempo(800, 1400, '慢一點，往下 1 秒、站起來 1 秒'),
  ],
  experimental: [
    { code: 'kneeToe', label: '前膝超過腳尖（不檢查）', why: '目前沒有腳尖的關節點；而且膝蓋稍微超過腳尖本身不一定是錯。' },
    { code: 'sides', label: '左右是否交替（不檢查）', why: '側面時左右腳常被 MediaPipe 搞混，所以只算總次數，請自己左右輪流。' },
  ],
  howto: [{ title: '站好', text: '雙手叉腰' }, { title: '往前跨一大步', text: '兩腳膝蓋都彎到約 90°，上半身直立' }, { title: '推回來', text: '前腳用力推回站姿，換腳' }],
};

// ── 提踵（踮腳尖） ──
const calfRaise = {
  id: 'calfRaise', name: '提踵', icon: '🦶', unit: '下',
  // 目前的關節點沒有腳跟腳尖，只能看「整個人往上多少」：幅度小，而且手機一動、人往前後走都會影響，所以可信度一律「中」
  views: { front: 0.65, angled: 0.65, side: 0.65 },
  bestView: 'front',
  placement: '手機<b>一定要放穩</b>（靠牆或用支架），放在正前方或側面約 2.5 公尺，從頭到腳入鏡。可以一手扶牆或椅背。',
  needs: ['hips', 'shoulders', 'nearLeg'],
  calib: null,
  thresholds: () => ({ start: 0.25, count: 0.55, release: 0.15, minMs: 600, bounce: 0.35 }),
  // 用力程度 = 髖往上移動多少（以站直時的軀幹長為單位，目標 0.10 ≈ 5 公分）；身體在畫面裡變大變小（走動）時不算
  metric(f, { base }) {
    if (!f.Hm || !f.T || !base?.T || base.hipY == null) return null;
    if (Math.abs(f.T / base.T - 1) > 0.05) return null;
    const rise = (base.hipY - f.Hm.y) / base.T;
    // 踮腳時腳踝也會跟著往上一點；走近鏡頭時腳踝反而往下 → 不是踮腳
    if (f.A && base.ankleY != null) { const ank = (base.ankleY - f.A.y) / base.T; if (ank < -0.03 || ank > rise + 0.04) return 0; }
    return rise / 0.1;
  },
  adapt(f, ctx) {
    const b = ctx.base;
    b.ankleY ??= f.A?.y;
    if (f.Hm && Math.abs(f.Hm.y - b.hipY) < b.T * 0.03) { b.hipY += (f.Hm.y - b.hipY) * 0.03; b.T += (f.T - b.T) * 0.03; if (f.A) b.ankleY += (f.A.y - b.ankleY) * 0.03; }
  },
  track(acc, f, m) { acc.rise = Math.max(acc.rise ?? 0, m); },
  checks: [
    { code: 'height', label: '踮多高', weight: 1, joints: ['hips', 'shoulders'], views: { front: 0.65, angled: 0.65, side: 0.65 }, on: ['rep', 'partial'],
      how: '整個人往上移動多少（目標約 5 公分）。看不到腳跟，所以可信度只有「中」。', score: (r) => lerp01(r.rise ?? 0, 0.5, 0.9),
      value: (r) => `約 ${Math.round((r.rise ?? 0) * 5)} 公分`, hint: '腳跟再抬高一點，用腳尖站高', good: '踮得很高！' },
    tempo(900, 1500, '慢慢踮起、停一下、慢慢放下'),
  ],
  experimental: [{ code: 'heel', label: '腳跟有沒有真的離地（不檢查）', why: '目前的關節點沒有腳跟、腳尖；只能從整個人往上移動來推算。' }],
  howto: [{ title: '站好', text: '可以扶牆或椅背' }, { title: '踮腳尖', text: '腳跟慢慢抬高，停 1 秒' }, { title: '慢慢放下', text: '腳跟回到地面' }],
};

// ── 靠牆深蹲（維持秒數） ──
const wallSit = {
  id: 'wallSit', name: '靠牆深蹲', icon: '🛡️', unit: '秒', hold: true,
  views: { front: 0.85, angled: 0.95, side: 1 },
  bestView: 'side',
  placement: '背靠著牆，手機放在你的<b>側面</b>約 2.5 公尺、高度到膝蓋～腰，從頭到腳入鏡。',
  needs: ['hips', 'nearLeg'],
  calib: null,
  // 「維持」：用力程度 ≥ count 就開始計秒，低於 release 才算中斷（遲滯）
  thresholds: () => ({ start: 0.3, count: 0.62, release: 0.45, minMs: 0, bounce: 9 }),
  target: 0.45,
  metric: dropMetric, adapt: dropAdapt,
  track(acc, f, m, ctx) {
    (acc.dropList ||= []).push(m * ctx.target);
    acc.maxTrunk = Math.max(acc.maxTrunk ?? 0, Math.abs(f.trunk ?? 0));
    if (ctx.view !== 'front' && f.knee != null) acc.knee = Math.min(acc.knee ?? 180, f.knee);
  },
  checks: [
    { code: 'depth', label: '蹲的深度', weight: 1.5, joints: ['hips', 'nearLeg'], views: { front: 0.85, angled: 0.95, side: 1 },
      how: '維持期間髖往下多少（取中位數；大腿接近水平最好）。', score: (r) => lerp01(median(r.dropList), 0.3, 0.42),
      value: (r) => `${Math.round(median(r.dropList) * 100)}%${r.knee && r.knee < 179 ? `・膝 ${Math.round(r.knee)}°` : ''}`, hint: '在不會痛的範圍內再往下一點，大腿接近水平', good: '深度剛好！' },
    { code: 'upright', label: '背貼牆', weight: 1, joints: ['shoulders', 'hips'], views: { front: 0, angled: 0.6, side: 1 },
      how: '上半身和垂直線的夾角（背貼著牆時接近 0°）。正面看不出前後傾。', score: (r) => 1 - lerp01(r.maxTrunk ?? 0, 12, 25) * 0.7,
      value: (r) => `${Math.round(r.maxTrunk ?? 0)}°`, hint: '背和頭貼著牆，上半身不要往前', good: '背貼得很好' },
  ],
  experimental: [],
  howto: [{ title: '背靠牆', text: '腳往前走兩步，與肩同寬' }, { title: '往下滑', text: '像坐在隱形椅子上，大腿接近水平' }, { title: '撐住', text: '正常呼吸，不舒服就站起來' }],
};

// ── 坐到站（椅子） ──：和深蹲同一套量法，坐下時髖一定會到椅面高度，所以只檢查速度與重心
export function makeSitStand(squat) {
  return {
    ...squat, id: 'sitStand', name: '坐到站', icon: '🪑',
    placement: '椅子（不會滑動、沒有輪子）放在身後，手機放在你的<b>正前方或斜前方</b>約 2.5 公尺，坐著和站著時從頭到腳都要入鏡。',
    calib: { ...squat.calib, key: 'sitStand', def: 0.45, min: 0.3, max: 0.6, prompt: '從椅子上站起來、再慢慢坐下，做 3 下。' },
    checks: squat.checks.filter((c) => c.code !== 'trunk').map((c) => (c.code === 'depth' ? { ...c, label: '坐下去', hint: '慢慢坐到椅子上再站起來', good: '很好！' } : c.code === 'tempo' ? { ...c, hint: '慢一點：慢慢坐下、站起來' } : c)),
    experimental: [{ code: 'trunk', label: '上半身前傾（不檢查）', why: '從椅子站起來時上半身本來就要往前傾。' }],
    howto: [{ title: '坐在椅子前半', text: '雙腳踩穩、與肩同寬' }, { title: '站起來', text: '身體往前、用腳的力量站直，盡量不用手撐' }, { title: '慢慢坐下', text: '屁股輕輕碰到椅子' }],
  };
}

// ── 坐姿抬膝 ──
const seatedKnee = {
  id: 'seatedKnee', name: '坐姿抬膝', icon: '🪑', unit: '下', perSide: true, seated: true,
  views: { front: 1, angled: 1, side: 0.9 },
  bestView: 'front',
  placement: '坐在穩的椅子上（不要有輪子），手機放在正前方約 2 公尺，<b>坐著時從頭到腳入鏡</b>。校正時坐好、雙手放在大腿旁。',
  needs: ['hips', 'nearLeg'],
  calib: null,
  thresholds: () => ({ start: 0.25, count: 0.55, release: 0.15, minMs: 400, bounce: 0.4 }),
  // 坐著時膝蓋本來就在髖的高度附近：看膝蓋往上移動多少（以軀幹長為單位，目標 0.3）
  metric(f, { base }) {
    const L = f.kyL != null ? (base.kyL0 - f.kyL) : null, R = f.kyR != null ? (base.kyR0 - f.kyR) : null;
    if (L == null && R == null) return null;
    return Math.max(L ?? -9, R ?? -9) / 0.3;
  },
  adapt(f, ctx) { for (const k of ['L', 'R']) { const v = f['ky' + k]; if (v != null && Math.abs(v - ctx.base['ky' + k + '0']) < 0.04) ctx.base['ky' + k + '0'] += (v - ctx.base['ky' + k + '0']) * 0.03; } },
  track(acc, f, m, ctx) {
    const L = ctx.base.kyL0 - (f.kyL ?? ctx.base.kyL0), R = ctx.base.kyR0 - (f.kyR ?? ctx.base.kyR0);
    const side = L >= R ? 'left' : 'right';
    if (acc.lift == null || Math.max(L, R) > acc.lift) { acc.lift = Math.max(L, R); acc.side = side; }
    acc.maxTrunk = Math.max(acc.maxTrunk ?? 0, Math.abs(f.trunk ?? 0));
  },
  checks: [
    { code: 'height', label: '膝蓋抬多高', weight: 1, joints: ['hips', 'nearLeg'], views: { front: 1, angled: 1, side: 1 }, on: ['rep', 'partial'],
      how: '膝蓋往上移動多少（以軀幹長為單位）。', score: (r) => lerp01((r.lift ?? 0) / 0.3, 0.6, 0.95), value: (r) => `${Math.round(((r.lift ?? 0) / 0.3) * 100)}%`, hint: '膝蓋再往上抬一點點', good: '抬得很好！' },
    { code: 'upright', label: '上半身不要往後倒', weight: 1, joints: ['shoulders', 'hips'], views: { front: 0.8, angled: 0.6, side: 1 },
      how: '抬腿時上半身有沒有歪或往後靠。', score: (r) => 1 - lerp01(r.maxTrunk ?? 0, 12, 25) * 0.7, value: (r) => `${Math.round(r.maxTrunk ?? 0)}°`, hint: '坐直，不要靠椅背借力', good: '坐得很直' },
  ],
  experimental: [],
  howto: [{ title: '坐在椅子前半', text: '背打直' }, { title: '抬膝', text: '左右輪流把膝蓋往上抬' }, { title: '放下', text: '腳輕輕踩回地面' }],
};

// ── 坐姿開合手 ──
const seatedArms = {
  id: 'seatedArms', name: '坐姿開合手', icon: '🙌', unit: '下', seated: true,
  views: { front: 1, angled: 0.6, side: 0 },
  bestView: 'front',
  placement: '坐在穩的椅子上，手機放在正前方約 2 公尺，<b>雙手舉高時也要在畫面裡</b>。',
  needs: ['shoulders', 'wrists'],
  calib: null,
  thresholds: () => ({ start: 0.2, count: 0.55, release: 0.15, minMs: 350, bounce: 0.35 }),
  metric(f) { const a = Math.min(f.armL ?? 0, f.armR ?? 0); return clamp((a - 25) / (145 - 25), 0, 1.2); },
  adapt() {},
  track(acc, f) { acc.armL = Math.max(acc.armL ?? 0, f.armL ?? 0); acc.armR = Math.max(acc.armR ?? 0, f.armR ?? 0); },
  checks: [
    { code: 'arms', label: '手舉多高', weight: 1, joints: ['shoulders', 'wrists'], views: { front: 1, angled: 0.7, side: 0 }, on: ['rep', 'partial'],
      how: '手臂和身體側邊的夾角，兩手取比較低的那隻。', score: (r) => lerp01(Math.min(r.armL, r.armR), 100, 145), value: (r) => `${Math.round(Math.min(r.armL, r.armR))}°`, hint: '雙手從旁邊舉到頭頂', good: '手舉得很高！' },
    { code: 'sym', label: '兩手一樣高', weight: 0.5, joints: ['shoulders', 'wrists'], views: { front: 1, angled: 0.4, side: 0 },
      how: '左右手最高點的角度差。', score: (r) => 1 - lerp01(Math.abs(r.armL - r.armR), 25, 55) * 0.7, value: (r) => `差 ${Math.round(Math.abs(r.armL - r.armR))}°`, hint: '兩隻手一起舉、一樣高', good: '左右對稱' },
  ],
  experimental: [],
  howto: [{ title: '坐直', text: '雙手放在身體兩側' }, { title: '舉高', text: '雙手從旁邊舉到頭頂' }, { title: '放下', text: '慢慢放回身體兩側' }],
};

// ── 地板動作（實驗） ──
const FLOOR_PLACE = '手機<b>橫放在地上或矮凳上</b>，放在你的<b>側面</b>約 2～2.5 公尺，<b>從頭到腳都要在畫面裡</b>。光線要夠、穿和地板顏色不一樣的衣服。';
const lineCheck = { code: 'line', label: '身體一直線', weight: 1.5, joints: ['nearLeg', 'shoulders'], views: { front: 0, angled: 0.4, side: 1 },
  how: '肩—髖—腳踝是否成一直線：髖往地板塌（腰塌）或屁股翹高都會扣分。只有側面看得到。',
  score: (r) => 1 - lerp01(Math.abs(r.dev ?? 0), 0.1, 0.25) * 0.8, value: (r) => (r.dev == null ? '—' : r.dev > 0.1 ? '腰塌' : r.dev < -0.1 ? '屁股太高' : '一直線'),
  hint: '收緊肚子，身體保持一直線', good: '身體很直！' };
const trackLine = (acc, f) => { if (f.hipDev != null && (acc.dev == null || Math.abs(f.hipDev) > Math.abs(acc.dev))) acc.dev = f.hipDev; };

const plank = {
  id: 'plank', name: '棒式', icon: '🧱', unit: '秒', hold: true, lying: true, noBase: true, beta: true,
  views: { front: 0, angled: 0.4, side: 1 }, bestView: 'side', placement: FLOOR_PLACE,
  needs: ['nearLeg', 'nearArm'], calib: null,
  // 只要身體是橫的、而且大致成一直線（髖偏離不超過軀幹長的 40%）就計秒
  thresholds: () => ({ start: 0.3, count: 0.6, release: 0.4, minMs: 0, bounce: 9 }),
  metric(f) { if (!f.lying || f.hipDev == null) return 0; return 1 - lerp01(Math.abs(f.hipDev), 0.25, 0.45); },
  adapt() {}, track: trackLine, checks: [lineCheck],
  experimental: [{ code: 'floor', label: '實驗動作', why: '姿態模型主要是用站著的人訓練的；趴在地上時比較容易抓錯，真機驗證前標示「實驗」。' }],
  howto: [{ title: '前臂撐地', text: '手肘在肩膀正下方' }, { title: '身體一直線', text: '收緊肚子，頭到腳成一直線' }, { title: '撐住', text: '正常呼吸，不舒服就放下' }],
};
const pushUp = {
  id: 'pushUp', name: '伏地挺身', icon: '💪', unit: '下', lying: true, noBase: true, beta: true,
  views: { front: 0, angled: 0.4, side: 1 }, bestView: 'side', placement: FLOOR_PLACE + '跪姿（膝蓋著地）也可以。',
  needs: ['nearArm', 'shoulders'], calib: null,
  thresholds: () => ({ start: 0.22, count: 0.6, release: 0.15, minMs: 600, bounce: 0.35 }),
  // 用力程度 = 手肘彎多少（160° 撐直 → 90° = 1）；身體不是橫的（站著彎手）不算
  metric(f) { if (!f.lying || f.elbow == null) return f.lying === false ? 0 : null; return (160 - f.elbow) / 70; },
  adapt() {},
  track(acc, f) { acc.elbow = Math.min(acc.elbow ?? 180, f.elbow ?? 180); trackLine(acc, f); },
  checks: [
    { code: 'depth', label: '下去多低', weight: 1.5, joints: ['nearArm'], views: { front: 0, angled: 0.4, side: 1 }, on: ['rep', 'partial'],
      how: '最低點的手肘角度（約 90° 最好）。', score: (r) => lerp01(160 - (r.elbow ?? 160), 40, 65), value: (r) => `手肘 ${Math.round(r.elbow ?? 0)}°`, hint: '再往下一點，手肘彎到約 90°（跪姿也可以）', good: '深度剛好！' },
    { ...lineCheck, hint: '收緊肚子，腰不要塌下去' },
    tempo(900, 1500, '慢一點：慢慢下去、推上來'),
  ],
  experimental: [{ code: 'floor', label: '實驗動作', why: '趴著時手臂常被身體擋住，姿態模型比較容易抓錯，真機驗證前標示「實驗」。' }],
  howto: [{ title: '手撐地', text: '雙手比肩膀稍寬' }, { title: '往下', text: '身體一直線，手肘彎到約 90°' }, { title: '推上來', text: '吐氣推回去' }],
};
const bridge = {
  id: 'bridge', name: '臀橋', icon: '🌉', unit: '下', lying: true, noBase: true, beta: true,
  views: { front: 0, angled: 0.4, side: 1 }, bestView: 'side', placement: FLOOR_PLACE.replace('從頭到腳', '頭、肩膀、髖、膝蓋、腳'),
  needs: ['nearLeg', 'shoulders'], calib: null,
  thresholds: () => ({ start: 0.3, count: 0.62, release: 0.2, minMs: 700, bounce: 0.35 }),
  // 用力程度 = 肩—髖—膝的角度（約 128° 平躺 → 164° 接近一直線 = 1）
  metric(f) { if (!f.lying || f.hip == null) return f.lying === false ? 0 : null; return (f.hip - 128) / 36; },
  adapt() {},
  track(acc, f) { acc.hipMax = Math.max(acc.hipMax ?? 0, f.hip ?? 0); },
  checks: [
    { code: 'height', label: '髖推多高', weight: 1.5, joints: ['nearLeg', 'shoulders'], views: { front: 0, angled: 0.4, side: 1 }, on: ['rep', 'partial'],
      how: '最高點時肩—髖—膝的角度（接近一直線最好）。', score: (r) => lerp01(r.hipMax ?? 0, 150, 162), value: (r) => `${Math.round(r.hipMax ?? 0)}°`, hint: '屁股再往上推一點，夾緊臀部', good: '推得很高！' },
    tempo(900, 1500, '慢慢推上去、停一下、慢慢放下'),
  ],
  experimental: [{ code: 'floor', label: '實驗動作', why: '躺著時姿態模型比較容易抓錯；腰部過度拱起從單一鏡頭也分不清，所以不檢查。' }],
  howto: [{ title: '躺好', text: '膝蓋彎曲、腳踩地' }, { title: '推上去', text: '夾緊臀部把髖往上推，肩到膝成一直線' }, { title: '慢慢放下', text: '一節一節放回地面' }],
};

export const MORE = { highKnees, march, lunge, calfRaise, wallSit, seatedKnee, seatedArms, plank, pushUp, bridge };
// 「之後再做」的動作與理由（文件與選單會顯示）
export const LATER = [{ id: 'situp', name: '仰臥起坐', why: '上半身捲起時常被腿擋住、從單一鏡頭看不清；而且做錯容易拉傷脖子，在家沒人看著時風險比較高。' }];
