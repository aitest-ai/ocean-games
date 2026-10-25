// 體感闖關問答, stage two: the five new level types (穿牆姿勢, 平衡過橋, 閃避障礙, 原地衝刺, Boss),
// combos, hearts and the revive challenge — played by a simulated child whose moves reach the game
// `delay` seconds late (camera + recognizer), using input frames only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateBank, rng } from '../src/quiz/bank.js';
import { QuizSession, Scorer, comboMult } from '../src/quiz/session.js';
import { LEVELS } from '../src/quiz/levels/index.js';
import { poseOf, POSES } from '../src/quiz/levels/wall.js';
import { Revive } from '../src/quiz/levels/revive.js';
import { RIVAL, speedOf } from '../src/quiz/levels/sprint.js';
import { PumpMeter, patchPuppet } from '../src/quiz/input.js';
import { Puppet, Recognizer } from '../packages/taikan-kit/src/index.js';

const load = async (f) => JSON.parse(await readFile(new URL('../data/quiz/' + f, import.meta.url), 'utf8'));
const index = await load('index.json');
const banks = (await Promise.all(index.banks.map(load))).map((b) => validateBank(b).bank);

const blank = (t) => ({ t: t * 1000, lean: 0, side: 'center', armsUp: 0, crouch: 0, crouching: false, cross: false, pump: 0, events: [] });

// A child: knows the answer with probability `skill`, starts acting `think` s after a question
// appears, balances with a slow proportional lean, pumps arms in sprints, dodges obstacles. Everything
// it does is seen `delay` s later.
function child({ skill = 1, think = 2, delay = 0.35, seed = 1, pump = 0.8, dodgeSkill = 1, seated = false } = {}) {
  const r = rng(seed);
  const queue = []; // frames waiting to be "seen"
  let lastStep = null, plan = null, sent = {}, thetaSeen = [];
  const wrong = (s) => (s.correct + 1 + Math.floor(r() * (s.options.length - 1))) % s.options.length;
  function act(lv, t) {
    const f = blank(t);
    const id = lv.constructor.name;
    if (id === 'Sprint') f.pump = pump;
    if (lv.phase !== 'answer') { if (id !== 'Bridge') lastStep = null; return f; }
    const s = lv.step;
    if (s !== lastStep) { lastStep = s; sent = {}; plan = { t0: t, pick: r() < skill ? s.correct : wrong(s) }; }
    const ready = t > plan.t0 + think;
    if (id === 'Wall') {
      if (ready) { const p = lv.poses[plan.pick]; if (p === 'up') f.armsUp = 1; else if (p === 'crouch') { f.crouching = true; f.crouch = 1; } else f.side = p; if (p === 'left' || p === 'right') f.lean = p === 'left' ? -0.8 : 0.8; }
    } else if (id === 'Bridge') {
      // lean against the needle the child sees (the needle is on screen, so no camera delay on seeing)
      thetaSeen.push({ t, th: lv.theta });
      const th = lv.theta;
      f.lean = Math.max(-1, Math.min(1, -th * 2.2 - lv.g * 1.2));
      f.side = f.lean < -0.35 ? 'left' : f.lean > 0.35 ? 'right' : 'center';
      if (lv.fallT <= 0 && lv.answer === null && ready && (!sent.raise || t - sent.raise > 3)) { sent.raise = t; f.events.push({ type: 'raise', side: plan.pick === 0 ? 'left' : 'right' }); }
    } else if (id === 'Dodge') {
      const o = lv.coming;
      if (o && r() < dodgeSkill) {
        const rel = lv.t - o.at;
        if (o.kind === 'hurdle' && rel > -0.8 && !sent['j' + o.at]) { sent['j' + o.at] = 1; f.events.push({ type: 'jump' }); }
        if (o.kind === 'bar' && rel > -0.6) { f.crouching = true; f.crouch = 1; }
        if (o.kind === 'hoop' && rel > -0.7) f.armsUp = 1;
        if (o.kind === 'swing' && rel > -0.5) f.side = o.side === 'left' ? 'right' : 'left';
      } else if (ready && lv.t > lv.window - 3) f.side = plan.pick === 0 ? 'left' : 'right';
    } else if (id === 'Sprint') {
      if (ready) f.side = plan.pick === 0 ? 'left' : 'right';
    } else if (id === 'Boss') {
      if (ready) {
        if (lv.cursor !== plan.pick && (!sent.lean || t - sent.lean > 0.6)) { sent.lean = t; f.events.push({ type: 'lean', side: plan.pick < lv.cursor ? 'left' : 'right' }); }
        else if (lv.cursor === plan.pick && !sent.ok && t - (sent.lean || plan.t0) > 0.8) { sent.ok = true; f.events.push({ type: 'raise', side: 'left' }); }
      }
    }
    return f;
  }
  // the game sees what the child did `delay` seconds ago (the bridge child watches the screen, so
  // only its body is late, which is the same thing)
  return (lv, t) => {
    queue.push(act(lv, t));
    while (queue.length > 1 && queue[0].t <= (t - delay) * 1000 && queue[1].t <= (t - delay) * 1000) {
      const old = queue.shift();
      queue[0].events = [...old.events, ...queue[0].events];
    }
    const f = queue[0].t <= (t - delay) * 1000 ? queue.shift() : { ...blank(t), pump: queue[0].pump };
    return { ...f, t: t * 1000 };
  };
}

