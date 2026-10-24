// Fishing (釣魚): rules and fish behaviour, independent of rendering (runs in node tests).
//
// One cast is: ready → flying → waiting (a fish approaches, tests the bait, bites) → fight → landing
// → reveal (field-guide card) → ready. A fight can also end in a broken line (too much tension for
// too long), an unhooked fish (too little tension for too long) or, for a hooked sea turtle, a safe
// release (the player stops reeling and lets the line go slack so it can be cut).
//
// World coordinates as in the ocean engine: x / z horizontal. The angler stands at region.angler
// and faces +z (out to sea). `aim` is the cast direction in radians, positive = the player's right.

import { clamp, sampleLength, weightOf, percentile, sizeClass, releaseRule, val } from './stats.js';

export const RIGHT_X = -1; // world x of the player's right-hand side (facing +z)

export const FISH_DIFF = {
  easy: {
    label: '簡單', weather: 'calm', time: 180, power: 0.75, biteWindow: 2.4, breakHold: 0.9, slackHold: 3.2, earlyScare: 0,
    wait: [2.5, 5], stars: [60, 180, 330],
    note: '晴天、浪小；魚的力氣小，張力條的安全區比較寬；咬餌後有比較久的時間揚竿',
  },
  normal: {
    label: '普通', weather: 'breeze', time: 180, power: 1, biteWindow: 1.7, breakHold: 0.6, slackHold: 2.4, earlyScare: 0.35,
    wait: [3, 7], stars: [50, 160, 300],
    note: '多雲微風；太早揚竿有時會把魚嚇跑；魚衝刺時要放鬆',
  },
  hard: {
    label: '挑戰', weather: 'rain', time: 180, power: 1.2, biteWindow: 1.25, breakHold: 0.45, slackHold: 1.8, earlyScare: 0.6,
    wait: [3.5, 8], stars: [40, 140, 270],
    note: '下雨、海水比較濁，魚影比較難看清楚；魚力氣大，拉太猛容易斷線',
  },
};

export const TENSION = { slack: 0.16, sweetLo: 0.32, sweetHi: 0.78, danger: 0.88, snap: 1 };

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const range = (r, [a, b]) => a + (b - a) * r();

// month 1..12 → how likely this species is around (peak 1.5, season 1, otherwise 0.12)
export function seasonFactor(regionInfo, month) {
  const peak = val(regionInfo.peakMonths) || [], months = val(regionInfo.months) || [];
  if (peak.includes(month)) return 1.5;
  if (months.includes(month)) return 1;
  return 0.12;
}

// habitat mix at a point: reef (near rocks), open (far from shore), sand (the rest)
export function zoneAt(region, x, z) {
  let reef = 0;
  for (const r of region.reefs) reef = Math.max(reef, Math.exp(-((x - r.x) ** 2 + (z - r.z) ** 2) / (2 * r.r * r.r)));
  const far = z - region.angler.z;
  const open = clamp((far - region.openFrom[0]) / (region.openFrom[1] - region.openFrom[0]), 0, 1) * (1 - reef * 0.7);
  const sand = Math.max(1 - reef - open, 0);
  return { reef, open, sand };
}
export function zoneName(z) {
  if (z.reef > 0.45) return '礁石邊';
  if (z.open > 0.5) return '外海深處';
  if (z.open > 0.15 && z.reef > 0.2) return '礁石外緣';
  return '沙底的水道';
}

// weight of each catchable at a point and month; returns [{ c, w }]
export function candidates(catchables, region, x, z, month) {
  const zone = zoneAt(region, x, z);
  return catchables.map((c) => {
    const g = c.game, info = c.regions?.[region.id];
    if (!info && c.kind !== 'junk') return { c, w: 0 };
    const pref = g.zones || { reef: 1, sand: 1, open: 1 };
    const habitat = zone.reef * (pref.reef || 0) + zone.sand * (pref.sand || 0) + zone.open * (pref.open || 0);
    const season = c.kind === 'junk' ? 1 : seasonFactor(info, month);
    return { c, w: Math.max(habitat, 0.05) * season * val(g.abundance) };
  });
}

function pick(list, r) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let u = r() * total;
  for (const x of list) if ((u -= x.w) <= 0) return x.c;
  return list[list.length - 1].c;
}

