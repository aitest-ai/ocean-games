// 訓練計畫（階段三）：每週 3 次、4 週，次數慢慢增加。每一次訓練就是一場對戰（同一套暖身／主訓練／收操結構）。
// ✏️ 計畫內容、次數、增加的幅度都是我的選擇，可以改；建議請運動專業人員看過。
import { SEATED_WARMUP, SEATED_COOLDOWN } from './levels.js';

const MONS = ['slime', 'remote', 'snack', 'sofa', 'elevator', 'chair', 'takeout', 'screen'];
// 每週次數增加 15%（第 4 週約 1.45 倍）
const grow = (n, week) => Math.max(3, Math.round(n * (1 + 0.15 * (week - 1))));

function build(plan, templates) {
  const sessions = [];
  for (let w = 1; w <= plan.weeks; w++) {
    for (let k = 0; k < plan.perWeek; k++) {
      const i = sessions.length, t = templates[i % templates.length];
      sessions.push({
        id: `plan:${plan.id}:${i}`, planId: plan.id, planIndex: i,
        name: `${plan.short} 第 ${w} 週・第 ${k + 1} 次`, chapter: plan.name,
        monster: MONS[(i + plan.offset) % MONS.length], rest: t.rest ?? 45,
        sets: t.sets.map(([ex, n]) => [ex, grow(n, w)]),
        warmup: plan.warmup, cooldown: plan.cooldown, boss: (k === plan.perWeek - 1 && w === plan.weeks),
      });
    }
  }
  return { ...plan, sessions };
}

export const PLANS = [
  build({ id: 'starter', name: '入門 4 週', short: '入門', weeks: 4, perWeek: 3, offset: 0, desc: '每週 3 次、每次約 12～18 分鐘。站姿動作為主，次數每週增加一點點。' }, [
    { sets: [['squat', 8], ['jack', 15], ['legRaise', 6], ['squat', 8]] },
    { sets: [['highKnees', 10], ['lunge', 6], ['wallSit', 15], ['calfRaise', 10]] },
    { sets: [['jack', 15], ['squat', 10], ['legRaise', 6], ['highKnees', 10]] },
  ]),
  build({ id: 'lowImpact', name: '低衝擊 4 週（不跳）', short: '低衝擊', weeks: 4, perWeek: 3, offset: 2, desc: '完全不跳，適合住公寓、怕吵鄰居、膝蓋或腳踝比較敏感的人。' }, [
    { sets: [['march', 12], ['squat', 8], ['stepJack', 12], ['calfRaise', 10]] },
    { sets: [['legRaise', 6], ['wallSit', 15], ['march', 12], ['squat', 8]] },
    { sets: [['stepJack', 12], ['calfRaise', 12], ['legRaise', 6], ['wallSit', 15]] },
  ]),
  build({ id: 'seated', name: '坐姿與椅子 4 週', short: '坐姿', weeks: 4, perWeek: 3, offset: 4, warmup: SEATED_WARMUP, cooldown: SEATED_COOLDOWN, desc: '需要一張穩的椅子（不要有輪子）。適合久站不舒服、平衡比較不好、剛開始運動的人。' }, [
    { sets: [['sitStand', 6], ['seatedArms', 10], ['seatedKnee', 8], ['sitStand', 6]] },
    { sets: [['seatedKnee', 8], ['sitStand', 6], ['seatedArms', 12]] },
    { sets: [['seatedArms', 10], ['seatedKnee', 10], ['sitStand', 8]] },
  ]),
];