function play(level, { bank = 0, count = 4, diff = 'normal', seed = 1, opts = {}, ...kid } = {}) {
  const S = new QuizSession({ bank: banks[bank], playlist: [{ level, count }], diff, seed, opts: { revive: false, ...opts } });
  const bot = child({ seed, ...kid });
  const dt = 1 / 30;
  let t = 0, guard = 0;
  const events = [];
  while (!S.done && guard++ < 30 * 600) {
    const lv = S.level;
    events.push(...S.update(dt, lv ? bot(lv, t) : blank(t)));
    t += dt;
  }
  return { S, t, events, sum: S.summary(), level: S.level };
}

for (const id of ['wall', 'bridge', 'dodge', 'sprint', 'boss']) {
  test(`${id}: a child who knows the answers gets them right on every difficulty and bank, even with a 0.6 s camera delay`, () => {
    for (const diff of ['easy', 'normal', 'hard']) for (let b = 0; b < banks.length; b++) for (const delay of [0.35, 0.6]) {
      const { sum, t } = play(id, { bank: b, diff, seed: b + 3, delay });
      assert.equal(sum.total, id === 'boss' ? sum.total : 4, `${id} ${diff} bank ${b}`);
      assert.equal(sum.correct, sum.total, `${id} ${diff} bank ${b} delay ${delay}: ` + JSON.stringify(sum.log.filter((x) => !x.correct).map((x) => x.prompt)));
      assert.ok(t < 150, `${id} ${diff}: one level took ${t.toFixed(0)} s`);
    }
  });
  test(`${id}: a child who does nothing still reaches the end of the level`, () => {
    const S = new QuizSession({ bank: banks[0], playlist: [{ level: id, count: 3 }], diff: 'normal', seed: 2, opts: { revive: false } });
    let t = 0;
    while (!S.done && t < 300) { S.update(1 / 30, blank(t)); t += 1 / 30; }
    assert.ok(S.done, id);
    assert.equal(S.summary().correct, 0);
  });
}

test('wall: holes are in wall order (left, up, crouch, right); seated play never needs a crouch', () => {
  for (let seed = 1; seed < 30; seed++) {
    for (const seated of [false, true]) {
      const { level, events } = play('wall', { seed, opts: { seated }, count: 4 });
      const steps = events.filter((e) => e.type === 'step');
      assert.ok(steps.length > 0);
      assert.ok(level.poses.every((p, i, a) => i === 0 || ['left', 'up', 'crouch', 'right'].indexOf(a[i - 1]) < ['left', 'up', 'crouch', 'right'].indexOf(p)));
      if (seated) assert.ok(!level.poses.includes('crouch'));
    }
  }
  assert.equal(poseOf({ armsUp: 1, side: 'left' }), 'up');
  assert.equal(poseOf({ crouching: true, side: 'right' }), 'crouch');
  assert.equal(poseOf({ side: 'right' }), 'right');
  assert.equal(poseOf({ side: 'center' }), null);
  assert.equal(Object.keys(POSES).length, 4);
});

