// 原地衝刺: a race against 「閃電喀喀」 (an original rival robot). Swing your arms up and down like
// running (standing or seated — the feet do not need to move); the faster the arms, the faster the
// figure. Questions pop up during the race: lean left / right and hold 0.6 s to answer. A right answer
// gives a 3-second turbo. Beat the rival by the end of the level for +150.
// Speed comes from arm swinging averaged over ~0.6 s (src/quiz/input.js PumpMeter), so camera delay
// and frame rate do not matter.
import { StepLevel, readTime, PREFER, prepareSteps } from './common.js';
import { Hold } from '../input.js';

const WINDOW = 7;
export const RIVAL = { easy: 3.0, normal: 3.6, hard: 4.1 }; // metres per second
export const WIN_BONUS = 150;
export const speedOf = (pump, turbo) => 1.2 + 4.8 * pump + (turbo > 0 ? 2.5 : 0);

class Sprint extends StepLevel {
  constructor(o) {
    super(o);
    this.dist = 0; this.rival = 0; this.turbo = 0; this.v = 0;
    this.rivalV = RIVAL[this.diffKey] ?? RIVAL.normal;
  }
  startStep(step) {
    this.window = WINDOW * this.diff.time + readTime(step);
    this.holdL = new Hold(600); this.holdR = new Hold(600);
  }
  update(dt, inp) {
    // the race runs all the time except during the level's title card
    if (this.phase !== 'intro' && this.phase !== 'done') {
      this.turbo = Math.max(this.turbo - dt, 0);
      const target = speedOf(inp.pump || 0, this.turbo);
      this.v += (target - this.v) * (1 - Math.exp(-dt * 2));
      this.dist += this.v * dt;
      this.rival += this.rivalV * dt;
    }
    const events = super.update(dt, inp);
    for (const e of [...events]) {
      if (e.type === 'answer' && e.correct) { this.turbo = 3; events.push({ type: 'say', text: '加速！' }, { type: 'sfx', name: 'whoosh' }); }
      if (e.type === 'levelDone') {
        this.won = this.dist > this.rival;
        if (this.won) events.unshift({ type: 'bonus', points: WIN_BONUS, text: `贏過閃電喀喀！+${WIN_BONUS}` });
        else events.unshift({ type: 'say', text: '閃電喀喀先到了！下次再拚！' });
      }
    }
    return events;
  }
  answerUpdate(dt, inp) {
    const ms = this.t * 1000;
    const l = this.holdL.update(ms, inp.side === 'left'), r = this.holdR.update(ms, inp.side === 'right');
    if (l || r) return { choice: l ? 0 : 1, bonus: Math.max(1 - this.t / this.window, 0) * 0.3 };
    if (this.t >= this.window) return { choice: inp.side === 'left' ? 0 : inp.side === 'right' ? 1 : null, bonus: 0 };
    return null;
  }
}

export const sprint = {
  id: 'sprint', title: '原地衝刺', icon: '⚡',
  rule: '和機器人「閃電喀喀」賽跑！<b>雙手前後擺動</b>像在跑步，擺越快跑越快（腳不用動，坐著也可以）。題目出現時<b>往左或往右傾</b>保持一下作答，答對會<b>加速 3 秒</b>。',
  howto: [
    { move: 'pump', title: '擺手臂＝跑步', text: '兩手一上一下擺，越快跑越快；腳不用動', seated: '坐著一樣擺手', key: 'R（按住）' },
    { move: 'lean', title: '傾斜保持＝作答', text: '往左傾 A、往右傾 B，保持一下就鎖定', seated: '坐著：上半身歪', key: '← →（按住）' },
  ],
  maxOptions: 2,
  prefer: PREFER.choiceLike,
  prepare: (steps, r) => prepareSteps(steps, { max: 2 }, r),
  create: (o) => new Sprint({ ...o, opts: { ...o.opts, revealTime: 1.8 } }),
};
