// 道場的「跟著示範做、系統打分」流程（不需要 GPU，可以在 node 裡測）。
//
// 一場＝幾個段落：準備（場地與距離檢查）→ 馬步 → 出拳打沙包 → 馬步沖拳打木樁 →（實驗：提膝）→ 收勢。
// 每段都可以在選單關掉，也可以在遊戲中「跳過」；跳過的段落不算分，也不扣分。
// 沙包、木樁的反應只是回饋：出拳只看「時機」和「哪一隻手」，不做碰撞判定。
import { stanceFeedback } from '../../packages/taikan-kit/martial/feedback.js';

export const DIFFICULTY = {
  easy: {
    label: '🌱 輕鬆', note: '高馬步（膝蓋微彎就好）、出拳慢、時間短。第一次玩、或想降低強度請選這個。',
    stance: { hold: 8, limit: 25, target: 0.25 }, punch: { n: 8, gap: 1.9 }, combo: { n: 6, gap: 2.1, target: 0.2 }, knee: { n: 4, gap: 2.6 },
  },
  normal: {
    label: '🥋 標準', note: '中馬步、一般速度。',
    stance: { hold: 12, limit: 30, target: 0.4 }, punch: { n: 12, gap: 1.5 }, combo: { n: 10, gap: 1.7, target: 0.35 }, knee: { n: 6, gap: 2.2 },
  },
  hard: {
    label: '🔥 挑戰', note: '比較低的馬步、出拳比較快。大腿不用低於水平。',
    stance: { hold: 18, limit: 38, target: 0.55 }, punch: { n: 16, gap: 1.15 }, combo: { n: 12, gap: 1.35, target: 0.5 }, knee: { n: 8, gap: 1.8 },
  },
};

const LEAD = 2.4;          // 每段出拳前的準備時間（秒）：先看示範
export const LATENCY = 0.12; // 出拳事件比拳頭打到底晚約 0.1 秒（見 martial/README.md），判定時扣回來
const PERFECT = 0.25, GOOD = 0.5, LATE = 0.6;

// 依設定排出這一場的段落
export function buildSteps(diffKey, s = {}) {
  const D = DIFFICULTY[diffKey] || DIFFICULTY.easy;
  const seated = !!s.seated;
  const steps = [{ kind: 'ready', title: '準備', text: seated ? '坐在椅子前半，背挺直，上半身和雙手都要入鏡' : '站在白線後面，退到看得到全身（約 2.5～3 公尺）' }];
  if (!s.noStance) {
    steps.push(seated
      ? { kind: 'stance', seated: true, title: '坐姿馬步', text: '坐在椅子前半、兩腳張開、背挺直、雙拳收在腰間', hold: D.stance.hold, limit: D.stance.limit, target: 0 }
      : { kind: 'stance', title: '馬步', text: '兩腳張開約兩倍肩寬，膝蓋往外、慢慢蹲低，上身挺直', ...D.stance });
  }
  if (!s.noPunch) {
    steps.push({ kind: 'punch', prop: 'bag', title: '出拳：打沙包', text: '跟著示範，拳頭從腰間往前打出去，再收回腰間', ...D.punch });
    const stanceToo = !s.noStance && !seated;
    steps.push({ kind: 'punch', prop: 'dummy', title: stanceToo ? '馬步沖拳：打木樁' : '沖拳：打木樁', text: stanceToo ? '蹲著馬步，一邊出拳' : '跟著示範，左右輪流出拳', stance: stanceToo, ...D.combo });
  }
  if (s.knee && !seated) steps.push({ kind: 'knee', title: '提膝（實驗）', text: '扶著椅背也可以：膝蓋往上抬到腰的高度，再慢慢放下', ...D.knee });
  steps.push({ kind: 'cooldown', title: '收勢', text: '雙腳併攏站好（或坐好），雙手放下，慢慢吸氣、吐氣', hold: 4 });
  for (const st of steps) {
    if (st.kind === 'punch' || st.kind === 'knee') {
      st.cues = Array.from({ length: st.n }, (_, i) => ({ at: LEAD + i * st.gap, side: i % 2 ? 'right' : 'left', grade: null }));
      st.limit = LEAD + st.n * st.gap + 1;
    }
  }
  return steps;
}

export class Routine {
  constructor(diffKey, settings = {}) {
    this.settings = settings;
    this.steps = buildSteps(diffKey, settings);
    this.i = 0; this.t = 0;
    this.enter();
  }
  get step() { return this.steps[this.i]; }
  get done() { return this.i >= this.steps.length; }

  enter() {
    const s = this.step;
    if (!s) return;
    this.t = 0;
    Object.assign(s, { good: 0, okSince: null, fb: null, fbAt: -1, stanceHits: 0, started: true, skipped: false });
  }
  next(out) {
    this.i++;
    this.enter();
    if (!this.done) out.push({ step: this.step, text: this.step.title, cue: 'step' });
    return out;
  }
  skip() {
    const s = this.step;
    if (!s || s.kind === 'cooldown') return this.next([]);
    s.skipped = true;
    return this.next([{ text: '已跳過', kind: '' }]);
  }

