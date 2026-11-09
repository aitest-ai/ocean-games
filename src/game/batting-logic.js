// 打擊練習的規則（純計算，不碰畫面，可以在 node 裡測試）：投球軌跡、揮棒時機判定、擊球飛行與結果。
import { FIELD, fenceR, angleOf } from '../land/dims.js';

const G = 9.81;
// 空氣阻力係數 k = ½·ρ·Cd·A / m（硬式棒球：直徑 7.3 cm、145 g、Cd≈0.35）
const DRAG = 0.5 * 1.2 * 0.35 * Math.PI * 0.0365 ** 2 / 0.145;
export const PLATE_Z = 0.25;      // 擊球點（本壘板中間，好球帶前後的中心）
export const MITT_Z = -0.75;      // 捕手手套
export const RELEASE = [0.35, 1.55, FIELD.pitch - 0.9]; // 五年級投手的出手點（右投：從捕手看在左邊，+x）

// ── 可調的設定（老師可以在選單「進階調整」改；網址參數也可以：?win=1.2&spd=0.9&htol=1.5&inout=1） ──
// 揮棒延遲的真機數字還沒回來，所以「時機寬容度」「球速」都用倍率，不寫死在各球種裡：
//   windowScale：時機寬容度倍率（鏡頭延遲抖動大的平板 → 調大）
//   speedScale ：所有球種的球速倍率（學生來不及反應 → 調小）
//   heightTol  ：揮棒高低的寬容度倍率（0＝不看高低，只看時機）
//   inOut      ：內外角要提早／延後揮的程度（0＝不分內外角）
export const TUNE_DEFAULT = { windowScale: 1, speedScale: 1, heightTol: 1, inOut: 1 };
export const TUNE_RANGE = { windowScale: [0.6, 1.8], speedScale: [0.6, 1.3], heightTol: [0, 2], inOut: [0, 1.5] };
export function makeTune(t = {}) {
  const out = { ...TUNE_DEFAULT };
  for (const k of Object.keys(TUNE_DEFAULT)) {
    const v = Number(t[k]);
    if (Number.isFinite(v)) out[k] = Math.min(Math.max(v, TUNE_RANGE[k][0]), TUNE_RANGE[k][1]);
  }
  return out;
}

// ── 3×3 好球帶與壞球區 ──
// 從捕手往投手看：col 0 = 左（三壘側、右打者的內角）、2 = 右；row 0 = 高、2 = 低。
const [ZL, ZH] = FIELD.strikeZone;
const HALF = FIELD.plateWidth / 2;
export const ZONE = {
  halfWidth: HALF, low: ZL, high: ZH,
  colX: (c) => HALF - (c + 0.5) * (2 * HALF / 3),   // +x 是捕手的左邊（三壘側）
  rowY: (r) => ZH - (r + 0.5) * ((ZH - ZL) / 3),
};
// 九宮格：0～8（列 × 3 ＋ 行）。壞球區：好球帶外一圈 8 個位置（距離框約一顆半球）
export const STRIKE_CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const BALL_CELLS = ['highIn', 'high', 'highOut', 'in', 'out', 'lowIn', 'low', 'lowOut'];
const BALL_GAP = 0.13;
export function cellTarget(cell) {
  if (typeof cell === 'number') return [ZONE.colX(cell % 3), ZONE.rowY(Math.floor(cell / 3))];
  // 壞球：in＝三壘側（+x），out＝一壘側（−x）；以右打者來說 in 就是內角
  const x = cell.includes('In') || cell === 'in' ? HALF + BALL_GAP : cell.includes('Out') || cell === 'out' ? -HALF - BALL_GAP : 0;
  const y = cell.startsWith('high') ? ZH + BALL_GAP : cell.startsWith('low') ? ZL - BALL_GAP : (ZL + ZH) / 2;
  return [x, y];
}
// 球實際通過本壘板的位置 → 落在哪一格（畫面上的提示、結算用）
export function cellOf(x, y) {
  const inX = Math.abs(x) <= HALF + 0.037, inY = y >= ZL - 0.037 && y <= ZH + 0.037; // 球擦到邊也算好球
  if (inX && inY) {
    const c = Math.min(2, Math.max(0, Math.floor((HALF - x) / (2 * HALF / 3))));
    const r = Math.min(2, Math.max(0, Math.floor((ZH - y) / ((ZH - ZL) / 3))));
    return { strike: true, cell: r * 3 + c };
  }
  const v = y > ZH ? 'high' : y < ZL ? 'low' : '';
  const h = x > HALF ? 'In' : x < -HALF ? 'Out' : '';
  return { strike: false, cell: v ? v + h : h.toLowerCase() };
}

