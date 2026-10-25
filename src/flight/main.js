// flight/index.html 的入口：體感飛行（模擬器系列）跑在共用遊戲外殼上。
import { runGame } from '../game/shell.js';
import { createFlightMode } from './mode.js';
import { Puppet, drawSkeleton } from '../../packages/taikan-kit/src/index.js';
import { patchPuppetYoke } from './controls.js';

const GAMES = [{ id: 'flight', icon: '🛩️', title: '體感飛行', series: 'sim' }];
const mode = createFlightMode();
await runGame(mode, GAMES);
document.getElementById('loading').hidden = true;
window.__ready = true;

// 「怎麼玩」裡「雙手抬高／放低」那張卡：同一個模擬人偶，雙手在胸前上下
const pup = patchPuppetYoke(new Puppet({ seed: 5, jitter: 0 }));
const t0 = performance.now();
(function anim(now) {
  requestAnimationFrame(anim);
  if (document.getElementById('howto').hidden) return;
  const ph = ((now - t0) / 1000) % 3;
  pup.set('pitchUp', ph > 0.4 && ph < 1.2); pup.set('pitchDown', ph > 1.8 && ph < 2.6);
  for (const fig of document.querySelectorAll('#hCards figure')) {
    if (!fig.querySelector('b')?.textContent.startsWith('雙手抬高')) continue;
    const cv = fig.querySelector('canvas'), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawSkeleton(ctx, pup.step(now - t0), { zoom: 1.6, cx: 0.5, cy: 0.45, width: 5 });
  }
})(t0);
