// The fishing scene drawn over the 3D sea: shadows of fish under the surface (never the fish itself),
// ripples and splashes, the float, the line and the rod, the aim guide, and the moment a catch is
// lifted out of the water. A 2D canvas laid over the WebGL canvas; world points go through the
// shell's camera projection (game.project), so everything sits on the moving sea.

import { RIGHT_X, TENSION } from './logic.js';

export const SHADOW_SCALE = 6; // shadows are drawn larger than life so a 25 cm fish is visible from up here
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

export class FishingView {
  constructor(parent, { dprMax = 1.5 } = {}) {
    this.cv = document.createElement('canvas');
    this.cv.id = 'fishView';
    Object.assign(this.cv.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none' });
    parent.after(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.dprMax = dprMax;
    this.ripples = []; this.drops = [];
    this.art = {};      // id → { image, shadow }
    this.lift = null;   // the catch being lifted out of the water
    this.murk = 1;
  }

  setArt(id, image, shadow) { this.art[id] = { image, shadow }; }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, this.dprMax);
    const w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.dpr = dpr;
  }

  ripple(x, z, { size = 1, life = 1.6, strength = 1 } = {}) { this.ripples.push({ x, z, t: 0, life, size, strength }); }
  splash(x, z, n = 14, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.6 + Math.random()) * 1.4 * power;
      this.drops.push({ x, y: 0.05, z, vx: Math.cos(a) * s * 0.5, vy: (2 + Math.random() * 2.5) * power, vz: Math.sin(a) * s * 0.5, t: 0, life: 0.7 + Math.random() * 0.4 });
    }
    this.ripple(x, z, { size: 1.4 * power, life: 1.8, strength: 1.3 });
  }

  // ── main draw, once per frame (after the 3D frame, same camera) ──
  draw(game, S, dt, { sea = 0, showAim = false } = {}) {
    this.resize();
    const ctx = this.ctx, dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    if (!S) return;
    const P = (x, y, z) => game.project([x, y, z]);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // reefs: dark patches under the water near the rocks
    for (const r of S.region.reefs) this.blob(ctx, P, r.x, sea - 0.5, r.z, r.r * 0.9, 'rgba(10, 30, 28, 0.22)');

    // shadows: the ambient fish, then the one at the bait
    for (const a of S.ambient) this.shadow(ctx, P, a, sea, a.phase === 'flee' ? clamp(1 - a.t / 2, 0, 1) : clamp(Math.min(a.t / 1.5, (a.life - a.t) / 1.5), 0, 1));
    const v = S.visitor;
    if (v && ((S.phase !== 'landing' && S.phase !== 'reveal') || v.kind === 'bycatch')) this.shadow(ctx, P, v, sea, v.phase === 'approach' ? clamp(v.t / 1.2, 0, 1) : 1);

    // water: ripples and drops
    this.ripples = this.ripples.filter((r) => (r.t += dt) < r.life);
    ctx.lineWidth = 2;
    for (const r of this.ripples) {
      const u = r.t / r.life, rad = (0.15 + u * 1.6) * r.size;
      ctx.strokeStyle = `rgba(235, 248, 255, ${(1 - u) * 0.55 * r.strength})`;
      this.ring(ctx, P, r.x, sea, r.z, rad);
      if (r.size > 1) { ctx.strokeStyle = `rgba(235, 248, 255, ${(1 - u) * 0.3 * r.strength})`; this.ring(ctx, P, r.x, sea, r.z, rad * 0.6); }
    }
    this.drops = this.drops.filter((d) => (d.t += dt) < d.life);
    ctx.fillStyle = 'rgba(240, 250, 255, 0.85)';
    for (const d of this.drops) {
      d.vy -= 9.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      if (d.y < 0) continue;
      const p = P(d.x, sea + d.y, d.z);
      if (p.behind) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, 7); ctx.fill();
    }

    // aim guide before casting
    if (showAim) this.aimGuide(ctx, P, S, sea);

    // the float, the line and the rod
    const b = S.bobber;
    const tipX = innerWidth * 0.5, tipY = innerHeight * 0.86;
    const T = S.fight ? S.fight.T : 0.25;
    let hook = null;
    if (S.phase === 'fight' || S.phase === 'landing') hook = P(v ? v.x : b.x, sea - 0.05, v ? v.z : b.z);
    else if (b.visible) {
      const bob = Math.sin(S.time * 2.4) * 0.03 - b.dip * 0.12 - b.sink * 0.25;
      hook = P(b.x, (b.flight ? b.y : sea) + bob, b.z);
    }
    this.rod(ctx, tipX, tipY, S.phase === 'fight' ? T : 0.15, hook, S);
    if (hook && !hook.behind) {
      // line: sags when slack, straight when tight
      const sag = S.phase === 'fight' ? (1 - clamp(T, 0, 1)) * 90 : b.flight ? 10 : 50;
      const mx = (this.tip.x + hook.x) / 2, my = (this.tip.y + hook.y) / 2 + sag;
      ctx.strokeStyle = S.phase === 'fight' && T > TENSION.danger ? 'rgba(255, 120, 100, 0.95)' : 'rgba(250, 250, 240, 0.8)';
      ctx.lineWidth = S.phase === 'fight' ? 1.8 : 1.3;
      ctx.beginPath(); ctx.moveTo(this.tip.x, this.tip.y); ctx.quadraticCurveTo(mx, my, hook.x, hook.y); ctx.stroke();
      if (b.visible && S.phase !== 'fight' && S.phase !== 'landing') this.float(ctx, P, b, sea, hook);
    }

    // the catch coming out of the water
    if (S.phase === 'landing' && S.landing) this.liftOut(ctx, P, S, sea);
  }

  ring(ctx, P, x, y, z, r) {
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2, p = P(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
      if (p.behind) return;
      if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    }
    ctx.stroke();
  }

  blob(ctx, P, x, y, z, r, color) {
    const c = P(x, y, z), e = P(x + r, y, z), f = P(x, y, z + r);
    if (c.behind) return;
    const rx = Math.hypot(e.x - c.x, e.y - c.y), ry = Math.hypot(f.x - c.x, f.y - c.y);
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(rx, 1));
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save(); ctx.translate(c.x, c.y); ctx.scale(1, ry / Math.max(rx, 1)); ctx.translate(-c.x, -c.y);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, rx, 0, 7); ctx.fill(); ctx.restore();
  }

  // a fish shadow: the picture's silhouette, blurred by depth, bending like a swimming body
  shadow(ctx, P, f, sea, fade = 1) {
    const art = this.art[f.c.id];
    if (!art || fade <= 0.01) return;
    const sh = art.shadow;
    const L = (f.len / 100) * SHADOW_SCALE, Wd = L * sh.aspect * 0.8;
    const ch = Math.cos(f.h), sn = Math.sin(f.h);
    const c = P(f.x, sea - 0.1, f.z), hd = P(f.x + ch * L / 2, sea - 0.1, f.z + sn * L / 2), sd = P(f.x - sn * Wd / 2, sea - 0.1, f.z + ch * Wd / 2);
    if (c.behind || hd.behind) return;
    const depth = f.depth ?? 1;
    const level = depth > 2 ? 2 : depth > 1.15 ? 1 : 0;
    const img = sh.levels[level];
    const alpha = clamp(0.95 - depth * 0.2, 0.2, 0.85) * fade * this.murk;
    const dpr = this.dpr;
    // local frame: x along the fish (-1 tail … +1 head), y across (±1 = half width)
    ctx.save();
    ctx.setTransform((hd.x - c.x) * dpr, (hd.y - c.y) * dpr, (sd.x - c.x) * dpr, (sd.y - c.y) * dpr, c.x * dpr, c.y * dpr);
    ctx.scale(-1, 1); // the picture faces left: its left edge is the head
    ctx.globalAlpha = alpha;
    const sw = f.c.game.swim || {};
    // the padded sprite: the body spans x' = -1 (head) … +1 (tail) and y = -1 … +1; the blur margin
    // around it is sh.pad body lengths wide
    const N = 14, iw = img.width, ih = img.height;
    const px = 2 * sh.pad, py = 2 * sh.pad / sh.aspect;
    const amp = (sw.wiggle ?? 0.12) * (2 * L / Wd) * clamp(0.4 + (f.speed || 0) * 0.5, 0.4, 1.6);
    for (let i = 0; i < N; i++) {
      const s0 = i / N, s1 = (i + 1) / N;
      const x = -1 - px + s0 * (2 + 2 * px), w = (s1 - s0) * (2 + 2 * px);
      const along = (x + w / 2 + 1) / 2;      // 0 head … 1 tail
      const env = clamp(along, 0, 1.15) ** 2 + 0.04;
      const off = amp * env * Math.sin(f.tail - along * 4.2);
      ctx.drawImage(img, s0 * iw, 0, (s1 - s0) * iw, ih, x, -1 - py + off, w * 1.05, 2 + 2 * py);
    }
    ctx.restore();
  }

  float(ctx, P, b, sea, p) {
    const e = P(b.x + 0.12, sea, b.z);
    const r = clamp(Math.hypot(e.x - p.x, e.y - p.y), 3, 14);
    const under = clamp(b.sink, 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - under * 0.75;
    // white lower half, red top, a thin stick
    ctx.fillStyle = '#f4f4ef'; ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.2, r * 0.75, r * 0.55, 0, 0, Math.PI); ctx.fill();
    if (under < 0.9) {
      ctx.fillStyle = '#ff3b2f'; ctx.beginPath(); ctx.ellipse(p.x, p.y + r * 0.2, r * 0.75, r * 0.8, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#ff3b2f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y - r * 0.5); ctx.lineTo(p.x, p.y - r * 1.6); ctx.stroke();
    }
    ctx.restore();
  }

  rod(ctx, tipX, tipY, T, hook, S) {
    // the rod comes up from the bottom of the screen; it bends toward the line when the line is tight
    const base = { x: innerWidth * 0.62, y: innerHeight + 30 };
    const toward = hook ? Math.atan2(hook.x - tipX, -(hook.y - tipY)) : 0;
    const bend = clamp(T, 0, 1.1) * 60;
    const tip = { x: tipX + Math.sin(toward) * bend, y: tipY + bend * 0.6 + (S.phase === 'ready' ? Math.sin(S.time * 1.5) * 3 : 0) };
    this.tip = tip;
    const mid = { x: (base.x + tip.x) / 2 + Math.sin(toward) * bend * 0.5, y: (base.y + tip.y) / 2 + bend * 0.2 };
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1b1f24'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y); ctx.stroke();
    ctx.strokeStyle = '#3a5f86'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(base.x, base.y); ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y); ctx.stroke();
    // the reel turns while reeling
    const rx = base.x - 10, ry = innerHeight - 40;
    ctx.fillStyle = '#c9ced4'; ctx.beginPath(); ctx.arc(rx, ry, 22, 0, 7); ctx.fill();
    const a = (this.reelA = (this.reelA || 0) + (S.fight ? S.fight.reel : 0) * 0.35);
    ctx.strokeStyle = '#30353b'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(a) * 26, ry + Math.sin(a) * 26); ctx.stroke();
  }

  aimGuide(ctx, P, S, sea) {
    const A = S.A;
    ctx.save();
    ctx.setLineDash([8, 10]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255, 220, 140, 0.75)';
    ctx.beginPath();
    for (let d = 3; d <= 30; d += 1) {
      const p = P(A.x + RIGHT_X * Math.sin(S.aim) * d, sea, A.z + Math.cos(S.aim) * d);
      if (p.behind) continue;
      if (d === 3) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 230, 160, 0.95)'; ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (const d of [10, 20, 30]) {
      const p = P(A.x + RIGHT_X * Math.sin(S.aim) * d, sea, A.z + Math.cos(S.aim) * d);
      if (p.behind) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, 7); ctx.fill();
      ctx.fillText(`${d} 公尺`, p.x + 34, p.y + 4);
    }
    ctx.restore();
  }

  liftOut(ctx, P, S, sea) {
    const v = S.visitor, art = v && this.art[v.c.id];
    if (!art || v.kind === 'bycatch') return; // a sea turtle is never hauled out of the water
    const u = clamp(S.phaseT / 1.3, 0, 1);
    const p = P(S.landing.x, sea, S.landing.z);
    const tx = innerWidth / 2, ty = innerHeight * 0.42;
    const e = u * u * (3 - 2 * u);
    const x = p.x + (tx - p.x) * e, y = p.y + (ty - p.y) * e - Math.sin(u * Math.PI) * 60;
    const w = Math.min(innerWidth * 0.5, 520) * (0.25 + 0.75 * e);
    const h = w * art.image.height / art.image.width;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(S.time * 18) * 0.12 * (1 - e * 0.6));
    ctx.globalAlpha = clamp(u * 3, 0, 1);
    ctx.drawImage(art.image, -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}