// ── 球種 ──
// speed：相對直球的球速；brk：比「沒有旋轉的球」多出的位移（公尺，到本壘板時；x＋＝三壘側、y＋＝往上）；
// late：位移出現的時機（越大越晚才變，指叉球最晚）；spin：畫面上的旋轉（看得出來的慢速版本，不是真實轉速）；
// arm：投手出手的手臂角度線索（over 上肩、high 高壓、side 側肩）。數字是給國小學生「看得出差別」的誇張版，不是真實數據。
export const PITCH_TYPES = {
  fastball: { label: '直球', speed: 1.0, brk: [0, 0.05], late: 2, spin: { axis: [1, 0, 0], rps: 6 }, arm: 'over', color: '#ffffff', hint: '最快、最直' },
  changeup: { label: '變速球', speed: 0.8, brk: [0.07, -0.12], late: 2, spin: { axis: [1, 0, 0], rps: 3 }, arm: 'over', color: '#9fe3ff', hint: '動作跟直球一樣，但慢很多' },
  curve: { label: '曲球', speed: 0.74, brk: [-0.06, -0.34], late: 1.5, spin: { axis: [-1, 0, 0], rps: 5 }, arm: 'high', color: '#ffd25a', hint: '出手後先往上飄，再大大往下掉' },
  slider: { label: '滑球', speed: 0.86, brk: [-0.24, -0.06], late: 2.6, spin: { axis: [0, 0, 1], rps: 7 }, arm: 'side', color: '#ff9f6b', hint: '側肩出手，最後往一壘側滑開' },
  splitter: { label: '指叉球', speed: 0.88, brk: [0, -0.28], late: 4, spin: { axis: [0.3, 1, 0], rps: 1.2 }, arm: 'over', color: '#c8a2ff', hint: '看起來像直球，最後一段突然往下掉' },
};

// 三種難度：出現哪些球種（權重）、球速（直球，公里/小時）、時機寬容度（秒）、壞球比例、高低寬容度（公尺）……
// 球速刻意比真實少棒慢（真實約 80～100 km/h）：鏡頭判斷有零點幾秒延遲，學生也需要時間看球。
export const DIFFICULTY = {
  easy: { label: '簡單', note: '只有直球（約 45 公里/小時）、全部好球、有「時機圈」與球種提示；揮高揮低只會改變打出去的方向，不會揮空', speed: 45, speedVar: 0, window: 0.2, ballRate: 0, assist: true, showType: 'release', pitches: 10, gap: 3.0, outs: { hang: 3.4, grounder: 14 }, types: { fastball: 1 }, height: { tol: 0.5, miss: false } },
  normal: { label: '普通', note: '直球、變速球、曲球（約 43～62 公里/小時），偶爾有壞球；揮的高低差太多會擦棒或打成滾地球', speed: 58, speedVar: 4, window: 0.14, ballRate: 0.15, assist: true, showType: 'release', pitches: 10, gap: 2.7, outs: { hang: 2.9, grounder: 17 }, types: { fastball: 4, changeup: 2, curve: 2 }, height: { tol: 0.32, miss: true } },
  hard: { label: '挑戰', note: '五種球種（含滑球、指叉球）、沒有時機圈、球投出後才告訴你是什麼球；高低要對準', speed: 68, speedVar: 5, window: 0.1, ballRate: 0.25, assist: false, showType: 'after', pitches: 12, gap: 2.4, outs: { hang: 2.6, grounder: 20 }, types: { fastball: 4, changeup: 2, curve: 2, slider: 2, splitter: 2 }, height: { tol: 0.22, miss: true } },
};

export const SCORE = { homer: 100, long: 60, hit: 40, out: 10, foul: 10, miss: 0, take: 20, looking: 0 };
export const LABEL = {
  homer: '全壘打！', long: '長打！', hit: '安打！', out: '出局（被接住）', foul: '界外球', miss: '揮空', take: '壞球，選得好！', looking: '好球（沒揮棒）',
};

