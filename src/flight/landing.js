// 降落與起降連飛的規則（純邏輯，可以在 node 測試）。
//
// 降落：從跑道外 1.8 公里、約 350 呎的「最後進場」開始 → 用身體傾斜對準跑道、用雙手控制下降角度
//   （看 PAPI 燈：兩白兩紅 = 剛好）→ 50 呎以下收油門、拉平（雙手慢慢抬高）→ 接地 → 自動煞車、保持在中心線 → 停下來。
// 起降連飛：起飛到 500 呎 → 左轉 180°（回頭）→ 順風邊（快轉）→ 再左轉 180° 對準跑道 → 接上面的降落。
//
// 失敗都很溫和：進場不穩定（太高、太低、太快、太慢、沒對準）→ 「重飛」：電腦加滿油門、爬升，重新進場。不會墜毀。
// 評分：對準度（接地時離中心線多遠、機頭方向）、下降率（接地時每分鐘下降幾呎）、接地速度、接地位置，以及進場是否穩定。
import { FlightModel, TRAINER_FDM, FDM_ASSIST } from './fdm.js';
import { TakeoffMission, FLIGHT_DIFF } from './mission.js';
import { RUNWAY, rwyFrame, hdgErr } from './runway.js';
import { FT, KT } from './state.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const D = Math.PI / 180;
const herr = (hdg, target) => ((hdg - target + 540) % 360) - 180;

// 降落的難度設定（接在起飛的難度上）
export const LAND_DIFF = {
  easy: { offset: 0, hdgOff: 0, autoThrottle: true, steerHelp: 0.45, glideHelp: 0.35, turbulence: 0, unstableDeg: 2.5, autoGoAround: false },
  normal: { offset: 45, hdgOff: 4, autoThrottle: false, steerHelp: 0.1, glideHelp: 0, turbulence: 0, unstableDeg: 1.6, autoGoAround: true },
  hard: { offset: 90, hdgOff: 8, autoThrottle: false, steerHelp: 0, glideHelp: 0, turbulence: 1, unstableDeg: 1.3, autoGoAround: true },
};
export const LAND_LABEL = { turn1: '左轉回頭', downwind: '順風邊', turn2: '左轉對準跑道', final: '最後進場', flare: '拉平', rollout: '滑行減速', goaround: '重飛', done: '完成' };
export const APPROACH = { startDist: 1800, startKt: 68, throttle: 0.3, flaps: 30, vref: 62, maxGoArounds: 3 };

// 進場偏差：下滑角差（度，正 = 太高）與左右偏（度，正 = 飛機在中心線右邊）
export function approachDev(x, y, z, R = RUNWAY) {
  const f = rwyFrame(x, z, R);
  const dAim = R.aimFromThr - f.along;                       // 到瞄準點的水平距離
  const glide = Math.atan2(y, Math.max(dAim, 1)) / D - R.glide;
  const loc = Math.atan2(f.cross, Math.max(R.length - f.along, 1)) / D; // 以跑道另一端為中心的角度
  return { glide, loc, dAim, along: f.along, cross: f.cross };
}

export class LandingMission {
  // start：'final'（降落任務）或 'turn1'（起降連飛：起飛後接上來）
  constructor({ diff = 'normal', opts = {}, fdm = null, start = 'final', seed = 1 } = {}) {
    this.diffKey = diff; this.d = FLIGHT_DIFF[diff]; this.L = LAND_DIFF[diff];
    this.opts = { tiltOnly: false, ...opts };
    this.fdm = fdm || new FlightModel(TRAINER_FDM, FDM_ASSIST[this.d.assist]);
    this.ctl = { lean: 0, pitch: 0 };
    this.stats = { goArounds: 0, finalT: 0, stableT: 0, time: 0, td: null, hard: false, offRunway: false };
    this.seed = seed >>> 0 || 1;
    this.timeScale = 1;
    this.done = false; this.failed = false;
    if (start === 'final') this.toFinal(); else { this.throttleCmd = 0.75; this.flapsCmd = 0; this.go(start); }
  }

