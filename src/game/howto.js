// "How to play" cards: each card loops a stick figure doing one action. The figure is the same
// puppet the keyboard simulator drives, so it shows exactly the motion the recognizer looks for.
import { Puppet, drawSkeleton } from '../../packages/taikan-kit/src/index.js';

// Looping scripts: [time ms, action] within `loop` ms. Actions as in Puppet.trigger, or 'hold:key:on|off'.
export const MOVES = {
  'paddle-left': { loop: 1400, script: [[300, 'paddle-left']] },
  'paddle-right': { loop: 1400, script: [[300, 'paddle-right']] },
  'paddle-alt': { loop: 1600, script: [[200, 'paddle-left'], [1000, 'paddle-right']] },
  'paddle-both': { loop: 1400, script: [[300, 'paddle-both']] },
  'lean': { loop: 3200, script: [[200, 'hold:leanL:on'], [1100, 'hold:leanL:off'], [1700, 'hold:leanR:on'], [2600, 'hold:leanR:off']] },
  'crouch': { loop: 2400, script: [[300, 'hold:crouch:on'], [1500, 'hold:crouch:off']] },
  'raise-both': { loop: 2400, script: [[300, 'hold:raiseL:on'], [300, 'hold:raiseR:on'], [1700, 'hold:raiseL:off'], [1700, 'hold:raiseR:off']] },
  'raise-left': { loop: 2000, script: [[300, 'hold:raiseL:on'], [1300, 'hold:raiseL:off']] },
  'raise-right': { loop: 2000, script: [[300, 'hold:raiseR:on'], [1300, 'hold:raiseR:off']] },
  'raise-one': { loop: 3200, script: [[200, 'hold:raiseL:on'], [1100, 'hold:raiseL:off'], [1700, 'hold:raiseR:on'], [2600, 'hold:raiseR:off']] },
  'swing': { loop: 1800, script: [[300, 'swing-left'], [1100, 'swing-right']] },
  'jump': { loop: 1600, script: [[400, 'jump']] },
};

// cards: [{ move, title, text, seated?, skip? }] → fills `root` with animated cards; returns stop()
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
    return { c, cv, ctx: cv.getContext('2d'), pup: new Puppet({ seed: i + 1, jitter: 0 }), lap: -1, next: 0 };
  });
  let raf, t0 = performance.now();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const t = now - t0;
    for (const f of figs) {
      const m = MOVES[f.c.move];
      if (!m) continue;
      const lap = Math.floor(t / m.loop), u = t % m.loop;
      if (lap !== f.lap) { f.lap = lap; f.next = 0; }
      while (f.next < m.script.length && m.script[f.next][0] <= u) {
        const a = m.script[f.next++][1];
        if (a.startsWith('hold:')) { const [, k, v] = a.split(':'); f.pup.set(k, v === 'on'); }
        else f.pup.trigger(a, t);
      }
      const pose = f.pup.step(t);
      const { ctx, cv } = f;
      ctx.clearRect(0, 0, cv.width, cv.height);
      // zoomed onto the upper body (what the camera needs to see), raised hands still in frame
      drawSkeleton(ctx, pose, { zoom: 1.6, cx: 0.5, cy: 0.45, width: 5 });
    }
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

export const HOWTO_CSS = `
.howto-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.howto-card { margin: 0; background: rgba(255,255,255,0.05); border: 1px solid var(--line); border-radius: 14px; padding: 10px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.howto-card canvas { width: 140px; height: 140px; background: rgba(0,0,0,0.25); border-radius: 12px; }
.howto-card figcaption { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.howto-card b { font-size: 18px; color: var(--accent); }
.howto-card span { font-size: 15px; line-height: 1.45; }
.howto-card small { font-size: 13px; color: var(--muted); line-height: 1.4; }
`;

// one looping figure on its own canvas (the hub's game cards)
export function mountMini(canvas, move) {
  const box = document.createElement('div');
  const cards = [{ move, title: '', text: '' }];
  // reuse the card animation with a detached root, then move its canvas drawing to `canvas`
  const stop = mountHowto(box, cards);
  const src = box.querySelector('canvas'), ctx = canvas.getContext('2d');
  const copy = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(src, 0, 0, canvas.width, canvas.height); raf = requestAnimationFrame(copy); };
  let raf = requestAnimationFrame(copy);
  return () => { stop(); cancelAnimationFrame(raf); };
}
