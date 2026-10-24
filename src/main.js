import { App, RENDER_MODE } from './app.js';
import { UI, UI_CSS } from './ui.js';
import { AudioEngine } from './audio/audio.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('c');
let app;
try {
  app = new App(canvas);
  window.app = app;
} catch (e) {
  document.body.insertAdjacentHTML('beforeend', `<pre class="err">${e.message}</pre>`);
  throw e;
}

// Live audio: created on the first user gesture (browsers block autoplay).
const audio = {
  engine: new AudioEngine(),
  ctx: null,
  async enable(on) {
    if (on && !this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'playback' });
      await this.engine.init(this.ctx);
    }
    if (!this.ctx) return;
    if (on) await this.ctx.resume(); else await this.ctx.suspend();
  },
  update(app) {
    const e = this.engine;
    if (!this.ctx) return;
    const S = app.weather.state;
    e.set({
      wind: S.wind, rain: S.rain, hs: app.stats ? app.stats.hs : 2,
      tp: (2 * Math.PI * Math.max(S.wind, 1)) / (0.855 * 9.81),
      foam: Math.min(2 * 3.84e-6 * Math.pow(S.wind, 3.41), 0.4),
    });
    e.tick();
    // muted (suspended) context: drop thunder instead of queueing it for the unmute
    if (this.ctx.state === 'running') for (const ev of app.thunderEvents || []) e.thunder(this.ctx.currentTime, ev.dist, ev.power);
  },
};

if (!RENDER_MODE) {
  const style = document.createElement('style');
  style.textContent = UI_CSS;
  document.head.appendChild(style);
  app.ui = new UI(app, audio);
  let last = performance.now();
  // dynamic resolution: keep the frame time near 30 fps on slow GPUs, sharpen on fast ones
  let avg = 1 / 60, settle = 0;
  const maxScale = params.has('scale') ? app.scale : Math.min(window.devicePixelRatio || 1, 1.5);
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    app.frame(dt);
    audio.update(app);
    avg += (dt - avg) * 0.05;
    if (!params.has('scale') && (settle += dt) > 2.5 && !document.hidden) {
      const next = avg > 1 / 26 ? Math.max(app.scale * 0.88, 0.5) : avg < 1 / 50 ? Math.min(app.scale * 1.08, maxScale) : app.scale;
      if (Math.abs(next - app.scale) > 0.02) { app.scale = next; app.resize(); settle = 0; }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
