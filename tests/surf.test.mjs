// Surf without a GPU: a simulated rider that leans toward litter and away from obstacles (as a
// child would, with ~0.4 s reaction) must score well; a rider who skips crouching and barely
// steers still gets a ride and some points; obstacles knock you off for 2 s, never end the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, SurfField, SURF_DIFF, autoLean } from '../src/game/surf-logic.js';

function ride(key, { seed = 1, steerBot = true, crouch = 'hold', react = 0.4 } = {}) {
  const d = SURF_DIFF[key];
  const b = new Board({ heading: 0.35 }), f = new SurfField(d, { seed, heading: 0.35 });
  const dt = 1 / 30;
  let lean = 0, plan = 0, t = 0, cr = 0;
  for (; t < d.time; t += dt) {
    if (steerBot && (plan -= dt) <= 0) { plan = react; lean = autoLean(b, f); }
    // crouch: hold most of the time, stand up now and then
    if (crouch === 'hold') cr = (t % 6) < 4.5 ? 0.9 : 0;
    b.update(dt, { lean, crouch: crouch === 'skip' ? null : cr, steer: d.steer, base: d.base, cross: d.cross * Math.sin(t * 0.3) });
    f.step(b, dt);
  }
  return { score: Math.round(f.score), max: f.maxScore, litter: f.litter, falls: f.falls, dodged: f.dodged, stars: f.stars() };
}

for (const key of Object.keys(SURF_DIFF)) {
  test(`${key}: an attentive rider scores 2+ stars and rarely falls (20 seeds)`, () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = ride(key, { seed });
      assert.ok(r.stars >= 2, `seed ${seed}: ` + JSON.stringify(r));
      assert.ok(r.falls <= (key === 'hard' ? 4 : 3), `seed ${seed}: ` + JSON.stringify(r));
    }
  });
  test(`${key}: crouch skipped (seated) still rides at a steady speed and scores`, () => {
    const r = ride(key, { crouch: 'skip' });
    assert.ok(r.stars >= 1 && r.score > 400, JSON.stringify(r));
  });
}

test('a rider who does nothing keeps riding (falls are 2 s pauses, never game over)', () => {
  const r = ride('hard', { steerBot: false, crouch: 'skip' });
  assert.ok(r.score > 300, JSON.stringify(r));
});

test('crouching makes the board faster than standing', () => {
  const run = (cr) => { const b = new Board(); for (let i = 0; i < 300; i++) b.update(1 / 30, { crouch: cr, base: 5 }); return b.v; };
  assert.ok(run(0.9) > run(0) + 1.5, `${run(0.9)} vs ${run(0)}`);
});

test('leaning carves, but never turns the board back up the swell', () => {
  const b = new Board();
  for (let i = 0; i < 600; i++) b.update(1 / 30, { lean: 1, base: 5 });
  assert.ok(b.h > 1 && b.h < 1.14, String(b.h));
});

test('a trick needs speed and has a cooldown', () => {
  const f = new SurfField(SURF_DIFF.easy), b = new Board();
  b.v = 5;
  assert.equal(f.trick(b, 'left'), true);
  assert.equal(f.trick(b, 'right'), false);
  b.v = 1; b.trick = 0;
  assert.equal(f.trick(b, 'right'), false);
});
