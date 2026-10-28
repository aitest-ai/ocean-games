// ○× 大舞台（是非題）: a statement appears; answer with the whole body —
//   ○ 對: both arms up over the head (a big circle)      × 錯: arms crossed in front of the chest
// Hold the pose 0.5 s to lock the answer (a ring fills up; it cannot change after locking), so a
// passing arm or camera delay never answers by accident. Locking early earns a small speed bonus.
// "簡單作答" (for anyone who cannot lift or cross the arms): lean left = ○, lean right = ×.
// Choice questions are asked as "答案是「…」嗎？", so every bank works here.
import { StepLevel, readTime, PREFER, prepareSteps } from './common.js';
import { Hold } from '../input.js';

const WINDOW = 8;
export const LOCK_MS = 500;

class TF extends StepLevel {
  startStep(step) {
    this.window = WINDOW * this.diff.time + readTime(step);
    this.holdO = new Hold(LOCK_MS); this.holdX = new Hold(LOCK_MS);
    this.locked = null; this.lockAt = 0; this.pose = null;
  }
  poseOf(inp) {
    if (this.opts.simpleTF) return inp.side === 'left' ? true : inp.side === 'right' ? false : null;
    if (inp.armsUp >= 1) return true;
    if (inp.cross) return false;
    return null;
  }
  answerUpdate(dt, inp, events) {
    const ms = this.t * 1000;
    const p = this.poseOf(inp);
    this.pose = p;
    if (this.locked === null) {
      const o = this.holdO.update(ms, p === true), x = this.holdX.update(ms, p === false);
      if (o || x) {
        this.locked = o; this.lockAt = this.t;
        events.push({ type: 'sfx', name: 'lock' });
      }
    }
    // show the lock for a moment, then reveal
    if (this.locked !== null && this.t - this.lockAt > 0.7) return { choice: this.locked, bonus: Math.max(1 - this.lockAt / this.window, 0) * 0.5 };
    if (this.t >= this.window) return { choice: this.locked ?? p, bonus: 0 };
    return null;
  }
  progress() { return Math.max(this.holdO?.progress(this.t * 1000) || 0, this.holdX?.progress(this.t * 1000) || 0); }
}

export const tf = {
  id: 'tf', title: '○× 大舞台', icon: '⭕',
  rule: '看到一句話，覺得<b>對</b>就雙手舉高在頭上圍成<b>○</b>，覺得<b>錯</b>就雙臂在胸前交叉成<b>×</b>。姿勢保持一下、圈圈填滿就鎖定答案。',
  howto: [
    { move: 'raise-both', title: '雙手舉高＝○ 對', text: '兩隻手舉到頭上，像一個大圓圈', seated: '坐著一樣做', skip: '可以改成「往左傾＝○」' },
    { move: 'cross', title: '雙臂交叉＝× 錯', text: '兩隻手在胸前交叉成 ×', seated: '坐著一樣做', skip: '可以改成「往右傾＝×」' },
  ],
  maxOptions: 2,
  prefer: PREFER.tfLike,
  prepare: (steps, r) => prepareSteps(steps, { as: 'tf' }, r),
  create: (o) => new TF(o),
};
