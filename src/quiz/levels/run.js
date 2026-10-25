// 左右岔路（二選一／三選一奔跑）: the runner jogs toward two or three doors with the answers on them;
// leaning left / right (standing straight = the middle door) picks the lane. Whatever lane the runner
// is in when it reaches the doors is the answer, read over the last 0.5 s, so camera delay does not
// matter. Keeping a side lane steady for 1.5 s makes the runner dash (less waiting for fast readers).
// Right door: burst through the paper. Wrong door: slide into the bubble pool (soft, funny, no shame).
import { StepLevel, readTime, PREFER, prepareSteps } from './common.js';

export const DOOR_Z = 30;          // metres from the start line to the doors
const WINDOW = 7;                   // seconds to the doors at normal difficulty (plus reading time)
export const laneX = (n) => (n === 3 ? [-2, 0, 2] : [-1.4, 1.4]);

class Run extends StepLevel {
  startStep(step) {
    const n = step.options.length;
    this.lanes = laneX(n);
    this.window = WINDOW * this.diff.time + readTime(step);
    this.z = 0; this.x = 0; this.lane = n === 3 ? 1 : null;
    this.hist = []; this.steady = 0; this.dash = false;
  }
  laneFor(side) {
    const n = this.lanes.length;
    if (n === 3) return side === 'left' ? 0 : side === 'right' ? 2 : 1;
    return side === 'left' ? 0 : side === 'right' ? 1 : this.lane; // two lanes: straight keeps the lane
  }
  answerUpdate(dt, inp, events) {
    const lane = this.laneFor(inp.side);
    if (lane !== this.lane) { this.lane = lane; this.steady = 0; if (lane !== null) events.push({ type: 'sfx', name: 'step' }); }
    else this.steady += dt;
    this.hist.push({ t: this.t, lane: this.lane });
    while (this.hist.length && this.t - this.hist[0].t > 0.5) this.hist.shift();
    // dash once the player has clearly chosen (a side lane held steady), after half the reading time
    if (!this.dash && this.lane !== null && inp.side !== 'center' && this.steady > 1.5 && this.t > readTime(this.step) * 0.5) { this.dash = true; events.push({ type: 'sfx', name: 'whoosh' }); events.push({ type: 'say', text: '衝刺！' }); }
    const remaining = Math.max(this.window - this.t, 0.001);
    const v = this.dash ? Math.max((DOOR_Z - this.z) / remaining, 9) : (DOOR_Z - this.z) / remaining;
    this.z = Math.min(this.z + v * dt, DOOR_Z);
    const tx = this.lane === null ? 0 : this.lanes[this.lane];
    this.x += (tx - this.x) * (1 - Math.exp(-dt * 5));
    if (this.z >= DOOR_Z) {
      // the lane held most of the last half second
      const count = {};
      for (const h of this.hist) if (h.lane !== null) count[h.lane] = (count[h.lane] || 0) + 1;
      const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
      return { choice: best ? Number(best[0]) : null, bonus: this.dash ? 0.3 : 0 };
    }
    return null;
  }
  revealUpdate(dt) {
    this.z = Math.min(this.z + dt * (this.decision.correct ? 6 : 2), DOOR_Z + 6);
  }
}

export const run = {
  id: 'run', title: '左右岔路', icon: '🏃',
  rule: '身體往<b>左</b>或往<b>右</b>傾，跑向答案的門；三個門時<b>站直</b>就是中間。跑到門口時站在哪一道，就是你的答案。答對衝破紙門，答錯會滑進<b>泡泡池</b>。',
  howto: [
    { move: 'lean', title: '身體傾斜＝選門', text: '往左傾跑左邊的門、往右傾跑右邊；站直走中間', seated: '坐著：上半身往左右歪', skip: '' },
  ],
  maxOptions: 3,
  prefer: PREFER.choiceLike,
  prepare: (steps, r) => prepareSteps(steps, { max: 3 }, r),
  create: (o) => new Run(o),
};
