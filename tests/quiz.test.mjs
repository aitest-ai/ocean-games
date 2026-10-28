// 體感闖關問答 without a browser: the question-bank formats (JSON, CSV, pasted text) and their
// plain-language errors, compiling every question type into body-sized steps, drawing questions,
// scoring, and each level's rules played by a simulated child (with a camera-like delay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseAny, parseTextBank, parseCSVBank, validateBank, compile, adapt, toStatement, toJSON, toCSVText,
  numberDistractors, parseBool, rng, describeIssue,
} from '../src/quiz/bank.js';
import { parseCSV, toCSV } from '../src/quiz/csv.js';
import { Deck, QuizSession, Scorer } from '../src/quiz/session.js';
import { LEVELS } from '../src/quiz/levels/index.js';
import { DOOR_Z } from '../src/quiz/levels/run.js';
import { isCross, patchPuppet, Hold } from '../src/quiz/input.js';
import { artURL, ART_LIST } from '../src/quiz/art.js';
import { Puppet, Recognizer } from '../packages/taikan-kit/src/index.js';

const load = async (f) => JSON.parse(await readFile(new URL('../data/quiz/' + f, import.meta.url), 'utf8'));
const index = await load('index.json');
const samples = await Promise.all(index.banks.map(load));

// ── formats ─────────────────────────────────────────────────────────────────
test('every built-in sample bank is valid, original and covers all six question types', () => {
  const types = new Set();
  for (const raw of samples) {
    const r = validateBank(raw);
    assert.deepEqual(r.errors, [], raw.title + ': ' + r.errors.map(describeIssue).join('; '));
    assert.deepEqual(r.warnings, [], raw.title + ': ' + r.warnings.map(describeIssue).join('; '));
    assert.ok(r.bank.questions.length >= 10, raw.title);
    assert.match(raw.license, /原創/);
    for (const q of r.bank.questions) types.add(q.type);
  }
  assert.deepEqual([...types].sort(), ['choice', 'image', 'match', 'number', 'order', 'tf']);
});

test('pasted text: numbering, * marks, 答案 lines, ○× at the end, pairs, ordering, numbers', () => {
  const r = parseAny(`1. cat 是什麼意思？
A. 貓 *
B. 狗
提示：會喵喵叫
難度：易

2、是非：太陽從東邊升起。○

配對：把英文和中文配對
cat = 貓
dog → 狗

排序：由小到大
1/4
1/2
3/4

7 × 8 = ？
答案：56

(1) 第二個字是？
A) 甲
B) 乙
C) 丙
答案：B`);
  assert.deepEqual(r.errors, []);
  const q = r.bank.questions;
  assert.deepEqual(q.map((x) => x.type), ['choice', 'tf', 'match', 'order', 'number', 'choice']);
  assert.equal(q[0].answer, 0); assert.equal(q[0].hint, '會喵喵叫'); assert.equal(q[0].difficulty, 1);
  assert.equal(q[1].answer, true); assert.equal(q[1].q, '太陽從東邊升起。');
  assert.equal(q[2].pairs[1][1].text, '狗');
  assert.deepEqual(q[3].items.map((x) => x.text), ['1/4', '1/2', '3/4']);
  assert.equal(q[4].answer, 56);
  assert.equal(q[5].answer, 1);
});

test('plain-language errors point at the question and line', () => {
  const r = parseAny(`狗的英文？
A. dog
答案：A

是非：地球是平的。
答案：也許

選擇：哪個最大？
A. 1
B. 2
答案：E`);
  const msgs = r.errors.map(describeIssue);
  assert.equal(r.errors.length, 3, msgs.join('\n'));
  assert.match(msgs[0], /^第 1 題（第 1 行）：選擇題至少要 2 個選項/);
  assert.match(msgs[1], /^第 2 題（第 5 行）：是非題的答案「也許」看不懂/);
  assert.match(msgs[2], /^第 3 題（第 8 行）：答案「E」找不到對應的選項（只有 A、B/);
  assert.equal(r.bank.questions.length, 0);
});

test('JSON syntax errors become a friendly message with a line number', () => {
  const r = parseAny('{\n "title": "x",\n "questions": [ { "q": "a" }, ]\n}', 'bank.json');
  assert.equal(r.bank, null);
  assert.match(r.errors[0].msg, /不是正確的 JSON/);
});

