// 飛行任務的規則（純邏輯，可以在 node 測試）：起飛（階段二）；之後的降落、起降連飛也放這裡。
//
// 起飛流程：起飛前檢查（認識幾個儀表，舉單手確認）→ 加油門（舉單手）→ 滑跑保持在中心線
//   → 到抬頭速度時雙手抬高 → 離地 → 爬升（收襟翼）→ 到達指定高度。
// 失敗都很溫和：偏出跑道、跑道不夠 → 收油門停下來，再試一次；失速 → 警告，必要時電腦幫忙把機頭放低。
import { FlightModel, TRAINER_FDM, FDM_ASSIST } from './fdm.js';
import { RUNWAY, rwyFrame, hdgErr } from './runway.js';
import { FT } from './state.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

// 起飛前檢查會介紹的儀表（id 對應駕駛艙的儀表）
export const CHECKS = {
  asi: { inst: 'asi', title: '空速表', text: '飛機在空氣裡跑多快（單位：節，1 節 ≈ 每小時 1.85 公里）。<b>到 55 節</b>才可以抬頭。' },
  ai: { inst: 'ai', title: '姿態儀', text: '藍色是天空、咖啡色是地面，中間橘色的小飛機就是你。機頭抬起來，藍色會變少。' },
  alt: { inst: 'alt', title: '高度表', text: '長針轉一圈 = 1000 呎（約 300 公尺）。這次要爬到 <b>{target} 呎</b>。' },
  tach: { inst: 'tach', title: '轉速表', text: '發動機每分鐘轉幾圈。加油門後指針會跑到<b>綠色區</b>。' },
  fuel: { inst: 'fuelL', title: '油量表', text: '左右兩個油箱都有油（指針不在紅色區）✔' },
  vsi: { inst: 'vsi', title: '爬升率表', text: '指針往上 = 在爬升。離地後大約在 <b>5（每分鐘 500 呎）</b>附近。' },
};

export const FLIGHT_DIFF = {
  easy: { label: '簡單', note: '輔助最多：失速保護、電腦幫忙修方向與下降、降落時自動油門、提示最清楚。起飛爬到 500 呎。', assist: 'easy', targetFt: 500, checks: ['asi', 'ai', 'alt'], steerHelp: 0.55, autoRecover: true, hints: 2 },
  normal: { label: '普通', note: '起飛時飛機會往左偏，要自己修；降落起點偏一點，速度要用機頭控制。起飛爬到 700 呎。', assist: 'normal', targetFt: 700, checks: ['asi', 'ai', 'alt', 'tach'], steerHelp: 0.15, autoRecover: true, hints: 1 },
  hard: { label: '挑戰', note: '往左偏更明顯、沒有失速保護、降落有亂流、提示比較少。起飛爬到 1000 呎。', assist: 'hard', targetFt: 1000, checks: ['asi', 'ai', 'alt', 'tach', 'vsi', 'fuel'], steerHelp: 0, autoRecover: false, hints: 0 },
};

export const PHASE_LABEL = { check: '起飛前檢查', power: '加油門', roll: '滑跑', climb: '爬升', reset: '再試一次', done: '完成' };

export class TakeoffMission {
  constructor({ diff = 'normal', opts = {}, fdmParams = TRAINER_FDM, vr = 55, vy = 74 } = {}) {
    this.diffKey = diff; this.d = FLIGHT_DIFF[diff];
    this.opts = { tiltOnly: false, autoThrottle: false, skipChecks: false, ...opts };
    this.vr = vr; this.vy = vy;
    this.fdm = new FlightModel(fdmParams, FDM_ASSIST[this.d.assist]);
    this.targetFt = this.opts.targetFt ?? this.d.targetFt;
    this.checks = this.opts.skipChecks ? [] : this.d.checks.map((k) => ({ key: k, ...CHECKS[k], text: CHECKS[k].text.replace('{target}', this.targetFt) }));
    this.ctl = { lean: 0, pitch: 0, handsSeen: true };
    this.stats = { crossSum: 0, crossN: 0, maxCross: 0, rotateKt: null, early: false, climbIn: 0, climbN: 0, stalls: 0, recovers: 0, tailStrikes: 0, retries: 0, time: 0 };
    this.place();
    this.go(this.checks.length ? 'check' : 'power');
    this.checkI = 0;
    this.done = false;
  }

  place() {
    this.fdm.reset({ x: RUNWAY.startX, z: 0, heading: RUNWAY.heading, flaps: 10 });
    this.throttleCmd = 0; this.brake = 1; this.flapsCmd = 10;
  }

  go(p) { this.phase = p; this.phaseT = 0; this.said = {}; }
  once(key, ev, out) { if (this.said[key]) return; this.said[key] = true; out.push(ev); }

  input(c) { this.ctl = { ...this.ctl, ...c }; }

