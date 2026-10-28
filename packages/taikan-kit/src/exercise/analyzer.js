// 動作分析器：一格一格吃 pose（從 kit.on('pose') 來的原始關節點），輸出
//   - 次數（rep 事件）、沒做到位的嘗試（partial）
//   - 姿勢檢查結果與溫和提示（hint 事件），每一項都附「這個視角下的可信度」
//   - 追蹤狀態（status 事件）：看不到腳、要轉成側面、離太遠……
//   - this.frame：這一格的所有量測值（給除錯畫面 ?debug 顯示）
//
//   const a = new ExerciseAnalyzer({ exercise: 'squat', profile, emit: (e) => ... });
//   kit.on('pose', (pose) => a.feed(pose, { aspect: video.videoWidth / video.videoHeight }));
//
// 不改 taikan-kit 的 recognizer.js：這個模組只讀 pose，自己算角度與狀態機。
import { PoseSmoother, measure, clamp, med3 } from './features.js';
import { RepCounter } from './counter.js';
import { EXERCISES, VIEW_NAMES } from './exercises.js';

export const GAP_MS = 600;       // 超過這麼久沒看到人：這一下作廢
const STILL_MS = 1000;
export const confLevel = (c) => (c >= 0.75 ? 'high' : c >= 0.5 ? 'mid' : c > 0.15 ? 'low' : 'none');
export const CONF_TEXT = { high: '高', mid: '中', low: '低', none: '這個角度看不到' };
export const HINT_MIN_CONF = 0.5; // 可信度「中」以上才提示

export const STATUS_TEXT = {
  ok: '',
  lost: '看不到你，請回到畫面中',
  crowd: '畫面裡有兩個人，請只留一位',
  cut: '身體超出畫面：請往後退一點，或把手機放遠、放低',
  noFeet: '看不到腳：請往後退一點，或把手機放低',
  noHands: '看不到雙手：手舉高時也要在畫面裡，請往後退一點',
  tooFar: '離鏡頭太遠了，請往前一點',
  wrongView: '',
  baseline: '請站直、雙手放下，不動 2 秒（量你站著的樣子）',
  notLying: '請趴好（或躺好），身體側面對著手機',
};

// 可見度 → 0～1（0.8 以上算清楚、0.4 以下算看不到）
const visFactor = (v) => clamp((v - 0.4) / 0.4, 0, 1);

export function viewFromYaw(yaw, prev) {
  // 遲滯：在界線附近不會一直切換
  const fa = prev === 'front' ? 37 : prev === 'angled' ? 27 : 32;
  const as = prev === 'side' ? 57 : prev === 'angled' ? 67 : 62;
  return yaw < fa ? 'front' : yaw > as ? 'side' : 'angled';
}

// 站直時的基準：之後所有「蹲多低、腳張多開、身體歪多少」都和它比
export function standBaseline(f) {
  const front = f.widthRatio != null && f.widthRatio > 0.45;
  // 不一定剛好正對鏡頭：用鼻子偏離肩膀中點的程度估計轉了幾度，換算回「正對時」的寬高比
  const turn = front && f.noseOff != null ? Math.atan(Math.abs(f.noseOff) / 0.26) : 0;
  return {
    view: front ? (turn < 0.3 ? 'front' : 'angled') : 'other',
    r0: front ? f.widthRatio / Math.cos(turn) : null,
    turnDeg: Math.round(turn * 180 / Math.PI),
    q0T: f.h && f.T ? f.h / f.T : null,
    q0S: front && f.h && f.swx ? f.h / f.swx : null,
    sw: front ? f.swx : null,
    trunk0: f.trunk ?? 0,
    // 腿的角度之後會扣掉手機歪斜（trunk0），基準也要用扣掉後的值
    legL0: (f.legL ?? 0) - (f.trunk ?? 0), legR0: (f.legR ?? 0) + (f.trunk ?? 0),
    spread0: f.spread ?? 0.75,
    shift0: front ? f.shift ?? 0 : 0,
    T: f.T, height: f.bottom != null && f.top != null ? f.bottom - f.top : null,
    kyL0: f.kyL ?? 0.85, kyR0: f.kyR ?? 0.85, hipY: f.Hm?.y ?? null, ankleY: f.A?.y ?? null,
  };
}

