// 示範動作表（3D 示範人偶與省電模式的線條示範共用）：[合成人體的動作名稱, 參數, 毫秒]
export const DEMOS = {
  squat: [['squat', {}], ['stand', {}, 600]], jack: [['jack', {}]], stepJack: [['jack', { hop: 0 }]],
  legRaise: [['legRaise', { side: 'left' }], ['legRaise', { side: 'right' }]],
  highKnees: [['highKnee', { side: 'left' }], ['highKnee', { side: 'right' }]],
  march: [['highKnee', { side: 'left', lift: 0.75 }, 900], ['highKnee', { side: 'right', lift: 0.75 }, 900]],
  lunge: [['lunge', { side: 'left' }], ['lunge', { side: 'right' }]], calfRaise: [['calfRaise', {}]],
  wallSit: [['wallSit', {}, 8000]], sitStand: [['sitStand', {}]],
  seatedKnee: [['seated', { knee: 'left' }], ['seated', { knee: 'right' }]], seatedArms: [['seated', { arms: true }]],
  plank: [['plank', {}, 4000]], pushUp: [['pushUp', {}]], bridge: [['bridge', {}]],
  walkInPlace: [['march', {}]], armCircle: [['armCircle', {}]], halfSquat: [['squat', { depth: 45 }]], sideReach: [['sideReach', {}]],
  quadL: [['quad', { side: 'left' }, 30000]], quadR: [['quad', { side: 'right' }, 30000]], hamstring: [['hamstring', {}, 30000]],
  shoulder: [['shoulder', {}]], breathe: [['breathe', {}]], idle: [['stand', {}, 1000]],
  seatedMarch: [['seated', { knee: 'left', lift: 0.6 }, 700], ['seated', { knee: 'right', lift: 0.6 }, 700]], seatedHam: [['seated', {}, 4000]],
};
// 從哪個角度示範比較清楚（弧度，0 = 正面）
export const DEMO_YAW = { squat: -0.9, halfSquat: -0.9, hamstring: -1.2, quadL: -0.6, quadR: 0.6, lunge: -1.3, wallSit: -1.3, sitStand: -0.8, plank: -1.57, pushUp: -1.57, bridge: -1.57 };
export const SEATED_DEMOS = new Set(['seatedKnee', 'seatedArms', 'sitStand', 'seatedMarch', 'seatedHam']);
