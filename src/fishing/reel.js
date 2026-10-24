// 捲線 (reeling): "draw circles with one hand", read from the input layer's continuous hand positions
// (kit.state.hands: wrists relative to the shoulder centre, in shoulder widths). Lives in the fishing
// folder so the shared input layer stays unchanged.
//
// How: for each hand, the angle of the wrist around the centre of its recent movement; the signed
// angle travelled per second is the cranking speed. Moving back and forth in a line (a wave) travels
// ~0 signed angle; small trembles (radius under 0.1 shoulder widths) do not count. To START reeling
// the hand must turn the same way for about 0.9 turn spread over the whole 1.2 s window (wild, fast, wide or sloppy circles count; the camera may only give 10-15 poses a second) (a single swing or overhead stroke traces at
// most one loop, so it does not start the reel); once reeling, the last 0.7 s is enough to keep going,
// so the reel answers quickly to speeding up, slowing down and stopping.

// signed turns of a track (list of {t, x, y}) around its own centre, split into `n` time slices
function turnsOf(H, minRadius, n) {
  let cx = 0, cy = 0;
  for (const q of H) { cx += q.x; cy += q.y; }
  cx /= H.length; cy /= H.length;
  const parts = new Array(n).fill(0), t0 = H[0].t, span = Math.max(H[H.length - 1].t - t0, 1);
  let sum = 0, prev = null;
  for (const q of H) {
    const dx = q.x - cx, dy = q.y - cy;
    if (Math.hypot(dx, dy) < minRadius) { prev = null; continue; }
    const a = Math.atan2(dy, dx);
    if (prev !== null) {
      const d = Math.atan2(Math.sin(a - prev), Math.cos(a - prev));
      // a jump across the centre is a line, not a turn
      if (Math.abs(d) < 2.0) { sum += d; parts[Math.min(Math.floor(((q.t - t0) / span) * n), n - 1)] += d; }
    }
    prev = a;
  }
  return { turns: sum / (2 * Math.PI), parts: parts.map((x) => x / (2 * Math.PI)), seconds: span / 1000 };
}

export class ReelDetector {
  constructor({ window = 1200, keep = 900, minRadius = 0.08, fullSpeed = 0.8, startTurns = 0.9 } = {}) {
    Object.assign(this, { window, keep, minRadius, fullSpeed, startTurns }); // fullSpeed: turns per second for reel = 1
    this.h = { left: [], right: [] };
    this.value = 0; this.side = null; this.dir = 0;
  }

  reset() { this.h.left.length = 0; this.h.right.length = 0; this.value = 0; this.side = null; this.dir = 0; }

  // t in ms, hands = { left: {x, y} | null, right: ... }; returns reel speed 0..1
  update(t, hands) {
    for (const s of ['left', 'right']) {
      const H = this.h[s], p = hands?.[s];
      if (p) H.push({ t, x: p.x, y: p.y }); else H.length = 0;
      while (H.length && t - H[0].t > this.window) H.shift();
    }
    let speed = 0;
    if (this.side) {
      // keep reeling with the same hand while it keeps turning the same way
      const H = this.h[this.side].filter((q) => t - q.t <= this.keep);
      const r = H.length >= 6 ? turnsOf(H, this.minRadius, 2) : null;
      if (r && Math.sign(r.turns) === this.dir && r.parts.every((x) => Math.sign(x) === this.dir || Math.abs(x) < 0.03) && Math.abs(r.turns) > 0.12) speed = Math.abs(r.turns) / r.seconds;
      else { this.side = null; this.dir = 0; }
    }
    if (!this.side) {
      for (const s of ['left', 'right']) {
        const H = this.h[s];
        if (H.length < 6) continue;
        const r = turnsOf(H, this.minRadius, 4);
        if (Math.abs(r.turns) >= this.startTurns && r.parts.every((x) => Math.sign(x) === Math.sign(r.turns) && Math.abs(x) > 0.1)) {
          this.side = s; this.dir = Math.sign(r.turns); speed = Math.abs(r.turns) / r.seconds;
          break;
        }
      }
    }
    const target = Math.min(speed / this.fullSpeed, 1);
    // quick to start, a little slower to stop (the reel keeps spinning for a moment)
    this.value += (target - this.value) * (target > this.value ? 0.6 : 0.2);
    if (this.value < 0.04) this.value = 0;
    return this.value;
  }
}

// Keyboard simulation for reeling: hold R (or the on-screen button) and the simulated puppet's right
// hand draws circles in front of the belly, so the detector above sees a real circling hand, the
// same way the keyboard simulator works for every other action (it moves a puppet; it never sends
// events directly).
export function attachReelSim(kit, { key = 'KeyR', turnsPerSecond = 1.2 } = {}) {
  const state = { on: false, since: 0 };
  const onKey = (e) => {
    if (e.code !== key) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    state.on = e.type === 'keydown';
  };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  addEventListener('blur', () => { state.on = false; });
  let wrapped = null;
  const ensure = () => {
    const src = kit.keyboard;
    if (!src || src.puppet === wrapped) return;
    wrapped = src.puppet;
    patchPuppet(wrapped, () => state.on, turnsPerSecond);
  };
  return { state, ensure, press(on) { state.on = on; } };
}

// make a Puppet's right wrist circle while isOn() is true (also used by the how-to animation)
export function patchPuppet(puppet, isOn, turnsPerSecond = 1.2) {
  const step = puppet.step.bind(puppet);
  let w = 0;
  puppet.step = (t) => {
    const pose = step(t);
    w += ((isOn() ? 1 : 0) - w) * 0.25;
    if (w < 0.01) return pose;
    const kp = pose.kp, ls = kp.leftShoulder, rs = kp.rightShoulder;
    const U = Math.hypot(rs.x - ls.x, rs.y - ls.y) || 0.16;
    const cx = (ls.x + rs.x) / 2, cy = (ls.y + rs.y) / 2;
    const a = (t / 1000) * turnsPerSecond * Math.PI * 2;
    const hx = cx + (0.45 + 0.32 * Math.cos(a)) * U, hy = cy + (0.62 + 0.32 * Math.sin(a)) * U;
    const blend = (p, x, y) => ({ ...p, x: p.x + (x - p.x) * w, y: p.y + (y - p.y) * w });
    kp.rightWrist = blend(kp.rightWrist, hx, hy);
    kp.rightElbow = blend(kp.rightElbow, cx + 0.75 * U, cy + 0.75 * U);
    return pose;
  };
  return puppet;
}