export class ExerciseAnalyzer {
  constructor({ exercise = 'squat', profile = {}, aspect = 0.75, base = null, emit = () => {}, autoBase = true } = {}) {
    this.emit = emit;
    this.aspect = aspect;
    this.profile = profile;
    this.autoBase = autoBase;
    this.smoother = new PoseSmoother();
    this.base = base ? { ...base } : null;
    this.view = { name: base?.view === 'front' ? 'front' : 'front', yaw: 0, cand: null, candSince: 0 };
    this.status = null;
    this.hist = [];
    this.mHist = [];
    this.lastGood = -1e9; this.lastT = 0; this.dt = 33;
    this.reps = { total: 0, left: 0, right: 0, partial: 0 };
    this.coach = { last: null, lastRep: -9, streak: {}, goodRun: 0, said: {} };
    this.setExercise(exercise);
  }

  setExercise(id) {
    this.def = typeof id === 'string' ? EXERCISES[id] : id;
    if (!this.def) throw new Error('沒有這個動作：' + id);
    const c = this.def.calib;
    this.target = c ? this.profile?.targets?.[c.key] ?? c.def : this.def.target ?? 1;
    this.hold = null;
    this.counter = new RepCounter(this.def.thresholds(this.target));
    this.acc = null;
    this.reps = { total: 0, left: 0, right: 0, partial: 0 };
    this.coach = { last: null, lastRep: -9, streak: {}, goodRun: 0, said: {} };
    this.lastResults = null;
    this.lastActive = -1e9; this.partialRun = 0;
  }

  setProfile(profile) { this.profile = profile; this.setExercise(this.def); }
  setBaseline(base) { this.base = base ? { ...base } : null; this.counter.interrupt(); }

  ctx() { return { base: this.base, view: this.view.name, target: this.target, def: this.def }; }

  setStatus(code, t, extra = '') {
    const text = code === 'baseline' && this.def.seated ? '請坐好、雙手放在大腿旁，不動 1 秒' : code === 'wrongView' ? `${this.def.name}要${VIEW_NAMES[this.def.bestView]}對著鏡頭才看得清楚，請${this.def.bestView === 'side' ? '轉成側身' : '轉向鏡頭'}` : (STATUS_TEXT[code] + extra);
    if (code === this.status) return;
    this.status = code;
    this.emit({ type: 'status', code, text, time: t });
  }

  // 有一格完全沒偵測到人（或沒有 pose）
  missing(t) {
    if (t - this.lastGood > GAP_MS) {
      this.setStatus('lost', t);
      if (this.counter.state !== 'top' || this.counter.armed) this.counter.interrupt();
      this.acc = null;
      this.hist = []; this.mHist = [];
      if (t - this.lastGood > 1500) this.smoother.reset();
    }
    this.frame = { ...(this.frame || {}), t, status: this.status, lost: true };
    return this.frame;
  }

