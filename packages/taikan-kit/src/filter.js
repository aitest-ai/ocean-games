// One Euro 濾波器（Casiez et al., CHI 2012）：手不動時強力去抖動，快速移動時幾乎不延遲。
// 比固定的移動平均更適合體感：去除骨架抖動，又不會讓「划槳」慢半拍。
class LowPass {
  constructor() { this.y = null; }
  filter(x, a) { this.y = this.y === null ? x : this.y + a * (x - this.y); return this.y; }
}
const alpha = (cutoff, dt) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); };

export class OneEuro {
  // beta 以「畫面寬度／秒」為單位：手每秒移動半個畫面時，截止頻率約 5.5 Hz
  constructor({ minCutoff = 1.5, beta = 8, dCutoff = 1.0 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.x = new LowPass(); this.dx = new LowPass(); this.last = null; this.prevRaw = null;
  }
  reset() { this.x = new LowPass(); this.dx = new LowPass(); this.last = null; this.prevRaw = null; }
  filter(value, tMs) {
    if (this.last === null) { this.last = tMs; this.prevRaw = value; return this.x.filter(value, 1); }
    const dt = Math.max((tMs - this.last) / 1000, 1e-3);
    this.last = tMs;
    const d = (value - this.prevRaw) / dt;
    this.prevRaw = value;
    const ed = this.dx.filter(d, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(ed);
    return this.x.filter(value, alpha(cutoff, dt));
  }
}
