// Boss 題: the Boss 「咕嚕嚕」 (an original question-mark monster) shows up with the hardest questions
// of the bank. Choose like 倒數搶答 (lean to move the highlight, raise one hand to confirm) before the
// Boss finishes charging. Every right answer is a hit; the Boss falls after about 60 % of the questions
// are right (+300). A wrong answer: the Boss splashes you with bubbles (costs a heart, see the revive
// rules in session.js). If the questions run out first, the Boss runs away — no losing screen.
import { StepLevel, readTime, PREFER, prepareSteps, cursorStep } from './common.js';

const CHARGE = 11;
export const BOSS_BONUS = 300;

class Boss extends StepLevel {
  constructor(o) {
    super(o);
    this.maxHP = Math.max(1, Math.ceil(this.steps.length * 0.6));
    this.hp = this.maxHP;
  }
  startStep(step) {
    this.window = CHARGE * this.diff.time + readTime(step);
    this.cursor = Math.floor((step.options.length - 1) / 2); this.chooseT = 0; this.moved = false;
  }
  answerUpdate(dt, inp, events) {
    this.chooseT += dt;
    if (cursorStep(this, inp, events, this.step.options.length)) return { choice: this.cursor, bonus: Math.max(1 - this.t / this.window, 0) * 0.5 };
    if (this.t >= this.window) return { choice: this.moved ? this.cursor : null, bonus: 0 };
    return null;
  }
  update(dt, inp) {
    const events = super.update(dt, inp);
    for (const e of [...events]) {
      if (e.type === 'answer') {
        if (e.correct) { this.hp--; events.push({ type: 'hit', hp: this.hp }); }
        else events.push({ type: 'bossAttack' });
        if (this.hp <= 0 && !this.down) {
          this.down = true;
          events.push({ type: 'bonus', points: BOSS_BONUS, text: `打倒 Boss！+${BOSS_BONUS}` }, { type: 'say', text: '咕嚕嚕被打倒了！' });
          this.steps.length = this.i + 1; // the remaining questions are not needed
        }
      }
      if (e.type === 'levelDone' && !this.down) events.unshift({ type: 'say', text: '咕嚕嚕逃走了！下次再挑戰！' });
    }
    return events;
  }
}

export const boss = {
  id: 'boss', title: 'Boss 題', icon: '👾',
  rule: '大魔王「咕嚕嚕」帶著<b>最難的題目</b>出現了！Boss 蓄力完之前：<b>傾一下</b>移動選框、<b>舉一隻手</b>確認。答對就打中 Boss，大約答對六成就能打倒它！',
  howto: [
    { move: 'lean', title: '傾一下＝移動選框', text: '往左傾一次，選框往左一格', seated: '坐著：上半身歪', key: '← →' },
    { move: 'raise-one', title: '舉一隻手＝確認', text: '選好就舉手，攻擊 Boss！', seated: '坐著一樣做', key: 'Q／E' },
  ],
  maxOptions: 4,
  // the hardest questions first
  prefer: (q) => (PREFER.choiceLike(q) ? PREFER.choiceLike(q) + q.difficulty * 0.4 : 0),
  prepare: (steps, r) => prepareSteps(steps, { max: 4 }, r),
  create: (o) => new Boss(o),
};