test('bridge: a child balancing with a 0.6 s delay rarely falls; not leaning falls; a fall costs 20 points and restarts the question', () => {
  let falls = 0;
  for (let seed = 1; seed <= 10; seed++) { const { events } = play('bridge', { seed, delay: 0.6, diff: 'hard' }); falls += events.filter((e) => e.type === 'fall').length; }
  assert.ok(falls <= 3, 'falls in 10 hard levels: ' + falls);
  const S = new QuizSession({ bank: banks[0], playlist: [{ level: 'bridge', count: 1 }], diff: 'hard', seed: 4, opts: { revive: false } });
  S.scorer.score = 100;
  const ev = [];
  for (let t = 0; t < 30 && !ev.some((e) => e.type === 'fall'); t += 1 / 30) ev.push(...S.update(1 / 30, blank(t)));
  const fall = ev.find((e) => e.type === 'penalty');
  assert.ok(fall, 'standing still on a windy bridge falls');
  assert.equal(fall.points, 20); assert.equal(S.scorer.score, 80);
  assert.equal(S.level.answer, null);
});

test('dodge: dodged obstacles score +20 each, missed ones only stumble; seated play uses hoops and cushions', () => {
  const good = play('dodge', { seed: 5 });
  const bonus = good.events.filter((e) => e.type === 'bonus').length;
  assert.equal(bonus, 8, 'all 8 obstacles dodged');
  const clumsy = play('dodge', { seed: 5, dodgeSkill: 0 });
  assert.equal(clumsy.events.filter((e) => e.type === 'bonus').length, 0);
  assert.equal(clumsy.sum.correct, 4, 'bumping obstacles does not cost the answers');
  const seated = play('dodge', { seed: 6, opts: { seated: true } });
  assert.ok(seated.level.obstacles.every((o) => o.kind === 'hoop' || o.kind === 'swing'));
  assert.equal(seated.events.filter((e) => e.type === 'bonus').length, 8);
});

test('sprint: arm swinging beats the rival, standing still does not; right answers give turbo', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const win = play('sprint', { diff, pump: 0.7 });
    assert.ok(win.level.won, diff + ' pumping child wins');
    assert.ok(win.events.some((e) => e.type === 'bonus' && e.points === 150));
    const idle = play('sprint', { diff, pump: 0 });
    assert.ok(!idle.level.won, diff + ' idle child loses (and still finishes)');
  }
  assert.ok(speedOf(0.7, 0) > RIVAL.hard && speedOf(0.5, 0) > RIVAL.easy && speedOf(0, 0) < RIVAL.easy);
});

test('boss: falls after ~60 % right answers (+300), the remaining questions are skipped; runs away otherwise', () => {
  const win = play('boss', { count: 5 });
  assert.ok(win.level.down);
  assert.equal(win.sum.total, 3, 'ceil(5 × 0.6) = 3 hits');
  assert.ok(win.events.some((e) => e.type === 'bonus' && e.points === 300));
  const lose = play('boss', { count: 5, skill: 0 });
  assert.ok(!lose.level.down); assert.equal(lose.sum.total, 5);
  assert.ok(lose.events.filter((e) => e.type === 'bossAttack').length === 5);
  // the boss takes the hardest questions first
  const S = new QuizSession({ bank: banks[1], playlist: [{ level: 'boss', count: 3 }], seed: 3 });
  S.update(1 / 30, blank(0));
  assert.ok(S.level.steps.every((s) => s.difficulty >= 2), S.level.steps.map((s) => s.difficulty).join());
});

// ── combos, hearts, revive ──────────────────────────────────────────────────
test('combo multiplier: ×1.2 from 3 in a row, ×1.5 from 5, ×2 from 8; a wrong answer resets it', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 7, 8, 12].map(comboMult), [1, 1, 1.2, 1.2, 1.5, 1.5, 2, 2]);
  const s = new Scorer();
  const step = { prompt: 'x', answerText: 'a' };
  const pts = [true, true, true, true, true, false, true].map((c) => s.answer({ correct: c, step }).points);
  assert.deepEqual(pts, [100, 100, 120, 120, 150, 0, 100]);
  assert.equal(s.maxCombo, 5);
  assert.equal(new Scorer({ combo: false }).answer({ correct: true, step }).points, 100);
});

