// 指針的慣性：二階「彈簧＋阻尼」跟隨器，加上最大轉速。
// - 真的儀表指針有質量與阻尼：值突然變了，指針會加速、再減速停住，而不是瞬間跳過去；
// - 阻尼比 ζ ≥ 0.8 時幾乎不會過衝，所以不會「抖」；輸入的細碎雜訊被 ωn 以上的頻率濾掉；
// - 爬升率表、真空表等真實會「慢半拍」的儀表用比較小的 ωn。
// 用半隱式積分 + 子步（dt 最長 1/120 秒），平板掉格時也穩定。
export class Needle {
  constructor({ wn = 9, zeta = 0.9, maxRate = Infinity, value = 0, wrap = 0 } = {}) {
    this.wn = wn; this.zeta = zeta; this.maxRate = maxRate; this.wrap = wrap; // wrap = 360：角度（走最短方向）
    this.x = value; this.v = 0; this.target = value;
  }

  set(value) { this.x = value; this.v = 0; this.target = value; return this; }

  update(target, dt) {
    this.target = target;
    let rest = Math.min(Math.max(dt, 0), 0.25);
    while (rest > 1e-6) {
      const h = Math.min(rest, 1 / 120);
      rest -= h;
      let e = target - this.x;
      if (this.wrap) e = ((e % this.wrap) + this.wrap * 1.5) % this.wrap - this.wrap / 2;
      const a = this.wn * this.wn * e - 2 * this.zeta * this.wn * this.v;
      this.v += a * h;
      if (this.v > this.maxRate) this.v = this.maxRate; else if (this.v < -this.maxRate) this.v = -this.maxRate;
      this.x += this.v * h;
      if (this.wrap) this.x = ((this.x % this.wrap) + this.wrap) % this.wrap;
    }
    return this.x;
  }
}
