// 從 pose 算出健身動作要用的「身體量測值」：關節角度、身體傾斜、腳張開的寬度……
//
// 座標：pose 是正規化座標（x 0～1 = 畫面寬，y 0～1 = 畫面高）。畫面不是正方形，直接拿來算角度會歪，
// 所以先把 x 乘上「畫面寬 / 高」（aspect），換成「以畫面高度為單位」的座標再算。
// 抖動與漏格：每個關節先取最近 3 格的中位數（去掉偶發亂跳的單一格），再用 One Euro 濾波（去抖動）。
// 所有時間都用 pose.t（這一格的時間），不用「資料到達的時間」。
import { OneEuro } from '../filter.js';
import { KEYPOINTS } from '../pose.js';

export const DEG = 180 / Math.PI;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const med3 = (a, b, c) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
export const mid = (a, b) => (a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) } : null);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 三點角度（b 是頂點），0～180 度
export function angle(a, b, c) {
  if (!a || !b || !c) return null;
  const v1 = [a.x - b.x, a.y - b.y], v2 = [c.x - b.x, c.y - b.y];
  const n = Math.hypot(...v1) * Math.hypot(...v2);
  if (n < 1e-9) return null;
  return Math.acos(clamp((v1[0] * v2[0] + v1[1] * v2[1]) / n, -1, 1)) * DEG;
}

// 從 from 指向 to 的線段和「垂直向上」的夾角（度，帶正負號：往畫面右邊倒為正）
export function tiltFromVertical(from, to) {
  if (!from || !to) return null;
  return Math.atan2(to.x - from.x, from.y - to.y) * DEG;
}

export class PoseSmoother {
  constructor({ minCutoff = 1.2, beta = 5, gapMs = 250 } = {}) {
    Object.assign(this, { minCutoff, beta, gapMs });
    this.reset();
  }

  reset() { this.f = {}; this.hist = {}; this.vis = {}; }

  // 回傳 { name: {x, y, v} }（x 已乘 aspect）；看不到的關節 v 會很低但仍保留位置
  feed(pose, aspect) {
    const out = {};
    const t = pose.t;
    for (const n of KEYPOINTS) {
      const k = pose.kp[n];
      if (!k) { this.hist[n] = []; continue; }
      const raw = { x: k.x * aspect, y: k.y, v: k.v ?? 1, t };
      const H = (this.hist[n] ||= []);
      if (H.length && t - H[H.length - 1].t > this.gapMs) { H.length = 0; delete this.f[n]; }
      H.push(raw);
      if (H.length > 3) H.shift();
      const x = H.length === 3 ? med3(H[0].x, H[1].x, H[2].x) : raw.x;
      const y = H.length === 3 ? med3(H[0].y, H[1].y, H[2].y) : raw.y;
      const F = (this.f[n] ||= { x: new OneEuro({ minCutoff: this.minCutoff, beta: this.beta }), y: new OneEuro({ minCutoff: this.minCutoff, beta: this.beta }) });
      // 可信度也平滑一下（MediaPipe 的 v 一格一格跳很大）
      this.vis[n] = this.vis[n] === undefined ? raw.v : this.vis[n] + (raw.v - this.vis[n]) * 0.35;
      out[n] = { x: F.x.filter(x, t), y: F.y.filter(y, t), v: this.vis[n] };
    }
    return out;
  }
}

const vis = (p, names) => Math.min(...names.map((n) => p[n]?.v ?? 0));