// 可重現的亂數
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

const pickWeighted = (w, rand) => {
  const e = Object.entries(w).filter(([k, v]) => v > 0 && PITCH_TYPES[k]);
  let r = rand() * e.reduce((a, [, v]) => a + v, 0);
  for (const [k, v] of e) { if ((r -= v) <= 0) return k; }
  return e[e.length - 1][0];
};

// 產生一球：{ type, cell, strike, kmh, speed, T（出手到擊球點的秒數）, target [x,y]（通過本壘板的位置）, pos(t), vel(t) }
// opts.type / opts.cell 可以指定（測試、揮棒測試用）；tune.speedScale 調整球速
export function makePitch(d, rand, { type, cell, tune = TUNE_DEFAULT } = {}) {
  type ??= pickWeighted(d.types || { fastball: 1 }, rand);
  const P = PITCH_TYPES[type] || PITCH_TYPES.fastball;
  if (cell === undefined) cell = rand() < d.ballRate ? BALL_CELLS[Math.floor(rand() * BALL_CELLS.length)] : STRIKE_CELLS[Math.floor(rand() * 9)];
  const kmh = (d.speed + (rand() * 2 - 1) * d.speedVar) * P.speed * (tune.speedScale ?? 1);
  const speed = kmh / 3.6;
  const [tx, ty] = cellTarget(cell);
  const [bx, by] = P.brk, late = P.late;
  const [x0, y0, z0] = RELEASE;
  const dist = z0 - PLATE_Z;
  const T = dist / speed;
  // 基本路徑瞄準「目標 − 變化量」，最後一段的變化把球帶進目標格子（所以曲球一開始看起來偏高）
  const ax = tx - bx, ay = ty - by;
  const vx = (ax - x0) / T, vz = -speed;
  const vy = (ay - y0 + 0.5 * G * T * T) / T;
  const f = (t) => Math.pow(Math.max(t, 0) / T, late), df = (t) => (late * Math.pow(Math.max(t, 0) / T, late - 1)) / T;
  return {
    type, label: P.label, cell, strike: typeof cell === 'number', kmh: Math.round(kmh), speed, T, target: [tx, ty],
    change: type === 'changeup', brk: [bx, by], spin: P.spin, arm: P.arm,
    pos(t) { return [x0 + vx * t + bx * f(t), y0 + vy * t - 0.5 * G * t * t + by * f(t), z0 + vz * t]; },
    vel(t) { return [vx + bx * df(t), vy - G * t + by * df(t), vz]; },
  };
}

// 內角／外角：球越靠內角，越要「早一點」在身體前面打到；外角要等球進來「晚一點」打。
// 鏡頭看不到球棒碰球的前後位置，所以這是由規則算的：理想的揮棒時間依球的左右位置往前／往後移。
export const IN_OUT_SHIFT = 0.35; // 最內角時，理想時機提早「時機寬容度 × 0.35」
export function idealShift(pitch, d, { lefty = false, tune = TUNE_DEFAULT } = {}) {
  if (!pitch?.target) return 0;
  const inside = clampN((pitch.target[0] * (lefty ? -1 : 1)) / HALF, -1.3, 1.3); // ＋＝內角（右打者站在 +x）
  return -inside * IN_OUT_SHIFT * d.window * (tune.windowScale ?? 1) * (tune.inOut ?? 1);
}
const clampN = (x, a, b) => Math.min(Math.max(x, a), b);