  feed(pose, { aspect } = {}) {
    const t = pose?.t ?? this.lastT + 33;
    if (t > this.lastT) this.dt += (Math.min(t - this.lastT, 500) - this.dt) * 0.1;
    this.lastT = t;
    const kp = pose?.kp;
    const ok = (n) => kp?.[n] && kp[n].v >= 0.3;
    if (!kp || !(ok('leftShoulder') || ok('rightShoulder')) || !(ok('leftHip') || ok('rightHip'))) return this.missing(t);
    // 中斷太久：狀態機重來
    if (t - this.lastGood > GAP_MS) { this.counter.interrupt(); this.acc = null; this.hist = []; this.mHist = []; }
    this.lastGood = t;

    const asp = aspect ?? pose.aspect ?? this.aspect;
    const pts = this.smoother.feed(pose, asp);
    const f = measure(pts, this.base);
    const def = this.def;

    // 1. 站著不動嗎（肩膀、髖 1 秒內移動不到軀幹長的 6%，雙手放下）
    this.hist.push({ t, S: f.S, H: f.Hm });
    while (this.hist.length > 2 && t - this.hist[0].t > STILL_MS) this.hist.shift();
    const T = f.T || 0.1;
    let move = 0;
    for (const h of this.hist) move = Math.max(move, Math.hypot(h.S.x - f.S.x, h.S.y - f.S.y) / T, Math.hypot(h.H.x - f.Hm.x, h.H.y - f.Hm.y) / T);
    const still = this.hist.length > 3 && t - this.hist[0].t > STILL_MS * 0.8 && move < 0.06;

    // 2. 追蹤狀態
    const needVis = Math.min(...def.needs.map((g) => f.vis[g] ?? 0));
    let st = 'ok';
    if (pose.others > 0) st = 'crowd';
    else if (!def.lying && f.top != null && f.bottom != null && (f.top < -0.02 || f.bottom > 1.0) && needVis < 0.5) st = 'cut';
    else if (def.needs.includes('ankles') || def.needs.includes('nearLeg')) { if ((f.vis.nearLeg < 0.45 || f.vis.ankles < 0.3)) st = 'noFeet'; }
    if (st === 'ok' && def.needs.includes('wrists') && f.vis.wrists < 0.4) st = 'noHands';
    // 身體要是橫的；偶爾一兩格判斷錯不算（要持續 0.4 秒才當作「沒有趴好」）
    if (def.lying) { if (f.lying) this.notLyingSince = null; else this.notLyingSince ??= t; }
    if (st === 'ok' && def.lying && this.notLyingSince != null && (t - this.notLyingSince > 400 || this.counter.state === 'top') && !this.hold?.on) st = 'notLying';
    if (st === 'ok' && !def.lying && this.counter.state === 'top' && f.top != null && f.bottom != null && f.bottom - f.top < 0.32) st = 'tooFar';

    // 3. 基準（站直的樣子）：沒有校正過就等玩家站好不動自動量
    if (!this.base && st === 'ok' && !def.noBase) {
      const armsDown = Math.max(f.armL ?? 0, f.armR ?? 0) < 40;
      if (this.autoBase && still && armsDown) { this.base = standBaseline(f); this.counter.interrupt(); }
      else st = 'baseline';
    }

    // 4. 視角（玩家正面還是側面對鏡頭）：只在休息姿勢時更新（蹲下、前彎會讓比例暫時改變）
    if (f.widthRatio != null && (this.counter.state === 'top')) {
      const r0 = this.base?.r0 ?? 0.76;
      const yaw = Math.acos(clamp(f.widthRatio / r0, 0, 1)) * 180 / Math.PI;
      this.view.yaw += (yaw - this.view.yaw) * 0.3;
      const want = viewFromYaw(this.view.yaw, this.view.name);
      if (want !== this.view.name) {
        if (this.view.cand !== want) { this.view.cand = want; this.view.candSince = t; }
        else if (t - this.view.candSince > 400) { this.view.name = want; this.view.cand = null; this.emit({ type: 'view', view: want, yaw: Math.round(this.view.yaw), time: t }); }
      } else this.view.cand = null;
    }
    const viewRel = def.views[this.view.name] ?? 0;
    if (st === 'ok' && viewRel === 0) st = 'wrongView';
    this.setStatus(st, t);

    // 5. 次數
    const ctx = this.ctx();
    const counting = (this.base || def.noBase) && (st === 'ok' || st === 'tooFar');
    let m = null, ev = null;
    if (counting) {
      const raw = def.metric(f, ctx);
      if (raw != null && isFinite(raw)) {
        this.mHist.push(raw);
        if (this.mHist.length > 3) this.mHist.shift();
        m = this.mHist.length === 3 ? med3(...this.mHist) : raw;
        // 在休息姿勢、站著不動：慢慢更新基準
        if (this.counter.state === 'top' && !this.hold?.on && still && m < this.counter.start * 0.6 && this.base) {
          def.adapt?.(f, ctx);
          if (this.view.name === 'front' && f.swx && !this.base.sw) { this.base.sw = f.swx; this.base.r0 ??= f.widthRatio; }
        }
        if (def.hold) { this.holdStep(m, t, f, ctx); }
        else {
        const before = this.counter.state;
        ev = this.counter.step(m, t);
        if (before === 'top' && this.counter.state === 'moving') this.acc = { visSum: {}, n: 0, view: this.view.name, yaw: this.view.yaw, gaps: 0 };
        if (this.acc && this.counter.state !== 'top') this.trackFrame(f, m, ctx);
        if (ev) this.handleCounter(ev, t, ctx);
        if (this.counter.state === 'top' && !ev) this.acc = null;
        }
      }
    } else if (this.counter.state !== 'top' || this.counter.armed) {
      // 看不清楚的時候不能算：這一下作廢，要回到休息姿勢才重新開始
      this.counter.interrupt(); this.acc = null;
    }
    if (!counting && this.hold?.on) this.endHold(t, ctx);

    const countConf = viewRel * visFactor(needVis);
    this.frame = {
      t, status: st, still, f, m, view: this.view.name, yaw: Math.round(this.view.yaw), viewRel, countConf, countLevel: confLevel(countConf),
      state: this.counter.state, armed: this.counter.armed, stateMs: t - (this.counter.since ?? t), thresholds: { start: this.counter.start, count: this.counter.count, release: this.counter.release },
      target: this.target, reps: { ...this.reps }, fps: Math.round(1000 / Math.max(this.dt, 1)), base: this.base, pts,
    };
    return this.frame;
  }

