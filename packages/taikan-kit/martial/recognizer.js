// 武術動作辨識（單一前鏡頭、全身入鏡）：馬步姿勢、出拳、提膝（實驗）。
//
// 跟 src/recognizer.js 一樣吃鏡像正規化的 pose，長度一律用「肩寬」當單位，所以遠近、大人小孩都適用。
// 這個檔案只負責武術動作；開始／暫停（雙手舉高）、看不到人、兩人同框等提示仍由原本的 Recognizer 處理。
//
// 判斷方式（理由見 README.md）：
// - 馬步深度＝骨盆下降量：髖部到腳踝的高度，跟「站直時」比少了多少（站好不動時自動記住）。
// - 出拳＝手腕從「腰部」快速升到「肩膀高度」且手肘抬到接近肩膀高度（正面出拳時手臂朝鏡頭，
//   畫面上手臂會變短，只剩這兩個線索）；必須先收回腰部才能算下一拳。
// - 提膝＝一邊膝蓋抬到接近髖部高度、腳踝比另一腳高很多（踢擊的前半段，預設關閉）。
import { OneEuro } from '../src/filter.js';

const SENSITIVITY = { low: 1.25, normal: 1, high: 0.8 };
const POINTS = ['nose', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
// 骨盆下降到「大腿接近水平」時，髖部高度約少了站直時的 36%（人體比例）；以此當深度 1
const FULL_DROP = 0.36;

export const MARTIAL_HINTS = {
  noLegs: '請往後退，讓腳也出現在畫面裡（約 2.5～3 公尺）',
  tooClose: '太近了！請往後退到看得到全身',
};

export class MartialRecognizer {
  constructor({ sensitivity = 'normal', disabled = ['knee'], emit = () => {} } = {}) {
    this.emit = emit;
    this.setSensitivity(sensitivity);
    this.setDisabled(disabled);
    this.reset();
  }

  setSensitivity(s) { this.sensitivity = s; this.k = SENSITIVITY[s] ?? 1; }
  setDisabled(list) { this.disabled = new Set(list); }

  reset() {
    this.filters = {};
    this.hist = [];
    this.base = null;        // 站直時：{ H: 髖到腳踝的高度（肩寬）, torso: 肩到髖的高度（肩寬） }
    this.stillSince = null;
    this.arms = { left: this.arm(), right: this.arm() };
    this.knees = { left: { armed: true, cool: 0 }, right: { armed: true, cool: 0 } };
    this.lastSeen = -1e9;
    this.state = {
      seen: false, fullBody: false, hint: '', calibrated: false,
      stance: null,  // { width, depth, kneeSpread, kneesIn, torso, upright, handsAtWaist }
      arms: { left: 'chamber', right: 'chamber' },
    };
  }
  arm() { return { phase: 'chamber', armed: true, leftChamberAt: 0, extSince: null, cool: 0 }; }

  // 重新記住「站直」的樣子（換人、或每段開始前站好時呼叫）
  calibrate() { this.base = null; this.stillSince = null; this.state.calibrated = false; }

  feed(pose, t = pose?.t ?? performance.now()) {
    const kp = pose?.kp;
    const ok = (k, v = 0.5) => k && k.v >= v;
    if (!kp || !ok(kp.leftShoulder) || !ok(kp.rightShoulder)) {
      if (t - this.lastSeen > 400) {
        this.state.seen = false; this.state.fullBody = false; this.state.stance = null;
        for (const k in this.filters) this.filters[k].x.reset(), this.filters[k].y.reset();
        this.hist = [];
      }
      return;
    }
    this.lastSeen = t;
    const p = {};
    for (const name of POINTS) {
      const k = kp[name];
      if (!ok(k, 0.4)) continue;
      const f = (this.filters[name] ||= { x: new OneEuro(), y: new OneEuro() });
      p[name] = { x: f.x.filter(k.x, t), y: f.y.filter(k.y, t), raw: k };
    }
    const L = p.leftShoulder, R = p.rightShoulder;
    const S = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
    const sw = Math.max(Math.hypot(R.x - L.x, R.y - L.y), 0.02);
    const legs = ['leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'].every((n) => p[n] && ok(p[n].raw) && p[n].raw.y < 0.985);
    this.state.seen = true;
    this.state.fullBody = legs;
    this.state.hint = sw > 0.24 ? MARTIAL_HINTS.tooClose : legs ? '' : MARTIAL_HINTS.noLegs;
    this.state.sw = sw;

    const rel = (q, o = S) => (q ? { x: (q.x - o.x) / sw, y: (q.y - o.y) / sw } : null);
    const f = { t, S, sw, p, rel };
    this.hist.push({ t, S, sw, lw: rel(p.leftWrist), rw: rel(p.rightWrist) });
    while (this.hist.length && t - this.hist[0].t > 600) this.hist.shift();

    this.measureStance(f);
    this.autoCalibrate(f);
    this.detectPunch(f, 'left');
    this.detectPunch(f, 'right');
    if (!this.disabled.has('knee')) { this.detectKnee(f, 'left'); this.detectKnee(f, 'right'); }
  }

  ago(ms) {
    const t = this.hist[this.hist.length - 1].t - ms;
    for (let i = this.hist.length - 1; i >= 0; i--) if (this.hist[i].t <= t) return this.hist[i];
    return this.hist[0];
  }

  // ── 馬步 ──
  measureStance({ p, sw, S, rel }) {
    const hipMid = p.leftHip && p.rightHip ? { x: (p.leftHip.x + p.rightHip.x) / 2, y: (p.leftHip.y + p.rightHip.y) / 2 } : null;
    const torso = hipMid ? (hipMid.y - S.y) / sw : null;
    const lw = rel(p.leftWrist), rw = rel(p.rightWrist);
    // 雙拳收在腰間：兩手腕都在胸口以下、靠近身體
    const atWaist = (w, s) => w && w.y > 0.7 && w.y < 1.7 && Math.abs(w.x - s * 0.5) < 0.6;
    const handsAtWaist = atWaist(lw, -1) && atWaist(rw, 1);
    const st = { torso, handsAtWaist, upright: null, width: null, depth: null, kneeSpread: null, kneesIn: false };
    if (torso !== null) {
      const t0 = this.base?.torso ?? 1.4;
      // 上身前傾時，畫面上肩到髖的距離會變短；左右歪也算
      const tilt = Math.abs(Math.atan2(hipMid.x - S.x, hipMid.y - S.y));
      st.upright = torso >= t0 * 0.86 && tilt < 0.26;
    }
    if (this.state.fullBody) {
      const aw = Math.abs(p.rightAnkle.x - p.leftAnkle.x);
      st.width = aw / sw;
      const H = ((p.leftAnkle.y + p.rightAnkle.y) / 2 - hipMid.y) / sw;
      st.H = H;
      const H0 = this.base?.H ?? 2.3;
      st.depth = clamp((1 - H / H0) / FULL_DROP, 0, 1.3);
      st.kneeSpread = Math.abs(p.rightKnee.x - p.leftKnee.x) / Math.max(aw, 0.01);
      // 蹲下去時膝蓋往內倒（膝蓋距離明顯比腳踝窄）：容易受傷，要提醒
      st.kneesIn = st.depth > 0.2 && st.kneeSpread < 0.72;
    }
    this.state.stance = st;
  }

  autoCalibrate({ t, S, sw }) {
    const st = this.state.stance;
    const prev = this.ago(250);
    const dt = Math.max((t - prev.t) / 1000, 1e-3);
    const still = Math.hypot(S.x - prev.S.x, S.y - prev.S.y) / sw / dt < 0.5 && t - prev.t > 100;
    // 站直（雙腳、骨盆都看得到）而且不動 0.8 秒；腳張開蹲下時不校準
    const standing = this.state.fullBody && st.torso > 0.9 && st.H > 1.6 && (!this.base || st.H > this.base.H * 0.95);
    if (still && standing) this.stillSince ??= t; else this.stillSince = null;
    if (this.stillSince !== null && t - this.stillSince > 800) {
      if (!this.base) { this.base = { H: st.H, torso: st.torso }; this.state.calibrated = true; }
      else { this.base.H += (st.H - this.base.H) * 0.05; this.base.torso += (st.torso - this.base.torso) * 0.05; }
    }
  }

  // ── 出拳 ──
  detectPunch({ t, p, sw }, side) {
    const A = this.arms[side];
    const sh = p[side + 'Shoulder'], el = p[side + 'Elbow'], wr = p[side + 'Wrist'];
    if (!sh || !el || !wr) return;
    const e = { x: (el.x - sh.x) / sw, y: (el.y - sh.y) / sw };
    const w = { x: (wr.x - sh.x) / sw, y: (wr.y - sh.y) / sw };
    const k = this.k;
    // 伸出：手腕在肩膀高度附近、手肘抬到接近肩膀（低於頭頂，避免把「舉手」當出拳）
    const extended = w.y > -0.45 && w.y < 0.42 / k && e.y < 0.45 / k && e.y > -0.2 && w.y - e.y > -0.3;
    // 收回：拳頭回到腰間，或手肘垂下（從下巴前的防守姿勢出拳也可以）
    const chamber = w.y > 0.62 * k || e.y > 0.56 * k;
    if (chamber) {
      if (A.phase !== 'chamber') A.armed = true;
      A.phase = 'chamber'; A.leftChamberAt = t; A.extSince = null;
    } else if (extended) {
      A.extSince ??= t;
      // 至少維持 50 毫秒（避免舉手經過肩膀高度時誤算），而且是從腰部很快伸出來的
      if (A.armed && t - A.extSince >= 50 && t - A.leftChamberAt < 500 && t >= A.cool) {
        const past = this.ago(220), wn = side === 'left' ? past.lw : past.rw;
        const now = this.hist[this.hist.length - 1], wc = side === 'left' ? now.lw : now.rw;
        const speed = wn && wc ? Math.hypot(wc.x - wn.x, wc.y - wn.y) / Math.max((now.t - past.t) / 1000, 0.05) : 0;
        if (speed > 1.6 * k) {
          A.armed = false; A.cool = t + 250;
          this.emit({ type: 'punch', side, strength: +clamp(speed / 7, 0.2, 1).toFixed(2), time: t });
        }
      }
      A.phase = 'extended';
    } else { A.phase = 'between'; A.extSince = null; }
    this.state.arms[side] = A.phase;
  }

  // ── 提膝（實驗） ──
  detectKnee({ t, p, sw }, side) {
    if (!this.state.fullBody) return;
    const K = this.knees[side], other = side === 'left' ? 'right' : 'left';
    const hip = p[side + 'Hip'], knee = p[side + 'Knee'], ank = p[side + 'Ankle'], ank2 = p[other + 'Ankle'];
    const thigh = (knee.y - hip.y) / sw, lift = (ank2.y - ank.y) / sw;
    const up = thigh < 0.45 / this.k && lift > 0.6 * this.k;
    if (up && K.armed && t >= K.cool) { K.armed = false; K.cool = t + 500; this.emit({ type: 'knee', side, time: t }); }
    if (lift < 0.25) K.armed = true;
  }
}