test('hearts: 3 wrong answers start a revive task; doing it gives 3 hearts and +50, not doing it still 2 hearts', () => {
  for (const doIt of [true, false]) {
    const S = new QuizSession({ bank: banks[0], playlist: [{ level: 'tf', count: 6 }], diff: 'normal', seed: 1 });
    let t = 0, revive = null, revived = null;
    while (!S.done && t < 400) {
      const f = blank(t);
      const lv = S.level;
      if (S.phase === 'revive' && doIt) {
        // lean left and right alternately (events), as the task asks
        if (Math.floor(t * 2) !== Math.floor((t - 1 / 30) * 2)) f.events.push({ type: 'lean', side: Math.floor(t * 2) % 2 ? 'left' : 'right' });
        f.events.push(...(S.revive.kind === 'raise' && Math.floor(t * 2) !== Math.floor((t - 1 / 30) * 2) ? [{ type: 'raise', side: 'both' }] : []));
        f.pump = 0.8;
      } else if (lv?.phase === 'answer' && lv.t > 1) { if (lv.step.correct) f.cross = true; else f.armsUp = 1; } // always wrong
      for (const e of S.update(1 / 30, f)) { if (e.type === 'revive') revive = e; if (e.type === 'revived') revived = e; }
      if (revived) break;
      t += 1 / 30;
    }
    assert.ok(revive, 'revive started');
    assert.equal(revived.success, doIt);
    assert.equal(S.scorer.hearts, doIt ? 3 : 2);
    assert.equal(S.scorer.total, 3, 'after the third wrong answer');
    while (!S.done && t < 600) { S.update(1 / 30, blank(t)); t += 1 / 30; }
    assert.ok(S.done, 'the game goes on after a revive');
  }
});

test('revive tasks: lean alternately 4×, raise both hands 2×, swing arms 3 s', () => {
  const lean = new Revive({ kind: 'lean' });
  for (const side of ['left', 'left', 'right', 'left', 'right']) lean.update(0.5, { events: [{ type: 'lean', side }] });
  assert.ok(lean.success, 'same side twice counts once');
  const raise = new Revive({ kind: 'raise' });
  raise.update(0.5, { events: [{ type: 'raise', side: 'left' }] }); assert.ok(!raise.done);
  raise.update(0.5, { events: [{ type: 'raise', side: 'both' }, { type: 'raise', side: 'both' }] }); assert.ok(raise.success);
  const pump = new Revive({ kind: 'pump' });
  for (let i = 0; i < 100 && !pump.done; i++) pump.update(0.05, { events: [], pump: 0.6 });
  assert.ok(pump.success && pump.t < 3.2);
  const slow = new Revive({ kind: 'pump', diff: 'hard' });
  for (let i = 0; i < 400 && !slow.done; i++) slow.update(0.05, { events: [], pump: 0.1 });
  assert.ok(slow.done && !slow.success && slow.t >= 10);
});

// ── the real input layer: arm pumping (keyboard R) ──
test('arm pumping through the real recognizer gives a high pump value; standing still and leaning do not', () => {
  const run = (script, ms = 4000) => {
    const pup = new Puppet({ seed: 3, jitter: 0.002 });
    const state = { cross: false, pump: false };
    patchPuppet(pup, () => state);
    const rec = new Recognizer({ emit: () => {} });
    const meter = new PumpMeter();
    const out = [];
    for (let t = 0; t <= ms; t += 33) {
      for (const [at, k, v] of script) if (Math.abs(at - t) < 17) (k in state ? (state[k] = v) : pup.set(k, v));
      rec.feed(pup.step(t), t);
      out.push({ t, pump: meter.update(t, rec.state.hands) });
    }
    return out;
  };
  const pumping = run([[1000, 'pump', true], [3500, 'pump', false]]);
  assert.ok(pumping.filter((f) => f.t > 1800 && f.t < 3400).every((f) => f.pump > 0.5), 'pumping counts');
  assert.ok(pumping.filter((f) => f.t < 900).every((f) => f.pump < 0.15), 'still is ~0');
  const leaning = run([[1000, 'leanL', true], [2000, 'leanL', false], [2500, 'leanR', true]]);
  assert.ok(leaning.every((f) => f.pump < 0.35), 'leaning is not running: ' + Math.max(...leaning.map((f) => f.pump)).toFixed(2));
});