  rnd() { this.seed ^= this.seed << 13; this.seed ^= this.seed >>> 17; this.seed ^= this.seed << 5; return (this.seed >>> 0) / 4294967296; }
  go(p) { this.phase = p; this.phaseT = 0; this.said = {}; this.unstableT = 0; this.timeScale = 1; }
  once(key, ev, out) { if (this.said[key]) return; this.said[key] = true; out.push(ev); }
  input(c) { this.ctl = { ...this.ctl, ...c }; }
  get agl() { return this.fdm.y * FT; }
  get frame() { return rwyFrame(this.fdm.x, this.fdm.z); }
  get dev() { return approachDev(this.fdm.x, this.fdm.y, this.fdm.z); }

  // 放到最後進場的起點（下滑道上、2.4 公里外），難度越高起點越偏
  toFinal() {
    const L = this.L, A = APPROACH, R = RUNWAY;
    const side = this.stats.goArounds % 2 ? -1 : 1;
    const dist = A.startDist, h = (dist + R.aimFromThr) * Math.tan(R.glide * D);
    this.fdm.reset({ onGround: false, x: R.thrX + dist, z: -side * L.offset, y: h, heading: R.heading + side * L.hdgOff, speed: A.startKt, flaps: A.flaps, gamma: -R.glide, pitch: -0.5, trim: -0.5 });
    this.fdm.throttle = A.throttle;
    this.throttleCmd = A.throttle; this.flapsCmd = A.flaps; this.brake = 0;
    this.go('final');
  }

  // 舉單手：進場中 = 主動重飛
  confirm() {
    if (this.phase === 'final' || this.phase === 'flare') { this.goAround(null, []); return true; }
    return false;
  }

  goAround(why, out) {
    this.stats.goArounds++;
    this.go('goaround');
    this.throttleCmd = 1; this.flapsCmd = 10;
    out.push({ text: why ? `${why} → 重飛！` : '重飛！加滿油門、爬升，再進場一次', kind: 'bad', cue: 'bump' });
    return out;
  }

  // 電腦幫忙控制機頭（只靠傾斜模式、重飛、繞場時）：讓機頭角度往 want 靠
  autoPitch(want) { return clamp((want - this.fdm.trim) / 2.5, -1, 1); }