test('CSV from Excel (BOM, quotes, commas and line breaks in cells) and TSV pasted from a sheet', () => {
  const csv = '﻿題型,題目,選項A,選項B,選項C,選項D,答案,提示,解說,難度,標籤,圖片\r\n'
    + '選擇,"哪一個是水果,而且是紅色?",蘋果,香蕉,"葡""萄",,A,,"第一行\n第二行",1,水果、顏色,\r\n'
    + '是非,水會往低處流,,,,,對,,,,,\r\n'
    + '配對,配對,cat=貓,dog=狗,,,,,,,,\r\n'
    + '數字,3+4=?,,,,,7,,,,,\r\n';
  const r = parseAny(csv, 'bank.csv');
  assert.deepEqual(r.errors, []);
  const [a, b, c, d] = r.bank.questions;
  assert.equal(a.q, '哪一個是水果,而且是紅色?'); assert.equal(a.options[2].text, '葡"萄'); assert.equal(a.explain, '第一行\n第二行');
  assert.deepEqual(a.tags, ['水果', '顏色']);
  assert.equal(b.answer, true); assert.equal(c.pairs.length, 2); assert.equal(d.answer, 7);
  const tsv = '題目\t選項A\t選項B\t答案\n1+1=?\t2\t3\tA\n';
  const t = parseAny(tsv);
  assert.equal(t.bank.questions[0].answer, 0);
  assert.equal(parseCSV('a,b\n"x\ny",z\n').length, 2);
  assert.deepEqual(parseCSV(toCSV([['a,b', 'c"d', 'e\nf']]))[0].slice(), ['a,b', 'c"d', 'e\nf']);
});

test('CSV without a 題目 column explains what the first row must be', () => {
  const r = parseCSVBank('name,score\nAmy,90\n');
  assert.match(r.errors[0].msg, /第一行要是欄位名稱，至少要有「題目」/);
});

test('JSON and CSV export round-trip every sample bank (images embedded in JSON)', () => {
  for (const raw of samples) {
    const b = validateBank(raw).bank;
    const j = parseAny(toJSON(b), 'x.json');
    assert.deepEqual(j.errors, []);
    assert.deepEqual(j.bank.questions.map(strip), b.questions.map(strip), raw.title);
    const c = parseAny(toCSVText(b), 'x.csv');
    assert.deepEqual(c.errors, [], raw.title + c.errors.map(describeIssue));
    assert.equal(c.bank.questions.length, b.questions.length);
  }
  const withImg = validateBank({ questions: [{ type: 'image', q: '這是誰？', image: 'cat.jpg', options: ['A', 'B'], answer: 'A' }], images: { abc: { name: 'cat.jpg', data: 'data:image/png;base64,AAA' } } }).bank;
  assert.equal(withImg.questions[0].image, 'img:abc');
  assert.ok(JSON.parse(toJSON(withImg)).images.abc);
  const missing = validateBank({ questions: [{ type: 'image', q: '?', image: 'dog.jpg', options: ['a', 'b'], answer: 1 }] });
  assert.match(missing.warnings[0].msg, /找不到圖片「dog.jpg」/);
});
const strip = (q) => ({ ...q, id: undefined });

test('true/false words teachers use', () => {
  for (const s of ['○', 'O', '對', '是', 'true', '✓', '(O)']) assert.equal(parseBool(s), true, s);
  for (const s of ['×', 'X', '錯', '否', 'false', '✗']) assert.equal(parseBool(s), false, s);
  assert.equal(parseBool('也許'), null);
});

// ── compiling into steps ────────────────────────────────────────────────────
test('each question type compiles into 2–4-option steps with the right answer marked', () => {
  const r = rng(5);
  for (const raw of samples) for (const q of validateBank(raw).bank.questions) {
    const steps = compile(q, r);
    assert.ok(steps.length >= 1);
    for (const s of steps) {
      if (s.kind === 'tf') { assert.equal(typeof s.correct, 'boolean'); continue; }
      assert.ok(s.options.length >= 2 && s.options.length <= 4, q.q);
      assert.ok(s.correct >= 0 && s.correct < s.options.length);
      assert.equal(new Set(s.options.map((o) => o.text + o.image)).size, s.options.length, 'no duplicate options: ' + q.q);
    }
    if (q.type === 'order') {
      assert.equal(steps.length, q.items.length - 1);
      steps.forEach((s, k) => assert.equal(s.options[s.correct], q.items[k]));
    }
    if (q.type === 'match') steps.forEach((s) => assert.ok(q.pairs.some((p) => p[1] === s.options[s.correct] && s.sub.includes(p[0].text))));
  }
});

