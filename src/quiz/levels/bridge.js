// 平衡過橋: the figure walks a narrow bridge over the bubble pool while gusts of wind push it. Keep
// the balance needle in the middle by leaning AGAINST the push, and on the way raise the LEFT hand
// for answer A or the RIGHT hand for answer B (first hand raised counts). The answer is revealed at
// the far end of the bridge. Falling (needle at the edge) drops you in the bubbles: 20 points off and
// the same question again from the start of the bridge.
//
// Balance is deliberately slow (the needle needs a few seconds to tip over), so a camera that is
// 0.3–0.6 s late still keeps up: it is about steady leaning, not quick reactions.
import { StepLevel, readTime, PREFER, prepareSteps } from './common.js';

const WALK = 9;               // seconds to cross at normal difficulty (plus reading time)
const GUST = { easy: 0.22, normal: 0.34, hard: 0.46 };
export const FALL_PENALTY = 20;

class Bridge extends StepLevel {
  startStep(step) {
    this.window = WALK * this.diff.time + readTime(step);
    this.reset();
    this.falls = 0;
  }
  reset() { this.theta = 0; this.g = 0; this.gTarget = 0; this.nextGust = 1.2; this.answer = null; this.fallT = 0; this.t = 0; }
  answerUpdate(dt, inp, events) {
    if (this.fallT > 0) {
      this.fallT -= dt;
      if (this.fallT <= 0) { this.reset(); events.push({ type: 'say', text: this.falls >= 2 ? '答答幫你擋風，慢慢走！' : '再走一次！' }); }
      return null;
    }
    // wind gusts: a new random push every 1.5–3 s, blending in smoothly
    // after two falls on the same question 答答 shields you from the wind (nobody gets stuck here)
    if ((this.nextGust -= dt) <= 0) { this.nextGust = 1.5 + this.rng() * 1.5; this.gTarget = this.falls >= 2 ? 0 : (this.rng() * 2 - 1) * (GUST[this.diffKey] ?? GUST.normal); }
    this.g += (this.gTarget - this.g) * (1 - Math.exp(-dt * 1.5));
    // the needle tips by itself a little (unstable) and leaning pushes it back
    this.theta += (this.g + 0.22 * this.theta + 0.75 * (inp.lean || 0)) * dt;
    if (Math.abs(this.theta) >= 1) {
      this.fallT = 1.8; this.falls++;
      events.push({ type: 'fall' }, { type: 'penalty', points: FALL_PENALTY }, { type: 'sfx', name: 'splash' }, { type: 'say', text: '掉進泡泡池了！' });
      return null;
    }
    if (this.answer === null) for (const e of inp.events) if (e.type === 'raise' && (e.side === 'left' || e.side === 'right')) { this.answer = e.side === 'left' ? 0 : 1; events.push({ type: 'sfx', name: 'lock' }); }
    this.progress = Math.min(this.t / this.window, 1);
    if (this.t >= this.window) return { choice: this.answer, bonus: this.falls ? 0 : 0.2 };
    return null;
  }
}

export const bridge = {
  id: 'bridge', title: '平衡過橋', icon: '🌉',
  rule: '風會把你吹歪！看中間的<b>平衡指針</b>，往<b>反方向</b>傾斜保持平衡。走在橋上時，答案 A 就<b>舉左手</b>、答案 B 就<b>舉右手</b>（第一次舉的算）。掉下去會扣 20 分、重新走一次（掉兩次之後就沒有風了）。',
  howto: [
    { move: 'lean', title: '反方向傾斜＝保持平衡', text: '指針往右偏，身體就往左歪一點', seated: '坐著：上半身歪', key: '← →（按住）' },
    { move: 'raise-left', title: '舉左手＝A', text: '左邊的答案', seated: '坐著一樣做', key: 'Q' },
    { move: 'raise-right', title: '舉右手＝B', text: '右邊的答案', seated: '坐著一樣做', key: 'E' },
  ],
  maxOptions: 2,
  prefer: PREFER.choiceLike,
  prepare: (steps, r) => prepareSteps(steps, { max: 2 }, r),
  create: (o) => new Bridge(o),
};
