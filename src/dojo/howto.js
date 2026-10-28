// 道場的「怎麼玩」卡片：每張卡片用全身模擬人偶重複示範一個動作（跟鍵盤模擬、鏡頭辨識看的是同一種動作）。
// 卡片樣式沿用海洋系列（../game/howto.js 的 HOWTO_CSS），這裡只換成會動腿的武術人偶。
import { drawSkeleton } from '../../packages/taikan-kit/src/index.js';
import { MartialPuppet, applyAction } from '../../packages/taikan-kit/martial/index.js';
export { HOWTO_CSS } from '../game/howto.js';

// 循環腳本：[毫秒, 動作]（動作同 applyAction）
export const MOVES = {
  stance: { loop: 4200, script: [[0, 'depth:0'], [300, 'hold:wide:on'], [900, 'depth:0.6'], [3300, 'depth:0'], [3700, 'hold:wide:off']] },
  'stance-seated': { seated: true, loop: 2400, script: [] },
  'punch-alt': { loop: 1800, script: [[300, 'punch-left'], [1200, 'punch-right']] },
  'combo': { loop: 1800, init: [[0, 'hold:wide:on'], [0, 'depth:0.5']], script: [[300, 'punch-left'], [1200, 'punch-right']] },
  'combo-seated': { seated: true, loop: 1800, script: [[300, 'punch-left'], [1200, 'punch-right']] },
  'raise-both': { loop: 2400, script: [[300, 'hold:raiseL:on'], [300, 'hold:raiseR:on'], [1700, 'hold:raiseL:off'], [1700, 'hold:raiseR:off']] },
  'raise-one': { loop: 2600, script: [[300, 'hold:raiseR:on'], [2000, 'hold:raiseR:off']] },
  'knee': { loop: 2400, script: [[300, 'knee-left'], [1500, 'knee-right']] },
  'idle': { loop: 2000, script: [] },
};

// 示範從斜前方看：正面看不出「往前出拳」，斜一點手臂伸出去才看得到
export const DEMO_YAW = 0.55;

// 畫一個全身人偶（讓腳也看得到）
export function drawFigure(ctx, pose, opts = {}) {
  drawSkeleton(ctx, pose, { zoom: 1.45, cx: 0.5, cy: 0.45, width: 5, ...opts });
}

// cards：[{ move, title, text, seated?, skip? }] → 填進 root；回傳 stop()
export function mountHowto(root, cards) {
  root.innerHTML = cards.map((c, i) => `
    <figure class="howto-card">
      <canvas width="220" height="220" data-i="${i}" aria-hidden="true"></canvas>
      <figcaption>
        <b>${c.title}</b>
        <span>${c.text}</span>
        ${c.seated ? `<small class="seat">🪑 ${c.seated}</small>` : ''}
        ${c.skip ? `<small class="skip">⏭️ ${c.skip}</small>` : ''}
      </figcaption>
    </figure>`).join('');
  const figs = cards.map((c, i) => {
    const cv = root.querySelector(`canvas[data-i="${i}"]`);
    const m = MOVES[c.move] || MOVES.idle;
    const pup = new MartialPuppet({ seed: i + 1, jitter: 0, yaw: DEMO_YAW });
    pup.seated = !!m.seated;
    for (const [, a] of m.init || []) applyAction(pup, a, 0);
    return { m, cv, ctx: cv.getContext('2d'), pup, lap: -1, next: 0 };
  });
  let raf;
  const t0 = performance.now();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const t = now - t0;
    for (const f of figs) {
      const lap = Math.floor(t / f.m.loop), u = t % f.m.loop;
      if (lap !== f.lap) { f.lap = lap; f.next = 0; }
      while (f.next < f.m.script.length && f.m.script[f.next][0] <= u) applyAction(f.pup, f.m.script[f.next++][1], t);
      const pose = f.pup.step(t);
      f.ctx.clearRect(0, 0, f.cv.width, f.cv.height);
      drawFigure(f.ctx, pose);
    }
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