  // 「維持」類動作（靠牆深蹲、棒式）：到位就每秒加一，離開姿勢（低於 release）才中斷
  holdStep(m, t, f, ctx) {
    const H = (this.hold ||= { on: false });
    const th = this.counter;
    if (!H.on) {
      if (m >= th.count) {
        Object.assign(H, { on: true, start: t, sec: 0, evalAt: t });
        this.acc = { visSum: {}, n: 0, view: this.view.name, yaw: this.view.yaw, gaps: 0 };
        this.counter.state = 'reached'; this.counter.since = t;
        this.emit({ type: 'holdStart', exercise: this.def.id, time: t });
      }
      return;
    }
    if (m < th.release) { this.endHold(t, ctx); return; }
    this.trackFrame(f, m, ctx);
    const sec = Math.floor((t - H.start) / 1000);
    while (H.sec < sec) {
      H.sec++; this.reps.total++;
      this.emit({ type: 'hold', exercise: this.def.id, seconds: H.sec, total: this.reps.total, reps: { ...this.reps }, time: t });
    }
    // 每 6 秒看一次姿勢，有需要就提示
    if (t - H.evalAt > 6000) { H.evalAt = t; this.holdCheck(t, ctx, false); this.acc = { visSum: {}, n: 0, view: this.view.name, yaw: this.view.yaw, gaps: 0 }; }
  }

  endHold(t, ctx) {
    const H = this.hold;
    if (!H?.on) return;
    H.on = false;
    this.counter.state = 'top'; this.counter.since = t;
    const r = this.holdCheck(t, ctx, true);
    this.emit({ type: 'holdEnd', exercise: this.def.id, seconds: H.sec, ms: t - H.start, quality: r.quality, results: r.results, time: t });
    this.acc = null;
  }

  holdCheck(t, ctx, final) {
    const results = this.evaluate({ durationMs: t - (this.hold?.start ?? t) }, 'rep', ctx);
    const usable = results.filter((x) => x.score != null && x.conf >= HINT_MIN_CONF);
    const wsum = usable.reduce((s, x) => s + x.weight, 0);
    const quality = wsum ? usable.reduce((s, x) => s + x.weight * x.score, 0) / wsum : null;
    this.lastResults = results;
    this.emit({ type: 'holdCheck', exercise: this.def.id, results, quality, final, time: t });
    if (!final) this.coachAfterRep(usable, t); // 結束時不再提示（玩家已經起來了）
    return { results, quality };
  }

  trackFrame(f, m, ctx) {
    const a = this.acc;
    a.n++;
    for (const [g, v] of Object.entries(f.vis)) a.visSum[g] = (a.visSum[g] ?? 0) + v;
    this.def.track(a, f, m, ctx);
  }

  // 每一項檢查：分數、可信度（視角 × 關節清楚程度）
  evaluate(r, kind, ctx) {
    const a = this.acc || { visSum: {}, n: 0 };
    const out = [];
    for (const c of this.def.checks) {
      if (kind === 'partial' && !(c.on || []).includes('partial')) continue;
      let vr = c.views[a.view ?? ctx.view] ?? 0;
      // 有些檢查只在「真的正對鏡頭」時可靠：轉了 yawLimit 的一半以上就開始降低可信度
      if (c.yawLimit) vr *= clamp((c.yawLimit - (a.yaw ?? this.view.yaw)) / (c.yawLimit / 2), 0, 1);
      const v = Math.min(...c.joints.map((g) => (a.n ? a.visSum[g] / a.n : 0)));
      const conf = vr * visFactor(v);
      let score = null;
      if (conf > 0) { try { score = c.score({ ...a, ...r }, ctx); } catch { score = null; } }
      const value = score == null ? '—' : c.value({ ...a, ...r }, ctx);
      out.push({ code: c.code, label: c.label, score, ok: score == null ? null : score >= 0.75, conf: +conf.toFixed(2), level: confLevel(conf), value, hint: c.hint, good: c.good, weight: c.weight });
    }
    return out;
  }

