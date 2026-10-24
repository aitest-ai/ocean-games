// Kayak buoy race: rules and boat physics, independent of rendering (so it runs in node tests).
// Coordinates: x/z horizontal metres, heading h in radians, forward = (cos h, sin h).
// Turning right (starboard) increases h.

export const DIFFICULTY = {
  easy: {
    label: '簡單', weather: 'calm', gates: 6, spacing: [24, 30], offset: [4, 8], width: 10, pace: 1.2,
    drift: 0, power: 1.15, autoSpeed: 2.4, note: '風平浪靜、浮標門很寬、沒有側風',
  },
  normal: {
    label: '普通', weather: 'breeze', gates: 8, spacing: [26, 32], offset: [6, 11], width: 8, pace: 1.45,
    drift: 0.028, power: 1, autoSpeed: 2.4, note: '微風、浪比較大，風會把船往側邊推',
  },
  hard: {
    label: '挑戰', weather: 'rain', gates: 10, spacing: [28, 34], offset: [8, 13], width: 6, pace: 1.6,
    drift: 0.045, power: 0.95, autoSpeed: 2.4, note: '下雨看不遠、浪大、門窄、側風強',
  },
};

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

export class Kayak {
  constructor({ x = 0, z = 0, heading = 0 } = {}) {
    this.x = x; this.z = z; this.h = heading;
    this.v = 0;        // forward speed (m/s)
    this.w = 0;        // yaw rate (rad/s)
    this.stroke = null; // paddle animation: { side, t }
    this.strokes = 0;
  }

  // a paddle stroke: on the left side the bow swings right (as in a real kayak), both = straight
  paddle(side, strength = 0.6, power = 1) {
    const s = clamp(strength, 0.2, 1);
    const k = (0.55 + 0.45 * s) * power;
    // a stroke adds less once the boat is fast (hull drag rises steeply)
    const room = clamp(1 - this.v / 4.2, 0.15, 1);
    if (side === 'both') { this.v += 1.4 * k * room; }
    else {
      this.v += 1.0 * k * room;
      this.w += (side === 'left' ? 1 : -1) * 0.42 * k;
    }
    this.stroke = { side, t: 0 };
    this.strokes++;
  }

  // dt seconds; lean -1..1 (rudder / edging), sea: { sx, sz } surface slope at the boat; wind: [wx, wz] m/s
  update(dt, { lean = 0, auto = 0, drift = 0, wind = [0, 0], sea = null } = {}) {
    const f = [Math.cos(this.h), Math.sin(this.h)];
    // leaning steers like a rudder: stronger when moving, still a little when stopped
    const steer = lean * (0.35 + 0.45 * clamp(this.v / 2, 0, 1));
    this.w += (steer - this.w * 0.2) * dt * 3;
    this.w *= Math.exp(-dt * 1.6);
    this.h = wrap(this.h + this.w * dt);
    // waves: running down a wave face speeds the boat up, climbing one slows it
    if (sea) {
      const along = sea.sx * f[0] + sea.sz * f[1];
      this.v -= 9.81 * along * 0.12 * dt;
    }
    this.v *= Math.exp(-dt * (0.22 + 0.03 * this.v));
    // accessibility: "auto paddle" holds a cruising speed when the paddle action is skipped
    if (auto > 0 && this.v < auto) this.v += (auto - this.v) * (1 - Math.exp(-dt * 1.5));
    this.v = clamp(this.v, -0.5, 4.5);
    this.x += f[0] * this.v * dt + wind[0] * drift * dt;
    this.z += f[1] * this.v * dt + wind[1] * drift * dt;
    if (this.stroke && (this.stroke.t += dt) > 0.7) this.stroke = null;
  }
}