test('number questions get plausible, distinct, non-negative distractors', () => {
  for (const n of [0, 1, 7, 56, 100, 999, 2.5]) {
    const d = numberDistractors(n, rng(n + 1));
    assert.equal(d.length, 3, String(n));
    assert.ok(!d.includes(n) && new Set(d).size === 3 && d.every((x) => x >= 0), `${n}: ${d}`);
  }
});

test('reducing options keeps the answer; statements are true about half the time', () => {
  const step = compile(validateBank({ questions: [{ q: 'x', options: ['a', 'b', 'c', 'd'], answer: 'c' }] }).bank.questions[0], rng(1))[0];
  const r = rng(2);
  let truthy = 0;
  for (let i = 0; i < 200; i++) {
    const s = adapt(step, 2, r);
    assert.equal(s.options.length, 2); assert.equal(s.options[s.correct].text, 'c');
    const t = toStatement(step, r);
    assert.equal(t.kind, 'tf');
    assert.equal(t.correct, t.claim.text === 'c');
    if (t.correct) truthy++;
  }
  assert.ok(truthy > 70 && truthy < 130, String(truthy));
});

test('built-in drawings exist for every listed picture', () => {
  for (const [kind, vals] of Object.entries(ART_LIST)) for (const v of vals) assert.match(artURL(`art:${kind}:${v}`), /^data:image\/svg\+xml/);
  assert.equal(artURL('art:nope:1'), '');
});

// ── drawing questions ───────────────────────────────────────────────────────
test('the deck draws without repeats, prefers suitable types and honours tag filters', () => {
  const bank = validateBank(samples[0]).bank;
  const d = new Deck(bank.questions, { rng: rng(3) });
  const seen = new Set();
  for (let i = 0; i < 3; i++) for (const s of d.take(3, LEVELS.buzz)) seen.add(s.qid + (s.sub || ''));
  assert.equal(d.rounds, 1);
  const tfDeck = new Deck(bank.questions, { rng: rng(4) });
  const first = tfDeck.take(2, LEVELS.tf);
  assert.ok(first.every((s) => s.kind === 'tf' && s.type === 'tf'), 'true/false questions first');
  const colours = new Deck(bank.questions, { rng: rng(4), tags: ['顏色'] });
  assert.ok(colours.take(10, LEVELS.buzz).every((s) => s.tags.includes('顏色')));
  const none = new Deck(bank.questions, { tags: ['不存在'] });
  assert.equal(none.filtered, false);
});

// ── simulated child ─────────────────────────────────────────────────────────
// A child who reads, knows the answer with probability `skill`, decides after `think` seconds and is
// seen by the game `delay` seconds later (camera + recognizer). It produces input frames only.
function child({ skill = 0.8, think = 2, delay = 0.35, seed = 1, sloppy = false } = {}) {
  const r = rng(seed);
  let plan = null, lastStep = null, sent = {};
  const at = (t0, x) => t0 + think + delay + x;
  return (lv, t) => {
    const f = { t: t * 1000, lean: 0, side: 'center', armsUp: 0, crouch: 0, crouching: false, cross: false, pump: 0, events: [] };
    if (lv.phase !== 'answer') { lastStep = null; return f; }
    const s = lv.step;
    if (s !== lastStep) { lastStep = s; sent = {}; const knows = r() < skill; plan = { t0: t, pick: knows ? s.correct : wrong(s, r), knows }; }
    const n = s.options?.length;
    if (lv.constructor.name === 'Run') {
      if (t > at(plan.t0, 0)) f.side = n === 3 ? ['left', 'center', 'right'][plan.pick] : plan.pick === 0 ? 'left' : 'right';
      if (sloppy && (t * 3) % 2 < 0.2) f.side = 'center';
    } else if (lv.constructor.name === 'TF') {
      if (t > at(plan.t0, 0)) { if (plan.pick === true) f.armsUp = 1; else f.cross = true; }
    } else if (lv.constructor.name === 'Buzz') {
      if (lv.stage === 'fuse' && t > at(plan.t0, 0) && !sent.buzz) { sent.buzz = t; f.events.push({ type: 'raise', side: 'both' }); }
      if (lv.stage === 'choose') {
        const want = plan.pick;
        if (lv.cursor !== want && (!sent.lean || t - sent.lean > 0.6)) { sent.lean = t; f.events.push({ type: 'lean', side: want < lv.cursor ? 'left' : 'right' }); }
        else if (lv.cursor === want && t - sent.buzz > 1.2 && !sent.ok) { sent.ok = true; f.events.push({ type: 'raise', side: 'right' }); }
      }
    }
    return f;
  };
}
const wrong = (s, r) => (s.kind === 'tf' ? !s.correct : (s.correct + 1 + Math.floor(r() * (s.options.length - 1))) % s.options.length);

