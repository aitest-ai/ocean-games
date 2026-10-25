// 一次訓練的固定結構：暖身 → 主訓練（幾組、組間休息倒數）→ 收操。純邏輯（可以在 node 測試）。
//
// 規則：
// - 暖身與收操**不能跳過**（沒有跳過的方法）；用鏡頭時要「看得到人」才會倒數。
// - 每一組做到預定次數就結束；做不完可以按「結束這組」（不強迫，安全第一）。
// - 組間休息至少 REST_MIN_SEC 秒才能按「準備好了」，也可以「多休息 15 秒」。
// - 整次訓練超過 SESSION_CAP_MIN 分鐘：剩下的組取消，直接進收操。
// - 隨時可以「不舒服，停止」：立刻結束，不扣任何東西。
import { WARMUP, COOLDOWN, SKILLS, SESSION_CAP_MIN, REST_MIN_SEC, repsFor } from './levels.js';
import { EXERCISES } from '../../packages/taikan-kit/src/exercise/exercises.js';

export function buildSteps(level, { diff = 'normal' } = {}) {
  const steps = WARMUP.map((m) => ({ type: 'warmup', ...m }));
  level.sets.forEach(([ex, n], i) => {
    if (i > 0) steps.push({ type: 'rest', sec: level.rest });
    steps.push({ type: 'set', exercise: ex, reps: repsFor(n, diff), perSide: !!EXERCISES[ex].perSide, skill: SKILLS[ex], set: i + 1, sets: level.sets.length });
  });
  for (const m of COOLDOWN) steps.push({ type: 'cooldown', ...m });
  return steps;
}

export class Session {
  constructor(level, { diff = 'normal', capMin = SESSION_CAP_MIN, emit = () => {} } = {}) {
    this.level = level; this.diff = diff; this.emit = emit;
    this.steps = buildSteps(level, { diff });
    this.capSec = capMin * 60;
    this.i = -1; this.elapsed = 0; this.total = 0;
    this.done = false; this.stopped = false; this.capped = false;
    this.reps = {}; this.good = {}; this.qual = []; this.checkOk = {}; this.maxCombo = {};
    this.setResults = [];
    this.warmupDone = false; this.cooldownDone = false;
    this.next();
  }

  get step() { return this.steps[this.i]; }
  get phase() { const s = this.step; return !s ? 'done' : s.type === 'set' || s.type === 'rest' ? 'main' : s.type; }
  plannedReps() { return this.steps.filter((s) => s.type === 'set').reduce((a, s) => a + s.reps * (s.perSide ? 2 : 1), 0); }

  next() {
    const prev = this.step;
    if (prev) this.emit({ type: 'stepEnd', step: prev, index: this.i });
    if (prev?.type === 'warmup' && this.steps[this.i + 1]?.type !== 'warmup') this.warmupDone = true;
    this.i++;
    this.elapsed = 0;
    this.setReps = { total: 0, left: 0, right: 0 };
    if (this.i >= this.steps.length) {
      this.cooldownDone = true; this.done = true;
      this.emit({ type: 'complete', summary: this.summary() });
      return;
    }
    this.emit({ type: 'stepStart', step: this.step, index: this.i });
  }

  // 每一格：dt 秒；present = 鏡頭看得到人（鍵盤模擬一律 true）
  tick(dt, { present = true } = {}) {
    if (this.done) return;
    this.total += dt;
    const s = this.step;
    if (s.type === 'warmup' || s.type === 'cooldown') {
      if (present) this.elapsed += dt;
      if (this.elapsed >= s.sec) this.next();
    } else if (s.type === 'rest') {
      this.elapsed += dt;
      if (this.elapsed >= s.sec) this.next();
    } else if (s.type === 'set') {
      this.elapsed += dt;
    }
    // 時間上限：主訓練還沒做完就直接進收操
    if (!this.capped && this.total > this.capSec && (this.step?.type === 'set' || this.step?.type === 'rest')) {
      this.capped = true;
      this.emit({ type: 'timeCap' });
      while (this.step && this.step.type !== 'cooldown') { if (this.step.type === 'set') this.endSetRecord(true); this.i++; }
      this.i--; this.next();
    }
  }

  // 動作分析器的 rep 事件（只在「組」進行中有效）
  rep(e) {
    const s = this.step;
    if (this.done || !s || s.type !== 'set' || e.exercise !== s.exercise) return false;
    const ex = s.exercise;
    this.setReps.total++;
    if (e.side) this.setReps[e.side]++;
    this.reps[ex] = (this.reps[ex] || 0) + 1;
    if (e.good) this.good[ex] = (this.good[ex] || 0) + 1;
    if (e.quality != null) this.qual.push(e.quality);
    const ok = (this.checkOk[ex] ||= {});
    for (const r of e.results || []) if (r.ok && r.conf >= 0.5) ok[r.code] = (ok[r.code] || 0) + 1;
    const doneSet = s.perSide ? this.setReps.left >= s.reps && this.setReps.right >= s.reps : this.setReps.total >= s.reps;
    if (doneSet) { this.endSetRecord(false); this.emit({ type: 'setComplete', step: s }); this.next(); }
    return true;
  }

  combo(ex, n) { this.maxCombo[ex] = Math.max(this.maxCombo[ex] || 0, n); }

  endSetRecord(partial) {
    this.setResults.push({ exercise: this.step.exercise, planned: this.step.reps, done: this.setReps.total, partial });
  }

  // 「結束這組」：做不完不勉強
  endSet() { if (this.step?.type === 'set') { this.endSetRecord(true); this.next(); } }
  canSkipRest() { return this.step?.type === 'rest' && this.elapsed >= REST_MIN_SEC; }
  skipRest() { if (this.canSkipRest()) { this.next(); return true; } return false; }
  extendRest(sec = 15) { if (this.step?.type === 'rest') this.steps[this.i] = { ...this.step, sec: this.step.sec + sec }; }
  // 暖身、收操沒有跳過的方法；不舒服就整個停止
  stop() { if (this.done) return; this.stopped = true; this.done = true; this.emit({ type: 'stopped', summary: this.summary() }); }

  summary() {
    const q = this.qual;
    const avg = q.length ? q.reduce((a, b) => a + b, 0) / q.length : null;
    return {
      levelId: this.level.id, diff: this.diff, completed: this.done && !this.stopped, stopped: this.stopped, capped: this.capped,
      warmupDone: this.warmupDone, cooldownDone: this.cooldownDone && !this.stopped,
      durationSec: Math.round(this.total), reps: { ...this.reps }, good: { ...this.good }, avgQuality: avg, checkOk: JSON.parse(JSON.stringify(this.checkOk)),
      maxCombo: { ...this.maxCombo }, sets: [...this.setResults], planned: this.plannedReps(),
    };
  }
}