// 揮棒判定。e＝揮棒時間 − 球到擊球點的時間（秒，負＝太早）。
// swing（可省略）：從手腕高低算出來的揮棒描述 { plane: −1 劈／0 平／+1 挑, heightM: 擊球瞬間球棒大約的高度（公尺）, power: 0.4～1.3, reliable }
//   沒有 swing（例如自動揮棒、拿不到骨架）時只看時機，跟以前一樣。
// 回傳 { contact, e, eAdj, q（時機品質）, qh（高低品質）, dh（球比球棒高多少公尺）, spray, launch, exit, why }
export function judgeSwing(e, d, { strength = 0.7, lefty = false, pitch = null, swing = null, tune = TUNE_DEFAULT, rand = Math.random } = {}) {
  const w = d.window * (tune.windowScale ?? 1);
  const eAdj = e - idealShift(pitch, d, { lefty, tune });
  const a = Math.abs(eAdj);
  // 壞球位置差很多時比較難打好
  const reach = pitch && pitch.strike === false ? 0.55 : 1;
  if (a > w * 1.8 || (pitch && pitch.strike === false && a > w * reach * 1.4)) return { contact: false, e, eAdj, why: eAdj < 0 ? 'early' : 'late' };
  // 高低：球棒高度跟球差多少
  const H = d.height || { tol: 0.4, miss: false };
  const htol = (H.tol ?? 0.4) * (tune.heightTol ?? 1) * (swing && swing.reliable === false ? 1.5 : 1);
  let dh = 0, qh = 1;
  if (swing && Number.isFinite(swing.heightM) && pitch?.target && htol > 0) {
    dh = pitch.target[1] - swing.heightM;
    // 「挑」的球棒由下往上走，對低球比較寬容；「劈」對高球比較寬容
    const plane = swing.plane || 0;
    const eff = Math.abs(dh) * (plane * dh < 0 ? 0.75 : 1);
    qh = Math.max(0, 1 - eff / htol);
    if (H.miss && eff > htol * 1.6) return { contact: false, e, eAdj, dh, qh: 0, why: dh > 0 ? 'under' : 'over' };
  }
  const qt = Math.max(0, 1 - a / (w * reach)); // 0～1：1 = 時機完美
  const q = qt * (0.35 + 0.65 * qh);
  // 拉打方向：以本壘看出去的角度（+ = 三壘側）。右打者太早拉向三壘
  const side = lefty ? -1 : 1;
  let spray = -eAdj / w * 0.62 * side + (rand() - 0.5) * 0.12;
  let foulTip = a > w || (swing && htol > 0 && qh <= 0); // 擦棒（簡單模式高低差很多時也只是擦棒界外，不會揮空）
  if (foulTip) spray = Math.sign(spray || side) * (0.9 + Math.max(a / w - 1, 0.2) * 0.6);
  // 擊球仰角：時機越準越接近 18～30°；球棒在球下面 → 往上飛（高飛、界外），在球上面 → 滾地
  const plane = swing?.plane || 0;
  let launch;
  if (foulTip) launch = (rand() < 0.5 ? -10 : 60) + rand() * 15;
  else {
    launch = 25 + (rand() - 0.5) * (14 + 50 * (1 - qt)) - (pitch ? (pitch.target[1] - 0.75) * 25 : 0);
    launch += plane * 10;                                   // 挑＋10°、劈−10°
    if (swing && htol > 0) launch += dh > 0 ? 45 * Math.min(dh / htol, 1.2) : 60 * Math.max(dh / htol, -1.2); // 打到球的下緣／上緣
  }
  // 擊球初速（m/s）：少棒選手約 20～32 m/s；力道用手腕速度（swing.power），沒有就用事件的 strength
  const power = Math.min(Math.max(swing?.power ?? strength, 0.3), 1.3);
  const exit = foulTip ? 12 + rand() * 6 : 17 + 18.5 * q * (0.55 + 0.45 * power) + rand() * 2;
  return { contact: true, e, eAdj, q, qt, qh, dh, spray, launch: Math.max(-15, Math.min(70, launch)), exit, foulTip, why: foulTip ? (a > w ? (eAdj < 0 ? 'early' : 'late') : dh > 0 ? 'under' : 'over') : null };
}

