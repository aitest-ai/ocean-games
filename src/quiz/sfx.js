// Quiz-show sounds, all synthesized with Web Audio (no recordings): right / wrong stings, buzzer,
// lock, ticking clock, splash, whoosh, fanfare, drum roll and a light looping backing beat.
// Sound starts only after a tap or key press (browser rule) and can be switched off in the menu.
export class Sfx {
  constructor() { this.ctx = null; this.on = false; this.music = false; this.vol = 0.8; this.loop = null; }
  async enable(on, music = this.music) {
    this.on = on; this.music = music;
    if (on && !this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
      this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (!this.ctx) return;
    if (on) await this.ctx.resume().catch(() => {}); else await this.ctx.suspend().catch(() => {});
    this.setMusic(on && music);
  }
  tone(f, t, dur, { type = 'sine', vol = 0.2, slide = 0, attack = 0.01 } = {}) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(f * slide, 20), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(t, dur, { vol = 0.2, freq = 1200, q = 1, type = 'bandpass', sweep = 0 } = {}) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  }
  play(name) {
    if (!this.on || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.01;
    const S = {
      right: () => [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, t + i * 0.07, 0.35, { type: 'triangle', vol: 0.18 })),
      // a soft cartoon "boing", never harsh: wrong answers should be funny, not punishing
      wrong: () => { this.tone(330, t, 0.45, { type: 'sine', vol: 0.22, slide: 0.45 }); this.tone(220, t + 0.12, 0.4, { type: 'triangle', vol: 0.12, slide: 0.6 }); },
      buzz: () => { this.tone(180, t, 0.35, { type: 'square', vol: 0.12 }); this.tone(270, t, 0.35, { type: 'square', vol: 0.08 }); },
      lock: () => { this.tone(1046, t, 0.12, { type: 'square', vol: 0.08 }); this.tone(1568, t + 0.06, 0.18, { type: 'sine', vol: 0.12 }); },
      tick: () => this.tone(1400, t, 0.05, { type: 'square', vol: 0.05 }),
      step: () => this.tone(520, t, 0.08, { type: 'triangle', vol: 0.08 }),
      splash: () => { this.noise(t, 0.6, { vol: 0.3, freq: 900, q: 0.7, sweep: 0.4 }); for (let i = 0; i < 6; i++) this.tone(600 + Math.random() * 900, t + 0.1 + i * 0.06, 0.08, { vol: 0.07, slide: 1.8 }); },
      whoosh: () => this.noise(t, 0.5, { vol: 0.18, freq: 400, q: 2, sweep: 6 }),
      fanfare: () => [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.42]].forEach(([f, d]) => { this.tone(f, t + d, 0.5, { type: 'sawtooth', vol: 0.07 }); this.tone(f / 2, t + d, 0.5, { type: 'triangle', vol: 0.1 }); }),
      level: () => { for (let i = 0; i < 10; i++) this.noise(t + i * 0.05, 0.06, { vol: 0.15, freq: 200, q: 1, type: 'lowpass' }); this.tone(392, t + 0.55, 0.4, { type: 'triangle', vol: 0.15 }); this.tone(587, t + 0.55, 0.5, { type: 'triangle', vol: 0.12 }); },
      cheer: () => this.noise(t, 1.4, { vol: 0.12, freq: 1800, q: 0.5, sweep: 0.8 }),
      count: () => this.tone(660, t, 0.15, { type: 'sine', vol: 0.15 }),
      go: () => this.tone(990, t, 0.35, { type: 'sine', vol: 0.18 }),
      bump: () => { this.tone(120, t, 0.25, { type: 'triangle', vol: 0.22, slide: 0.7 }); this.noise(t, 0.12, { vol: 0.12, freq: 300, q: 1, type: 'lowpass' }); },
      coin: () => { this.tone(988, t, 0.08, { type: 'square', vol: 0.06 }); this.tone(1319, t + 0.07, 0.25, { type: 'square', vol: 0.06 }); },
      combo: () => [659, 784, 988, 1319].forEach((f, i) => this.tone(f, t + i * 0.05, 0.2, { type: 'triangle', vol: 0.12 })),
      drum: () => { for (let i = 0; i < 14; i++) this.noise(t + i * 0.045, 0.05, { vol: 0.08 + i * 0.008, freq: 180, q: 1, type: 'lowpass' }); },
      hit: () => { this.noise(t, 0.2, { vol: 0.25, freq: 600, q: 0.8 }); this.tone(220, t, 0.3, { type: 'square', vol: 0.1, slide: 0.5 }); },
      boss: () => { this.tone(98, t, 1.2, { type: 'sawtooth', vol: 0.09, slide: 0.8 }); this.tone(147, t + 0.3, 1.0, { type: 'sawtooth', vol: 0.06, slide: 0.8 }); },
    };
    S[name]?.();
  }
  // a quiet four-bar beat that loops while a level runs
  setMusic(on, mood = 'happy') {
    clearInterval(this.loop); this.loop = null;
    if (!on || !this.ctx) return;
    // happy: major and bouncy; boss: minor and lower; fast: the race levels
    const bass = mood === 'boss' ? [110, 110, 131, 123, 110, 110, 98, 104] : [131, 131, 165, 175, 131, 131, 196, 175];
    let i = 0;
    const beat = mood === 'fast' ? 0.19 : mood === 'boss' ? 0.28 : 0.24;
    this.loop = setInterval(() => {
      if (this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime + 0.02;
      if (i % 2 === 0) this.tone(bass[(i / 2) % 8], t, 0.22, { type: 'triangle', vol: 0.07 });
      this.noise(t, 0.04, { vol: i % 4 === 2 ? 0.07 : 0.03, freq: 7000, q: 1, type: 'highpass' });
      if (i % 4 === 0) this.tone(60, t, 0.15, { type: 'sine', vol: 0.12, slide: 0.5 });
      i++;
    }, beat * 1000);
  }
}

// reading questions aloud with the browser's own voice (Web Speech API) when the device has one;
// the game never depends on it — every word is also on screen
export class Voice {
  constructor() {
    this.ok = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
    this.on = false; this.voice = null;
    if (this.ok) {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this.voice = vs.find((v) => /zh[-_]TW/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
      };
      pick(); speechSynthesis.addEventListener?.('voiceschanged', pick);
    }
  }
  get available() { return this.ok; }
  say(text, { rate = 1 } = {}) {
    if (!this.on || !this.ok || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text).replace(/_{2,}|＿+/g, '空格').replace(/[○〇]/g, '圈').replace(/×/g, '叉'));
      u.lang = this.voice?.lang || 'zh-TW'; if (this.voice) u.voice = this.voice; u.rate = rate;
      speechSynthesis.speak(u);
    } catch {}
  }
  stop() { if (this.ok) try { speechSynthesis.cancel(); } catch {} }
}
