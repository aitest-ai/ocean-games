// 倒數搶答: the question and its options show while a fuse burns down. Raise BOTH hands to buzz in —
// the sooner, the more points (the bonus falls smoothly with the fuse, so camera delay costs only a
// few points). Then choose: each lean moves the highlight one option left / right, raising ONE hand
// confirms. If the choosing time runs out, the highlighted option is the answer.
// Fuse burnt out without a buzz: the answer is shown, no points (and no other penalty).
import { StepLevel, readTime, PREFER, prepareSteps } from './common.js';

const FUSE = 9, CHOOSE = 8;

class Buzz extends StepLevel {
  startStep(step) {
    this.fuse = FUSE * this.diff.time + readTime(step);
    this.window = this.fuse;
    this.stage = 'fuse'; this.cursor = 0; this.buzzAt = null; this.chooseT = 0; this.moved = false;
  }
  get fuseLeft() { return this.stage === 'fuse' ? Math.max(1 - this.t / this.fuse, 0) : this.buzzAt === null ? 0 : Math.max(1 - this.buzzAt / this.fuse, 0); }
  get chooseLeft() { return Math.max(this.chooseWindow - this.chooseT, 0); }
  answerUpdate(dt, inp, events) {
    const n = this.step.options.length;
    if (this.stage === 'fuse') {
      const buzz = inp.events.some((e) => e.type === 'raise' && (e.side === 'both' || this.opts.simpleBuzz));
      if (buzz) {
        this.stage = 'choose'; this.buzzAt = this.t; this.chooseT = 0;
        this.chooseWindow = CHOOSE * this.diff.time + (this.opts.simpleBuzz ? 2 : 0);
        this.cursor = Math.floor((n - 1) / 2);
        events.push({ type: 'sfx', name: 'buzz' }, { type: 'say', text: '搶到了！' });
        return null;
      }
      if (this.t >= this.fuse) { events.push({ type: 'say', text: '時間到！' }); return { choice: null, bonus: 0 }; }
      return null;
    }
    this.chooseT += dt;
    for (const e of inp.events) {
      if (e.type === 'lean' && e.side !== 'center') {
        const c = Math.min(Math.max(this.cursor + (e.side === 'left' ? -1 : 1), 0), n - 1);
        if (c !== this.cursor) { this.cursor = c; this.moved = true; events.push({ type: 'sfx', name: 'step' }); }
      }
      // confirming takes one hand (the both-hands buzz must have come down first; the recognizer re-arms)
      if (e.type === 'raise' && e.side !== 'both' && this.chooseT > 0.3) return { choice: this.cursor, bonus: this.fuseLeft };
    }
    if (this.chooseT >= this.chooseWindow) return { choice: this.cursor, bonus: this.fuseLeft };
    return null;
  }
}

export const buzz = {
  id: 'buzz', title: '倒數搶答', icon: '🔔',
  rule: '導火線燒完之前，<b>雙手舉高</b>搶答！越快搶到分數越高。搶到後<b>身體傾一下</b>移動選框，<b>舉一隻手</b>確認。',
  howto: [
    { move: 'raise-both', title: '雙手舉高＝搶答', text: '知道答案就趕快雙手舉高', seated: '坐著一樣做', skip: '可以改成「舉一隻手就搶答」' },
    { move: 'lean', title: '傾一下＝移動選框', text: '往左傾一次，選框往左一格；回正再傾，再移一格', seated: '坐著：上半身左右歪' },
    { move: 'raise-one', title: '舉一隻手＝確認', text: '選框停在答案上，舉起一隻手', seated: '坐著一樣做' },
  ],
  maxOptions: 4,
  prefer: PREFER.choiceLike,
  prepare: (steps, r) => prepareSteps(steps, { max: 4 }, r),
  create: (o) => new Buzz(o),
};