export class FishingSession {
  constructor({ catchables, region, diff, month = 6, seed = 1, opts = {} }) {
    this.catchables = catchables; this.region = region; this.diff = diff; this.month = month;
    this.rand = rng(seed); this.opts = opts;
    this.A = { ...region.angler };
    this.phase = 'ready'; this.phaseT = 0; this.time = 0;
    this.bobber = { x: this.A.x, z: this.A.z + 2, y: 1.5, sink: 0, dip: 0, visible: false, flight: null };
    this.aim = 0; this.lastCast = null;
    this.visitor = null; this.fight = null; this.reveal = null; this.landing = null;
    this.ambient = [];
    this.score = 0;
    this.catches = [];     // every reveal: fish (kept or released), junk, turtle
    this.tally = { casts: 0, bites: 0, missed: 0, early: 0, broke: 0, unhooked: 0, kept: 0, released: 0, junk: 0, turtle: 0 };
    this.nextVisit = 0;
    for (let i = 0; i < 3; i++) this.spawnAmbient(true);
  }

  setPhase(p) { this.phase = p; this.phaseT = 0; }

  // ── casting ──
  // strength 0..1 from the swing; aim (rad) from lean + swing direction
  cast(strength, aim) {
    if (this.phase !== 'ready') return null;
    const dist = 7 + 23 * clamp((strength - 0.35) / 0.65, 0, 1);
    aim = clamp(aim, -0.6, 0.6);
    const tx = this.A.x + RIGHT_X * Math.sin(aim) * dist, tz = this.A.z + Math.cos(aim) * dist;
    this.bobber.flight = { x0: this.A.x + RIGHT_X * 0.6, z0: this.A.z + 0.5, x1: tx, z1: tz, t: 0, dur: 0.6 + dist / 40 };
    this.bobber.visible = true; this.bobber.sink = 0;
    this.lastCast = { dist, aim, x: tx, z: tz };
    this.tally.casts++;
    this.setPhase('flying');
    return this.lastCast;
  }

  // ── hook set (揚竿) ──
  hook() {
    const v = this.visitor;
    if (this.phase === 'bite' && v) { this.startFight(); return { type: 'hooked', c: v.c }; }
    if (this.phase === 'waiting' && v && v.phase === 'test') {
      if (this.rand() < this.diff.earlyScare) { this.tally.early++; this.scare('early'); return { type: 'early', scared: true }; }
      return { type: 'early', scared: false };
    }
    if (this.phase === 'waiting') return { type: 'tooSoon' };
    return null;
  }

  // the player picked keep / release on the card
  finishReveal(choice = 'keep') {
    const r = this.reveal;
    if (!r || this.phase !== 'reveal') return null;
    let pts = 0;
    if (r.kind === 'fish') {
      const base = 10 + r.difficulty * 12 + Math.round(r.percentile * 20);
      if (r.release.required) { pts = Math.round(base * 0.5) + 20; r.outcome = 'released'; }
      else if (choice === 'release') { pts = base + 10; r.outcome = 'released'; }
      else { pts = base; r.outcome = 'kept'; }
      this.tally[r.outcome]++;
    } else if (r.kind === 'junk') { pts = 30; r.outcome = 'binned'; this.tally.junk++; }
    else if (r.kind === 'bycatch') { pts = r.outcome === 'safe' ? 60 : 40; this.tally.turtle++; }
    r.points = pts;
    this.score += pts;
    this.reveal = null;
    this.retrieve();
    return r;
  }

  retrieve() { this.visitor = null; this.fight = null; this.bobber.visible = false; this.setPhase('retrieve'); }

  scare(reason) {
    const v = this.visitor;
    if (v) { v.phase = 'flee'; v.t = 0; v.h = Math.atan2(v.z - this.bobber.z, v.x - this.bobber.x); this.ambient.push(v); }
    this.visitor = null;
    this.bobber.sink = 0;
    if (this.phase === 'bite' || this.phase === 'fight') this.retrieve();
    else this.nextVisit = range(this.rand, this.diff.wait);
    return reason;
  }