  // 舉單手（或按畫面上的確認）
  confirm() {
    if (this.phase === 'check') { this.checkI++; this.phaseT = 0; if (this.checkI >= this.checks.length) this.go('power'); return true; }
    if (this.phase === 'power' && this.throttleCmd < 1) { this.throttleCmd = 1; this.brake = 0; this.go('roll'); return true; }
    return false;
  }

  get agl() { return this.fdm.y * FT; }
  get frame() { return rwyFrame(this.fdm.x, this.fdm.z); }

  step(dt) {
    const out = [], f = this.fdm, d = this.d;
    this.phaseT += dt; this.stats.time += dt;
    let elev = this.opts.tiltOnly ? 0 : this.ctl.pitch, ail = this.ctl.lean;
    const fr = this.frame, he = hdgErr(f.heading), kt = f.kt;

    if (this.phase === 'check') {
      elev = 0; ail = 0;
      if (this.phaseT > 9) this.confirm(); // 沒有確認也會自己往下走，不會卡住
    } else if (this.phase === 'power') {
      elev = 0; ail = 0;
      if (this.opts.autoThrottle && this.phaseT > 2) this.confirm();
      if (this.phaseT > 12) this.confirm();
    } else if (this.phase === 'roll') {
      // 簡單模式：自動幫忙往中心線修一部分
      ail = clamp(ail + d.steerHelp * clamp(-fr.cross / 5 - he / 8, -1, 1), -1, 1);
      if (kt > 15) { this.stats.crossSum += Math.abs(fr.cross) * dt; this.stats.crossN += dt; this.stats.maxCross = Math.max(this.stats.maxCross, Math.abs(fr.cross)); }
      if (this.opts.tiltOnly && kt >= this.vr) elev = f.trim < 9 ? 1 : 0;
      // 簡單模式：超過抬頭速度 8 節還沒抬頭，電腦幫忙（手不方便的同學也能起飛）
      if (this.diffKey === 'easy' && kt >= this.vr + 8 && f.trim < 9) { elev = 1; this.stats.autoRot = true; this.once('autorot', { text: '電腦幫你抬頭了！下次到 55 節時雙手抬高', kind: '' }, out); }
      if (f.trim > 3 && this.stats.rotateKt === null) this.stats.rotateKt = kt;
      if (!this.opts.tiltOnly && this.ctl.pitch > 0.3 && kt < this.vr - 8 && kt > 15) { this.stats.early = true; this.once('early', { text: '太早了！速度還不夠，機頭抬不起來', kind: 'bad' }, out); }
      if (kt >= this.vr) this.once('vr', { text: this.opts.tiltOnly ? '抬頭速度！電腦幫你抬頭' : '55 節！雙手抬高，抬頭！', kind: 'good', cue: 'pass' }, out);
      if (d.hints && Math.abs(fr.cross) > 3 && this.phaseT > 2) this.once('side' + Math.sign(fr.cross) + Math.floor(this.phaseT / 4), { text: fr.cross > 0 ? '偏右了 → 身體往左傾一點' : '偏左了 → 身體往右傾一點', kind: '' }, out);
      if (f.tailStrike) { this.stats.tailStrikes++; this.once('tail', { text: '機頭抬太高，機尾擦到地了！', kind: 'bad', cue: 'bump' }, out); }
      // 偏出跑道、或跑道快用完還沒離地 → 溫和地停下來再試一次
      if (Math.abs(fr.cross) > RUNWAY.width / 2 - 1) return this.retry('偏出跑道了！收油門，再試一次', out);
      if (fr.along > RUNWAY.length - 40 && f.onGround) return this.retry('跑道快用完了，收油門停下來，再試一次', out);
    } else if (this.phase === 'climb') {
      if (this.opts.tiltOnly) { const want = kt > this.vy + 5 ? 10 : kt < this.vy - 8 ? 6 : 8; elev = clamp((want - f.trim) / 3, -1, 1); }
      const agl = this.agl;
      if (agl > 200 && this.flapsCmd > 0) { this.flapsCmd = 0; out.push({ text: '200 呎：收襟翼（電腦幫你收）', kind: '', cue: 'tick' }); }
      if (agl > 120) this.once('gear', { text: '這架教練機的起落架是固定的，不用收', kind: '' }, out);
      if (agl > 60) { this.stats.climbN += dt; if (kt >= 62 && kt <= 90 && Math.abs(he) < 20) this.stats.climbIn += dt; }
      if (d.hints && kt < 62 && this.phaseT > 4) this.once('slow' + Math.floor(this.phaseT / 5), { text: '速度太慢 → 雙手放低一點（機頭往下）', kind: 'bad' }, out);
      if (d.hints && kt > 92) this.once('fast' + Math.floor(this.phaseT / 5), { text: '速度太快 → 雙手抬高一點', kind: '' }, out);
      if (d.hints > 1 && this.phaseT > 3 && Math.abs(he) > 15) this.once('hdg' + Math.floor(this.phaseT / 5), { text: he > 0 ? '往右偏了 → 往左傾' : '往左偏了 → 往右傾', kind: '' }, out);
      // 失速：先警告；持續 1.5 秒（或太低）電腦幫你把機頭放低
      if (f.stall) {
        this.stallT = (this.stallT || 0) + dt;
        if (d.autoRecover || agl < 150) if (this.stallT > 1.5) { f.trim = Math.min(f.trim, f.gamma * 180 / Math.PI + 4); this.stats.recovers++; this.stallT = 0; out.push({ text: '電腦幫你把機頭放低，速度回來了', kind: '' }); }
      } else this.stallT = 0;
      if (agl >= this.targetFt) { this.throttleCmd = 0.75; this.go('done'); this.done = true; out.push({ text: `到達 ${this.targetFt} 呎！起飛成功`, kind: 'good', cue: 'finish' }); }
    } else if (this.phase === 'reset') {
      elev = 0; ail = 0; this.throttleCmd = 0; this.brake = 1;
      if (this.phaseT > 2.5 && f.kt < 3) { this.place(); this.go('power'); }
      if (this.phaseT > 8) { this.place(); this.go('power'); }
    }

    // 不讓飛機在地面上抬頭超過擦機尾的角度太多（簡單模式）
    const evs = f.step(dt, { elev, ail, throttle: this.throttleCmd, flaps: this.flapsCmd, brake: this.brake });
    for (const e of evs) {
      if (e.type === 'liftoff') { this.go('climb'); this.liftoffKt = e.kt; out.push({ text: '離地了！手回到胸前，保持機頭角度', kind: 'good', cue: 'pass' }); }
      if (e.type === 'stallWarn') { this.stats.stalls++; out.push({ text: '失速警告！雙手放低，讓機頭往下', kind: 'bad', cue: 'stall' }); }
      if (e.type === 'touchdown' && this.phase === 'climb') { this.go('roll'); this.said.vr = true; out.push({ text: '又落回跑道了，再抬一次頭', kind: 'bad' }); }
    }
    return out;
  }

