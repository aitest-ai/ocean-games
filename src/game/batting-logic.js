// 打擊練習的規則（純計算，不碰畫面，可以在 node 裡測試）：投球軌跡、揮棒時機判定、擊球飛行與結果。
import { FIELD, fenceR, angleOf } from '../land/dims.js';

const G = 9.81;
// 空氣阻力係數 k = ½·ρ·Cd·A / m（硬式棒球：直徑 7.3 cm、145 g、Cd≈0.35）
const DRAG = 0.5 * 1.2 * 0.35 * Math.PI * 0.0365 ** 2 / 0.145;
export const PLATE_Z = 0.25;      // 擊球點（本壘板中間，好球帶前後的中心）
export const MITT_Z = -0.75;      // 捕手手套
export const RELEASE = [0.35, 1.55, FIELD.pitch - 0.9]; // 五年級投手的出手點（右投：從捕手看在左邊，+x）

// 三種難度：球速（公里/小時）、時機寬容度（秒）、壞球比例……
// 球速刻意比真實少棒慢（真實約 80～100 km/h）：鏡頭判斷有零點幾秒延遲，學生也需要時間看球。
export const DIFFICULTY = {
  easy: { label: '簡單', note: '球速約 45 公里/小時、全部好球、有「時機圈」提示', speed: 45, speedVar: 0, window: 0.2, ballRate: 0, assist: true, pitches: 10, gap: 3.0, outs: { hang: 3.4, grounder: 14 } },
  normal: { label: '普通', note: '球速約 55～62 公里/小時，偶爾有壞球（不揮棒就對了）', speed: 58, speedVar: 4, window: 0.14, ballRate: 0.15, assist: true, pitches: 10, gap: 2.7, outs: { hang: 2.9, grounder: 17 } },
  hard: { label: '挑戰', note: '球速約 62～75 公里/小時、有變速球、沒有時機圈', speed: 68, speedVar: 7, window: 0.1, ballRate: 0.25, assist: false, pitches: 12, gap: 2.4, outs: { hang: 2.6, grounder: 20 } },
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

// 產生一球：{ speed (m/s), T（從出手到擊球點的秒數）, target [x,y], strike, change, pos(t) }
export function makePitch(d, rand) {
  const isBall = rand() < d.ballRate;
  const change = d.speedVar > 5 && rand() < 0.25; // 變速球：慢很多
  const kmh = change ? d.speed * 0.78 : d.speed + (rand() * 2 - 1) * d.speedVar;
  const speed = kmh / 3.6;
  const [zl, zh] = FIELD.strikeZone;
  let tx, ty;
  if (isBall) {
    // 明顯的壞球：太外角、太內角、太高或太低
    const k = Math.floor(rand() * 4);
    tx = k === 0 ? 0.55 : k === 1 ? -0.55 : (rand() - 0.5) * 0.3;
    ty = k === 2 ? zh + 0.3 : k === 3 ? zl - 0.28 : zl + (zh - zl) * rand();
  } else {
    tx = (rand() - 0.5) * 0.32;
    ty = zl + 0.08 + (zh - zl - 0.16) * rand();
  }
  const [x0, y0, z0] = RELEASE;
  const dist = z0 - PLATE_Z;
  const T = dist / speed;
  const vx = (tx - x0) / T, vz = -speed;
  const vy = (ty - y0 + 0.5 * G * T * T) / T;
  return {
    kmh: Math.round(kmh), speed, T, target: [tx, ty], strike: !isBall, change,
    pos(t) { return [x0 + vx * t, y0 + vy * t - 0.5 * G * t * t, z0 + vz * t]; },
    vel(t) { return [vx, vy - G * t, vz]; },
  };
}

// 揮棒判定：e = 揮棒時間 − 球到擊球點的時間（秒，負 = 太早）
//   |e| ≤ window：打到前面（好球帶裡）；window～1.8×window：擦到，界外；更多：揮空
//   太早 → 拉打（右打者往三壘側），太晚 → 推打（往一壘側）
export function judgeSwing(e, d, { strength = 0.7, lefty = false, pitch = null, rand = Math.random } = {}) {
  const w = d.window;
  const a = Math.abs(e);
  // 壞球位置差很多時比較難打好
  const reach = pitch && !pitch.strike ? 0.55 : 1;
  if (a > w * 1.8 || (pitch && !pitch.strike && a > w * reach * 1.4)) return { contact: false, e };
  const q = Math.max(0, 1 - a / (w * reach)); // 0～1：1 = 時機完美
  // 拉打方向：以本壘看出去的角度（+ = 三壘側）。右打者太早拉向三壘
  const side = lefty ? -1 : 1;
  let spray = -e / w * 0.62 * side + (rand() - 0.5) * 0.12;
  if (a > w) spray = Math.sign(spray || side) * (0.9 + (a / w - 1) * 0.6); // 擦到 → 一定界外
  // 擊球仰角：時機越準越接近 18～30°，差一點容易打成滾地或高飛
  const launch = a > w ? (rand() < 0.5 ? -10 : 60) + rand() * 15 : 25 + (rand() - 0.5) * (14 + 50 * (1 - q)) - (pitch ? (pitch.target[1] - 0.75) * 25 : 0);
  // 擊球初速（m/s）：少棒選手約 20～32 m/s
  const exit = a > w ? 12 + rand() * 6 : 17 + 18.5 * q * (0.55 + 0.45 * strength) + rand() * 2;
  return { contact: true, e, q, spray, launch: Math.max(-15, Math.min(70, launch)), exit };
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
  constructor(d) { this.d = d; this.n = 0; this.score = 0; this.log = []; this.count = { homer: 0, long: 0, hit: 0, out: 0, foul: 0, miss: 0, take: 0, looking: 0 }; }
  get hits() { return this.count.homer + this.count.long + this.count.hit; }
  get done() { return this.n >= this.d.pitches; }
  record(kind, extra = {}) {
    this.n++;
    this.count[kind]++;
    this.score += SCORE[kind];
    this.log.push({ kind, ...extra });
  }
  // 星星：看「有揮到、打進場內」的比例（壞球不揮也算做對）
  stars() {
    const good = this.hits + this.count.take;
    const r = good / this.d.pitches;
    return r >= 0.6 ? 3 : r >= 0.35 ? 2 : good >= 1 ? 1 : 0;
  }
}
