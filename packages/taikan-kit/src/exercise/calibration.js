// 個人校正（概念參考打擊練習的「揮棒測試」：先量你、再依你調整）
//
// 第 1 步「站直量基準」：面向鏡頭、全身入鏡、雙手放下、不動 2 秒 → 量身體比例（軀幹長、肩寬、
//   髖到腳踝的高度、兩腳距離、手機有沒有放歪）。之後「蹲多低、腳張多開、身體歪多少」都和這個比，
//   所以高矮胖瘦、離鏡頭遠近都不影響。
// 第 2 步「舒服的幅度」（深蹲、側抬腿才有）：用很低的門檻做幾下，記下你每一下最深（最高）到哪裡，
//   取中位數的九成當作你的「個人目標」。算一下的門檻 = 個人目標的六成。
//   → 柔軟度比較差、膝蓋不舒服的人也能被正常計次；不會被「標準深度」卡住而一直沒算到。
import { PoseSmoother, measure } from './features.js';
import { ExerciseAnalyzer, standBaseline } from './analyzer.js';
import { EXERCISES } from './exercises.js';

const STAND_MS = 2000;
const ROM_TIMEOUT_MS = 40000;

export class Calibrator {
  constructor({ exercise = 'squat', aspect = 0.75, rom = true, emit = () => {} } = {}) {
    this.def = typeof exercise === 'string' ? EXERCISES[exercise] : exercise;
    this.aspect = aspect;
    this.emit = emit;
    this.wantRom = rom && !!this.def.calib;
    this.smoother = new PoseSmoother();
    this.phase = 'stand';
    this.stillSince = null; this.hist = [];
    this.peaks = []; this.romStart = null;
    this.result = null;
    this.msg = '請站到鏡頭前面';
    this.progress = 0;
  }

  feed(pose, { aspect } = {}) {
    if (this.phase === 'done') return this.state();
    const t = pose?.t ?? 0;
    if (this.phase === 'stand') this.feedStand(pose, aspect ?? pose?.aspect ?? this.aspect, t);
    else if (this.phase === 'rom') this.feedRom(pose, aspect, t);
    return this.state();
  }

  state() { return { phase: this.phase, msg: this.msg, progress: this.progress, result: this.result, peaks: [...this.peaks] }; }

  say(msg) { if (msg !== this.msg) { this.msg = msg; this.emit({ type: 'calib', phase: this.phase, msg }); } }

  feedStand(pose, aspect, t) {
    if (!pose) { this.stillSince = null; this.progress = 0; this.say('看不到你，請站到鏡頭前面'); return; }
    const p = this.smoother.feed(pose, aspect);
    const f = measure(p, null);
    const need = ['nose', 'leftShoulder', 'rightShoulder', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];
    const v = Math.min(...need.map((n) => p[n]?.v ?? 0));
    this.hist.push({ t, S: f.S, H: f.Hm });
    while (this.hist.length > 2 && t - this.hist[0].t > 800) this.hist.shift();
    let move = 0;
    for (const h of this.hist) if (h.S && f.S) move = Math.max(move, Math.hypot(h.S.x - f.S.x, h.S.y - f.S.y) / (f.T || 0.1), Math.hypot(h.H.x - f.Hm.x, h.H.y - f.Hm.y) / (f.T || 0.1));
    let problem = null;
    if (pose.others > 0) problem = '畫面裡有兩個人，請只留一位';
    else if (v < 0.55 || f.top < 0 || f.bottom > 0.99) problem = (p.leftAnkle?.v ?? 0) < 0.55 || f.bottom > 0.99 ? '從頭到腳都要入鏡：請往後退，或把手機放低、放遠' : '頭要在畫面裡：請往後退一點';
    else if (f.bottom - f.top < 0.32) problem = '離太遠了，請往前一點';
    else if (f.widthRatio < 0.45) problem = '請先面向鏡頭站好（量完再轉身）';
    else if (Math.max(f.armL ?? 0, f.armR ?? 0) > 40) problem = '雙手自然放在身體兩側';
    else if (move > 0.05) problem = '站穩、先不要動';
    if (problem) { this.stillSince = null; this.progress = 0; this.say(problem); return; }
    this.stillSince ??= t;
    this.progress = Math.min((t - this.stillSince) / STAND_MS, 1);
    this.say('很好，保持不動…');
    if (this.progress >= 1) {
      this.baseline = standBaseline(f);
      this.emit({ type: 'baseline', baseline: this.baseline, time: t });
      if (this.wantRom) this.startRom(t);
      else this.finish(t, false);
    }
  }

  startRom(t) {
    this.phase = 'rom';
    this.progress = 0;
    const c = this.def.calib;
    // 用很低的門檻：做到 minCount 就算，記下每一下最深到哪
    this.analyzer = new ExerciseAnalyzer({
      exercise: this.def, base: this.baseline, profile: { targets: { [c.key]: c.minCount / 0.6 } }, aspect: this.aspect,
      emit: (e) => {
        if (e.type === 'rep') {
          const peak = e.amount;
          this.peaks.push({ value: peak, side: e.side });
          this.progress = this.peaks.length / this.romReps();
          this.say(`第 ${this.peaks.length} 下：${c.show(peak)}${this.peaks.length < this.romReps() ? '，繼續' : ''}`);
          if (this.peaks.length >= this.romReps()) this.finish(e.time, true);
        } else if (e.type === 'status' && e.code !== 'ok') this.say(e.text);
      },
    });
    this.romStart = t;
    this.say(c.prompt);
  }

  romReps() { return this.def.calib.reps * (this.def.perSide ? 2 : 1); }

  feedRom(pose, aspect, t) {
    this.analyzer.feed(pose, { aspect });
    if (this.phase === 'rom' && t - this.romStart > ROM_TIMEOUT_MS) this.finish(t, this.peaks.length >= 2);
  }

  finish(t, measured) {
    const c = this.def.calib;
    let target = c ? c.def : null, used = 'default';
    if (c && measured && this.peaks.length >= 2) {
      const v = this.peaks.map((p) => p.value).sort((a, b) => a - b);
      const med = v[Math.floor(v.length / 2)];
      target = Math.min(Math.max(med * 0.9, c.min), c.max);
      used = 'measured';
    }
    this.phase = 'done';
    this.progress = 1;
    this.result = { baseline: this.baseline, target, targetKey: c?.key ?? null, used, peaks: this.peaks.map((p) => p.value) };
    this.say(c ? (used === 'measured' ? `校正完成！你的舒服幅度：${c.show(target)}` : `沒有量到足夠的動作，先用預設值 ${c.show(target)}，之後可以重新校正`) : '校正完成！');
    this.emit({ type: 'calibrated', ...this.result, time: t });
  }
}
