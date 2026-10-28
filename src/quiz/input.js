// Input for the quiz: taikan-kit events and continuous values → one plain "input frame" per game
// frame, which is all the level rules see (so the rules run in node tests without a camera).
//
//   { t, lean, side: 'left'|'center'|'right', armsUp: 0|0.5|1, crouch, crouching, cross, events: [...] }
//
// Only existing actions are used (the shared recognizer is not changed). Two poses are read here from
// the kit's hand positions, like the fishing game reads its reel:
//   cross  — arms crossed (or hands together) in front of the chest: the "×" of a true/false question
//   pump   — arms swinging up and down like running (stage two, src/quiz/levels/sprint.js)
// Keyboard simulation of those two poses moves the simulated puppet (X, R), never sends fake events.

// hands: kit.state.hands = { left, right } in shoulder widths from the shoulder centre, y down;
// "left" is the hand on the left of the (mirrored) picture
export function isCross(hands) {
  const l = hands?.left, r = hands?.right;
  if (!l || !r) return false;
  const chest = (h) => h.y > -0.45 && h.y < 0.8;
  if (!chest(l) || !chest(r)) return false;
  const crossed = l.x > r.x + 0.05;                                         // wrists swapped sides
  const together = Math.abs(l.x - r.x) < 0.3 && Math.abs(l.y - r.y) < 0.45;  // hands meet in the middle
  return crossed || (together && Math.abs((l.x + r.x) / 2) < 0.45);
}

// arm pumping (running in place): how fast the two wrists move up and down in opposite directions,
// averaged over ~0.6 s, 0..1. Averaging makes it indifferent to camera delay and frame rate.
export class PumpMeter {
  constructor({ window = 600, full = 5 } = {}) { this.window = window; this.full = full; this.h = []; this.value = 0; }
  reset() { this.h.length = 0; this.value = 0; }
  update(t, hands) {
    const l = hands?.left, r = hands?.right;
    if (!l || !r) { this.h.length = 0; this.value *= 0.9; return this.value; }
    this.h.push({ t, ly: l.y, ry: r.y });
    while (this.h.length && t - this.h[0].t > this.window) this.h.shift();
    let s = 0;
    for (let i = 1; i < this.h.length; i++) {
      const a = this.h[i - 1], b = this.h[i];
      const dl = b.ly - a.ly, dr = b.ry - a.ry;
      // opposite directions (left up while right down) count fully; both together count a little
      s += dl * dr < 0 ? Math.abs(dl) + Math.abs(dr) : (Math.abs(dl) + Math.abs(dr)) * 0.25;
    }
    const span = this.h.length > 1 ? (this.h[this.h.length - 1].t - this.h[0].t) / 1000 : 0;
    const speed = span > 0.25 ? s / span : 0; // shoulder widths per second
    const target = Math.min(speed / this.full, 1);
    this.value += (target - this.value) * 0.3;
    return this.value;
  }
}

export class QuizInput {
  constructor(kit) {
    this.kit = kit;
    this.queue = [];
    this.pump = new PumpMeter();
    kit.on('action', (e) => this.queue.push(e));
  }
  frame(t = performance.now()) {
    const st = this.kit.state;
    const events = this.queue; this.queue = [];
    return {
      t, lean: st.lean || 0, side: st.leanSide || 'center', armsUp: st.armsUp || 0,
      crouch: st.crouch || 0, crouching: !!st.crouching, cross: isCross(st.hands),
      pump: this.pump.update(t, st.hands), tracking: st.tracking, events,
      upL: st.hands?.left && st.hands.left.y < -0.8 ? 1 : 0, upR: st.hands?.right && st.hands.right.y < -0.8 ? 1 : 0,
    };
  }
}

// a pose must be held for `ms` to count (and is released after `release` ms without it)
export class Hold {
  constructor(ms = 500) { this.ms = ms; this.since = null; }
  update(t, on) { if (on) this.since ??= t; else this.since = null; return this.since !== null && t - this.since >= this.ms; }
  progress(t) { return this.since === null ? 0 : Math.min((t - this.since) / this.ms, 1); }
  reset() { this.since = null; }
}

// ── keyboard simulation of the two extra poses (the puppet really moves) ──
// X held → arms crossed in front of the chest; R held → arms pump like running
export function patchPuppet(puppet, isOn) {
  const step = puppet.step.bind(puppet);
  let wc = 0, wp = 0;
  puppet.step = (t) => {
    const pose = step(t);
    const on = isOn();
    wc += ((on.cross ? 1 : 0) - wc) * 0.3;
    wp += ((on.pump ? 1 : 0) - wp) * 0.3;
    if (wc < 0.01 && wp < 0.01) return pose;
    const kp = pose.kp, ls = kp.leftShoulder, rs = kp.rightShoulder;
    const U = Math.hypot(rs.x - ls.x, rs.y - ls.y) || 0.16;
    const cx = (ls.x + rs.x) / 2, cy = (ls.y + rs.y) / 2;
    const blend = (p, x, y, w) => ({ ...p, x: p.x + (x - p.x) * w, y: p.y + (y - p.y) * w });
    if (wc >= 0.01) {
      kp.leftWrist = blend(kp.leftWrist, cx + 0.28 * U, cy + 0.35 * U, wc);
      kp.rightWrist = blend(kp.rightWrist, cx - 0.28 * U, cy + 0.3 * U, wc);
      kp.leftElbow = blend(kp.leftElbow, cx - 0.55 * U, cy + 0.55 * U, wc);
      kp.rightElbow = blend(kp.rightElbow, cx + 0.55 * U, cy + 0.55 * U, wc);
    }
    if (wp >= 0.01) {
      const a = (t / 1000) * 2.6 * Math.PI * 2; // 2.6 strides a second
      kp.leftWrist = blend(kp.leftWrist, cx - 0.45 * U, cy + (0.45 + 0.4 * Math.sin(a)) * U, wp);
      kp.rightWrist = blend(kp.rightWrist, cx + 0.45 * U, cy + (0.45 - 0.4 * Math.sin(a)) * U, wp);
    }
    return pose;
  };
  return puppet;
}

export function attachSims(kit, keys = { cross: 'KeyX', pump: 'KeyR' }) {
  const state = { cross: false, pump: false };
  const onKey = (e) => {
    const k = Object.keys(keys).find((n) => keys[n] === e.code);
    if (!k) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    state[k] = e.type === 'keydown';
  };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  addEventListener('blur', () => { state.cross = state.pump = false; });
  let wrapped = null;
  return {
    state,
    press(k, on) { state[k] = on; },
    ensure() { const src = kit.keyboard; if (src && src.puppet !== wrapped) { wrapped = src.puppet; patchPuppet(wrapped, () => state); } },
  };
}