// 擊球後的飛行（含空氣阻力、彈跳、撞牆），回傳 { path(t), result, dist, hang, ... }
export function flyBall(hit, d, from = [0, 0.9, PLATE_Z]) {
  const la = (hit.launch * Math.PI) / 180;
  let v = [Math.sin(hit.spray) * Math.cos(la) * hit.exit, Math.sin(la) * hit.exit, Math.cos(hit.spray) * Math.cos(la) * hit.exit];
  let p = [...from];
  const pts = [[0, ...p]];
  const dt = 1 / 120;
  let t = 0, first = null, wall = null, homer = false, bounces = 0;
  while (t < 9) {
    const sp = Math.hypot(...v);
    v = [v[0] - DRAG * sp * v[0] * dt, v[1] - (G + DRAG * sp * v[1]) * dt, v[2] - DRAG * sp * v[2] * dt];
    const q = [p[0] + v[0] * dt, p[1] + v[1] * dt, p[2] + v[2] * dt];
    t += dt;
    // 外野牆（只有界內方向）
    const ang = angleOf(q[0], q[2]), r = Math.hypot(q[0], q[2]);
    if (!wall && !homer && q[2] > 0 && Math.abs(ang) <= Math.PI / 4 && r >= fenceR(ang)) {
      if (q[1] > FIELD.wallHeight) { homer = true; first ??= { t, p: q, fair: true }; }
      else {
        wall = { t, p: q };
        first ??= { t, p: q, fair: true, wall: true };
        // 撞牆反彈
        const nx = q[0] / r, nz = q[2] / r, dot = v[0] * nx + v[2] * nz;
        v = [(v[0] - 2 * dot * nx) * 0.35, v[1] * 0.5, (v[2] - 2 * dot * nz) * 0.35];
        q[0] = p[0]; q[2] = p[2];
      }
    }
    if (q[1] <= 0.036) {
      q[1] = 0.036;
      if (!first) first = { t, p: q, fair: q[2] > 0 && Math.abs(angleOf(q[0], q[2])) <= Math.PI / 4 };
      bounces++;
      if (v[1] < -1.2) v = [v[0] * 0.7, -v[1] * 0.42, v[2] * 0.7];
      else { v[1] = 0; const s = Math.hypot(v[0], v[2]), ns = Math.max(s - 5 * dt, 0); v[0] *= s ? ns / s : 0; v[2] *= s ? ns / s : 0; }
    }
    p = q;
    pts.push([t, ...p]);
    if (homer && r > fenceR(ang) + 15) break;
    if (Math.hypot(v[0], v[2]) < 0.3 && p[1] <= 0.04) break;
  }
  const fp = first ? first.p : p;
  const dist = Math.hypot(fp[0], fp[2]);
  const hang = first ? first.t : t;
  // 結果分類
  let result;
  if (!first || !first.fair) result = 'foul';
  else if (homer) result = 'homer';
  else if (first.wall || dist >= 50) result = 'long';
  else {
    const grounder = hit.launch < 10;
    // 滾地球太軟、高飛球在空中太久（野手跑得到）、內野小飛球 → 出局
    const weak = grounder ? hit.exit < d.outs.grounder : (hang > d.outs.hang && dist < 56) || (hit.launch > 42 && dist < 40);
    result = weak ? 'out' : 'hit';
  }
  return {
    result, dist, hang, duration: t, landing: fp,
    path(time) {
      if (time <= 0) return pts[0].slice(1);
      const i = Math.min(Math.floor(time * 120), pts.length - 1);
      return pts[i].slice(1);
    },
  };
}

// 一輪練習的計分
export class Session {
  constructor(d) { this.d = d; this.n = 0; this.score = 0; this.log = []; this.byType = {}; this.count = { homer: 0, long: 0, hit: 0, out: 0, foul: 0, miss: 0, take: 0, looking: 0 }; }
  get hits() { return this.count.homer + this.count.long + this.count.hit; }
  get done() { return this.n >= this.d.pitches; }
  record(kind, extra = {}) {
    this.n++;
    if (extra.type) { const t = (this.byType[extra.type] ||= { n: 0, hits: 0, swings: 0 }); t.n++; if (['homer', 'long', 'hit'].includes(kind)) t.hits++; if (!['take', 'looking'].includes(kind)) t.swings++; }
    this.count[kind]++;
    this.score += SCORE[kind];
    this.log.push({ kind, ...extra });
  }
  // 星星：看「有揮到、打進場內」的比例（壞球不揮也算做對）
  stars() {
    const good = this.hits + this.count.take;
    const r = good / this.d.pitches;
    // 3 星還要「揮空不超過兩成」：亂揮的人碰巧打到幾支也拿不到滿分
    return r >= 0.6 && this.count.miss <= this.d.pitches * 0.2 ? 3 : r >= 0.35 ? 2 : good >= 1 ? 1 : 0;
  }
}
