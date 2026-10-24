// Entry point of fishing/index.html: load the fish database and the pictures, then run the shared shell.
import { loadDB } from './data.js';
import { loadArt, shadowSprites, thumbURL } from './art.js';
import { createFishingMode } from './mode.js';
import { Puppet, drawSkeleton } from '../../packages/taikan-kit/src/index.js';
import { patchPuppet } from './reel.js';

const status = document.getElementById('fLoading');
let db;
try {
  db = await loadDB('../data/fishing/');
} catch (e) {
  status.textContent = '⚠️ 魚類資料載入失敗：' + e.message;
  throw e;
}
db.art = {}; db.shadows = {}; db.thumbs = {}; db.big = {};
await Promise.all(db.catchables.map(async (c) => {
  const a = await loadArt(c, '../');
  c.artOfficial = a.official;
  db.art[c.id] = a;
  db.shadows[c.id] = shadowSprites(a.image);
  db.thumbs[c.id] = thumbURL(a.image, 200);
  db.big[c.id] = thumbURL(a.image, 640);
}));
status.remove();
window.fishDB = db;

const mode = createFishingMode(db);
const { runGame } = await import('../game/shell.js');
const game = runGame(mode);
mode.attach(game);

// the "draw circles" card of the how-to screen: the same puppet, with its right hand circling
const reelPup = patchPuppet(new Puppet({ seed: 5, jitter: 0 }), () => true);
const t0 = performance.now();
(function howtoReel(now) {
  requestAnimationFrame(howtoReel);
  if (document.getElementById('howto').hidden) return;
  for (const fig of document.querySelectorAll('#hCards figure')) {
    if (!fig.querySelector('b')?.textContent.startsWith('手畫圈')) continue;
    const cv = fig.querySelector('canvas'), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawSkeleton(ctx, reelPup.step(now - t0), { zoom: 1.6, cx: 0.5, cy: 0.45, width: 5 });
  }
})(t0);
