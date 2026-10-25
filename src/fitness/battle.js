// 對戰規則（純邏輯）：每算一下就是一次攻擊。
//
// 「品質比次數重要」，但不讓人沮喪：
// - 每一下至少造成 10 點傷害；怪獸血量 = 預定次數 × 10，所以**做完預定次數一定打得倒**。
// - 品質越好傷害越高（最多 1.5 倍）；連續「標準」的動作累積連擊，再加成最多 30%。
// - 不標準的一下：連擊不增加，但**也不會歸零**（只有停下來超過 6 秒才歸零）。
// - 星星看平均品質，完成就至少 1 顆星。
export const BASE_DMG = 10;
export const COMBO_GAP_MS = 6000;

export class Battle {
  constructor(planned) {
    this.maxHp = Math.max(planned, 1) * BASE_DMG;
    this.hp = this.maxHp;
    this.combo = 0; this.lastAt = -1e9;
    this.score = 0; this.hits = 0; this.qsum = 0; this.qn = 0;
  }

  get defeated() { return this.hp <= 0; }

  // e：動作分析器的 rep 事件（quality 0～1 或 null、good、time 毫秒）
  hit(e) {
    const t = e.time ?? 0;
    if (t - this.lastAt > COMBO_GAP_MS) this.combo = 0;
    this.lastAt = t;
    const q = e.quality ?? 0.7; // 看不清楚的視角沒有品質分數：當作普通的一下
    if (e.good) this.combo++;
    const comboBonus = Math.min(this.combo * 0.02, 0.3);
    const dmg = Math.round(BASE_DMG * (1 + 0.5 * q) * (1 + comboBonus));
    this.hp = Math.max(this.hp - dmg, 0);
    this.score += dmg;
    this.hits++;
    if (e.quality != null) { this.qsum += e.quality; this.qn++; }
    const crit = e.good && q >= 0.95;
    return { damage: dmg, combo: this.combo, crit, defeated: this.defeated, text: crit ? '會心一擊！' : e.good ? (this.combo >= 5 ? `${this.combo} 連擊！` : '漂亮！') : '命中' };
  }

  // 「維持」類（靠牆深蹲、棒式）每撐一秒：護盾反擊 4 點（10 秒 = 4 下）
  holdTick() {
    const dmg = 4;
    this.hp = Math.max(this.hp - dmg, 0);
    this.score += dmg;
    return { damage: dmg, defeated: this.defeated, text: '護盾反擊' };
  }

  // 維持期間的姿勢品質也算進星星
  quality(q) { if (q != null) { this.qsum += q; this.qn++; } }

  // 新的一組開始：連擊重新算（中間有休息）
  newSet() { this.combo = 0; this.lastAt = -1e9; }

  stars() {
    const avg = this.qn ? this.qsum / this.qn : 0.7;
    return avg >= 0.85 ? 3 : avg >= 0.7 ? 2 : 1;
  }
}
