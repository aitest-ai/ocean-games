// The picture for each level type (rules are in src/quiz/levels/). Add new level views here.
import { runView } from './run.js';
import { tfView, buzzView, idleView } from './studio.js';

export const VIEWS = { run: runView, tf: tfView, buzz: buzzView, idle: idleView };
// how the option cards are laid out: 'anchor' = on objects in the 3D scene, 'row' = along the bottom
export const LAYOUT = { run: 'row', tf: 'anchor', buzz: 'row' };
export const KEYS = {
  run: '←／→（按住）身體傾斜選門',
  tf: 'Enter（按住）雙手舉高＝○　X（按住）雙臂交叉＝×',
  tfSimple: '←（按住）往左傾＝○　→（按住）往右傾＝×',
  buzz: 'Enter 雙手舉高搶答　←／→ 傾一下移動選框　Q／E 舉手確認',
};
