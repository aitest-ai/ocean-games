// Fishing without a GPU: the database is complete (every datum has a source, a license and a status),
// size statistics behave, a simulated child who watches the tension bar (~0.4 s reactions) lands
// fish on every difficulty, a player who reels and braces flat out breaks lines, a player who never
// reels loses fish to slack, every skip option still finishes the game, and the reel detector counts
// circles but not swings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadDB, validateSpecies } from '../src/fishing/data.js';
import { FishingSession, FISH_DIFF, TENSION, zoneAt } from '../src/fishing/logic.js';
import { percentile, sampleLength, weightOf, sizeClass, releaseRule, val } from '../src/fishing/stats.js';
import { ReelDetector, patchPuppet } from '../src/fishing/reel.js';
import { Puppet, Recognizer } from '../packages/taikan-kit/src/index.js';
import { rng } from '../src/fishing/logic.js';

const db = await loadDB('', async (p) => JSON.parse(await readFile(new URL('../data/fishing/' + p, import.meta.url), 'utf8')));
const fish = db.species.filter((s) => s.kind === 'fish');

// play one session; bot = 'attentive' | 'greedy' (reel + brace flat out) | 'idle' (never reels or braces)
function play(diffKey, { seed = 1, bot = 'attentive', react = 0.4, opts = {}, month = 1 } = {}) {
  const d = FISH_DIFF[diffKey];
  const S = new FishingSession({ catchables: db.catchables, region: db.region, diff: d, month, seed, opts });
  const r = rng(seed * 7 + 3);
  const dt = 1 / 30;
  let time = d.time, plan = 0, reel = 0, brace = 0, revealAt = 0, guard = 0;
  const fights = [];
  while ((time > 0 || S.busy) && guard++ < 30 * 900) {
    if (S.phase === 'ready' && S.phaseT > 1.5 && !opts.autoCast) S.cast(0.6 + r() * 0.4, (r() - 0.5) * 0.8);
    if (S.phase === 'bite' && S.phaseT > 0.5 && !opts.autoHook) S.hook();
    if (S.phase === 'fight' && (plan -= dt) <= 0) {
      plan = react;
      const F = S.fight;
      if (bot === 'attentive') {
        // what a child sees: the bar's colour and the "衝刺" warning (both a reaction late)
        reel = F.T < 0.55 && F.surge <= 0 ? 1 : 0;
        brace = F.T < 0.35 ? 1 : F.T > 0.7 ? 0 : brace;
        if (S.visitor?.kind === 'bycatch') { reel = 0; brace = 0; }
      } else if (bot === 'greedy') { reel = 1; brace = 1; }
      else { reel = 0; brace = 0; }
    }
    if (S.phase === 'reveal') { if (!revealAt) revealAt = S.time; if (S.time - revealAt > 2) { fights.push(S.reveal); S.finishReveal('keep'); revealAt = 0; } }
    const evs = S.step(dt, { reel: opts.autoReel ? 0 : reel, brace: opts.autoBrace ? null : brace, lean: 0 });
    for (const e of evs) if (e.type === 'break' || e.type === 'unhook') fights.push({ lost: e.type });
    if (S.phase !== 'reveal') time -= dt;
  }
  const t = S.tally;
  return { score: S.score, stars: S.stars(), landed: t.kept + t.released + t.junk + t.turtle, ...t };
}

test('database: every species and litter item is complete, every datum has source, license and status', () => {
  assert.ok(fish.length >= 8 && fish.length <= 10, `${fish.length} fish`);
  const problems = db.species.flatMap((s) => validateSpecies(s, db.sources));
  assert.deepEqual(problems, []);
  for (const j of db.junk) assert.ok(val(j.names.zh) && val(j.intro) && j.art?.file, j.id);
  for (const c of db.catchables) assert.match(c.art.file, new RegExp(`^assets/fishing/(species|junk)/${c.id}\\.png$`), c.id);
  for (const src of Object.values(db.sources)) {
    assert.ok(src.license, `${src.id} has no license`);
    assert.doesNotMatch(src.license, /^CC BY-NC|^CC BY-SA|NC-|-SA/, `${src.id}: NC / SA content must not be used as data`);
  }
});

test('size statistics: percentiles, length → weight, size classes, release rules', () => {
  for (const sp of fish) {
    const p50 = val(sp.length.catch.p50), p95 = val(sp.length.catch.p95);
    assert.ok(Math.abs(percentile(sp, p50) - 0.5) < 0.01, sp.id);
    assert.ok(Math.abs(percentile(sp, p95) - 0.95) < 0.01, sp.id);
    assert.ok(weightOf(sp, p95) > weightOf(sp, p50), sp.id);
    const r = rng(5);
    for (let i = 0; i < 200; i++) {
      const L = sampleLength(sp, r);
      assert.ok(L >= val(sp.length.min) && L <= val(sp.length.maxCommon), `${sp.id} ${L}`);
    }
    const w = weightOf(sp, p50);
    assert.ok(w > 5 && w < 20000, `${sp.id}: ${w} g at ${p50} cm`);
  }
  assert.equal(sizeClass(0.1).label, '小型');
  assert.equal(sizeClass(0.5).label, '中型');
  assert.equal(sizeClass(0.9).label, '大型');
  for (const c of db.catchables.filter((x) => x.kind === 'bycatch')) assert.equal(releaseRule(c, 50).required, true);
});