function playSession({ bankIndex = 0, playlist, diff = 'normal', skill, seed = 1, opts = {}, bot } = {}) {
  const bank = validateBank(samples[bankIndex]).bank;
  const S = new QuizSession({ bank, playlist, diff, seed, opts });
  const kid = bot || child({ skill, seed });
  const dt = 1 / 30;
  let t = 0, guard = 0;
  const events = [];
  while (!S.done && guard++ < 30 * 600) {
    events.push(...S.update(dt, S.level ? kid(S.level, t) : { t: t * 1000, side: 'center', events: [] }));
    t += dt;
  }
  return { S, t, events, sum: S.summary() };
}

const P1 = [{ level: 'run', count: 4 }, { level: 'tf', count: 4 }, { level: 'buzz', count: 4 }];

test('a child who knows the answers gets them all right in every level and difficulty, in a few minutes', () => {
  for (const diff of ['easy', 'normal', 'hard']) for (let b = 0; b < samples.length; b++) {
    const { sum, t } = playSession({ bankIndex: b, playlist: P1, diff, skill: 1, seed: b + 1 });
    assert.equal(sum.total, 12, `${diff} bank ${b}`);
    assert.equal(sum.correct, 12, `${diff} bank ${b}: ` + JSON.stringify(sum.log.filter((x) => !x.correct)));
    assert.equal(sum.stars, 3);
    assert.ok(t < 6 * 60, `${diff}: ${t.toFixed(0)} s`);
  }
});

test('accuracy follows the child\'s knowledge; a child who knows nothing still finishes with 1 star', () => {
  const half = [1, 2, 3, 4, 5].map((seed) => playSession({ playlist: P1, skill: 0.5, seed }).sum.accuracy);
  const mean = half.reduce((a, b) => a + b) / half.length;
  assert.ok(mean > 0.45 && mean < 0.85, String(mean)); // half known + lucky guesses on the rest
  const none = playSession({ playlist: P1, skill: 0, seed: 9 }).sum;
  assert.equal(none.total, 12); assert.equal(none.correct, 0); assert.equal(none.stars, 1);
});

test('an idle player (nothing detected) gets no answers right and the game still ends', () => {
  const idle = (lv, t) => ({ t: t * 1000, lean: 0, side: 'center', armsUp: 0, cross: false, events: [] });
  const { sum, t } = playSession({ playlist: P1, bot: idle });
  assert.equal(sum.total, 12);
  // run with three doors: standing straight is the middle door, so a few may be right by chance
  assert.ok(sum.correct <= 3, String(sum.correct));
  assert.ok(t < 8 * 60);
});

test('run: the lane at the doors is the answer even with a slow camera; steady lanes dash', () => {
  for (const delay of [0.1, 0.35, 0.6]) {
    const { sum } = playSession({ playlist: [{ level: 'run', count: 6 }], skill: 1, bot: child({ skill: 1, delay, think: 2.5 }) });
    assert.equal(sum.correct, 6, 'delay ' + delay);
  }
  const lv = LEVELS.run.create({ steps: LEVELS.run.prepare(compile(validateBank({ questions: [{ q: 'x', options: ['a', 'b'], answer: 'A' }] }).bank.questions[0], rng(1)), rng(1)), diff: 'normal' });
  let t = 0, dashT = null;
  while (!lv.decision && t < 20) {
    lv.update(1 / 30, { side: lv.step && lv.step.options[0].text === 'a' ? 'left' : 'right', events: [] });
    if (lv.dash && dashT === null) dashT = t;
    t += 1 / 30;
  }
  assert.ok(dashT !== null && lv.decision.correct && lv.z >= DOOR_Z);
  assert.ok(t < lv.window + 3.2, 'dashing reaches the doors before the window ends');
});