  // ── visitors ──
  spawnVisitor() {
    const b = this.bobber;
    const list = candidates(this.catchables, this.region, b.x, b.z, this.month);
    const c = pick(list, this.rand);
    const ang = this.rand() * Math.PI * 2, r = c.kind === 'junk' ? 3.5 : range(this.rand, [4, 6]);
    const v = {
      c, kind: c.kind, x: b.x + Math.cos(ang) * r, z: b.z + Math.sin(ang) * r, h: ang + Math.PI,
      depth: c.kind === 'junk' ? 1.2 : 2.6, phase: 'approach', t: 0, tail: this.rand() * 6, speed: 0,
      orbit: 0, nibbles: 0, wob: this.rand() * 10,
    };
    if (c.kind === 'junk') { v.len = val(c.size?.lengthCm) || 25; v.weight = val(c.size?.weightG) || 50; }
    else {
      v.len = sampleLength(c, this.rand);
      v.cond = 1 + (this.rand() - 0.5) * 0.14;
      v.weight = weightOf(c, v.len, v.cond);
    }
    v.nibbles = c.game.bite?.nibbles ? Math.round(range(this.rand, c.game.bite.nibbles)) : 0;
    this.visitor = v;
    return v;
  }

  spawnAmbient(anywhere = false) {
    const A = this.A, b = this.bobber;
    const cx = anywhere || !b.visible ? A.x + (this.rand() - 0.5) * 24 : b.x, cz = anywhere || !b.visible ? A.z + 8 + this.rand() * 22 : b.z;
    const fish = this.catchables.filter((c) => c.kind === 'fish');
    if (!fish.length) return;
    const list = candidates(fish, this.region, cx, cz, this.month);
    const c = pick(list, this.rand);
    const ang = this.rand() * Math.PI * 2;
    this.ambient.push({
      c, kind: 'fish', x: cx + Math.cos(ang) * 6, z: cz + Math.sin(ang) * 6, h: this.rand() * 6.28, depth: range(this.rand, [1.8, 3.2]),
      len: sampleLength(c, this.rand), phase: 'wander', t: 0, life: range(this.rand, [9, 16]), tail: this.rand() * 6, speed: 0, wob: this.rand() * 10,
    });
  }

  // swim toward (tx, tz) with the species' style; returns the distance left
  swim(v, tx, tz, dt, { speedMul = 1, turn = 2.2 } = {}) {
    const g = v.c.game.swim || {};
    const dx = tx - v.x, dz = tz - v.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(dz, dx);
    v.h += clamp(wrap(want - v.h), -turn * dt, turn * dt);
    let sp = (g.speed || 0.6) * speedMul;
    const style = g.style || 'steady';
    v.wob += dt;
    if (style === 'cautious') sp *= 0.25 + Math.max(Math.sin(v.wob * 1.6), 0) * 1.5;   // stop and go
    else if (style === 'dart') sp *= 0.6 + 1.4 * Math.pow(Math.max(Math.sin(v.wob * 2.1), 0), 3); // bursts
    else if (style === 'bottom') sp *= Math.sin(v.wob * 1.1) > 0.7 ? 3 : 0.3;          // still, then a lunge
    else if (style === 'graze') v.h += Math.sin(v.wob * 3) * dt * 1.2;                  // wavy path
    else if (style === 'drift') { v.h = want; sp = 0.35 * speedMul; }
    v.speed = lerp(v.speed, Math.min(sp, d / Math.max(dt, 1e-3)), 1 - Math.exp(-dt * 4));
    v.x += Math.cos(v.h) * v.speed * dt; v.z += Math.sin(v.h) * v.speed * dt;
    v.tail += dt * (g.tailHz || 2) * (0.4 + v.speed / Math.max(g.speed || 0.6, 0.1)) * Math.PI * 2;
    return d;
  }

  // ── fight ──
  startFight() {
    const v = this.visitor, g = v.c.game.fight || {};
    const k = v.kind === 'fish' ? clamp(v.len / val(v.c.length.catch.p50), 0.5, 2) : 1;
    const D = Math.hypot(v.x - this.A.x, v.z - this.A.z);
    this.fight = {
      D, D0: D, s: 1, T: 0.3, overT: 0, underT: 0, calm: 0, surge: 0, t: 0,
      nextSurge: range(this.rand, g.surgeEvery || [3, 6]) * 0.6,
      power: (g.power ?? 0.5) * this.diff.power * clamp(Math.pow(k, 0.9), 0.6, 1.7),
      stamina: (g.stamina ?? 10) * clamp(k, 0.7, 1.5),
      ang: Math.atan2(v.x - this.A.x, v.z - this.A.z) * RIGHT_X, side: this.rand() < 0.5 ? -1 : 1,
      reel: 0, brace: 0, pull: 0,
    };
    v.phase = 'hooked';
    this.bobber.sink = 1;
    this.tally.bites++;
    this.setPhase('fight');
  }

