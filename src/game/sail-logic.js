// Sailing race: rules and a simplified sailing physics, independent of rendering (node tests).
// The wind cannot be sailed into (the "no-go zone", about 40° either side of where it comes
// from); fastest is across the wind. The sheet (how far the sail is let out) has a best setting
// for each angle to the wind. Leaning steers the rudder, a swing tacks the boat across the wind,
// raising a hand trims the sheet, crouching hikes out against the heel in gusts.

export const SAIL_DIFF = {
  easy: {
    label: '簡單', weather: 'calm', marks: 3, time: 240, trim: 'auto', shift: 0, gusts: false, wind: 1, upwind: false,
    note: '晴天穩定順風；帆會自動調整，只要轉向就好；3 個標誌',
  },
  normal: {
    label: '普通', weather: 'breeze', marks: 4, time: 210, trim: 'assist', shift: 0, gusts: true, wind: 1.1, upwind: false,
    note: '多雲穩定側風；帆有最佳角度提示並會慢慢自己修正；偶爾有陣風；4 個標誌',
  },
  hard: {
    label: '挑戰', weather: 'rain', marks: 5, time: 180, trim: 'manual', shift: 40, gusts: true, wind: 1.2, upwind: true,
    note: '陰雨浪大；帆要自己調；每 40 秒風向會轉；有一段要「之字形」逆風前進；5 個標誌',
  },
};

const D = Math.PI / 180;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const NO_GO = 40 * D;

// boat speed as a fraction of the best, by angle off the wind (0 = straight into it, pi = dead downwind)
export function polar(a) {
  a = Math.abs(a);
  if (a < NO_GO) return 0.05 + 0.1 * (a / NO_GO);
  if (a < 60 * D) return 0.15 + 0.6 * ((a - NO_GO) / (20 * D));
  if (a < 95 * D) return 0.75 + 0.25 * ((a - 60 * D) / (35 * D));
  if (a < 140 * D) return 1 - 0.1 * ((a - 95 * D) / (45 * D));
  return 0.9 - 0.25 * ((a - 140 * D) / (40 * D));
}
// best sheet setting: 0 = pulled in tight (upwind), 1 = let all the way out (downwind)
export const bestTrim = (a) => clamp((Math.abs(a) - NO_GO) / (140 * D), 0, 1);

export class Dinghy {
  constructor({ x = 0, z = 0, heading = 0 } = {}) {
    this.x = x; this.z = z; this.h = heading;
    this.v = 0; this.w = 0;
    this.trim = 0.5;
    this.heel = 0;
    this.tack = null;    // { target heading } while tacking
    this.eff = 1;
    this.twa = 0;        // signed angle between heading and where the wind comes from
    this.hike = 0;
  }

  // wind: { dir (rad, where it blows TO), k (strength factor) }; trimMode: auto | assist | manual
  // hike 0..1 (null = crouch skipped: heel corrects itself)
  update(dt, { lean = 0, wind, trimMode = 'auto', hike = null, maxSpeed = 4.2 } = {}) {
    const from = wind.dir + Math.PI;
    this.twa = wrap(this.h - from);
    const a = Math.abs(this.twa);
    const opt = bestTrim(this.twa);
    if (trimMode === 'auto') this.trim += (opt - this.trim) * (1 - Math.exp(-dt * 3));
    else if (trimMode === 'assist') this.trim += (opt - this.trim) * (1 - Math.exp(-dt * 0.25));
    this.eff = clamp(1 - Math.abs(this.trim - opt) * 2.2, 0.15, 1);
    // heel: strongest on a reach in a gust; hiking out (crouch / bend forward) holds the boat flat
    this.hike = hike === null ? 1 : hike;
    const press = wind.k * Math.sin(a) * this.eff;
    this.heel += (clamp(press * 0.9 - this.hike * 0.55, 0, 1) - this.heel) * (1 - Math.exp(-dt * 2));
    const heelLoss = 1 - clamp((this.heel - 0.45) * 1.2, 0, 0.5);
    // steering: the rudder needs water flow; a tack swings the bow through the wind on its own
    if (this.tack) {
      const d = wrap(this.tack.target - this.h);
      this.w = Math.sign(d) * Math.min(Math.abs(d) * 2.5 + 0.2, 0.9);
      if (Math.abs(d) < 0.04) { this.tack = null; this.w = 0; }
    } else {
      const grip = 0.35 + 0.65 * clamp(this.v / 2, 0, 1);
      this.w += (lean * 0.55 * grip - this.w) * (1 - Math.exp(-dt * 3));
    }
    this.h = wrap(this.h + this.w * dt);
    const target = maxSpeed * wind.k * polar(this.twa) * this.eff * heelLoss;
    this.v += (target - this.v) * (1 - Math.exp(-dt * (target > this.v ? 0.5 : 0.8)));
    this.x += Math.cos(this.h) * this.v * dt;
    this.z += Math.sin(this.h) * this.v * dt;
  }

