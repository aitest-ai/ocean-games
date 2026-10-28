// "How to play" cards for the quiz: the same looping puppet as the other games (src/game/howto.js),
// plus the two quiz poses (arms crossed ×, running arms) that the shared cards do not have.
import { Puppet, drawSkeleton } from '../../packages/taikan-kit/src/index.js';
import { MOVES } from '../game/howto.js';
import { patchPuppet } from './input.js';

const EXTRA = {
  cross: { loop: 2600, script: [[300, 'x:cross:on'], [1700, 'x:cross:off']] },
  pump: { loop: 2400, script: [[200, 'x:pump:on'], [2000, 'x:pump:off']] },
  'lean-step': { loop: 3600, script: [[200, 'hold:leanR:on'], [700, 'hold:leanR:off'], [1300, 'hold:leanR:on'], [1800, 'hold:leanR:off'], [2600, 'hold:raiseR:on'], [3300, 'hold:raiseR:off']] },
};

export function mountCards(root, cards) {
  root.innerHTML = cards.map((c, i) => `
    <figure class="howto-card">
      <canvas width="220" height="220" data-i="${i}" aria-hidden="true"></canvas>
      <figcaption><b>${c.title}</b><span>${c.text}</span>
        ${c.seated ? `<small class="seat">🪑 ${c.seated}</small>` : ''}${c.skip ? `<small class="skip">⏭️ ${c.skip}</small>` : ''}
        ${c.key ? `<small class="key">⌨️ ${c.key}</small>` : ''}</figcaption>
    </figure>`).join('');
  const figs = cards.map((c, i) => {
    const extra = { cross: false, pump: false };
    const pup = patchPuppet(new Puppet({ seed: i + 1, jitter: 0 }), () => extra);
    const cv = root.querySelector(`canvas[data-i="${i}"]`);
    return { c, cv, ctx: cv.getContext('2d'), pup, extra, lap: -1, next: 0 };
  });
  let raf; const t0 = performance.now();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const t = now - t0;
    for (const f of figs) {
      const m = EXTRA[f.c.move] || MOVES[f.c.move];
      if (!m) continue;
      const lap = Math.floor(t / m.loop), u = t % m.loop;
      if (lap !== f.lap) { f.lap = lap; f.next = 0; }
      while (f.next < m.script.length && m.script[f.next][0] <= u) {
        const a = m.script[f.next++][1];
        if (a.startsWith('hold:')) { const [, k, v] = a.split(':'); f.pup.set(k, v === 'on'); }
        else if (a.startsWith('x:')) { const [, k, v] = a.split(':'); f.extra[k] = v === 'on'; }
        else f.pup.trigger(a, t);
      }
      f.ctx.clearRect(0, 0, f.cv.width, f.cv.height);
      drawSkeleton(f.ctx, f.pup.step(t), { zoom: 1.6, cx: 0.5, cy: 0.45, width: 5 });
    }
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