  // inp：{ seen, fullBody, stance, calibrate() }
  update(dt, inp) {
    const out = [];
    const s = this.step;
    if (!s) return out;
    this.t += dt;
    const fb = (r) => { if (!s.fb || r.key !== s.fb.key && this.t - s.fbAt > 0.6) { s.fb = r; s.fbAt = this.t; } };
    if (s.kind === 'ready') {
      const ok = this.settings.seated ? inp.seen : inp.fullBody && !inp.tooClose;
      fb(ok ? { key: 'ok', text: this.settings.seated ? '很好！坐好不要動' : '很好！站在原地不要動', good: true } : { key: 'wait', text: inp.hint || s.text, good: false });
      if (ok) s.okSince ??= this.t; else s.okSince = null;
      if (s.okSince !== null && this.t - s.okSince > 1.5) { inp.calibrate?.(); return this.next(out); }
    } else if (s.kind === 'stance') {
      const r = stanceFeedback(inp.stance, { target: s.target, seated: s.seated, fullBody: inp.fullBody });
      fb(r);
      if (r.good) s.good += dt;
      if (s.good >= s.hold || this.t >= s.limit) {
        out.push(s.good >= s.hold ? { text: '馬步完成！', kind: 'good', cue: 'perfect' } : { text: '時間到', kind: '' });
        return this.next(out);
      }
    } else if (s.kind === 'punch' || s.kind === 'knee') {
      if (s.stance) {
        const r = stanceFeedback(inp.stance, { target: s.target, fullBody: inp.fullBody });
        fb(r);
        s.stanceOk = r.good;
      }
      for (const c of s.cues) {
        if (!c.grade && this.t > c.at + LATE) { c.grade = 'miss'; out.push({ text: '錯過', kind: 'bad', cue: 'miss' }); }
      }
      if (this.t >= s.limit) return this.next(out);
    } else if (s.kind === 'cooldown') {
      if (this.t >= s.hold) return this.next(out);
    }
    return out;
  }

  // 出拳／提膝事件（e.side）→ 判定最接近的提示
  hit(type, side) {
    const s = this.step;
    if (!s || s.kind !== (type === 'punch' ? 'punch' : 'knee')) return null;
    const t = this.t - LATENCY;
    let best = null;
    for (const c of s.cues) {
      if (c.grade) continue;
      const d = Math.abs(t - c.at);
      if (d <= GOOD && (!best || d < Math.abs(t - best.at))) best = c;
    }
    if (!best) return { grade: 'free', text: '' };
    const d = Math.abs(t - best.at);
    if (side !== best.side) best.grade = 'side';
    else best.grade = d <= PERFECT ? 'perfect' : 'good';
    if (s.stance && s.stanceOk) s.stanceHits++;
    const text = { perfect: '漂亮！', good: '好！', side: '換另一隻手！' }[best.grade];
    return { grade: best.grade, text: text + (s.stance && s.stanceOk && best.grade !== 'side' ? ' 馬步穩！' : ''), kind: best.grade === 'side' ? 'bad' : 'good' };
  }

  // 每段的分數 0~100；跳過的段落不算
  stepScore(s) {
    if (s.kind === 'stance') return Math.round(Math.min(s.good / s.hold, 1) * 100);
    if (s.kind === 'punch' || s.kind === 'knee') {
      const pts = { perfect: 100, good: 70, side: 30, miss: 0 };
      const hits = s.cues.reduce((a, c) => a + (pts[c.grade] ?? 0), 0) / s.cues.length;
      return Math.round(s.stance ? hits * 0.7 + (s.stanceHits / s.cues.length) * 100 * 0.3 : hits);
    }
    return null;
  }

  result() {
    const lines = [];
    let sum = 0, n = 0;
    for (const s of this.steps) {
      if (s.kind === 'ready' || s.kind === 'cooldown') continue;
      if (s.skipped || !s.started) { lines.push({ title: s.title, text: '跳過' }); continue; }
      const sc = this.stepScore(s);
      sum += sc; n++;
      let detail = '';
      if (s.cues) {
        const c = (g) => s.cues.filter((x) => x.grade === g).length;
        detail = `漂亮 ${c('perfect')}・好 ${c('good')}${c('side') ? `・換手 ${c('side')}` : ''}・錯過 ${c('miss')}`;
      } else if (s.kind === 'stance') detail = `做對 ${Math.round(s.good)} / ${s.hold} 秒`;
      lines.push({ title: s.title, score: sc, text: detail });
    }
    const score = n ? Math.round(sum / n) : 0;
    return { score, stars: n === 0 ? 1 : score >= 80 ? 3 : score >= 55 ? 2 : 1, lines };
  }

  // 示範人偶這一段要做什麼：{ wide, depth, seated, actions: [[段落時間, 'punch-left'], ...] }
  demoPlan() {
    const s = this.step;
    const seated = !!this.settings.seated;
    if (!s) return { wide: false, depth: 0, seated, actions: [] };
    const stance = s.kind === 'stance' && !s.seated ? s.target + 0.1 : s.stance ? s.target + 0.1 : 0;
    // 拳頭約在動作開始後 0.14 秒打到底：提前這麼多開始，讓示範剛好在拍子上打到
    const actions = (s.cues || []).map((c) => [c.at - (s.kind === 'knee' ? 0.3 : 0.14), `${s.kind === 'knee' ? 'knee' : 'punch'}-${c.side}`]);
    return { wide: stance > 0, depth: stance, seated, actions };
  }

  // 下一個還沒判定的提示（畫面上的節拍圈用）
  upcoming() { return this.step?.cues?.find((c) => !c.grade && c.at > this.t - LATE) || null; }
}