// A slalom of gates (red buoy on the left, green on the right, like harbour channel marks).
export class Course {
  constructor(diff = DIFFICULTY.normal, { seed = 1, heading = 0, start = [0, 0] } = {}) {
    const r = rng(seed);
    this.diff = diff;
    this.gates = [];
    let d = 18;
    let side = r() < 0.5 ? -1 : 1;
    const f = [Math.cos(heading), Math.sin(heading)], rt = [-Math.sin(heading), Math.cos(heading)];
    for (let i = 0; i < diff.gates; i++) {
      const off = side * (diff.offset[0] + r() * (diff.offset[1] - diff.offset[0])) * (i === 0 ? 0.3 : 1);
      side = -side;
      const c = [start[0] + f[0] * d + rt[0] * off, start[1] + f[1] * d + rt[1] * off];
      this.gates.push({ c, n: f, w: diff.width, passed: false, missed: false, i });
      d += diff.spacing[0] + r() * (diff.spacing[1] - diff.spacing[0]);
    }
    // each gate faces the line from the previous one, so it can be approached head-on
    for (let i = 0; i < this.gates.length; i++) {
      const a = i ? this.gates[i - 1].c : start, b = this.gates[i].c;
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz);
      this.gates[i].n = [dx / l, dz / l];
    }
    // time limit from the course length: `pace` is the average speed needed (m/s), plus a start allowance
    let len = 0, prev = start;
    for (const g of this.gates) { len += Math.hypot(g.c[0] - prev[0], g.c[1] - prev[1]); prev = g.c; }
    this.length = len;
    this.time = Math.round(len / diff.pace / 5) * 5 + 15;
    this.next = 0;
    this.score = 0;
    this.passed = 0;
    this.bumps = 0;
  }

  // buoy positions of gate g: [left, right]
  buoys(g) {
    const rt = [-g.n[1], g.n[0]];
    const h = g.w / 2;
    return [[g.c[0] - rt[0] * h, g.c[1] - rt[1] * h], [g.c[0] + rt[0] * h, g.c[1] + rt[1] * h]];
  }

  get done() { return this.next >= this.gates.length; }

  // move from p0 to p1 (boat positions); returns events: { type: 'pass' | 'miss' | 'bump', gate }
  step(p0, p1) {
    const out = [];
    // buoy bumps (any nearby buoy)
    for (const g of this.gates) for (const b of this.buoys(g)) {
      const d1 = Math.hypot(p1[0] - b[0], p1[1] - b[1]), d0 = Math.hypot(p0[0] - b[0], p0[1] - b[1]);
      if (d1 < 1.1 && d0 >= 1.1) { this.bumps++; this.score = Math.max(this.score - 10, 0); out.push({ type: 'bump', gate: g, buoy: b }); }
    }
    if (this.done) return out;
    const g = this.gates[this.next];
    const s0 = (p0[0] - g.c[0]) * g.n[0] + (p0[1] - g.c[1]) * g.n[1];
    const s1 = (p1[0] - g.c[0]) * g.n[0] + (p1[1] - g.c[1]) * g.n[1];
    if (s0 < 0 && s1 >= 0) {
      const t = s0 / (s0 - s1);
      const x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
      const lat = (x - g.c[0]) * -g.n[1] + (z - g.c[1]) * g.n[0];
      if (Math.abs(lat) <= g.w / 2) {
        g.passed = true; this.passed++; this.score += 100; this.next++;
        out.push({ type: 'pass', gate: g });
      } else if (Math.abs(lat) > g.w / 2 + 6) {
        // well wide of the gate: it is missed, the next one becomes the target
        g.missed = true; this.next++;
        out.push({ type: 'miss', gate: g });
      }
    }
    // went far past without crossing the line between the buoys
    if (!g.passed && !g.missed && s1 > 15) { g.missed = true; this.next++; out.push({ type: 'miss', gate: g }); }
    return out;
  }

  // stars at the finish: 3 = every gate and time to spare
  stars(timeLeft) {
    const all = this.gates.length;
    if (this.passed === all && timeLeft > this.time * 0.2) return 3;
    if (this.passed >= all * 0.7) return 2;
    return this.passed > 0 ? 1 : 0;
  }
}