  retry(text, out) {
    this.stats.retries++;
    this.go('reset');
    out.push({ text, kind: 'bad', cue: 'bump' });
    return out;
  }

  // 目前要顯示的大字指示
  get prompt() {
    const f = this.fdm, kt = f.kt;
    switch (this.phase) {
      case 'check': { const c = this.checks[this.checkI]; return c ? { title: `起飛前檢查 ${this.checkI + 1}/${this.checks.length}：${c.title}`, sub: c.text + '<br><small>看懂了就<b>舉單手</b>（或按 Q／E）</small>', inst: c.inst } : null; }
      case 'power': return { title: '襟翼 10°、煞車放開，準備起飛', sub: this.opts.autoThrottle ? '電腦幫你推油門…' : '<b>舉單手</b>，把油門推到底！（或按 Q／E）', inst: 'tach' };
      case 'roll':
        if (kt < this.vr) return { title: `滑跑中：${Math.round(kt)} 節`, sub: '<b>身體左右傾</b>，讓飛機保持在跑道中間的白線上。到 <b>55 節</b>再抬頭', inst: 'asi' };
        return { title: this.opts.tiltOnly ? '抬頭！' : '抬頭！雙手抬高', sub: this.opts.tiltOnly ? '電腦幫你抬頭，你負責保持方向' : '雙手一起往上抬（到下巴），機頭抬到姿態儀上第一條線（約 10°）就放回胸前', inst: 'ai' };
      case 'climb': return { title: `爬升：${Math.round(this.agl)} / ${this.targetFt} 呎`, sub: this.opts.tiltOnly ? '電腦控制機頭，你用身體傾斜保持方向' : '保持空速 <b>65～85 節</b>：太慢就雙手放低一點、太快就抬高一點', inst: kt < 62 || kt > 90 ? 'asi' : 'alt' };
      case 'reset': return { title: '停下來，再試一次', sub: '', inst: null };
      case 'done': return { title: '起飛成功！', sub: '', inst: null };
      default: return null;
    }
  }

  // 評分：中心線、抬頭時機、爬升時速度與方向；扣分：擦機尾、失速、重來
  result() {
    const s = this.stats;
    const avgCross = s.crossN ? s.crossSum / s.crossN : 0;
    const center = clamp(100 - avgCross * 16, 0, 100);
    const rk = s.rotateKt ?? this.vr;
    const rotate = this.opts.tiltOnly ? 100 : s.autoRot ? 40 : clamp(100 - Math.max(this.vr - 2 - rk, 0) * 8 - Math.max(rk - (this.vr + 10), 0) * 5, 0, 100);
    const climb = s.climbN ? (s.climbIn / s.climbN) * 100 : 100;
    let score = Math.round(center * 0.4 + rotate * 0.25 + climb * 0.35 - s.tailStrikes * 10 - s.stalls * 8 - s.retries * 10);
    score = clamp(score, 0, 100);
    const stars = !this.done ? 0 : score >= 80 ? 3 : score >= 55 ? 2 : 1;
    return { score, stars, center: Math.round(center), rotate: Math.round(rotate), climb: Math.round(climb), avgCross, ...s };
  }
}
