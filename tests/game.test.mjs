// Game rules without a GPU: a simulated player that paddles at a child's pace (one stroke every
// 0.75 s, only using paddle events) must be able to finish every difficulty in time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Kayak, Course, DIFFICULTY } from '../src/game/logic.js';

function play(diffKey, { cadence = 0.75, useLean = false, auto = false, wind = [8, 3], seed = 1 } = {}) {
  const d = DIFFICULTY[diffKey];
  const course = new Course(d, { seed, heading: 0.3 });
  const k = new Kayak({ heading: 0.3 });
  const dt = 1 / 30;
  let t = 0, nextStroke = 0.5, alt = 0;
  while (t < course.time && !course.done) {
    const g = course.gates[course.next];
    const err = Math.atan2(Math.sin(Math.atan2(g.c[1] - k.z, g.c[0] - k.x) - k.h), Math.cos(Math.atan2(g.c[1] - k.z, g.c[0] - k.x) - k.h));
    if (!auto && t >= nextStroke) {
      nextStroke = t + cadence;
      // need to turn right (err > 0) → paddle on the left
      const side = Math.abs(err) > 0.12 ? (err > 0 ? 'left' : 'right') : (alt++ % 2 ? 'left' : 'right');
      k.paddle(side, 0.6, d.power);
    }
    const p0 = [k.x, k.z];
    k.update(dt, { lean: useLean || auto ? Math.max(-1, Math.min(1, err * 2)) : 0, auto: auto ? d.autoSpeed : 0, drift: d.drift, wind });
    course.step(p0, [k.x, k.z]);
    t += dt;
  }
  return { t, passed: course.passed, total: d.gates, done: course.done, stars: course.stars(course.time - t), time: course.time, bumps: course.bumps };
}

for (const key of Object.keys(DIFFICULTY)) {
  // on the hard course the player also needs to lean (rudder) against the cross wind
  test(`${key}: paddling${key === 'hard' ? ' + leaning' : ' only'}, finishes in time with most gates`, () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = play(key, { useLean: key === 'hard', seed });
      assert.ok(r.done, `seed ${seed} did not finish: ` + JSON.stringify(r));
      assert.ok(r.passed >= r.total * 0.7, `seed ${seed}: ` + JSON.stringify(r));
    }
  });
  test(`${key}: paddle skipped (auto paddle) + lean steering also finishes`, () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = play(key, { auto: true, seed });
      assert.ok(r.done && r.passed >= r.total * 0.7, `seed ${seed}: ` + JSON.stringify(r));
    }
  });
}

test('left stroke turns the bow right, right stroke turns it left, both goes straight', () => {
  for (const [side, sign] of [['left', 1], ['right', -1], ['both', 0]]) {
    const k = new Kayak();
    k.paddle(side, 0.8);
    for (let i = 0; i < 30; i++) k.update(1 / 30);
    assert.ok(k.v > 0.3, side + ' speed');
    if (sign) assert.equal(Math.sign(k.h), sign, side); else assert.ok(Math.abs(k.h) < 1e-9);
  }
});

test('missing a gate wide moves the target on', () => {
  const c = new Course(DIFFICULTY.easy, { seed: 2 });
  const g = c.gates[0];
  const far = [g.c[0] + -g.n[1] * 30, g.c[1] + g.n[0] * 30];
  c.step([far[0] - g.n[0] * 2, far[1] - g.n[1] * 2], [far[0] + g.n[0] * 2, far[1] + g.n[1] * 2]);
  assert.equal(c.next, 1);
  assert.equal(c.passed, 0);
});