  handleCounter(ev, t, ctx) {
    if (ev.type === 'bounce') { this.say('bounce', '每一下都要先站直，再蹲下一下', 'tip', 1, t); return; }
    if (ev.type === 'noise') { this.acc = null; return; }
    const results = this.evaluate(ev, ev.type, ctx);
    const usable = results.filter((x) => x.score != null && x.conf >= HINT_MIN_CONF);
    const wsum = usable.reduce((s, x) => s + x.weight, 0);
    const quality = wsum ? usable.reduce((s, x) => s + x.weight * x.score, 0) / wsum : null;
    const side = this.acc?.side;
    this.lastResults = results;
    if (ev.type === 'partial') {
      this.reps.partial++;
      const miss = usable.find((x) => !x.ok);
      this.emit({ type: 'partial', exercise: this.def.id, results, side, time: t, start: ev.start, peak: ev.peak });
      // 只蹲一點點也可能只是彎腰撿東西：正在做動作（8 秒內算過一下）或連續兩次沒到位，才提示
      this.partialRun++;
      if (miss && (t - this.lastActive < 8000 || this.partialRun >= 2)) this.say(miss.code, `${miss.hint}（這下還沒算）`, 'tip', miss.conf, t, true);
      this.lastActive = t;
      this.acc = null;
      return;
    }
    this.reps.total++;
    this.partialRun = 0; this.lastActive = t;
    if (this.def.perSide && side) this.reps[side]++;
    const issues = usable.filter((x) => !x.ok).map((x) => x.code);
    const rep = {
      type: 'rep', exercise: this.def.id, n: this.reps.total, side, reps: { ...this.reps }, quality: quality == null ? null : +quality.toFixed(2),
      good: quality == null ? null : quality >= 0.75, results, issues, durationMs: Math.round(ev.durationMs), start: ev.start, end: ev.end, reachedAt: ev.reachedAt,
      peak: +ev.peak.toFixed(2), amount: ev.peak * ctx.target, view: this.acc?.view ?? ctx.view, time: t,
    };
    this.emit(rep);
    this.coachAfterRep(usable, t);
    this.acc = null;
  }

  // 溫和提示：一次只說一件事，同一件事不連續嘮叨；改善了就稱讚
  coachAfterRep(usable, t) {
    const C = this.coach, n = this.reps.total;
    const fails = usable.filter((x) => !x.ok);
    for (const x of usable) C.streak[x.code] = x.ok ? 0 : (C.streak[x.code] || 0) + 1;
    if (fails.length) {
      C.goodRun = 0;
      // 同一件事：隔 2 下以上才再說一次；連續 3 下都一樣，就算剛說過也再提醒
      // 同一件事說過 3 次以上：改成隔 4 下才說（不要嘮叨）
      const gap = (code) => ((C.said[code] || 0) >= 3 ? 4 : 2);
      const pick = fails.find((x) => x.code !== C.last || n - C.lastRep >= gap(x.code)) || null;
      if (pick) this.say(pick.code, pick.hint, 'tip', pick.conf, t);
      return;
    }
    C.goodRun++;
    if (C.last && C.last !== 'praise' && C.streak[C.last] === 0) {
      const fixed = usable.find((x) => x.code === C.last);
      this.say('praise', fixed?.good ? `${fixed.good}就是這樣！` : '很好，就是這樣！', 'praise', 1, t);
    } else if (C.goodRun % 5 === 0) this.say('praise', ['動作很標準！', '節奏很穩，保持下去', '做得好！'][(C.goodRun / 5) % 3 | 0], 'praise', 1, t);
  }

  say(code, text, kind, conf, t, partial = false) {
    const C = this.coach;
    C.last = code; C.lastRep = this.reps.total;
    C.said[code] = (C.said[code] || 0) + 1;
    this.emit({ type: 'hint', code, text, kind, conf: +conf.toFixed(2), level: confLevel(conf), partial, exercise: this.def.id, time: t });
  }

  // 目前這個視角下，每一項檢查的可信度（介面上的「姿勢檢查」清單用）
  checkList() {
    const f = this.frame?.f, view = this.view.name;
    return this.def.checks.map((c) => {
      let vr = c.views[view] ?? 0;
      if (c.yawLimit) vr *= clamp((c.yawLimit - this.view.yaw) / (c.yawLimit / 2), 0, 1);
      const v = f ? Math.min(...c.joints.map((g) => f.vis[g] ?? 0)) : 0;
      const conf = vr * visFactor(v);
      const last = this.lastResults?.find((x) => x.code === c.code);
      return { code: c.code, label: c.label, how: c.how, conf: +conf.toFixed(2), level: confLevel(conf), viewOnly: vr === 0, last };
    });
  }
}
