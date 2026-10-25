// Shared parts of the level rules: timing, difficulty, the step loop, and how a question is
// prepared for a level. Level rules are pure (no DOM, no three.js): update(dt, input) → events.
import { adapt, toStatement, itemLabel } from '../bank.js';

export const DIFFS = {
  easy: { label: '簡單', note: '作答時間長，答錯沒有任何懲罰。適合第一次玩、低年級。', time: 1.3 },
  normal: { label: '普通', note: '一般的作答時間。', time: 1 },
  hard: { label: '挑戰', note: '時間比較短，速度加分比較多。', time: 0.8 },
};

// seconds to read a step: about 6 Chinese characters a second (a slow reader in 3rd grade), within 1.5–6 s
export function readTime(step) {
  const chars = (step.prompt || '').length + (step.sub || '').length + (step.options || []).reduce((n, o) => n + itemLabel(o).length, 0) * 0.5 + (step.image ? 6 : 0);
  return Math.min(Math.max(1 + chars / 6, 1.5), 6);
}

// tf steps as two options (for levels that choose by position)
export function tfAsChoice(step) {
  if (step.kind !== 'tf') return step;
  return { ...step, kind: 'choice', options: [{ text: '○ 對', image: '' }, { text: '× 錯', image: '' }], correct: step.correct ? 0 : 1, tfDoors: true };
}

// prefer(question) → how well a question type suits a level (0 = never)
export const PREFER = {
  choiceLike: (q) => ({ choice: 3, image: 3, number: 3, order: 2, match: 2, tf: 1 }[q.type] || 0),
  tfLike: (q) => ({ tf: 4, choice: 2, image: 2, number: 2, order: 1, match: 1 }[q.type] || 0),
};

// prepare compiled steps for a level: true/false or choice with at most `max` options
export function prepareSteps(steps, { max = 4, as = 'choice' } = {}, r = Math.random) {
  return steps.map((s) => (as === 'tf' ? toStatement(s, r) : adapt(tfAsChoice(s), max, r)));
}

// The step loop every level shares: 'intro' → for each step 'answer' → 'reveal' → … → done.
// A level supplies startStep(), answerUpdate(dt, inp) (returns a decision or null) and its window.
export class StepLevel {
  constructor({ steps, diff = 'normal', opts = {}, rng = Math.random }) {
    this.steps = steps; this.diffKey = diff; this.diff = DIFFS[diff] || DIFFS.normal; this.opts = opts; this.rng = rng;
    this.i = -1; this.phase = 'intro'; this.t = 0; this.done = false;
    this.results = [];
    this.introTime = opts.introTime ?? 3.2;
  }
  get step() { return this.steps[this.i] || null; }
  get timeLeft() { return this.phase === 'answer' ? Math.max(this.window - this.t, 0) : 0; }
  next(events) {
    this.i++;
    if (this.i >= this.steps.length) { this.done = true; this.phase = 'done'; events.push({ type: 'levelDone' }); return; }
    this.phase = 'answer'; this.t = 0;
    this.decision = null;
    this.startStep(this.step, events);
    events.push({ type: 'step', step: this.step, i: this.i });
  }
  // decision: { choice (index | true | false | null), bonus 0..1 }
  decide(d, events) {
    const s = this.step;
    const correct = d.choice !== null && d.choice !== undefined && d.choice === s.correct;
    this.decision = { ...d, correct };
    this.results.push({ step: s, choice: d.choice, correct, bonus: correct ? d.bonus || 0 : 0 });
    this.phase = 'reveal'; this.t = 0;
    this.revealTime = (this.opts.revealTime ?? 2.6) + (!correct && s.explain ? 1.6 : 0);
    events.push({ type: 'answer', correct, choice: d.choice, bonus: correct ? d.bonus || 0 : 0, step: s, none: d.choice === null || d.choice === undefined });
  }
  update(dt, inp) {
    const events = [];
    this.t += dt;
    if (this.phase === 'intro') { if (this.t >= this.introTime) this.next(events); }
    else if (this.phase === 'answer') {
      const d = this.answerUpdate(dt, inp, events);
      if (d) this.decide(d, events);
    } else if (this.phase === 'reveal') {
      this.revealUpdate?.(dt, inp, events);
      if (this.t >= this.revealTime) this.next(events);
    }
    return events;
  }
}

// what the player did most over the last `ms` milliseconds (null values are ignored)
export class Majority {
  constructor(ms = 500) { this.ms = ms; this.h = []; }
  push(t, v) { this.h.push({ t, v }); while (this.h.length && t - this.h[0].t > this.ms) this.h.shift(); }
  best() {
    const c = new Map();
    for (const { v } of this.h) if (v !== null && v !== undefined) c.set(v, (c.get(v) || 0) + 1);
    let b = null, n = 0;
    for (const [v, k] of c) if (k > n) { b = v; n = k; }
    return b;
  }
  clear() { this.h.length = 0; }
}

// choose with a cursor: each lean moves the highlight one step, raising ONE hand confirms
// (shared by 倒數搶答 and the Boss level)
export function cursorStep(lv, inp, events, n) {
  for (const e of inp.events) {
    if (e.type === 'lean' && e.side !== 'center') {
      const c = Math.min(Math.max(lv.cursor + (e.side === 'left' ? -1 : 1), 0), n - 1);
      if (c !== lv.cursor) { lv.cursor = c; lv.moved = true; events.push({ type: 'sfx', name: 'step' }); }
    }
    if (e.type === 'raise' && e.side !== 'both' && lv.chooseT > 0.3) return true;
  }
  return false;
}
