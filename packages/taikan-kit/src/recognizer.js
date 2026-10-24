// 動作辨識：把一連串 pose（鏡像正規化座標）轉成動作事件。
//
// 設計重點（理由寫在 README「延遲與誤判處理」）：
// - 一律用「肩寬」當長度單位，所以離鏡頭遠近、大人小孩都適用。
// - 用身體座標（相對兩肩中點）判斷手的動作，玩家整個人移動不會誤判成划槳。
// - 速度 + 位移雙門檻：要「夠快」也要「夠大」，抖一下不算。
// - 動作進行到一半就觸發（不等做完），降低體感延遲。
// - 每個動作有冷卻與「重新上膛」條件，一次划槳只算一次。
import { OneEuro } from './filter.js';
import { visible } from './pose.js';

const SENSITIVITY = { low: 1.25, normal: 1, high: 0.8 };
const TRACKED = ['nose', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftHip', 'rightHip'];
const HINTS = {
  ok: '',
  lost: '看不到你，請站（或坐）到鏡頭正前方',
  tooClose: '太近了，請往後退一步',
  tooFar: '太遠了，請往前一點',
  edge: '請移到畫面中間',
  hands: '請讓雙手也出現在畫面裡',
  crowd: '鏡頭前有兩個人，請只留一位玩家',
};
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

export class Recognizer {
  constructor({ sensitivity = 'normal', disabled = [], emit = () => {} } = {}) {
    this.emit = emit;
    this.disabled = new Set(disabled);
    this.setSensitivity(sensitivity);
    this.reset();
  }

  setSensitivity(s) { this.sensitivity = s; this.k = SENSITIVITY[s] ?? 1; }
  setDisabled(list) { this.disabled = new Set(list); }

  reset() {
    this.filters = {};
    this.hist = [];
    this.base = null;          // 校準基準：{ y: 兩肩中點高度, sw: 肩寬, roll: 平常肩膀角度 }
    this.stillSince = null;
    this.lastSeen = -1e9;
    this.crowdSince = null;
    this.handsSeen = -1e9;
    this.tracking = 'lost';
    this.cool = {};
    this.strokes = {};
    this.raise = { left: { up: false, since: 0, fired: false }, right: { up: false, since: 0, fired: false }, pending: null };
    this.jump = { armed: true, at: -1e9 };
    this.crouching = false; this.crouchSince = null;
    this.leanSide = 'center';
    this.state = { tracking: 'lost', hint: HINTS.lost, calibrated: false, lean: 0, leanSide: 'center', crouch: 0, crouching: false, armsUp: 0, hands: null };
    this.debug = {};
  }

  calibrate() { this.base = null; this.stillSince = null; this.state.calibrated = false; }

  can(type, t) { return !this.disabled.has(type) && t >= (this.cool[type] || 0); }

  fire(e, t, cooldownMs, key = e.type) {
    this.cool[key] = t + cooldownMs;
    this.emit({ ...e, time: t });
  }

  setTracking(s, t) {
    if (s === this.tracking) return;
    this.tracking = s;
    this.state.tracking = s;
    this.state.hint = HINTS[s];
    this.emit({ type: 'status', tracking: s, hint: HINTS[s], time: t });
  }

  // pose: { t, kp } 或 null（這一格沒有偵測到人）
  feed(pose, t = pose?.t ?? performance.now()) {
    const kp = pose?.kp;
    if (!kp || !visible(kp.leftShoulder) || !visible(kp.rightShoulder)) {
      if (t - this.lastSeen > 400) {
        this.setTracking('lost', t);
        // 人不見了：放掉所有「按住」類狀態，避免回來時誤觸
        this.endCrouch(t);
        this.updateLean(0, t);
        this.state.hands = null;
        for (const k in this.filters) this.filters[k].x.reset(), this.filters[k].y.reset();
        this.hist = [];
      }
      return;
    }
    this.lastSeen = t;

    // 1. 濾波
    const p = {};
    for (const name of TRACKED) {
      const k = kp[name];
      if (!visible(k, 0.4)) continue;
      const f = (this.filters[name] ||= { x: new OneEuro(), y: new OneEuro() });
      p[name] = { x: f.x.filter(k.x, t), y: f.y.filter(k.y, t) };
    }
    const L = p.leftShoulder, R = p.rightShoulder;
    const S = { x: (L.x + R.x) / 2, y: (L.y + R.y) / 2 };
    const sw = Math.max(Math.hypot(R.x - L.x, R.y - L.y), 0.03);

    // 2. 追蹤品質提示
    const lw = p.leftWrist, rw = p.rightWrist;
    if (lw || rw) this.handsSeen = t;
    // someone else in the picture for more than a second (the camera reports pose.others)
    if (pose.others > 0) this.crowdSince ??= t; else this.crowdSince = null;
    let status = 'ok';
    if (this.crowdSince !== null && t - this.crowdSince > 1000) status = 'crowd';
    else if (sw > 0.42) status = 'tooClose';
    else if (sw < 0.08) status = 'tooFar';
    else if (S.x < 0.15 || S.x > 0.85) status = 'edge';
    else if (t - this.handsSeen > 1500) status = 'hands';
    this.setTracking(status, t);

    // 3. 身體座標：原點 = 兩肩中點，單位 = 肩寬，y 向下為正
    const rel = (q) => (q ? { x: (q.x - S.x) / sw, y: (q.y - S.y) / sw } : null);
    const hl = rel(lw), hr = rel(rw);
    const mid = hl && hr ? { x: (hl.x + hr.x) / 2, y: (hl.y + hr.y) / 2 } : (hl || hr);
    const nose = rel(p.nose);
    const roll = Math.atan2(R.y - L.y, R.x - L.x); // 左肩比較低 → 負值（向左傾）
    const frame = { t, S, sw, hl, hr, mid, nose, roll };
    this.hist.push(frame);
    while (this.hist.length && t - this.hist[0].t > 1200) this.hist.shift();
    this.state.hands = { left: hl, right: hr };

    // 4. 自動校準：前 0.8 秒穩定不動就當作「平常姿勢」
    this.autoCalibrate(frame);
    if (!this.base) return;

    // 5. 各動作
    this.detectLean(frame);
    this.detectPaddle(frame);
    this.detectRaise(frame);
    this.detectSwing(frame);
    this.detectJumpCrouch(frame);
  }

  // 取得約 dtMs 毫秒前的那一格（用來算速度與位移）
  ago(dtMs) {
    const t = this.hist[this.hist.length - 1].t - dtMs;
    for (let i = this.hist.length - 1; i >= 0; i--) if (this.hist[i].t <= t) return this.hist[i];
    return this.hist[0];
  }

  autoCalibrate(f) {
    const prev = this.ago(250);
    const dt = Math.max((f.t - prev.t) / 1000, 1e-3);
    const motion = Math.hypot(f.S.x - prev.S.x, f.S.y - prev.S.y) / f.sw / dt;
    const still = motion < 0.6 && f.t - prev.t > 100;
    if (!this.base) {
      if (still) this.stillSince ??= f.t; else this.stillSince = null;
      if (this.stillSince !== null && f.t - this.stillSince > 800) {
        this.base = { y: f.S.y, sw: f.sw, roll: f.roll };
        this.state.calibrated = true;
        this.emit({ type: 'status', tracking: this.tracking, hint: this.state.hint, calibrated: true, time: f.t });
      }
      return;
    }
    // 慢慢跟著玩家調整（換坐姿、往前挪），但蹲低、跳躍時不跟
    if (still && !this.crouching && f.t - this.jump.at > 1000) {
      const a = 0.01;
      this.base.y += (f.S.y - this.base.y) * a;
      this.base.sw += (f.sw - this.base.sw) * a;
      this.base.roll += (f.roll - this.base.roll) * a * 0.5;
    }
  }

  updateLean(v, t) {
    this.state.lean = v;
    // 遲滯：超過 0.35 才算傾斜，回到 0.2 以內才算回正，避免在邊界來回跳
    let side = this.leanSide;
    if (side === 'center') { if (v < -0.35) side = 'left'; else if (v > 0.35) side = 'right'; }
    else if (Math.abs(v) < 0.2 || Math.sign(v) !== (side === 'left' ? -1 : 1)) side = Math.abs(v) > 0.35 ? (v < 0 ? 'left' : 'right') : 'center';
    if (side !== this.leanSide) {
      this.leanSide = side;
      this.state.leanSide = side;
      if (!this.disabled.has('lean')) this.emit({ type: 'lean', side, value: +v.toFixed(2), time: t });
    }
  }

  detectLean(f) {
    if (this.disabled.has('lean')) { this.state.lean = 0; return; }
    const ang = f.roll - this.base.roll;              // 肩膀連線角度
    const head = f.nose ? clamp(f.nose.x / 0.45, -1, 1) : 0; // 頭偏向哪邊
    let raw = (0.75 * ang) / (0.3 * this.k) + 0.25 * head; // 約 17° 傾斜 = 滿格
    const dead = 0.12;
    raw = Math.sign(raw) * Math.max(Math.abs(raw) - dead, 0) / (1 - dead);
    this.debug.leanAngleDeg = +((ang * 180) / Math.PI).toFixed(1);
    this.updateLean(+clamp(raw, -1, 1).toFixed(3), f.t);
  }

  // 划槳：手（雙手中點或同側那隻手）在身體一側，由上往下拉
  detectPaddle(f) {
    if (this.disabled.has('paddle')) return;
    const prev = this.ago(66);
    const dt = Math.max((f.t - prev.t) / 1000, 1e-3);
    const D = 0.45 * this.k, V = 1.2 * this.k;
    const cands = [
      ['left', 'mid', f.mid, prev.mid, (h) => h.x < -0.3],
      ['right', 'mid', f.mid, prev.mid, (h) => h.x > 0.3],
      ['left', 'hand', f.hl, prev.hl, (h) => h.x < -0.55],
      ['right', 'hand', f.hr, prev.hr, (h) => h.x > 0.55],
    ];
    const fired = {};
    for (const [side, kind, h, h0, inZone] of cands) {
      const key = side + kind;
      const s = (this.strokes[key] ||= { top: null, low: null, armed: true });
      if (!h || !inZone(h)) { s.top = null; s.low = null; s.armed = true; continue; }
      const vy = h0 ? (h.y - h0.y) / dt : 0;
      const vx = h0 ? (h.x - h0.x) / dt : 0;
      // 重新上膛：手往回舉高 0.25 肩寬
      if (!s.armed) { s.low = Math.max(s.low ?? h.y, h.y); if (s.low - h.y > 0.25) { s.armed = true; s.top = h.y; } continue; }
      s.top = s.top === null ? h.y : Math.min(s.top, h.y);
      if (h.y - s.top >= D && vy >= V && Math.abs(vy) > Math.abs(vx) * 0.8) {
        s.armed = false; s.low = h.y;
        fired[side] = Math.max(fired[side] || 0, clamp(0.3 + (vy - V) / 4, 0.2, 1));
        this.debug.lastPaddleVy = +vy.toFixed(2);
      }
    }
    const t = f.t;
    if (fired.left && fired.right) return this.firePaddle('both', Math.max(fired.left, fired.right), t);
    for (const side of ['left', 'right']) {
      if (!fired[side]) continue;
      // 另一隻手也在自己那側同時往下拉 → 雙槳
      const other = side === 'left' ? f.hr : f.hl, other0 = side === 'left' ? prev.hr : prev.hl;
      const out = other && (side === 'left' ? other.x > 0.5 : other.x < -0.5);
      const ovy = other && other0 ? (other.y - other0.y) / dt : 0;
      if (out && ovy > V * 0.6) {
        const k2 = (side === 'left' ? 'right' : 'left') + 'hand';
        if (this.strokes[k2]) { this.strokes[k2].armed = false; this.strokes[k2].low = other.y; }
        return this.firePaddle('both', fired[side], t);
      }
      this.firePaddle(side, fired[side], t);
    }
  }

  firePaddle(side, strength, t) {
    const key = 'paddle-' + side;
    if (!this.can(key, t) || t < (this.cool['paddle-both'] || 0)) return;
    if (t < (this.cool.swingBlock || 0)) return;
    // 一次划槳把兩側的候選都停用，避免同一個動作被「雙手中點」和「單手」各算一次
    for (const k of [side + 'mid', side + 'hand']) if (this.strokes[k]) { this.strokes[k].armed = false; this.strokes[k].low = -1e9; }
    if (side === 'both') for (const k of ['leftmid', 'rightmid', 'lefthand', 'righthand']) if (this.strokes[k]) { this.strokes[k].armed = false; this.strokes[k].low = -1e9; }
    this.fire({ type: 'paddle', side, strength: +strength.toFixed(2) }, t, 280, key);
  }

  // 舉手：手腕高過頭頂 0.15 秒。單手舉會等 0.2 秒，看是不是要舉雙手。
  detectRaise(f) {
    const headY = f.nose ? f.nose.y : -0.6;
    const up = (h) => !!h && h.y < headY - 0.2;
    const t = f.t, R = this.raise;
    let n = 0;
    for (const side of ['left', 'right']) {
      const h = side === 'left' ? f.hl : f.hr, r = R[side];
      if (up(h)) { if (!r.up) { r.up = true; r.since = t; } n++; }
      else if (!h || h.y > 0.1) { r.up = false; r.fired = false; } // 手放到肩膀以下才重新上膛
    }
    this.state.armsUp = n / 2;
    if (this.disabled.has('raise')) return;
    const ready = (s) => R[s].up && !R[s].fired && t - R[s].since >= 150;
    if (ready('left') && ready('right')) {
      R.left.fired = R.right.fired = true; R.pending = null;
      return this.fire({ type: 'raise', side: 'both' }, t, 400, 'raise');
    }
    for (const s of ['left', 'right']) {
      if (!ready(s)) continue;
      const other = s === 'left' ? 'right' : 'left';
      if (R[other].up) continue; // 另一隻也舉著，等它滿 0.15 秒一起算雙手
      if (!R.pending) R.pending = { side: s, at: t };
      if (R.pending.side === s && t - R.pending.at >= 200) {
        R[s].fired = true; R.pending = null;
        this.fire({ type: 'raise', side: s }, t, 400, 'raise-' + s);
      }
    }
  }

  // 揮臂：手腕快速水平移動（揮棒、揮手、甩繩）
  detectSwing(f) {
    if (this.disabled.has('swing')) return;
    const p = this.ago(250), q = this.ago(80);
    for (const side of ['left', 'right']) {
      const h = side === 'left' ? f.hl : f.hr, h0 = side === 'left' ? p.hl : p.hr, h1 = side === 'left' ? q.hl : q.hr;
      if (!h || !h0 || !h1) continue;
      const dt = Math.max((f.t - q.t) / 1000, 1e-3);
      const vx = (h.x - h1.x) / dt, vy = (h.y - h1.y) / dt;
      const travel = h.x - h0.x;
      if (Math.abs(vx) >= 3.2 * this.k && Math.abs(travel) >= 0.9 * this.k && Math.abs(vx) > 1.5 * Math.abs(vy) && this.can('swing-' + side, f.t)) {
        this.cool.swingBlock = f.t + 250;
        this.fire({ type: 'swing', side, dir: vx < 0 ? 'left' : 'right', strength: +clamp(Math.abs(vx) / 8, 0.2, 1).toFixed(2) }, f.t, 450, 'swing-' + side);
      }
    }
  }

  // 跳躍與蹲低：兩肩中點相對「平常高度」的變化（單位：校準時的肩寬）
  detectJumpCrouch(f) {
    const b = this.base;
    const dy = (b.y - f.S.y) / b.sw; // 正 = 比平常高
    const p = this.ago(120);
    const dt = Math.max((f.t - p.t) / 1000, 1e-3);
    const vup = (p.S.y - f.S.y) / b.sw / dt;
    // 玩家正在走近/走遠（肩寬快速變化）時不判斷，避免誤認為跳躍或蹲下
    const walking = Math.abs(f.sw - this.ago(300).sw) / b.sw > 0.15;
    this.debug.heightDy = +dy.toFixed(2);
    const t = f.t;
    if (!this.jump.armed && dy < 0.12) this.jump.armed = true;
    if (!this.disabled.has('jump') && this.jump.armed && !walking && !this.crouching && dy >= 0.28 * this.k && vup >= 1.6 * this.k && this.can('jump', t)) {
      this.jump.armed = false; this.jump.at = t;
      this.fire({ type: 'jump', strength: +clamp(dy / 0.8, 0.2, 1).toFixed(2) }, t, 700);
    }
    this.state.crouch = +clamp(-dy / 0.9, 0, 1).toFixed(2);
    if (this.disabled.has('crouch')) return;
    const afterJump = t - this.jump.at < 700; // 落地時身體會往下沉，不算蹲
    if (!this.crouching) {
      if (dy <= -0.55 * this.k && !walking && !afterJump) { this.crouchSince ??= t; if (t - this.crouchSince >= 200) { this.crouching = true; this.state.crouching = true; this.emit({ type: 'crouch', on: true, time: t }); } }
      else this.crouchSince = null;
    } else if (dy > -0.35 * this.k) this.endCrouch(t);
  }

  endCrouch(t) {
    this.crouchSince = null;
    if (!this.crouching) return;
    this.crouching = false; this.state.crouching = false;
    this.emit({ type: 'crouch', on: false, time: t });
  }
}