  autoInput(input) {
    const F = this.fight, o = this.opts;
    let { reel = 0, brace = 0 } = input;
    if (!F) return { reel, brace };
    const turtle = this.visitor?.kind === 'bycatch';
    if (o.autoReel) reel = turtle ? 0 : F.T < 0.55 && F.surge <= 0 ? 0.75 : 0;
    if (o.autoBrace || brace === null) brace = turtle ? 0 : F.T < 0.3 ? 0.7 : 0;
    return { reel, brace };
  }

  stepFight(dt, input) {
    const F = this.fight, v = this.visitor, g = v.c.game.fight || {}, d = this.diff, out = [];
    const { reel, brace } = this.autoInput(input);
    F.reel = reel; F.brace = brace; F.t += dt;
    const turtle = v.kind === 'bycatch', junk = v.kind === 'junk';
    // surges (衝刺): the fish bolts for a moment; a tired fish surges less often
    if (!junk) {
      F.nextSurge -= dt;
      if (F.surge > 0) F.surge -= dt;
      else if (F.nextSurge <= 0 && F.s > 0.12) {
        F.surge = (g.surgeLen ?? 1.2) * (0.7 + 0.6 * this.rand());
        F.nextSurge = range(this.rand, g.surgeEvery || [3, 6]) * (1 + (1 - F.s) * 0.8);
        F.side = this.rand() < 0.5 ? -1 : 1;
        out.push({ type: 'surge' });
      }
    }
    const surging = F.surge > 0;
    const wobble = 0.05 * Math.sin(F.t * 5.3) + 0.03 * Math.sin(F.t * 11.7);
    const pull = junk ? F.power : F.power * (0.35 + 0.65 * F.s) * (surging ? (g.surgeMul ?? 1.8) : 1) + wobble * F.power;
    F.pull = pull;
    const target = pull * (0.5 + 0.5 * brace) + 0.35 * reel * (0.4 + 0.6 * Math.min(pull, 1)) + 0.12 * brace;
    F.T += (target - F.T) * (1 - Math.exp(-dt * 7));
    // line: the fish takes line when it pulls hard (bracing holds it back); reeling brings it in
    const run = junk ? 0 : Math.max(pull - 0.3, 0) * 2.6 * (1 - 0.6 * brace);
    const reelIn = reel * (junk ? 2.2 : 2.6) * (1 - 0.7 * clamp(pull - 0.3, 0, 1));
    F.D = Math.max(F.D + (run - reelIn) * dt, 0);
    F.D = Math.min(F.D, F.D0 + 12, 42);
    // tiring: tension in the working range and bracing wear the fish out
    // (stamina = seconds a fish lasts against a line held in the good range, roughly ×1.5)
    if (!junk) F.s = Math.max(F.s - dt * (0.1 + 2 * clamp(F.T - 0.2, 0, 0.6) + 0.4 * brace) / F.stamina, 0);
    // the fish swings left / right on the line
    F.ang += (F.side * (surging ? 0.35 : 0.08) - F.ang * 0.25) * dt;
    F.ang = clamp(F.ang, -0.7, 0.7);
    v.x = this.A.x + RIGHT_X * Math.sin(F.ang) * F.D; v.z = this.A.z + Math.cos(F.ang) * F.D;
    v.h = Math.atan2(v.z - this.A.z, v.x - this.A.x) + Math.sin(F.t * (surging ? 9 : 3)) * (surging ? 0.5 : 0.25);
    v.speed = surging ? 2.5 : 0.8;
    v.tail += dt * (v.c.game.swim?.tailHz || 2) * (surging ? 3 : 1.4) * Math.PI * 2;
    v.depth = lerp(v.depth, surging ? 1.4 : 0.7, 1 - Math.exp(-dt * 2));
    if (surging && this.rand() < dt * 6) out.push({ type: 'splash', x: v.x, z: v.z, big: false });

    // line break / unhook / turtle safely let go
    if (F.T >= TENSION.snap) F.overT += dt; else F.overT = Math.max(F.overT - dt * 2, 0);
    if (F.t > 1.5 && F.T < TENSION.slack && !turtle) F.underT += dt; else F.underT = Math.max(F.underT - dt * 1.5, 0);
    if (turtle) F.calm = F.t > 1 && reel < 0.1 && brace < 0.2 ? F.calm + dt : Math.max(F.calm - dt * 0.5, 0);
    if (F.overT > d.breakHold) {
      this.tally.broke++;
      out.push({ type: 'break', c: v.c, turtle });
      this.scare('break');
      return out;
    }
    if (F.underT > d.slackHold) {
      this.tally.unhooked++;
      out.push({ type: 'unhook', c: v.c });
      this.scare('unhook');
      return out;
    }
    if (turtle && F.calm > 2.5) { out.push({ type: 'turtleSafe' }); this.land('safe'); return out; }
    if (F.D <= 2.2) { this.land(turtle ? 'close' : null); out.push({ type: 'landing', c: v.c }); }
    return out;
  }