for (const key of Object.keys(FISH_DIFF)) {
  test(`${key}: an attentive player lands fish and earns 2+ stars (20 sessions)`, () => {
    let landed = 0, broke = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = play(key, { seed, month: 1 + (seed % 12) });
      assert.ok(r.stars >= 2, `seed ${seed}: ` + JSON.stringify(r));
      landed += r.landed; broke += r.broke;
    }
    assert.ok(landed / 20 >= 3, `avg landed ${landed / 20}`);
    assert.ok(broke / 20 <= 1.5, `avg broke ${broke / 20}`);
  });
}

test('reeling and bracing flat out breaks lines; never reeling loses fish to slack', () => {
  let broke = 0, unhooked = 0;
  for (let seed = 1; seed <= 10; seed++) {
    broke += play('normal', { seed, bot: 'greedy' }).broke;
    unhooked += play('normal', { seed, bot: 'idle' }).unhooked;
  }
  assert.ok(broke >= 10, `greedy broke ${broke}`);
  assert.ok(unhooked >= 10, `idle unhooked ${unhooked}`);
});

test('every skip option still plays: auto cast + hook + reel + brace lands fish', () => {
  for (const key of Object.keys(FISH_DIFF)) for (let seed = 1; seed <= 5; seed++) {
    const r = play(key, { seed, bot: 'idle', opts: { autoCast: true, autoHook: true, autoReel: true, autoBrace: true } });
    assert.ok(r.landed >= 2 && r.stars >= 1, `${key} seed ${seed}: ` + JSON.stringify(r));
  }
  // seated players who skip only the brace still do well
  const r = play('normal', { seed: 3, opts: { autoBrace: true } });
  assert.ok(r.stars >= 2, JSON.stringify(r));
});

test('a hooked sea turtle is let go safely when the player stops reeling', () => {
  const turtle = db.catchables.find((c) => c.kind === 'bycatch');
  const S = new FishingSession({ catchables: [turtle], region: db.region, diff: FISH_DIFF.normal, month: 7, seed: 4 });
  S.cast(0.8, 0);
  let safe = false;
  for (let i = 0; i < 30 * 60 && !safe; i++) {
    if (S.phase === 'bite') S.hook();
    for (const e of S.step(1 / 30, { reel: 0, brace: 0 })) if (e.type === 'turtleSafe') safe = true;
  }
  assert.ok(safe);
});

test('early hook sets can scare fish (normal), never on easy', () => {
  const sp = fish.find((s) => (s.game.bite.nibbles[0]) >= 2);
  for (const [key, expect] of [['easy', false], ['hard', true]]) {
    let scared = false;
    for (let seed = 1; seed <= 15 && !scared; seed++) {
      const S = new FishingSession({ catchables: [sp], region: db.region, diff: FISH_DIFF[key], month: 1, seed });
      S.cast(0.8, 0);
      for (let i = 0; i < 30 * 40; i++) {
        S.step(1 / 30, {});
        if (S.visitor?.phase === 'test') { const r = S.hook(); if (r?.scared) scared = true; break; }
      }
    }
    assert.equal(scared, expect, key);
  }
});

test('casting: a faster swing goes farther; aim turns the landing point; zones differ', () => {
  const S = new FishingSession({ catchables: db.catchables, region: db.region, diff: FISH_DIFF.easy, seed: 1 });
  const a = S.cast(0.4, 0); S.setPhase('ready');
  const b = S.cast(1, 0); S.setPhase('ready');
  assert.ok(b.dist > a.dist + 15, `${a.dist} → ${b.dist}`);
  const l = S.cast(0.8, -0.4); S.setPhase('ready');
  const rt = S.cast(0.8, 0.4);
  assert.ok(Math.sign(l.x) !== Math.sign(rt.x));
  const near = zoneAt(db.region, db.region.reefs[0].x, db.region.reefs[0].z), far = zoneAt(db.region, 0, 34);
  assert.ok(near.reef > 0.9 && far.open > 0.9);
});

test('reel detector: hand circles count; single swings, paddles and small waves do not', () => {
  const rec = new Recognizer({ emit: () => {} });
  let on = false;
  const pup = patchPuppet(new Puppet({ seed: 3 }), () => on);
  const det = new ReelDetector();
  const sample = (from, to, f) => { let max = 0; for (let t = from; t < to; t += 33) { f?.(t); const p = pup.step(t); rec.feed(p, t); const v = det.update(t, rec.state.hands); if (t > from + 800) max = Math.max(max, v); } return max; };
  sample(0, 2000);
  on = true; const circling = sample(2000, 5000); on = false;
  sample(5000, 6500);
  let fired = 0;
  const swinging = sample(6500, 11000, (t) => { if (t % 1500 < 33) { pup.trigger(['swing-left', 'paddle-right', 'wave'][fired++ % 3], t); } });
  assert.ok(circling > 0.8, `circling ${circling}`);
  assert.ok(swinging < 0.25, `swinging ${swinging}`);
});

test('tension zones are ordered', () => {
  assert.ok(TENSION.slack < TENSION.sweetLo && TENSION.sweetLo < TENSION.sweetHi && TENSION.sweetHi < TENSION.danger && TENSION.danger < TENSION.snap);
});
