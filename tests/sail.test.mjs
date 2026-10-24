// Sailing without a GPU: a simulated sailor that steers by leaning, tacks (swing) when the mark is
// upwind, trims the sheet by raising a hand every 1.5 s at most and hikes in gusts must finish
// every difficulty in time; the skip options (auto trim, no hiking) must still finish.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dinghy, SailCourse, WindTrack, SAIL_DIFF, polar, bestTrim, wrap } from '../src/game/sail-logic.js';

const D = Math.PI / 180;
function race(key, { seed = 1, autoTrim = false, hike = true } = {}) {
  const d = SAIL_DIFF[key];
  const windDir = 20 * D;
  const course = new SailCourse(d, { seed, windDir });
  const wind = new WindTrack(d, windDir, seed);
  const b = new Dinghy({ heading: windDir + Math.PI / 2 });
  const dt = 1 / 30;
  let t = 0, nextSheet = 0, tacks = 0, think = 0, lean = 0;
  const mode = autoTrim ? 'auto' : d.trim;
  while (t < d.time && !course.done) {
    wind.step(dt);
    const from = wind.dir + Math.PI;
    if ((think -= dt) <= 0) {
      think = 0.3;
      const tg = course.target();
      const bear = Math.atan2(tg[1] - b.z, tg[0] - b.x);
      const tb = wrap(bear - from);
      let want = bear;
      if (Math.abs(tb) < 48 * D) {
        // beat: close-hauled on the current tack; tack when the mark is well over the other side
        const side = Math.sign(b.twa || 1);
        if (Math.sign(tb) !== side && Math.abs(tb) > 12 * D && !b.tack && b.v > 0.8) { b.startTack(wind.dir); tacks++; }
        want = from + side * 50 * D;
      }
      lean = Math.max(-1, Math.min(1, wrap(want - b.h) * 2.5));
    }
    if (mode !== 'auto' && t >= nextSheet && Math.abs(b.trim - bestTrim(b.twa)) > 0.15) {
      b.sheet(b.trim > bestTrim(b.twa) ? -0.25 : 0.25); nextSheet = t + 1.5;
    }
    b.update(dt, { lean, wind: { dir: wind.dir, k: wind.k }, trimMode: mode, hike: hike ? (b.heel > 0.35 ? 1 : 0) : null });
    course.step(b);
    t += dt;
  }
  return { t: Math.round(t), time: d.time, done: course.done, rounded: course.rounded, tacks, stars: course.stars(d.time - t) };
}

for (const key of Object.keys(SAIL_DIFF)) {
  test(`${key}: finishes in time (20 seeds)`, () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = race(key, { seed });
      assert.ok(r.done, `seed ${seed}: ` + JSON.stringify(r));
    }
  });
  test(`${key}: with auto trim and no hiking (skipped actions) still finishes`, () => {
    for (let seed = 1; seed <= 10; seed++) {
      const r = race(key, { seed, autoTrim: true, hike: false });
      assert.ok(r.done, `seed ${seed}: ` + JSON.stringify(r));
    }
  });
}

test('hard course needs tacking: at least one tack', () => {
  const r = race('hard', { seed: 3 });
  assert.ok(r.tacks >= 1, JSON.stringify(r));
});

test('no-go zone: pointing into the wind stops the boat, a beam reach is fastest', () => {
  assert.ok(polar(0) < 0.1 && polar(30 * D) < 0.2);
  assert.ok(polar(90 * D) > polar(45 * D) && polar(90 * D) > polar(180 * D));
  const b = new Dinghy({ heading: Math.PI }); // wind blows toward +x (dir 0), comes from pi: heading into it
  for (let i = 0; i < 600; i++) b.update(1 / 30, { wind: { dir: 0, k: 1 } });
  assert.ok(b.v < 0.5, String(b.v));
});

test('a badly trimmed sail is slower than a well trimmed one', () => {
  const run = (trim) => { const b = new Dinghy({ heading: Math.PI / 2 }); b.trim = trim; for (let i = 0; i < 600; i++) b.update(1 / 30, { wind: { dir: 0, k: 1 }, trimMode: 'manual' }); return b.v; };
  assert.ok(run(bestTrim(Math.PI / 2)) > run(1) * 1.5);
});

test('a tack mirrors the angle to the wind', () => {
  const b = new Dinghy({ heading: Math.PI + 50 * D });
  b.update(1 / 30, { wind: { dir: 0, k: 1 } });
  const before = b.twa;
  b.startTack(0);
  for (let i = 0; i < 150; i++) b.update(1 / 30, { wind: { dir: 0, k: 1 } });
  assert.ok(Math.abs(b.twa + before) < 0.1, `${b.twa} vs ${before}`);
});