  land(outcome) {
    const v = this.visitor;
    this.landing = { x: v.x, z: v.z };
    this.setPhase('landing');
    const c = v.c;
    const rec = { id: c.id, kind: c.kind, name: c.names?.zh?.value ?? c.names?.zh, time: this.time };
    if (c.kind === 'fish') {
      const p = percentile(c, v.len);
      Object.assign(rec, {
        lengthCm: v.len, weightG: Math.round(v.weight), percentile: p, sizeClass: sizeClass(p).key,
        release: releaseRule(c, v.len), difficulty: val(c.game.difficulty) || 2,
      });
    } else if (c.kind === 'bycatch') Object.assign(rec, { outcome: outcome === 'safe' ? 'safe' : 'close', release: { required: true } });
    this.pendingReveal = rec;
    this.catches.push(rec);
  }

  // ── main step ──
  // input: { reel 0..1, brace 0..1 or null (skipped), lean -1..1 }
  step(dt, input = {}) {
    this.time += dt; this.phaseT += dt;
    const out = [], b = this.bobber, o = this.opts;
    b.dip = Math.max(b.dip - dt * 3, 0);
    // ambient fish wander and fade out; keep ~3 around
    for (const a of this.ambient) {
      a.t += dt;
      if (a.phase === 'flee') { a.speed = 2.6; a.x += Math.cos(a.h) * a.speed * dt; a.z += Math.sin(a.h) * a.speed * dt; a.depth = Math.min(a.depth + dt * 1.5, 3.5); a.tail += dt * 14; a.life ??= 2; continue; }
      if (!a.goal || a.t > a.goalT) { a.goal = [a.x + (this.rand() - 0.5) * 8, Math.max(a.z + (this.rand() - 0.5) * 8, this.A.z + 6)]; a.goalT = a.t + 3 + this.rand() * 3; }
      this.swim(a, a.goal[0], a.goal[1], dt, { speedMul: 0.6, turn: 1.2 });
    }
    this.ambient = this.ambient.filter((a) => a.t < a.life);
    if (this.ambient.filter((a) => a.phase === 'wander').length < 3 && this.rand() < dt * 0.5) this.spawnAmbient();

    const v = this.visitor;
    switch (this.phase) {
      case 'ready':
        this.aim = clamp((input.lean || 0) * 0.45, -0.45, 0.45);
        if (o.autoCast && this.phaseT > 2) out.push({ type: 'cast', ...this.cast(0.7 + this.rand() * 0.3, this.aim + (this.rand() - 0.5) * 0.4), auto: true });
        break;
      case 'flying': {
        const f = b.flight;
        f.t += dt;
        const u = clamp(f.t / f.dur, 0, 1);
        b.x = lerp(f.x0, f.x1, u); b.z = lerp(f.z0, f.z1, u); b.y = 1.6 + Math.sin(u * Math.PI) * (2 + f.dur * 3) - u * 1.6;
        if (u >= 1) {
          b.y = 0; b.flight = null;
          out.push({ type: 'splash', x: b.x, z: b.z, big: true }, { type: 'landed', zone: zoneName(zoneAt(this.region, b.x, b.z)), dist: this.lastCast.dist });
          this.nextVisit = range(this.rand, this.diff.wait) * 0.6;
          this.setPhase('waiting');
        }
        break;
      }
      case 'waiting': {
        if (!v) {
          this.nextVisit -= dt;
          if (this.nextVisit <= 0) out.push({ type: 'approach', c: this.spawnVisitor().c });
          break;
        }
        v.t += dt;
        if (v.phase === 'approach') {
          const g = v.c.game.swim || {};
          // circlers orbit the bait for a few seconds before testing it
          let tx = b.x, tz = b.z;
          if (g.style === 'circle' && v.orbit < 3 && Math.hypot(v.x - b.x, v.z - b.z) < 2.5) { v.orbit += dt; const a = v.orbit * 1.8; tx = b.x + Math.cos(a) * 1.4; tz = b.z + Math.sin(a) * 1.4; }
          const d = this.swim(v, tx, tz, dt, { speedMul: 2.2 });
          v.depth = lerp(v.depth, 0.7, 1 - Math.exp(-dt * 0.6));
          if (d < 0.6 && (g.style !== 'circle' || v.orbit >= 3)) {
            v.phase = v.nibbles > 0 ? 'test' : 'strike'; v.t = 0; v.nextNibble = 0.4;
            if (v.kind === 'junk') { v.phase = 'strike'; }
          }
          if (v.t > 25) this.scare('bored');
        } else if (v.phase === 'test') {
          // 試探: little pecks at the bait, the float dips each time
          v.h += Math.sin(v.t * 6) * dt * 2;
          this.swim(v, b.x + Math.cos(v.t * 2) * 0.35, b.z + Math.sin(v.t * 2) * 0.35, dt, { speedMul: 0.5, turn: 4 });
          v.nextNibble -= dt;
          if (v.nextNibble <= 0) {
            v.nibbles--; b.dip = 0.35 + this.rand() * 0.2; v.nextNibble = 0.5 + this.rand() * 0.6;
            out.push({ type: 'nibble' });
            if (v.nibbles <= 0) { v.phase = 'strike'; v.t = 0; }
          }
        } else if (v.phase === 'strike') {
          // 咬餌: the float goes under and the fish starts to swim off with the bait
          const runAway = v.c.game.bite?.type === 'run';
          b.sink = v.kind === 'junk' ? 0.6 : 1;
          v.biteH = runAway ? v.h + Math.PI * (this.rand() < 0.5 ? 0.5 : -0.5) : v.h;
          this.setPhase('bite');
          out.push({ type: 'bite', c: v.c, junk: v.kind === 'junk' });
        }
        break;
      }
      case 'bite': {
        const runAway = v.c.game.bite?.type === 'run';
        v.speed = runAway ? 1.2 : 0.3;
        v.h = v.biteH;
        v.x += Math.cos(v.h) * v.speed * dt; v.z += Math.sin(v.h) * v.speed * dt;
        b.x = lerp(b.x, v.x, 1 - Math.exp(-dt * 3)); b.z = lerp(b.z, v.z, 1 - Math.exp(-dt * 3));
        v.tail += dt * 10;
        const win = this.diff.biteWindow * (v.c.game.bite?.window ?? 1) * (v.kind === 'junk' ? 2 : 1);
        if (o.autoHook && this.phaseT > Math.min(0.45, win * 0.4)) { this.startFight(); out.push({ type: 'hooked', c: v.c, auto: true }); break; }
        if (this.phaseT > win) {
          this.tally.missed++;
          out.push({ type: 'missed', c: v.c });
          this.scare('missed');
          if (this.phase === 'bite') this.retrieve();
        }
        break;
      }
      case 'fight': out.push(...this.stepFight(dt, input)); break;
      case 'landing':
        if (this.phaseT > 1.3) { this.reveal = this.pendingReveal; this.setPhase('reveal'); out.push({ type: 'reveal', rec: this.reveal }); }
        break;
      case 'retrieve':
        if (this.phaseT > 1.2) this.setPhase('ready');
        break;
    }
    if (this.phase !== 'flying' && this.phase !== 'fight' && b.visible) b.y = 0;
    return out;
  }

  // true while a fish is on the way, on the line or on the card: the clock lets it finish
  get busy() { return ['bite', 'fight', 'landing', 'reveal'].includes(this.phase); }

  stars() {
    const s = this.diff.stars;
    return this.score >= s[2] ? 3 : this.score >= s[1] ? 2 : this.score >= s[0] ? 1 : 0;
  }
}
