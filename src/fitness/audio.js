// 音效：全部用 Web Audio 即時合成（沒有任何錄音檔、沒有授權問題）。
// 瀏覽器規定要先有一次點擊才能出聲，所以在按「開始」時才建立 AudioContext。
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  async enable() {
    if (!this.on) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== 'running') await this.ctx.resume();
    } catch { this.ctx = null; }
  }

  tone(freq, { at = 0, dur = 0.18, type = 'sine', vol = 0.12, slide = 0 } = {}) {
    const c = this.ctx;
    if (!c || !this.on || c.state !== 'running') return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // 短促的「噪音打擊」（技能命中用）
  hit(vol = 0.18, at = 0) {
    const c = this.ctx;
    if (!c || !this.on || c.state !== 'running') return;
    const t = c.currentTime + at, n = Math.floor(c.sampleRate * 0.18);
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = vol;
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
  }

  play(kind) {
    switch (kind) {
      case 'rep': this.tone(660, { dur: 0.12 }); break;                         // 算一下
      case 'good': this.tone(784, { dur: 0.1 }); this.tone(1175, { at: 0.07, dur: 0.16 }); break; // 標準的一下
      case 'partial': this.tone(330, { dur: 0.14, type: 'triangle', vol: 0.06 }); break;
      case 'hint': this.tone(523, { dur: 0.22, vol: 0.06 }); break;
      case 'tick': this.tone(440, { dur: 0.1, vol: 0.08 }); break;
      case 'go': this.tone(880, { dur: 0.25 }); break;
      case 'done': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, { at: i * 0.11, dur: 0.35 })); break;
      case 'calib': this.tone(988, { dur: 0.12, vol: 0.08 }); break;
      case 'charge': this.tone(220, { dur: 0.25, type: 'triangle', vol: 0.05, slide: 1.8 }); break;
      case 'strike': this.hit(0.22); this.tone(180, { dur: 0.25, type: 'square', vol: 0.05, slide: 0.5 }); break;
      case 'combo': this.tone(1046, { dur: 0.08, vol: 0.07 }); this.tone(1318, { at: 0.05, dur: 0.12, vol: 0.07 }); break;
      case 'shield': this.tone(392, { dur: 0.5, type: 'sine', vol: 0.05 }); break;
      case 'win': [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, { at: i * 0.12, dur: 0.45, vol: 0.1 })); break;
      case 'rest': this.tone(392, { dur: 0.4, vol: 0.06 }); this.tone(330, { at: 0.25, dur: 0.5, vol: 0.06 }); break;
    }
  }
}
