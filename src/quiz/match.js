// Group play in a classroom: one camera, one player at a time, the rest of the class watching the
// projector. A match is a list of TURNS; in each turn one player plays one level (QuizSession), then
// the next player steps up during a short hand-over screen. Pure logic (node tests).
//
//   teams  分組對戰   2–4 teams take turns (team 1, team 2, … then round 2); each team has its own
//                     score, combo and hearts. Everyone is celebrated at the end (not only the winner).
//   coop   全班合作   the whole class against one giant Boss: every right answer, whoever gives it,
//                     takes one bite of the Boss's health; the class shares the hearts.
//   relay  接力       players 1…N in order, each plays one level; the class adds up right answers and
//                     time, and tries to beat its own record (kept on this device).
//
// Players are numbers (棒次) or seat numbers only — never names.
import { Deck, QuizSession, HEARTS } from './session.js';
import { LEVELS } from './levels/index.js';
import { rng as makeRng } from './bank.js';

export const TEAM_COLORS = [
  { name: '紅隊', color: '#ff5a6e', icon: '🔴' }, { name: '藍隊', color: '#3fa7ff', icon: '🔵' },
  { name: '綠隊', color: '#3ccf7a', icon: '🟢' }, { name: '黃隊', color: '#ffd23f', icon: '🟡' },
];
export const MODES = {
  teams: { title: '分組對戰', icon: '🆚', desc: '2～4 隊輪流上場，每人玩一關，比總分' },
  coop: { title: '全班合作打大 Boss', icon: '🤝', desc: '每個人輪流答題，全班一起把大魔王的血條打光' },
  relay: { title: '接力', icon: '🏃‍♀️', desc: '一個接一個上場，全班一起挑戰「答對最多題」的紀錄' },
};

// levels: [{ level, count }] the teacher picked (used in turn, round after round)
// teams: number of teams (teams mode); players: how many players take a turn (coop / relay)
export class Match {
  constructor({ mode = 'teams', bank, levels, teams = 2, rounds = 2, players = 6, diff = 'normal', opts = {}, seed = 1, tags = [] }) {
    this.mode = mode; this.bank = bank; this.diff = diff; this.opts = opts;
    this.rng = makeRng(seed);
    // one deck for the whole match: nobody gets a question that was already asked
    this.deck = new Deck(bank.questions, { rng: this.rng, tags });
    const lv = levels.filter((l) => LEVELS[l.level] && l.count > 0);
    if (!lv.length) throw new Error('no levels');
    this.sides = mode === 'teams'
      ? TEAM_COLORS.slice(0, Math.min(Math.max(teams, 2), 4)).map((t) => ({ ...t, score: 0, correct: 0, total: 0, hearts: HEARTS, maxCombo: 0, revives: 0, falls: 0 }))
      : [{ name: mode === 'coop' ? '全班' : '接力隊', color: '#ffd23f', icon: '⭐', score: 0, correct: 0, total: 0, hearts: HEARTS, maxCombo: 0, revives: 0 }];
    this.turns = [];
    if (mode === 'teams') {
      for (let r = 0; r < rounds; r++) this.sides.forEach((side, s) => this.turns.push({ side: s, player: r + 1, level: lv[(r * this.sides.length + s) % lv.length] }));
    } else {
      for (let p = 0; p < players; p++) this.turns.push({ side: 0, player: p + 1, level: lv[p % lv.length] });
    }
    if (mode === 'coop') {
      const total = this.turns.reduce((n, t) => n + t.level.count, 0);
      this.bossMax = Math.max(1, Math.round(total * 0.6));
      this.bossHP = this.bossMax;
    }
    this.ti = -1; this.phase = 'handover'; this.t = 0; this.done = false; this.session = null;
    this.results = [];
    this.next();
  }
  get turn() { return this.turns[this.ti] || null; }
  get side() { return this.turn ? this.sides[this.turn.side] : null; }
  get nextTurn() { return this.turns[this.ti + 1] || null; }

  next() {
    this.ti++;
    if (this.ti >= this.turns.length) { this.done = true; this.phase = 'done'; return; }
    this.phase = 'handover'; this.t = 0; this.session = null;
  }
  // the hand-over screen ends when the next player is ready (both hands up / the teacher's key)
  begin() {
    if (this.phase !== 'handover') return;
    const T = this.turn, side = this.side;
    this.session = new QuizSession({ bank: this.bank, playlist: [{ level: T.level.level, count: T.level.count }], diff: this.diff, opts: { ...this.opts, teamRevive: this.mode !== 'relay' }, deck: this.deck, hearts: side.hearts });
    this.phase = 'play'; this.t = 0;
  }
  update(dt, inp) {
    this.t += dt;
    const events = [];
    if (this.phase === 'handover' && this.opts.autoBegin && this.t >= this.opts.autoBegin) this.begin();
    if (this.phase !== 'play') return events;
    for (const e of this.session.update(dt, inp)) {
      if (e.type === 'answer' && e.correct && this.mode === 'coop' && this.bossHP > 0) {
        this.bossHP--; events.push({ type: 'classHit', hp: this.bossHP });
        if (this.bossHP === 0) events.push({ type: 'classBossDown' });
      }
      events.push(e);
    }
    const side = this.side;
    side.hearts = this.session.scorer.hearts;
    if (this.session.done) {
      const s = this.session.summary();
      side.score += s.score; side.correct += s.correct; side.total += s.total;
      side.maxCombo = Math.max(side.maxCombo, s.maxCombo); side.revives += s.revives;
      const r = { ...this.turn, sideName: side.name, score: s.score, correct: s.correct, total: s.total, time: this.t, log: s.log };
      this.results.push(r);
      events.push({ type: 'turnDone', result: r });
      this.next();
      if (this.done) events.push({ type: 'matchDone' });
    }
    return events;
  }
  // a revive done by the whole team at their seats (the camera only sees the player, so the
  // teacher confirms it with a key)
  teamRevive() {
    const S = this.session;
    if (S?.phase === 'revive') { S.revive.count = S.revive.def.need; }
  }
  summary() {
    const sides = this.sides.map((s, i) => ({ ...s, i, accuracy: s.total ? s.correct / s.total : 0 }));
    const ranked = [...sides].sort((a, b) => b.score - a.score);
    // every team gets a prize: the best at something
    const awards = [];
    if (this.mode === 'teams') {
      const best = (k, title) => { const s = [...sides].sort((a, b) => b[k] - a[k])[0]; if (s && s[k] > 0) awards.push({ side: s.i, title }); };
      best('score', '🏆 總分冠軍'); best('accuracy', '🎯 答對率最高'); best('maxCombo', '🔥 最長連對'); best('revives', '❤️ 最會復活');
      for (const s of sides) if (!awards.some((a) => a.side === s.i)) awards.push({ side: s.i, title: '💪 最佳鬥志' });
    }
    const time = this.results.reduce((n, r) => n + r.time, 0);
    return { mode: this.mode, sides, ranked, awards, results: this.results, bossDown: this.mode === 'coop' ? this.bossHP === 0 : undefined, bossHP: this.bossHP, bossMax: this.bossMax, time, correct: sides.reduce((n, s) => n + s.correct, 0), total: sides.reduce((n, s) => n + s.total, 0) };
  }
}
