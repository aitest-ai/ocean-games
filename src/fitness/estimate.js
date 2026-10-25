// 粗估消耗熱量（只在玩家自己填了體重時顯示，而且一定標「粗估」）。
//
// 熱量 ≈ MET × 體重（公斤）× 時間（小時）。MET 取自公開的《身體活動強度表》
// （Compendium of Physical Activities，Ainsworth 等人，2011）中的一般值：
//   徒手體操 費力 8.0（開合跳、高抬腿）、徒手體操 中等 3.8（深蹲、弓箭步……）、輕度 2.8（坐姿）、
//   伸展與休息 2.5。每一下花幾秒是估計值。真實消耗因人差很多，所以顯示一個範圍（±30%）。
const MET = { jack: 8, highKnees: 8, squat: 3.8, lunge: 3.8, legRaise: 3.8, calfRaise: 3.8, wallSit: 3.8, pushUp: 3.8, plank: 3.8, bridge: 3.8, march: 3.8, stepJack: 3.8, sitStand: 2.8, seatedKnee: 2.8, seatedArms: 2.8 };
const SEC_PER_REP = { jack: 1.1, highKnees: 0.8, squat: 3, lunge: 3, legRaise: 2.4, calfRaise: 2.5, wallSit: 1, pushUp: 2.5, plank: 1, bridge: 3, march: 1, stepJack: 1.3, sitStand: 3.5, seatedKnee: 2, seatedArms: 2 };
const OTHER_MET = 2.5;

export function estimateKcal(summary, weightKg) {
  const kg = Number(weightKg);
  if (!kg || kg < 25 || kg > 250 || !summary) return null;
  let active = 0, kcal = 0;
  for (const [ex, n] of Object.entries(summary.reps || {})) {
    const sec = n * (SEC_PER_REP[ex] ?? 2.5);
    active += sec;
    kcal += (MET[ex] ?? 3.8) * kg * (sec / 3600);
  }
  const other = Math.max((summary.durationSec || 0) - active, 0);
  kcal += OTHER_MET * kg * (other / 3600);
  return { low: Math.round(kcal * 0.7), high: Math.round(kcal * 1.3), mid: Math.round(kcal) };
}