  step(dt) {
    const out = [], f = this.fdm, L = this.L, A = APPROACH;
    this.phaseT += dt; this.stats.time += dt;
    let elev = this.opts.tiltOnly ? 0 : this.ctl.pitch, ail = this.ctl.lean;
    const kt = f.kt, agl = this.agl;

    if (this.phase === 'turn1' || this.phase === 'downwind' || this.phase === 'turn2') {
      // 繞場：電腦幫忙保持 600 呎（挑戰模式要自己保持），玩家用身體傾斜轉彎
      const target = this.phase === 'turn2' ? RUNWAY.heading : (RUNWAY.heading + 180) % 360;
      const e = herr(f.heading, target);
      const alt = this.phase === 'turn2' ? 420 : 600; // 第二個轉彎時開始下降
      if (this.diffKey !== 'hard' || this.opts.tiltOnly) elev = this.autoPitch(clamp(2 + (alt - agl) * 0.03, -4, 8));
      if (this.diffKey === 'easy') ail = clamp(ail + 0.5 * clamp(-e / 25, -1, 1), -1, 1);
      this.throttleCmd = this.phase === 'downwind' ? 0.55 : this.phase === 'turn2' ? 0.35 : 0.65; this.flapsCmd = this.phase === 'turn2' ? 20 : 0;
      if (this.phase === 'turn1' && Math.abs(e) < 12 && this.phaseT > 3) { this.go('downwind'); out.push({ text: '很好！順風邊：保持航向 090（快轉中）', kind: 'good', cue: 'pass' }); }
      else if (this.phase === 'downwind') {
        this.timeScale = 4;
        if (f.x > RUNWAY.thrX + 2100) { this.go('turn2'); out.push({ text: '身體往左傾，再左轉 180°，對準跑道', kind: '', cue: 'tick' }); }
        if (this.phaseT > 4 && Math.abs(e) > 20) this.once('dw' + Math.floor(this.phaseT / 4), { text: e > 0 ? '往右偏了 → 往左傾一點' : '往左偏了 → 往右傾一點', kind: '' }, out);
      } else if (this.phase === 'turn2' && Math.abs(e) < 15 && this.phaseT > 3) {
        this.flapsCmd = A.flaps; this.throttleCmd = A.throttle;
        this.go('final'); out.push({ text: '最後進場！看 PAPI 燈：兩白兩紅 = 剛好', kind: 'good', cue: 'pass' });
      }
    } else if (this.phase === 'final' || this.phase === 'flare') {
      const v = this.dev;
      this.stats.finalT += dt;
      if (Math.abs(v.glide) < 0.8 && kt > 58 && kt < 78 && Math.abs(v.cross) < 12) this.stats.stableT += dt;
      // 對準跑道（簡單模式：電腦幫一部分）
      ail = clamp(ail + L.steerHelp * clamp(-v.cross / 25 - herr(f.heading, RUNWAY.heading) / 12, -1, 1), -1, 1);
      // 下滑角：簡單模式幫一部分；只靠傾斜模式全部由電腦控制
      const wantTheta = clamp(-0.5 - v.glide * 3, -6, 5);
      if (this.opts.tiltOnly) elev = this.autoPitch(wantTheta);
      else if (L.glideHelp && this.phase === 'final') elev = clamp(elev + L.glideHelp * this.autoPitch(wantTheta), -1, 1);
      // 油門：簡單模式自動保持 65 節；其他模式固定進場油門（速度要用機頭控制）
      if (this.phase === 'final') this.throttleCmd = L.autoThrottle ? clamp(A.throttle + (65 - kt) * 0.04, 0.05, 0.7) : A.throttle;
      // 亂流（挑戰）
      if (L.turbulence) { f.gamma += (this.rnd() - 0.5) * 0.004 * L.turbulence; f.phi += (this.rnd() - 0.5) * 0.006 * L.turbulence; }
      if (this.phase === 'final') {
        if (this.d.hints && this.phaseT > 3) {
          if (v.glide > 0.7) this.once('hi' + Math.floor(this.phaseT / 5), { text: '太高了（PAPI 白燈多）→ 雙手放低一點', kind: '' }, out);
          else if (v.glide < -0.7) this.once('lo' + Math.floor(this.phaseT / 5), { text: '太低了（PAPI 紅燈多）→ 雙手抬高一點', kind: 'bad' }, out);
          if (Math.abs(v.cross) > 10) this.once('x' + Math.floor(this.phaseT / 5), { text: v.cross > 0 ? '偏右了 → 往左傾，對準跑道' : '偏左了 → 往右傾，對準跑道', kind: '' }, out);
          if (kt > 80) this.once('fast' + Math.floor(this.phaseT / 6), { text: '太快了 → 雙手抬高一點（機頭抬起來會變慢）', kind: '' }, out);
          if (kt < 57) this.once('slow' + Math.floor(this.phaseT / 6), { text: '太慢了 → 雙手放低一點', kind: 'bad' }, out);
        }
        // 進場不穩定（200 呎以下）→ 提醒，持續 2.5 秒就重飛
        const unstable = agl < 200 && agl > 30 && (Math.abs(v.glide) > L.unstableDeg || kt < 54 || kt > 88 || Math.abs(v.cross) > 22);
        this.unstableT = unstable ? this.unstableT + dt : 0;
        if (unstable) this.once('unst', { text: '進場不穩定！修正，不然要重飛', kind: 'bad' }, out);
        if (L.autoGoAround && this.unstableT > 2.5) return this.goAround('進場不穩定', out);
        if (agl < 35) { this.go('flare'); out.push({ text: '收油門、拉平！雙手慢慢抬高', kind: 'good', cue: 'tick' }); }
      }
      if (this.phase === 'flare') {
        this.throttleCmd = Math.max(0, this.throttleCmd - dt * 0.4);
        if (this.opts.tiltOnly) elev = this.autoPitch(clamp(1 + (35 - agl) * 0.18, 0, 6));
        else if (this.diffKey === 'easy') elev = clamp(elev + 0.35 * this.autoPitch(clamp(1 + (35 - agl) * 0.15, 0, 6)), -1, 1);
      }
      // 一定要重飛的情況：沒有對準、落點太遠、太接近地面還太低
      if (agl < 60 && Math.abs(v.cross) > RUNWAY.width / 2 + 3) return this.goAround('沒有對準跑道', out);
      if (agl < 40 && v.along > 520) return this.goAround('太晚了，跑道不夠', out);
      if (agl < 25 && v.along < -60) return this.goAround('太低了，還沒到跑道', out);
    } else if (this.phase === 'goaround') {
      elev = this.autoPitch(9); this.throttleCmd = 1;
      if (agl > 120) this.flapsCmd = 0;
      this.once('ga', { text: '電腦幫你加油門、抬頭爬升', kind: '' }, out);
      if (this.phaseT > 9 && agl > 300) {
        if (this.stats.goArounds >= APPROACH.maxGoArounds) { this.failed = true; this.done = true; this.go('done'); out.push({ text: '今天先練到這裡，下次再試！', kind: '' }); return out; }
        this.toFinal(); out.push({ text: '重新進場', kind: '', cue: 'tick' });
        return out;
      }
    } else if (this.phase === 'rollout') {
      this.throttleCmd = 0;
      this.brake = clamp(this.phaseT - 1.5, 0, 0.7);
      elev = 0;
      const fr = this.frame;
      ail = clamp(ail + this.d.steerHelp * clamp(-fr.cross / 5 - hdgErr(f.heading) / 8, -1, 1), -1, 1);
      if (kt < 3) { this.go('done'); this.done = true; out.push({ text: '停好了！降落成功', kind: 'good', cue: 'finish' }); }
      if (Math.abs(fr.cross) > RUNWAY.width / 2 + 2) this.stats.offRunway = true;
    }

    const evs = f.step(dt, { elev, ail, throttle: this.throttleCmd, flaps: this.flapsCmd, brake: this.brake });
    for (const e of evs) {
      if (e.type === 'stallWarn') out.push({ text: '失速警告！雙手放低', kind: 'bad', cue: 'stall' });
      if (e.type === 'touchdown') {
        const v = rwyFrame(e.x, e.z);
        this.stats.td = { fpm: e.fpm, kt: e.kt, cross: v.cross, along: v.along, hdg: herr(e.heading, RUNWAY.heading), pitch: e.pitch };
        this.go('rollout');
        const word = e.fpm < 250 ? '好輕的落地！' : e.fpm < 500 ? '接地！' : e.fpm < 800 ? '有點重的落地' : '重落地！';
        if (e.fpm >= 800) this.stats.hard = true;
        out.push({ text: `${word}（每分鐘下降 ${Math.round(e.fpm)} 呎）`, kind: e.fpm < 500 ? 'good' : 'bad', cue: e.fpm < 500 ? 'pass' : 'bump' });
      }
    }
    return out;
  }