// 一格的身體量測值。base = 站直時的基準（校正量到的；沒有就是 null）
export function measure(p, base) {
  const LS = p.leftShoulder, RS = p.rightShoulder, LH = p.leftHip, RH = p.rightHip;
  const LK = p.leftKnee, RK = p.rightKnee, LA = p.leftAnkle, RA = p.rightAnkle;
  const S = mid(LS, RS), Hm = mid(LH, RH), A = mid(LA, RA);
  const T = S && Hm ? dist(S, Hm) : null;                      // 軀幹長（肩中點到髖中點）
  const swx = LS && RS ? Math.abs(LS.x - RS.x) : null;         // 肩膀左右寬（水平距離）
  const hwx = LH && RH ? Math.abs(LH.x - RH.x) : null;
  const sw = LS && RS ? dist(LS, RS) : null;
  const roll0 = base?.trunk0 ?? 0;                             // 手機沒放正造成的歪斜
  const f = {
    S, Hm, A, T, sw, swx, hwx,
    // 寬高比：正面約 0.75，側面接近 0（用來猜玩家是正面還是側面對鏡頭）
    widthRatio: T ? Math.max(swx ?? 0, (hwx ?? 0) * 1.5) / T : null,
    // 軀幹和垂直線的夾角（度）。正面看 = 往左右歪；側面看 = 往前彎
    trunk: S && Hm ? tiltFromVertical(Hm, S) - roll0 : null,
    kneeL: angle(LH, LK, LA), kneeR: angle(RH, RK, RA),
    hipL: angle(LS, LH, LK), hipR: angle(RS, RH, RK),
    elbowL: angle(LS, p.leftElbow, p.leftWrist), elbowR: angle(RS, p.rightElbow, p.rightWrist),
    // 手臂側舉角度：髖—肩—手腕的夾角（0 = 垂下、90 = 水平、180 = 舉到頭頂）
    armL: angle(LH, LS, p.leftWrist), armR: angle(RH, RS, p.rightWrist),
    // 腿往外張的角度（髖→腳踝和垂直向下的夾角，往身體外側為正）
    // 鏡像畫面：玩家的左腳在畫面左邊，所以左腳往外 = x 變小
    legL: LH && LA ? Math.atan2(LH.x - LA.x, LA.y - LH.y) * DEG - roll0 : null,
    legR: RH && RA ? Math.atan2(RA.x - RH.x, RA.y - RH.y) * DEG + roll0 : null,
    // 髖到腳踝的高度（畫面高度單位）
    h: A && Hm ? A.y - Hm.y : null,
    // 兩腳張開的水平距離（以肩寬為單位）
    spread: LA && RA && swx ? Math.abs(LA.x - RA.x) / Math.max(base?.sw ?? sw, 1e-3) : null,
    // 髖的左右位置相對兩腳中間（以肩寬為單位，往畫面右邊為正）
    shift: Hm && A && (base?.sw ?? sw) ? (Hm.x - A.x) / (base?.sw ?? sw) : null,
    vis: {
      head: vis(p, ['nose']),
      // 肩、髖取兩邊平均：側面時遠的那一邊被擋住，但中點還是估得出來
      shoulders: ((p.leftShoulder?.v ?? 0) + (p.rightShoulder?.v ?? 0)) / 2,
      hips: ((p.leftHip?.v ?? 0) + (p.rightHip?.v ?? 0)) / 2,
      knees: vis(p, ['leftKnee', 'rightKnee']),
      ankles: vis(p, ['leftAnkle', 'rightAnkle']),
      wrists: vis(p, ['leftWrist', 'rightWrist']),
      left: vis(p, ['leftShoulder', 'leftHip', 'leftKnee', 'leftAnkle']),
      right: vis(p, ['rightShoulder', 'rightHip', 'rightKnee', 'rightAnkle']),
    },
  };
  // 離鏡頭比較近的那一側（側面時另一側被身體擋住，可信度本來就低）
  f.vis.nearLeg = Math.max(f.vis.left, f.vis.right);
  // 身體在畫面中的範圍（頭頂到腳踝），用來提示「太近／太遠／看不到腳」
  const ys = ['nose', 'leftAnkle', 'rightAnkle'].map((n) => p[n]).filter(Boolean);
  f.top = p.nose ? p.nose.y - (T ?? 0.1) * 0.45 : null;
  f.bottom = ys.length ? Math.max(...ys.map((q) => q.y)) : null;
  // 側面時比較看得清楚的那一邊（離鏡頭近、可信度高）
  f.near = f.vis.left >= f.vis.right ? 'L' : 'R';
  // 膝蓋在髖下方多遠（以軀幹長為單位）：站直約 0.85，抬到和髖一樣高 = 0（高抬腿、坐姿抬膝）
  f.kyL = LK && LH && T ? (LK.y - LH.y) / T : null;
  f.kyR = RK && RH && T ? (RK.y - RH.y) / T : null;
  // 手臂（肩—肘—腕）看得最清楚的那一邊
  const arm = (sd) => vis(p, [sd + 'Shoulder', sd + 'Elbow', sd + 'Wrist']);
  f.vis.nearArm = Math.max(arm('left'), arm('right'));
  f.elbow = arm('left') >= arm('right') ? f.elbowL : f.elbowR;
  // 身體是不是橫的（趴著、躺著）：軀幹和垂直線夾角 50°～130°
  f.lying = f.trunk != null && Math.abs(Math.abs(tiltFromVertical(Hm, S)) - 90) < 40;
  // 趴著／躺著時，髖偏離「肩—腳踝」連線多少（以軀幹長為單位）：正 = 往地板塌、負 = 屁股翹高
  {
    const sd = f.near === 'L' ? 'left' : 'right';
    const Sh = p[sd + 'Shoulder'], Hp = p[sd + 'Hip'], An = p[sd + 'Ankle'];
    if (Sh && Hp && An && T && Math.abs(An.x - Sh.x) > 1e-3) {
      const k = (Hp.x - Sh.x) / (An.x - Sh.x);
      f.hipDev = (Hp.y - (Sh.y + (An.y - Sh.y) * k)) / T;
      f.line = angle(Sh, Hp, An);
    } else { f.hipDev = null; f.line = null; }
  }
  // 鼻子偏離兩肩中點多少（以肩寬為單位）：正對鏡頭 ≈ 0，轉 45° 約 0.26
  f.noseOff = p.nose && S && swx > 0.02 ? (p.nose.x - S.x) / swx : null;
  f.knee = f.near === 'L' ? f.kneeL : f.kneeR;
  f.hip = f.near === 'L' ? f.hipL : f.hipR;
  return f;
}

// 兩個角度的平均（其中一個看不到就用另一個）
export const avg2 = (a, b) => (a == null ? b : b == null ? a : (a + b) / 2);
export { clamp, med3 };
