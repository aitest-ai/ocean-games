// 次數狀態機（所有動作共用）
//
// 每個動作把一格的姿勢變成一個「用力程度」數字 m（0 = 休息姿勢，1 = 做到個人目標）。狀態機：
//
//   休息 top ──m > start──▶ 動作中 moving ──m ≥ count──▶ 到位 reached ──m < release──▶ 算一下（回到 top）
//                               └──────── m < release（沒到位就回來）──▶ 不算，回報「幅度不夠」
//
// - 遲滯：start / count / release 三個門檻分開（release 比 start 低），在門檻附近抖動不會來回跳、重複算。
// - 太快：整下動作少於 minMs（人做不到的速度）視為雜訊，不算。
// - 漏格、追蹤中斷：呼叫 interrupt()，這一下作廢；而且要先回到休息姿勢（armed）才會開始算下一下，
//   避免「中斷時正蹲在下面，回來站起來就被算一下」。
// - 半途反彈（沒站直又蹲下去）：記一次 bounce，讓教練提示「每下都要站直」。
export class RepCounter {
  constructor({ start, count, release, minMs = 350, bounce = 0.3 } = {}) {
    this.set({ start, count, release, minMs, bounce });
    this.reset();
  }

  set(th) { Object.assign(this, th); }

  reset() { this.state = 'top'; this.armed = false; this.since = null; this.rep = null; }

  interrupt() { this.state = 'top'; this.armed = false; this.rep = null; }

  // 回傳事件或 null：{ type: 'rep' | 'partial' | 'bounce', ... }
  step(m, t) {
    if (m == null) return null;
    if (!this.armed) {
      if (m < this.release) { this.armed = true; this.state = 'top'; this.since = t; }
      return null;
    }
    const r = this.rep;
    switch (this.state) {
      case 'top':
        if (m > this.start) { this.state = 'moving'; this.since = t; this.rep = { start: t, peak: m, peakAt: t, reachedAt: null, bounces: 0, dipped: false }; }
        return null;
      case 'moving':
        if (m > r.peak) { r.peak = m; r.peakAt = t; }
        if (m >= this.count) { this.state = 'reached'; this.since = t; r.reachedAt = t; return null; }
        if (m < this.release) {
          this.state = 'top'; this.since = t; this.rep = null;
          // 只是晃一下（很快、幅度小）就不回報
          if (r.peak > this.start + (this.count - this.start) * 0.25 && t - r.start > this.minMs * 0.6) return { type: 'partial', ...r, end: t, durationMs: t - r.start };
        }
        return null;
      case 'reached':
        if (m > r.peak) { r.peak = m; r.peakAt = t; }
        // 往回走了一大段、但還沒回到休息姿勢，又再往下：半途反彈
        if (!r.dipped && m < r.peak - this.bounce && m > this.release) { r.dipped = true; r.trough = m; }
        if (r.dipped) {
          r.trough = Math.min(r.trough, m);
          if (m >= this.count && m > r.trough + this.bounce) { r.dipped = false; r.bounces++; r.peak = m; return { type: 'bounce', at: t }; }
        }
        if (m < this.release) {
          this.state = 'top'; this.since = t; this.rep = null;
          const dur = t - r.start;
          if (dur < this.minMs) return { type: 'noise', ...r, end: t, durationMs: dur };
          return { type: 'rep', ...r, end: t, durationMs: dur };
        }
        return null;
    }
    return null;
  }
}
