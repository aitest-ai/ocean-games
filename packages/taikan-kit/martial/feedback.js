// 馬步的即時口語回饋：一次只講一件最重要的事（安全 > 入鏡 > 腳寬 > 深度 > 上身），講白話。
//
// stance：MartialRecognizer 的 state.stance；opts.target：要求的深度（0~1，1＝大腿接近水平）
// 回傳 { key, text, good }，good＝這一格算「做對了」（計時、計分用）
export function stanceFeedback(stance, { target = 0.4, seated = false, fullBody = true, minWidth = 1.6 } = {}) {
  if (!stance) return { key: 'lost', text: '看不到你，請回到鏡頭前', good: false };
  if (seated) {
    if (stance.upright === false) return { key: 'upright', text: '背挺直，不要駝背', good: false };
    if (!stance.handsAtWaist) return { key: 'fists', text: '雙拳收在腰間', good: false };
    return { key: 'good', text: '很好！保持住，慢慢呼吸', good: true };
  }
  if (!fullBody || stance.depth === null) return { key: 'legs', text: '往後退一點，讓腳也入鏡', good: false };
  if (stance.kneesIn) return { key: 'knees', text: '膝蓋往外推，對準腳尖', good: false };
  if (stance.depth > Math.max(target + 0.45, 1.05)) return { key: 'tooDeep', text: '不用蹲那麼低，稍微起來一點', good: false };
  if (stance.width < minWidth) return { key: 'width', text: '兩腳再張開一點（約兩倍肩寬）', good: false };
  if (stance.depth < target) return { key: 'deeper', text: stance.depth < target * 0.5 ? '膝蓋彎下去，蹲低' : '再蹲低一點', good: false };
  if (stance.upright === false) return { key: 'upright', text: '上身挺直，不要往前彎', good: false };
  return { key: 'good', text: '很好！保持住，慢慢呼吸', good: true };
}