  get prompt() {
    const f = this.fdm, kt = f.kt;
    switch (this.phase) {
      case 'turn1': return { title: `左轉回頭：航向 ${Math.round(f.heading)}° → 090°`, sub: '<b>身體往左傾</b>，轉到航向儀上的 <b>9（東）</b>在最上面。電腦幫你保持高度', inst: 'hi' };
      case 'downwind': return { title: '順風邊（快轉 ×4）', sub: '保持航向 090，跑道在左邊。等一下再左轉對準跑道', inst: 'hi' };
      case 'turn2': return { title: `左轉對準跑道：航向 ${Math.round(f.heading)}° → 270°`, sub: '<b>身體往左傾</b>，轉到跑道出現在正前方', inst: 'hi' };
      case 'final': {
        const v = this.dev;
        return { title: `最後進場：離跑道 ${(Math.max(-v.along, 0) / 1000).toFixed(1)} 公里、${Math.round(this.agl)} 呎`, sub: this.opts.tiltOnly ? '電腦控制下降，你用<b>身體傾斜對準跑道</b>' : '<b>身體傾斜</b>對準跑道；<b>雙手</b>控制下降：PAPI 燈<b>兩白兩紅</b>最剛好。空速 60～75 節', inst: kt > 80 || kt < 57 ? 'asi' : null };
      }
      case 'flare': return { title: '拉平！', sub: this.opts.tiltOnly ? '電腦幫你拉平，保持對準中心線' : '油門收到底，<b>雙手慢慢抬高</b>，讓機頭抬起一點、輕輕落地', inst: 'vsi' };
      case 'rollout': return { title: `滑行減速：${Math.round(kt)} 節`, sub: '自動煞車中，<b>身體左右傾</b>保持在中心線上', inst: null };
      case 'goaround': return { title: '重飛', sub: '電腦加滿油門、抬頭爬升，等一下重新進場', inst: null };
      case 'done': return { title: this.failed ? '練習結束' : '降落成功！', sub: '', inst: null };
      default: return null;
    }
  }

