// One play-through: a playlist of levels filled with questions drawn from a bank, and the score.
// Pure logic (runs in node tests); the page (game.js) feeds it input frames and draws its state.
import { compile, rng as makeRng, shuffle } from './bank.js';
import { LEVELS } from './levels/index.js';
import { Revive, REVIVE_BONUS } from './levels/revive.js';

// Draws questions without repeats until the bank is used up (then starts over, reshuffled).
// A level takes questions by preference (a true/false level takes true/false questions first) and
// counts steps, so an ordering question with 3 steps fills 3 places.
export class Deck {
  constructor(questions, { rng = Math.random, tags = [], difficulties = [1, 2, 3] } = {}) {
    this.rng = rng;
    let pool = questions.filter((q) => difficulties.includes(q.difficulty) && (!tags.length || q.tags.some((t) => tags.includes(t))));
    this.filtered = pool.length > 0;
    if (!pool.length) pool = questions; // nothing matches the filter: use the whole bank
    this.all = pool;
    this.left = shuffle(pool, rng);
    this.rounds = 1;
  }
  take(count, def) {
    const steps = [];
    let guard = 0;
    while (steps.length < count && guard++ < 200) {
      if (!this.left.length) { this.left = shuffle(this.all, this.rng); this.rounds++; }
      const room = count - steps.length;
      // best-suited question first; among equals the shuffled order; prefer ones that fit the room
      const score = (q) => def.prefer(q) * 10 - (compileCount(q) > room ? 5 : 0);
      let best = -1, bi = -1;
      this.left.forEach((q, i) => { const s = score(q); if (s > best) { best = s; bi = i; } });
      if (best <= 0) break;
      const [q] = this.left.splice(bi, 1);
      steps.push(...def.prepare(compile(q, this.rng), this.rng).slice(0, room));
    }
    return steps;
  }
}
const compileCount = (q) => (q.type === 'order' ? q.items.length - 1 : q.type === 'match' ? q.pairs.length - 1 : 1);

export const BASE_POINTS = 100;
export const HEARTS = 3;
// combo multiplier: 3 right in a row ×1.2, 5 ×1.5, 8 ×2
export const comboMult = (c) => (c >= 8 ? 2 : c >= 5 ? 1.5 : c >= 3 ? 1.2 : 1);

export class Scorer {
  constructor({ combo = true } = {}) {
    this.useCombo = combo;
    this.score = 0; this.correct = 0; this.total = 0; this.log = [];
    this.combo = 0; this.maxCombo = 0; this.hearts = HEARTS; this.bonusPoints = 0;
  }
  answer({ correct, bonus = 0, step, choice, level }) {
    this.total++;
    if (correct) { this.correct++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); }
    else { this.combo = 0; this.hearts = Math.max(this.hearts - 1, 0); }
    const mult = this.useCombo && correct ? comboMult(this.combo) : 1;
    const points = correct ? Math.round((BASE_POINTS + Math.round(bonus * 100)) * mult) : 0;
    this.score += points;
    this.log.push({ level, prompt: step.prompt, sub: step.sub || '', correct, points, answer: step.answerText, chose: choice, explain: step.explain || '' });
    return { points, combo: this.combo, mult, hearts: this.hearts };
  }
  bonus(n) { this.score += n; this.bonusPoints += n; }
  penalty(n) { const p = Math.min(n, this.score); this.score -= p; return p; }
  get accuracy() { return this.total ? this.correct / this.total : 0; }
  // never zero stars: finishing is worth something
  get stars() { const a = this.accuracy; return a >= 0.8 ? 3 : a >= 0.5 ? 2 : 1; }
}

// playlist: [{ level: 'run', count: 4 }, …]; opts: level options (seated, simpleTF, simpleBuzz…)
export class QuizSession {
  constructor({ bank, playlist, diff = 'normal', opts = {}, seed = 1, tags = [], difficulties }) {
    this.rng = makeRng(seed);
    this.bank = bank; this.diff = diff; this.opts = opts;
    this.deck = new Deck(bank.questions, { rng: this.rng, tags, difficulties });
    this.playlist = playlist.filter((p) => LEVELS[p.level] && p.count > 0);
    this.scorer = new Scorer({ combo: opts.combo !== false });
    this.revives = 0;
    this.li = -1; this.level = null; this.phase = 'start'; this.t = 0; this.done = false;
    this.levelScores = [];
  }
  get def() { return LEVELS[this.playlist[this.li]?.level]; }
  startLevel(events) {
    this.li++;
    if (this.li >= this.playlist.length) { this.phase = 'done'; this.done = true; events.push({ type: 'done' }); return; }
    const p = this.playlist[this.li];
    const def = LEVELS[p.level];
    const steps = this.deck.take(p.count, def);
    if (!steps.length) { this.levelScores.push({ level: p.level, score: 0, correct: 0, total: 0 }); return this.startLevel(events); }
    this.level = def.create({ steps, diff: p.diff || this.diff, opts: this.opts, rng: this.rng });
    this.levelStart = { score: this.scorer.score, correct: this.scorer.correct, total: this.scorer.total };
    this.phase = 'level';
    events.push({ type: 'level', def, index: this.li, count: this.playlist.length });
  }
  update(dt, inp) {
    const events = [];
    this.t += dt;
    if (this.phase === 'start') this.startLevel(events);
    else if (this.phase === 'level') {
      // hearts gone: once the answer has been shown, a short body task brings them back (no one is out)
      const L = this.level;
      if (this.reviveDue && L.phase === 'reveal' && L.t > 1.4) {
        this.reviveDue = false;
        const kinds = ['lean', 'raise', 'pump'];
        this.revive = new Revive({ kind: kinds[this.revives++ % kinds.length], diff: this.diff });
        this.phase = 'revive';
        events.push({ type: 'revive', task: this.revive });
        return events;
      }
      for (const e of L.update(dt, inp)) {
        if (e.type === 'answer') {
          Object.assign(e, this.scorer.answer({ ...e, level: this.def.id }));
          if (this.scorer.hearts === 0 && this.opts.revive !== false) this.reviveDue = true;
        }
        if (e.type === 'bonus') this.scorer.bonus(e.points);
        if (e.type === 'penalty') e.points = this.scorer.penalty(e.points);
        if (e.type === 'levelDone') {
          const s = this.levelStart;
          this.levelScores.push({ level: this.def.id, score: this.scorer.score - s.score, correct: this.scorer.correct - s.correct, total: this.scorer.total - s.total });
          this.phase = 'between'; this.t = 0;
          e.summary = this.levelScores[this.levelScores.length - 1];
        }
        events.push(e);
      }
    } else if (this.phase === 'revive') {
      events.push(...this.revive.update(dt, inp));
      if (this.revive.done) {
        const ok = this.revive.success;
        this.scorer.hearts = ok ? 3 : 2;
        if (ok) this.scorer.bonus(REVIVE_BONUS);
        events.push({ type: 'revived', success: ok, hearts: this.scorer.hearts, points: ok ? REVIVE_BONUS : 0 });
        this.phase = 'level';
      }
    } else if (this.phase === 'between') {
      if (this.t >= (this.opts.betweenTime ?? 2.8)) this.startLevel(events);
    }
    return events;
  }
  summary() {
    const S = this.scorer;
    return { score: S.score, correct: S.correct, total: S.total, accuracy: S.accuracy, stars: S.stars, maxCombo: S.maxCombo, revives: this.revives, levels: this.levelScores, log: S.log };
  }
}
