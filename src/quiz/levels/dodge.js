// 閃避障礙搶分: the runner jogs on; while the question shows, two obstacles come — a low hurdle (hop
// over it), a high bar (crouch under it) or a swinging cushion (lean away from it). Each obstacle you
// dodge is +20; bumping one only makes the figure stumble. At the end, two answer gates: lean left or
// right like 左右岔路.
// Timing is generous: an orange warning comes 1.8 s early and the move counts anywhere in about a
// one-second window around the obstacle (hop: 1.1 s before to 0.35 s after), so camera delay is fine.
// Seated (or no jumping): the hurdle becomes a hoop (raise both hands) and the bar a cushion (lean).
import { StepLevel, readTime, PREFER, prepareSteps, Majority } from './common.js';

const WINDOW = 10;
export const DODGE_POINTS = 20;
export const OBSTACLES = {
  hurdle: { name: '低欄：小跳一下', icon: '🦘', from: -1.1, to: 0.35 },
  bar: { name: '橫桿：蹲低', icon: '⬇️', from: -0.7, to: 0.3 },
  swing: { name: '軟墊：往另一邊歪', icon: '↔️', from: -0.6, to: 0.3 },
  hoop: { name: '圓環：雙手舉高', icon: '🙌', from: -0.9, to: 0.35 },
};

class Dodge extends StepLevel {
  startStep(step) {
    this.window = WINDOW * this.diff.time + readTime(step);
    const kinds = this.opts.seated ? ['hoop', 'swing'] : ['hurdle', 'bar', 'swing'];
    this.obstacles = [0.32, 0.62].map((f) => ({
      kind: kinds[Math.floor(this.rng() * kinds.length)], at: this.window * f,
      side: this.rng() < 0.5 ? 'left' : 'right', // which side a cushion swings in from
      done: false, ok: false,
    }));
    this.lane = null; this.lanes = new Majority(500); this.stumble = 0;
  }
  answerUpdate(dt, inp, events) {
    this.stumble = Math.max(this.stumble - dt, 0);
    for (const o of this.obstacles) {
      if (o.done) continue;
      const def = OBSTACLES[o.kind], rel = this.t - o.at;
      if (rel < def.from) continue;
      let hit = false;
      if (o.kind === 'hurdle') hit = inp.events.some((e) => e.type === 'jump');
      else if (o.kind === 'bar') hit = inp.crouching || inp.crouch > 0.6;
      else if (o.kind === 'hoop') hit = inp.armsUp >= 1;
      else if (o.kind === 'swing') hit = inp.side === (o.side === 'left' ? 'right' : 'left');
      if (hit) { o.done = o.ok = true; events.push({ type: 'bonus', points: DODGE_POINTS, text: `閃過了 +${DODGE_POINTS}` }, { type: 'sfx', name: 'whoosh' }); }
      else if (rel > def.to) { o.done = true; this.stumble = 0.8; events.push({ type: 'sfx', name: 'bump' }, { type: 'say', text: '哎唷！撞到了，沒關係繼續跑！' }); }
    }
    if (inp.side === 'left') this.lane = 0; else if (inp.side === 'right') this.lane = 1;
    this.lanes.push(this.t * 1000, inp.side === 'left' ? 0 : inp.side === 'right' ? 1 : this.lane);
    if (this.t >= this.window) return { choice: this.lanes.best(), bonus: 0 };
    return null;
  }
  // the obstacle the player should get ready for (for the warning on screen)
  get coming() { return this.obstacles?.find((o) => !o.done && this.t > o.at - 1.8) || null; }
}

export const dodge = {
  id: 'dodge', title: '閃避障礙搶分', icon: '🚧',
  rule: '一邊看題目、一邊閃障礙：<b>低欄小跳</b>、<b>橫桿蹲低</b>、<b>軟墊往另一邊歪</b>，閃過一個 +20 分。最後兩道答案門，<b>往左或往右傾</b>選答案。',
  howto: [
    { move: 'jump', title: '低欄＝小跳一下', text: '雙腳離地一點點就夠，不用跳高', seated: '坐著玩：改成圓環，雙手舉高', key: '空白鍵' },
    { move: 'crouch', title: '橫桿＝蹲低', text: '膝蓋彎一下', seated: '坐著玩：改成軟墊', key: '↓（按住）' },
    { move: 'lean', title: '軟墊、答案門＝傾斜', text: '軟墊從哪邊來就往另一邊歪；最後往左右傾選答案', seated: '坐著一樣做', key: '← →（按住）' },
  ],
  maxOptions: 2,
  prefer: PREFER.choiceLike,
  prepare: (steps, r) => prepareSteps(steps, { max: 2 }, r),
  create: (o) => new Dodge(o),
};
