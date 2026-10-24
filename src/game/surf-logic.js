// Surf ride: rules and board physics, independent of rendering (runs in node tests).
// The rider runs down-swell (along the wind); leaning carves left / right, crouching "pumps" the
// board faster, driftwood and rocks knock the rider off for 2 s, floating litter is collected.
// Coordinates as in logic.js: heading h, forward = (cos h, sin h), turning right increases h.

export const SURF_DIFF = {
  easy: {
    label: '簡單', weather: 'calm', swell: 1.3, time: 90, every: 10, litterEvery: 3, steer: 1.4, cross: 0, base: 4.2,
    note: '晴天小浪；障礙物每 10 秒 1 個；輕輕傾斜就會轉',
  },
  normal: {
    label: '普通', weather: 'breeze', swell: 2.0, time: 90, every: 6, litterEvery: 3, steer: 1.0, cross: 0.6, base: 5,
    note: '微風中浪；障礙物每 6 秒 1 個；浪會把板子往旁邊推',
  },
  hard: {
    label: '挑戰', weather: 'rain', swell: 2.6, time: 90, every: 4, litterEvery: 3, steer: 0.8, cross: 1.2, base: 5.8,
    note: '強風陣雨、浪大看不遠；障礙物每 4 秒 1 個；要傾斜明顯才轉得過來',
  },
};

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

export class Board {
  constructor({ x = 0, z = 0, heading = 0 } = {}) {
    this.x = x; this.z = z; this.h = heading; this.course = heading;
    this.v = 3; this.pump = 0; this.crouch = 0;
    this.fallen = 0;     // seconds left in the water
    this.air = 0;        // seconds left airborne (jump)
    this.trick = 0;      // seconds left of a trick pose
    this.trickSide = 'left';
  }

  // lean -1..1, crouch 0..1 (or null: crouch skipped → steady middle speed), sea slope, cross push (m/s)
  update(dt, { lean = 0, crouch = null, steer = 1, base = 5, sea = null, cross = 0 } = {}) {
    if (this.fallen > 0) {
      this.fallen = Math.max(this.fallen - dt, 0);
      this.v *= Math.exp(-dt * 3);
      this.x += Math.cos(this.h) * this.v * dt; this.z += Math.sin(this.h) * this.v * dt;
      if (this.fallen === 0) { this.h = this.course; this.v = base * 0.6; }
      return;
    }
    this.air = Math.max(this.air - dt, 0);
    this.trick = Math.max(this.trick - dt, 0);
    // carving: the board turns with the lean, but never more than 65° off the swell direction
    this.h = this.course + clamp(wrap(this.h + lean * steer * 0.9 * dt - this.course), -1.13, 1.13);
    // pumping: holding a crouch builds speed, standing lets it fade; skipped → steady middle
    this.crouch = crouch ?? 0;
    if (crouch === null) this.pump += (0.5 - this.pump) * (1 - Math.exp(-dt * 2));
    else if (crouch > 0.45) this.pump = Math.min(this.pump + dt * 0.7, 1);
    else this.pump = Math.max(this.pump - dt * 0.35, 0);
    // carving across the swell costs a little speed
    const off = Math.abs(wrap(this.h - this.course));
    let target = base * (0.8 + 0.6 * this.pump) * (1 - 0.25 * off);
    const f = [Math.cos(this.h), Math.sin(this.h)];
    if (sea) target -= 9.81 * (sea.sx * f[0] + sea.sz * f[1]) * 1.2; // down a wave face → faster
    this.v += (clamp(target, 1.5, 10) - this.v) * (1 - Math.exp(-dt * 1.2));
    const c = [-Math.sin(this.course), Math.cos(this.course)];
    this.x += f[0] * this.v * dt + c[0] * cross * dt;
    this.z += f[1] * this.v * dt + c[1] * cross * dt;
  }
}

// Obstacles and litter appear ahead of the rider along the swell direction.
export class SurfField {
  constructor(diff, { seed = 1, heading = 0 } = {}) {
    this.diff = diff;
    this.r = rng(seed);
    this.heading = heading;
    this.items = [];
    this.nextObstacle = 2.5;
    this.nextLitter = 1;
    this.score = 0; this.rideTime = 0; this.litter = 0; this.falls = 0; this.tricks = 0; this.dodged = 0;
    this.id = 0;
    // a perfect ride: every second +10, every piece of litter +50
    this.maxScore = diff.time * 10 + Math.floor(diff.time / diff.litterEvery) * 50;
  }

