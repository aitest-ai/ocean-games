// 復活挑戰: when the hearts run out, nobody is out of the game — a short body task brings them back.
// Done in time: 3 hearts and +50. Not done: 答答 cheers you on and you still get 2 hearts.
// (In team play, teammates can help: stage three.)
export const REVIVE_TASKS = {
  lean: { title: '左右左右！', text: '身體往左、往右輪流傾斜 4 次', need: 4, key: '← → 輪流按' },
  raise: { title: '舉高高！', text: '雙手舉高、放下，做 2 次', need: 2, key: 'Enter 按 2 次' },
  pump: { title: '原地加油跑！', text: '雙手擺動像跑步，擺滿 3 秒', need: 3, key: 'R 按住' },
};
export const REVIVE_BONUS = 50;

export class Revive {
  constructor({ kind, diff = 'normal' }) {
    this.kind = kind; this.def = REVIVE_TASKS[kind];
    this.limit = { easy: 15, normal: 12, hard: 10 }[diff] ?? 12;
    this.t = 0; this.count = 0; this.last = null; this.done = false; this.success = false;
  }
  get progress() { return Math.min(this.count / this.def.need, 1); }
  update(dt, inp) {
    const events = [];
    if (this.done) return events;
    this.t += dt;
    const before = this.count;
    if (this.kind === 'lean') for (const e of inp.events) { if (e.type === 'lean' && e.side !== 'center' && e.side !== this.last) { this.last = e.side; this.count++; } }
    if (this.kind === 'raise') for (const e of inp.events) if (e.type === 'raise' && e.side === 'both') this.count++;
    if (this.kind === 'pump' && (inp.pump || 0) > 0.4) this.count += dt;
    if (Math.floor(this.count) > Math.floor(before)) events.push({ type: 'sfx', name: 'step' });
    if (this.count >= this.def.need) { this.done = this.success = true; events.push({ type: 'sfx', name: 'fanfare' }); }
    else if (this.t >= this.limit) this.done = true;
    return events;
  }
}