  // tack (bow through the wind) or gybe (stern through it): mirror the angle to the wind
  startTack(windDir) {
    if (this.tack) return false;
    const from = windDir + Math.PI;
    const twa = wrap(this.h - from);
    this.tack = { target: wrap(from - twa) };
    return true;
  }

  sheet(delta) { this.trim = clamp(this.trim + delta, 0, 1); }
}

// Marks to round in order, then through the finish gate.
export class SailCourse {
  constructor(diff, { seed = 1, windDir = 0 } = {}) {
    const r = rng(seed);
    this.diff = diff;
    const from = windDir + Math.PI;
    // legs as angles off the wind direction: reaches across it (and one beat into it on the hard course)
    const marks = [];
    let p = [0, 0];
    for (let i = 0; i < diff.marks; i++) {
      let ang;
      if (diff.upwind && i === 1) ang = from + (r() - 0.5) * 20 * D;                    // straight upwind: zigzag
      else {
        const side = i % 2 ? 1 : -1;
        const off = diff.upwind ? 75 + r() * 50 : 80 + r() * 40;                          // a reach either side
        ang = from + side * off * D;
      }
      const len = diff.upwind ? (i === 1 ? 50 : 55) + r() * 20 : 85 + r() * 30;          // hard: shorter legs, more of them
      p = [p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len];
      marks.push({ c: p, rounded: false, i });
    }
    this.marks = marks;
    // the finish gate lies a short reach beyond the last mark (never a long beat back to the start)
    const fa = from + (diff.marks % 2 ? 1 : -1) * 100 * D;
    this.finish = { c: [p[0] + Math.cos(fa) * 60, p[1] + Math.sin(fa) * 60], w: 14 };
    this.next = 0;
    this.rounded = 0;
    this.finished = false;
    this.windDir = windDir;
  }
  get done() { return this.finished; }
  target() { return this.next < this.marks.length ? this.marks[this.next].c : this.finish.c; }

  // a mark counts as rounded when the boat comes within 12 m of it; the finish within the gate
  step(boat) {
    const out = [];
    if (this.finished) return out;
    const t = this.target();
    const d = Math.hypot(boat.x - t[0], boat.z - t[1]);
    if (this.next < this.marks.length) {
      if (d < 12) { this.marks[this.next].rounded = true; this.rounded++; this.next++; out.push({ type: 'mark', i: this.next - 1 }); }
    } else if (d < this.finish.w / 2 + 2) { this.finished = true; out.push({ type: 'finish' }); }
    return out;
  }

  stars(timeLeft) {
    if (!this.finished) return this.rounded > 0 ? 1 : 0;
    return timeLeft > this.diff.time * 0.25 ? 3 : 2;
  }
}

// Wind over the race: shifts (hard) and gusts (normal, hard), deterministic from a seed.
export class WindTrack {
  constructor(diff, baseDir, seed = 1) {
    this.diff = diff; this.base = baseDir; this.dir = baseDir; this.r = rng(seed * 7 + 3);
    this.t = 0; this.k = diff.wind; this.gust = 0; this.nextGust = 18 + this.r() * 10; this.warn = false; this.nextShift = diff.shift || Infinity;
    this.shifts = 0;
  }
  step(dt) {
    const out = [];
    this.t += dt;
    if (this.t >= this.nextShift) {
      this.nextShift += this.diff.shift;
      this.shifts++;
      this.dir = this.base + (this.shifts % 2 ? 1 : -1) * (18 + this.r() * 12) * D;
      out.push({ type: 'shift' });
    }
    if (this.diff.gusts) {
      if (!this.warn && this.t >= this.nextGust - 3) { this.warn = true; out.push({ type: 'gust-warn' }); }
      if (this.t >= this.nextGust) { this.gust = 6; this.warn = false; this.nextGust = this.t + 20 + this.r() * 12; out.push({ type: 'gust' }); }
    }
    this.gust = Math.max(this.gust - dt, 0);
    this.k = this.diff.wind * (this.gust > 0 ? 1.4 : 1);
    return out;
  }
}