  spawn(board, kind) {
    const f = [Math.cos(this.heading), Math.sin(this.heading)], rt = [-f[1], f[0]];
    // across-track position of the board, so things land on (or near) its line
    const lat = (board.x * rt[0] + board.z * rt[1]);
    const along = board.x * f[0] + board.z * f[1];
    const ahead = 55 + this.r() * 15;
    const spread = kind === 'litter' ? 9 : 6;
    const off = lat + (this.r() * 2 - 1) * spread;
    const x = f[0] * (along + ahead) + rt[0] * off, z = f[1] * (along + ahead) + rt[1] * off;
    const type = kind === 'litter' ? (this.r() < 0.5 ? 'bottle' : 'float') : (this.r() < 0.6 ? 'log' : 'rock');
    const yaw = this.r() * Math.PI;
    this.items.push({ id: this.id++, kind, type, x, z, yaw, r: type === 'rock' ? 1.5 : type === 'log' ? 1.3 : 1.9, hit: false });
  }

  // advance the field; returns events { type: 'litter' | 'fall' | 'dodge' }
  step(board, dt) {
    const out = [];
    if ((this.nextObstacle -= dt) <= 0) { this.spawn(board, 'obstacle'); this.nextObstacle = this.diff.every * (0.8 + this.r() * 0.4); }
    if ((this.nextLitter -= dt) <= 0) { this.spawn(board, 'litter'); this.nextLitter = this.diff.litterEvery * (0.8 + this.r() * 0.4); }
    if (board.fallen === 0 && board.v > 2) { this.rideTime += dt; this.score += 10 * dt; }
    const f = [Math.cos(this.heading), Math.sin(this.heading)];
    const along = board.x * f[0] + board.z * f[1];
    for (const it of this.items) {
      if (it.hit) continue;
      const d = Math.hypot(it.x - board.x, it.z - board.z);
      if (it.kind === 'litter' && d < it.r && board.fallen === 0) {
        it.hit = true; this.litter++; this.score += 50;
        out.push({ type: 'litter', item: it });
      } else if (it.kind === 'obstacle' && d < it.r && board.fallen === 0 && board.air === 0) {
        it.hit = true; this.falls++;
        board.fallen = 2; board.v *= 0.3;
        out.push({ type: 'fall', item: it });
      } else if (it.kind === 'obstacle' && !it.passed && (it.x * f[0] + it.z * f[1]) < along - 2) {
        it.passed = true; this.dodged++;
        out.push({ type: 'dodge', item: it });
      }
    }
    // forget what is far behind
    this.items = this.items.filter((it) => (it.x * f[0] + it.z * f[1]) > along - 40);
    return out;
  }

  trick(board, side) {
    if (board.fallen > 0 || board.v < 3 || board.trick > 0) return false;
    board.trick = 1.2; board.trickSide = side;
    this.tricks++; this.score += 30;
    return true;
  }

  stars() {
    const k = this.score / this.maxScore;
    return k >= 0.6 ? 3 : k >= 0.4 ? 2 : k > 0.1 ? 1 : 0;
  }
}

// "Auto steer" (when leaning is skipped): the lean a careful rider would use — away from the next
// obstacle near the board's line, otherwise toward the next piece of litter, otherwise straight.
export function autoLean(board, field, { avoidOnly = false } = {}) {
  const fw = [Math.cos(field.heading), Math.sin(field.heading)], rt = [-fw[1], fw[0]];
  const rel = (it) => ({ a: (it.x - board.x) * fw[0] + (it.z - board.z) * fw[1], l: (it.x - board.x) * rt[0] + (it.z - board.z) * rt[1], it });
  const ahead = field.items.filter((it) => !it.hit).map(rel).filter((p) => p.a > 3 && p.a < 45).sort((p, q) => p.a - q.a);
  const danger = ahead.find((p) => p.it.kind === 'obstacle' && Math.abs(p.l) < 3.5);
  const goal = avoidOnly ? null : ahead.find((p) => p.it.kind === 'litter');
  const want = danger ? -Math.sign(danger.l || 1) * 4 : goal ? goal.l : 0;
  const off = wrap(board.h - field.heading);
  return clamp(want * 0.25 - off * 1.5, -1, 1);
}