  // 接地評分
  result() {
    const s = this.stats, td = s.td;
    if (!td) return { score: 0, stars: 0, align: 0, sink: 0, speed: 0, spot: 0, stable: 0, ...s };
    const align = clamp(100 - Math.abs(td.cross) * 8 - Math.max(Math.abs(td.hdg) - 3, 0) * 5, 0, 100);
    const sink = td.fpm <= 200 ? 100 : clamp(100 - (td.fpm - 200) * 0.14, 0, 100);
    const speed = clamp(100 - Math.max(45 - td.kt, 0) * 8 - Math.max(td.kt - 62, 0) * 8, 0, 100); // 接地 45～62 節最好（剛好在失速速度上面一點）
    const spot = td.along >= 120 && td.along <= 450 ? 100 : clamp(100 - Math.max(120 - td.along, td.along - 450, 0) * 0.3, 0, 100);
    const stable = s.finalT ? clamp((s.stableT / s.finalT) * 110, 0, 100) : 100;
    let score = Math.round(align * 0.3 + sink * 0.3 + speed * 0.2 + spot * 0.1 + stable * 0.1 - s.goArounds * 8 - (s.offRunway ? 15 : 0) - (td.pitch < 0 ? 10 : 0));
    score = clamp(score, 0, 100);
    const stars = this.failed ? 0 : score >= 80 ? 3 : score >= 55 ? 2 : 1;
    return { score, stars, align: Math.round(align), sink: Math.round(sink), speed: Math.round(speed), spot: Math.round(spot), stable: Math.round(stable), ...s };
  }
}

// 起降連飛：先用起飛任務飛到 500 呎，再接繞場與降落
export class CircuitMission {
  constructor({ diff = 'normal', opts = {} } = {}) {
    this.diffKey = diff; this.d = FLIGHT_DIFF[diff]; this.opts = opts;
    this.to = new TakeoffMission({ diff, opts: { ...opts, targetFt: 500 } });
    this.cur = this.to; this.ld = null; this.done = false;
  }
  get fdm() { return this.cur.fdm; }
  get phase() { return this.cur.phase; }
  get phaseT() { return this.cur.phaseT; }
  get agl() { return this.cur.agl; }
  get frame() { return this.cur.frame; }
  get prompt() { return this.cur.prompt; }
  get timeScale() { return this.cur.timeScale || 1; }
  get dev() { return this.ld?.dev; }
  get checks() { return this.to.checks; }
  get checkI() { return this.to.checkI; }
  get failed() { return !!this.ld?.failed; }
  input(c) { this.cur.input(c); }
  confirm() { return this.cur.confirm(); }
  step(dt) {
    const out = this.cur.step(dt);
    if (this.cur === this.to && this.to.done) {
      this.ld = new LandingMission({ diff: this.diffKey, opts: this.opts, fdm: this.to.fdm, start: 'turn1' });
      this.cur = this.ld;
      out.push({ text: '起飛完成！身體往左傾，左轉回頭飛回機場', kind: 'good' });
    }
    if (this.ld?.done) this.done = true;
    return out;
  }
  result() {
    const a = this.to.result(), b = this.ld ? this.ld.result() : { score: 0, stars: 0 };
    const score = Math.round(a.score * 0.35 + b.score * 0.65);
    const stars = !this.done || this.ld?.failed ? 0 : score >= 80 ? 3 : score >= 55 ? 2 : 1;
    return { score, stars, takeoff: a, landing: b };
  }
}

