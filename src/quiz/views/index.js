// The picture for each level type (rules are in src/quiz/levels/). Add new level views here.
import { runView } from './run.js';
import { tfView, buzzView, idleView } from './studio.js';
import { wallView, bridgeView, bossView } from './arena.js';
import { dodgeView, sprintView } from './track.js';

export const VIEWS = { run: runView, tf: tfView, buzz: buzzView, wall: wallView, bridge: bridgeView, dodge: dodgeView, sprint: sprintView, boss: bossView, idle: idleView };
// how the option cards are laid out: 'anchor' = on objects in the 3D scene, 'row' = along the bottom
export const LAYOUT = { run: 'row', tf: 'anchor', buzz: 'row', wall: 'row', bridge: 'row', dodge: 'row', sprint: 'row', boss: 'row' };
export const KEYS = {
  run: '←／→（按住）身體傾斜選門',
  tf: 'Enter（按住）雙手舉高＝○　X（按住）雙臂交叉＝×',
  tfSimple: '←（按住）往左傾＝○　→（按住）往右傾＝×',
  buzz: 'Enter 雙手舉高搶答　←／→ 傾一下移動選框　Q／E 舉手確認',
  wall: '←／→ 歪　Enter 萬歲　↓ 蹲低（都要按住）',
  bridge: '←／→（按住）反方向傾斜保持平衡　Q 舉左手＝A　E 舉右手＝B',
  dodge: '空白鍵 小跳　↓（按住）蹲低　←／→（按住）傾斜　坐著玩：Enter 雙手舉高',
  sprint: 'R（按住）擺手臂跑步　←／→（按住）作答',
  boss: '←／→ 傾一下移動選框　Q／E 舉手確認',
};
// the small label on each option card: which move picks it
export function cardHint(id, lv, i, n) {
  if (id === 'run') return n === 3 ? ['・往左', '・站直', '・往右'][i] : ['・往左', '・往右'][i];
  if (id === 'dodge' || id === 'sprint') return ['・往左', '・往右'][i];
  if (id === 'bridge') return ['・舉左手', '・舉右手'][i];
  return '';
}