test('○×: a pose must be held 0.5 s; brief flickers never lock; simple mode uses leaning', () => {
  const steps = LEVELS.tf.prepare(compile(validateBank({ questions: [{ type: 'tf', q: '天空是藍的', answer: '○' }] }).bank.questions[0]), rng(1));
  const lv = LEVELS.tf.create({ steps, diff: 'normal', opts: { introTime: 0 } });
  let t = 0;
  // arms flicker up for 0.3 s every second: never long enough
  while (t < 5) { lv.update(1 / 30, { t: t * 1000, armsUp: (t % 1) < 0.3 ? 1 : 0, cross: false, side: 'center', events: [] }); t += 1 / 30; }
  assert.equal(lv.locked, null);
  while (!lv.decision) { lv.update(1 / 30, { t: t * 1000, armsUp: 1, cross: false, side: 'center', events: [] }); t += 1 / 30; }
  assert.equal(lv.decision.correct, true);
  assert.ok(lv.results[0].bonus > 0);
  const simple = LEVELS.tf.create({ steps, opts: { introTime: 0, simpleTF: true } });
  for (let i = 0; i < 90 && !simple.decision; i++) simple.update(1 / 30, { side: 'right', armsUp: 0, events: [] });
  assert.equal(simple.decision.choice, false);
});

test('buzz: earlier buzz scores more; the fuse running out answers nothing; timeout submits the highlight', () => {
  const steps = () => LEVELS.buzz.prepare(compile(validateBank({ questions: [{ q: 'x', options: ['a', 'b', 'c'], answer: 'b', shuffle: false }] }).bank.questions[0]), rng(1));
  const pts = [];
  for (const buzzAt of [1, 4, 8]) {
    const sc = new Scorer();
    const lv = LEVELS.buzz.create({ steps: steps(), opts: { introTime: 0 } });
    let t = 0;
    while (!lv.decision) {
      const ev = [];
      if (lv.stage === 'fuse' && t >= buzzAt) ev.push({ type: 'raise', side: 'both' });
      if (lv.stage === 'choose' && lv.chooseT > 0.5) ev.push({ type: 'raise', side: 'left' });
      for (const e of lv.update(1 / 30, { events: ev })) if (e.type === 'answer') pts.push(sc.answer(e).points);
      t += 1 / 30;
    }
  }
  assert.ok(pts[0] > pts[1] && pts[1] > pts[2] && pts[2] >= 100, pts.join());
  const late = LEVELS.buzz.create({ steps: steps(), opts: { introTime: 0 } });
  while (!late.decision) late.update(1 / 30, { events: [] });
  assert.equal(late.decision.choice, null);
  const slow = LEVELS.buzz.create({ steps: steps(), opts: { introTime: 0 } });
  slow.update(1 / 30, { events: [] }); slow.update(1 / 30, { events: [{ type: 'raise', side: 'both' }] });
  while (!slow.decision) slow.update(1 / 30, { events: [] });
  assert.equal(slow.decision.choice, 1); // the middle option is highlighted first
});

// ── the real input layer ────────────────────────────────────────────────────
// the simulated puppet (what the keyboard drives) through the real recognizer
function feed(script, { ms = 3000, seated = false } = {}) {
  const pup = new Puppet({ seed: 3, jitter: 0.002 });
  const state = { cross: false, pump: false };
  patchPuppet(pup, () => state);
  const rec = new Recognizer({ emit: () => {} });
  const out = [];
  for (let t = 0; t <= ms; t += 33) {
    for (const [at, k, v] of script) if (Math.abs(at - t) < 17) (k in state ? (state[k] = v) : pup.set(k, v));
    rec.feed(pup.step(t), t);
    out.push({ t, cross: isCross(rec.state.hands), armsUp: rec.state.armsUp, side: rec.state.leanSide });
  }
  return out;
}

test('arms crossed (keyboard X) is seen as ×; resting, raising and leaning are not', () => {
  const crossed = feed([[1200, 'cross', true], [2200, 'cross', false]]);
  const hold = new Hold(500);
  assert.ok(crossed.some((f) => hold.update(f.t, f.cross)), 'held cross detected');
  assert.ok(crossed.filter((f) => f.t < 1150 || f.t > 2600).every((f) => !f.cross), 'rest is not a cross');
  const other = feed([[1000, 'raiseL', true], [1000, 'raiseR', true], [1800, 'raiseL', false], [1800, 'raiseR', false], [2200, 'leanL', true], [2900, 'leanL', false]]);
  assert.ok(other.every((f) => !f.cross));
  assert.ok(other.some((f) => f.armsUp === 1) && other.some((f) => f.side === 'left'));
});
