// 穿牆姿勢: a wall slides toward the player with one person-shaped hole per answer. Each hole has a
// different, easy pose: lean left, both arms up (萬歲), crouch, lean right — placed on the wall in that
// order from left to right, so the pose matches where the hole is. Strike the pose of the answer you
// believe and the figure slips through; a wrong pose and the wall bumps it softly into the bubbles.
// The pose is read over the last 0.6 s before the wall arrives (hold it, no split-second timing).
// Seated play: no crouch hole (3 poses, so at most 3 answers).
import { StepLevel, readTime, PREFER, prepareSteps, Majority } from './common.js';
import { adapt } from '../bank.js';

export const POSES = {
  left: { name: '往左歪', icon: '↖️', key: '←' },
  up: { name: '萬歲（雙手舉高）', icon: '🙌', key: 'Enter' },
  crouch: { name: '蹲低', icon: '⬇️', key: '↓' },
  right: { name: '往右歪', icon: '↗️', key: '→' },
};
export const POSE_ORDER = ['left', 'up', 'crouch', 'right']; // left to right on the wall
const WINDOW = 8;

export function poseOf(inp) {
  if (inp.armsUp >= 1) return 'up';
  if (inp.crouching || inp.crouch > 0.6) return 'crouch';
  if (inp.side === 'left' || inp.side === 'right') return inp.side;
  return null;
}

class Wall extends StepLevel {
  startStep(step) {
    const avail = this.opts.seated ? ['left', 'up', 'right'] : POSE_ORDER;
    const s = adapt(step, avail.length, this.rng);
    // pick which poses are used, keep them in wall order, and show the options in that order
    const n = s.options.length;
    let use;
    if (n >= avail.length) use = avail;
    else if (n === 2) use = ['left', 'right'];
    else { const drop = this.rng() < 0.5 ? 'up' : 'crouch'; use = avail.filter((p) => p !== drop); }
    const order = [...use].sort((a, b) => POSE_ORDER.indexOf(a) - POSE_ORDER.indexOf(b));
    this.poses = order;
    this.steps[this.i] = s; // the reduced version is the one the page shows
    this.window = WINDOW * this.diff.time + readTime(s);
    this.seen = new Majority(600); this.pose = null; this.wallZ = 1;
  }
  answerUpdate(dt, inp) {
    this.pose = poseOf(inp);
    this.seen.push(this.t * 1000, this.pose);
    this.wallZ = Math.max(1 - this.t / this.window, 0);
    if (this.t >= this.window) {
      const p = this.seen.best();
      const k = p ? this.poses.indexOf(p) : -1;
      return { choice: k >= 0 ? k : null, bonus: 0, pose: p };
    }
    return null;
  }
}

export const wall = {
  id: 'wall', title: '穿牆姿勢', icon: '🧱',
  rule: '牆上有好幾個人形洞，每個洞是一個答案。牆撞過來之前，<b>擺出答案那個洞的姿勢</b>：往左歪、萬歲、蹲低、往右歪。姿勢對就能穿過去！',
  howto: [
    { move: 'lean', title: '往左歪／往右歪', text: '最左邊和最右邊的洞', seated: '坐著：上半身歪', key: '← →' },
    { move: 'raise-both', title: '萬歲', text: '雙手舉高的洞', seated: '坐著一樣做', key: 'Enter' },
    { move: 'crouch', title: '蹲低', text: '矮矮的洞（坐著玩時沒有這個洞）', seated: '坐著不用蹲', key: '↓' },
  ],
  maxOptions: 4,
  prefer: PREFER.choiceLike,
  prepare: (steps, r) => prepareSteps(steps, { max: 4 }, r),
  create: (o) => new Wall(o),
};
