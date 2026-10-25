// 飛行系列（模擬器系列）：儀表換算、指針慣性、機艙規格、錶面圖集（不需要 GPU）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asiAngle, altHands, vsiAngle, tachAngle, tcAngle, aiOffset, arcAngle, hiCardAngle, PITCH_PER_10 } from '../src/flight/gauges/scales.js';
import { Needle } from '../src/flight/needle.js';
import { createFlightState } from '../src/flight/state.js';
import { TRAINER } from '../src/flight/aircraft/trainer.js';
import { atlasItems, packAtlas } from '../src/flight/gauges/faces.js';

const deg = (r) => (r * 180) / Math.PI;
const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} ≈ ${b}`);

test('空速表：刻度單調遞增、重要速度落在預期角度', () => {
  let prev = -1;
  for (let v = 0; v <= 200; v += 1) { const a = asiAngle(v); assert.ok(a >= prev, `${v} kt`); prev = a; }
  close(deg(asiAngle(40)), 30); close(deg(asiAngle(100)), 180); close(deg(asiAngle(160)), 330);
  assert.ok(deg(asiAngle(400)) <= 340, '超速時停在刻度外');
  assert.equal(asiAngle(-5), 0);
});

test('高度表：三根針的位置', () => {
  const h = altHands(1500);
  close(deg(h.h100), 180); close(deg(h.h1000), 54); close(deg(h.h10000), 5.4);
  close(deg(altHands(0).h100), 0);
  close(deg(altHands(999.999).h100), 360, 0.01);
  // 負高度（低於海平面）也不會出錯
  assert.ok(Number.isFinite(altHands(-200).h100));
});

test('爬升率表：0 在 9 點鐘、上下對稱、1000 fpm 以內比較細', () => {
  close(deg(vsiAngle(0)), -90);
  close(deg(vsiAngle(500)) + 90, -(deg(vsiAngle(-500)) + 90));
  close(deg(vsiAngle(1000)), 10);
  assert.ok(deg(vsiAngle(1500)) - deg(vsiAngle(1000)) < deg(vsiAngle(1000)) - deg(vsiAngle(500)));
  close(deg(vsiAngle(5000)), deg(vsiAngle(2000)));
});

test('轉速表、轉彎協調儀、姿態儀、航向盤、小儀表', () => {
  close(deg(tachAngle(0)), -135); close(deg(tachAngle(3500)), 135); close(deg(tachAngle(1750)), 0);
  close(deg(tcAngle(3)), 20); close(deg(tcAngle(-3)), -20); close(deg(tcAngle(99)), 28);
  close(aiOffset(10), PITCH_PER_10); close(aiOffset(-60), -3 * PITCH_PER_10);
  close(deg(hiCardAngle(90)), -90);
  close(deg(arcAngle(13, 0, 26, -60, 60)), 0); close(deg(arcAngle(-5, 0, 26, -60, 60)), -60);
});

test('指針慣性：不會過衝太多、會收斂、不會因為雜訊而抖', () => {
  const n = new Needle({ wn: 9, zeta: 0.85 });
  let max = 0, x = 0;
  for (let i = 0; i < 240; i++) { x = n.update(100, 1 / 60); max = Math.max(max, x); }
  assert.ok(max < 102, `過衝 ${max}`);
  close(x, 100, 0.05, '4 秒後收斂');
  // 有雜訊的輸入（±2）：指針的抖動要比輸入小很多
  const m = new Needle({ wn: 9, zeta: 0.85 }).set(100);
  let lo = 1e9, hi = -1e9, seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 600; i++) { const v = m.update(100 + (rnd() - 0.5) * 4, 1 / 60); if (i > 60) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
  assert.ok(hi - lo < 1.6, `抖動範圍 ${hi - lo}`);
  // 掉格（dt 很大）也穩定
  const k = new Needle({ wn: 12, zeta: 0.9 });
  for (let i = 0; i < 20; i++) k.update(50, 0.25);
  close(k.x, 50, 0.5);
});

test('指針慣性：航向走最短的方向（350° → 10° 不會倒轉一圈）', () => {
  const n = new Needle({ wn: 8, zeta: 0.9, wrap: 360 }).set(350);
  let minSeen = 360;
  for (let i = 0; i < 300; i++) { const v = n.update(10, 1 / 60); if (v > 180) minSeen = Math.min(minSeen, v); }
  assert.ok(minSeen >= 349, '沒有往回轉');
  close(n.x, 10, 0.1);
});

test('飛行狀態物件：有所有儀表需要的欄位', () => {
  const s = createFlightState();
  for (const k of ['ias', 'alt', 'pitch', 'roll', 'heading', 'vs', 'turnRate', 'slip', 'rpm', 'fuelL', 'fuelR', 'oilP', 'oilT', 'vac', 'amps', 'elevator', 'aileron', 'throttle', 'mixture', 'flaps', 'warn']) assert.ok(k in s, k);
  for (const g of TRAINER.smallGauges) assert.ok(Number.isFinite(g.value(s)), g.id);
  for (const a of TRAINER.annunciators) assert.ok(a.key in s.warn, `警示燈 ${a.key} 在 state.warn 裡`);
});

test('機艙規格：儀表不重疊、都在儀表板範圍內、不壓到操縱桿孔', () => {
  const P = TRAINER.panel, H = TRAINER.cabin.panelH;
  const circles = P.instruments.map((I) => ({ id: I.id || I.type, x: I.at[0], y: I.at[1], r: (I.type === 'small' ? P.smallRadius : P.bigRadius) + 0.0055 }));
  for (const s of [-1, 1]) circles.push({ id: 'yoke' + s, x: s * TRAINER.cabin.seatX, y: TRAINER.controls.yokeAt[1], r: 0.026 });
  for (let i = 0; i < circles.length; i++) {
    const a = circles[i];
    assert.ok(a.x - a.r > -P.width / 2 && a.x + a.r < P.width / 2 && a.y - a.r > 0 && a.y + a.r < H, `${a.id} 在儀表板內`);
    for (let j = i + 1; j < circles.length; j++) {
      const b = circles[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r, `${a.id} 與 ${b.id} 重疊`);
    }
  }
  const rects = [...P.radios.map((r) => ({ id: r.id, x: r.at[0], y: r.at[1], w: r.size[0], h: r.size[1] })), { id: 'ann', x: P.annunciator.at[0], y: P.annunciator.at[1], w: P.annunciator.size[0], h: P.annunciator.size[1] }];
  for (const r of rects) for (const c of circles) {
    const dx = Math.max(Math.abs(c.x - r.x) - r.w / 2, 0), dy = Math.max(Math.abs(c.y - r.y) - r.h / 2, 0);
    assert.ok(Math.hypot(dx, dy) >= c.r, `${r.id} 與 ${c.id} 重疊`);
  }
  const v = TRAINER.vspeeds;
  assert.ok(v.vso < v.vs1 && v.vs1 < v.vr && v.vr < v.vy && v.vy < v.vfe && v.vfe < v.vno && v.vno < v.vne, 'V 速度順序合理');
});

test('錶面圖集：低畫質 1024²、中高畫質 2048²，格子不重疊', () => {
  for (const [S, size] of [[256, 1024], [512, 2048]]) {
    const items = atlasItems(TRAINER, S);
    const { pos, Wpx, Hpx } = packAtlas(items, S);
    assert.equal(Wpx, size); assert.equal(Hpx, size);
    const list = Object.entries(pos);
    assert.equal(list.length, items.length);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const [ia, a] = list[i], [ib, b] = list[j];
      const sep = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(sep, `${ia} 與 ${ib} 重疊`);
    }
  }
});

// ── 階段二：飛行模型、身體控制、起飛任務 ──
import { FlightModel, TRAINER_FDM, FDM_ASSIST } from '../src/flight/fdm.js';
import { BodyControls, Calibrator, patchPuppetYoke, DEFAULT_CALIB } from '../src/flight/controls.js';
import { TakeoffMission, FLIGHT_DIFF } from '../src/flight/mission.js';
import { RUNWAY, rwyFrame, onRunway, hdgErr } from '../src/flight/runway.js';
import { Puppet } from '../packages/taikan-kit/src/index.js';
import { createFlightState as newState } from '../src/flight/state.js';

// 全油門滑跑，在 rotateKt 開始拉到 pitchTo 度
function takeoff({ rotateKt = 55, pitchTo = 9, assist = 'normal', secs = 60 } = {}) {
  const f = new FlightModel(TRAINER_FDM, FDM_ASSIST[assist]).reset({ heading: 270 });
  let lift = null;
  for (let t = 0; t < secs; t += 1 / 60) {
    const elev = f.kt >= rotateKt && f.trim < pitchTo ? 1 : 0;
    for (const e of f.step(1 / 60, { throttle: 1, elev, ail: (270 - f.heading) / 10 })) if (e.type === 'liftoff') lift = { ...e, t };
  }
  return { f, lift };
}

test('飛行模型：到抬頭速度拉桿 → 約 57～60 節離地、滑跑 250～350 公尺', () => {
  const { lift } = takeoff();
  assert.ok(lift, '有離地');
  assert.ok(lift.kt > 55 && lift.kt < 62, `離地速度 ${lift.kt}`);
  assert.ok(lift.roll > 230 && lift.roll < 360, `滑跑距離 ${lift.roll}`);
});

test('飛行模型：抬頭太早 → 速度不夠時機頭抬不起來、也不會離地', () => {
  const f = new FlightModel(TRAINER_FDM, FDM_ASSIST.normal).reset({ heading: 270 });
  let lifted = false;
  for (let t = 0; t < 30; t += 1 / 60) {
    for (const e of f.step(1 / 60, { throttle: 1, elev: 1 })) if (e.type === 'liftoff') lifted = f.kt;
    if (f.kt < 30) assert.ok(f.theta * 180 / Math.PI < 2.1, '30 節以下機頭不會抬起來');
  }
  assert.ok(lifted === false || lifted >= 48, `${lifted} 節就離地了`);
});

test('飛行模型：升力隨空速平方增加；攻角太大會失速', () => {
  const f = new FlightModel().reset({ onGround: false, y: 300, speed: 80 });
  // 平飛需要的攻角：速度越快越小
  const a60 = f.trimForLevel(60 / 1.944), a90 = f.trimForLevel(90 / 1.944);
  assert.ok(a60 > a90, '慢的時候需要比較大的攻角');
  assert.ok(f.CL(14) > f.CL(10), '失速前：攻角大升力大');
  assert.ok(f.CL(20) < f.CL(15), '超過失速攻角：升力變小');
  // 普通難度一直拉 → 失速警告
  const g = new FlightModel(TRAINER_FDM, FDM_ASSIST.normal).reset({ onGround: false, y: 300, speed: 70 });
  let warned = false;
  for (let t = 0; t < 20; t += 1 / 60) for (const e of g.step(1 / 60, { throttle: 1, elev: 1 })) if (e.type === 'stallWarn') warned = true;
  assert.ok(warned, '普通難度：一直拉會有失速警告');
  // 簡單模式有失速保護
  const h = new FlightModel(TRAINER_FDM, FDM_ASSIST.easy).reset({ onGround: false, y: 300, speed: 70 });
  let maxA = 0;
  for (let t = 0; t < 20; t += 1 / 60) { h.step(1 / 60, { throttle: 1, elev: 1 }); maxA = Math.max(maxA, h.alpha * 180 / Math.PI); }
  assert.ok(maxA < TRAINER_FDM.alphaStall, `簡單模式攻角最大 ${maxA.toFixed(1)}°`);
});

test('飛行模型：傾斜才會轉彎，轉彎率符合 g·tanφ/V；手回中間機頭保持', () => {
  const f = new FlightModel(TRAINER_FDM, FDM_ASSIST.normal).reset({ onGround: false, y: 500, speed: 90, flaps: 0 });
  f.throttle = 0.7;
  for (let t = 0; t < 8; t += 1 / 60) f.step(1 / 60, { throttle: 0.7, ail: 1 });
  const phi = f.phi, V = f.V, expect = 9.81 * Math.tan(phi) / V;
  assert.ok(Math.abs(phi * 180 / Math.PI - 30) < 1.5, '普通難度最多傾斜 30°');
  assert.ok(Math.abs(f.psiDot - expect) / expect < 0.12, `轉彎率 ${f.psiDot} ≈ ${expect}`);
  for (let t = 0; t < 6; t += 1 / 60) f.step(1 / 60, { throttle: 0.7, ail: 0 });
  assert.ok(Math.abs(f.phi * 180 / Math.PI) < 1, '身體回正 → 機翼回到水平');
  const th0 = f.theta;
  for (let t = 0; t < 3; t += 1 / 60) f.step(1 / 60, { throttle: 0.7, elev: 0 });
  assert.ok(Math.abs(f.theta - th0) < 0.01, '手在中間 → 機頭角度不變');
});

test('飛行模型 → 飛行狀態物件（儀表單位）', () => {
  const { f } = takeoff({ secs: 40 });
  const s = f.toState(newState());
  assert.ok(s.ias > 55 && s.ias < 95, `空速 ${s.ias}`);
  assert.ok(s.alt > 100, `高度 ${s.alt}`);
  assert.ok(s.vs > 200 && s.vs < 1200, `爬升率 ${s.vs}`);
  assert.ok(s.rpm > 2100 && s.rpm < 2750, `轉速 ${s.rpm}`);
  assert.equal(s.onGround, false);
});

test('跑道座標：中心線偏移、在不在跑道上、航向差', () => {
  assert.deepEqual(rwyFrame(RUNWAY.thrX, 0), { along: 0, cross: -0 });
  assert.equal(rwyFrame(0, -5).cross, 5, '面向 270° 時北邊是右邊');
  assert.ok(onRunway(RUNWAY.startX, 0) && !onRunway(0, 20) && !onRunway(RUNWAY.thrX + 10, 0));
  assert.equal(hdgErr(280), 10); assert.equal(hdgErr(260), -10); assert.equal(hdgErr(90), -180);
});

// 鍵盤模擬的人偶 → 身體控制
function puppetRun(bc, pup, ms, t0) { let t = t0; for (let e = 0; e < ms; e += 33) { t += 33; bc.feed(pup.step(t), t); } return t; }

test('身體控制：中立 = 0、傾斜 = ±1、雙手抬高／放低 = ±1、手放腿上 = 0', () => {
  const pup = patchPuppetYoke(new Puppet({ seed: 2, jitter: 0.004 }));
  const bc = new BodyControls();
  let t = puppetRun(bc, pup, 1200, 0);
  assert.equal(bc.lean, 0, '中立時有死區，不會抖'); assert.equal(bc.pitch, 0);
  pup.set('leanR', true); t = puppetRun(bc, pup, 1500, t); assert.ok(bc.lean > 0.95, `右傾 ${bc.lean}`);
  pup.set('leanR', false); pup.set('leanL', true); t = puppetRun(bc, pup, 1500, t); assert.ok(bc.lean < -0.95);
  pup.set('leanL', false); pup.set('pitchUp', true); t = puppetRun(bc, pup, 1200, t); assert.ok(bc.pitch > 0.95, `抬高 ${bc.pitch}`); assert.ok(Math.abs(bc.lean) < 0.08, `抬手時傾斜 ${bc.lean}`);
  pup.set('pitchUp', false); pup.set('pitchDown', true); t = puppetRun(bc, pup, 1200, t); assert.ok(bc.pitch < -0.95);
  pup.set('pitchDown', false); t = puppetRun(bc, pup, 1200, t); assert.equal(bc.pitch, 0);
  // 手放在腿上（比「放低」還低很多）→ 當作中間，不會讓飛機一直低頭
  const c = { ...DEFAULT_CALIB };
  assert.equal(new BodyControls({ calib: c }).normPitch(c.handDown + 0.6), null);
});

test('身體控制：預測讓反應比單純濾波快，但不會超過 ±1', () => {
  const mk = (lead) => { const pup = patchPuppetYoke(new Puppet({ seed: 2, jitter: 0 })); const bc = new BodyControls({ lead }); let t = puppetRun(bc, pup, 1000, 0); pup.set('leanR', true); return { bc, pup, t }; };
  const a = mk(0), b = mk(0.1);
  let ta = null, tb = null;
  for (let k = 1; k <= 40; k++) {
    a.t += 33; a.bc.feed(a.pup.step(a.t), a.t); b.t += 33; b.bc.feed(b.pup.step(b.t), b.t);
    if (ta === null && a.bc.lean > 0.5) ta = k; if (tb === null && b.bc.lean > 0.5) tb = k;
    assert.ok(b.bc.lean <= 1);
  }
  assert.ok(tb < ta, `有預測 ${tb} 格 < 沒有預測 ${ta} 格`);
});

test('體感校正：量到中立姿勢與個人的最大傾斜、雙手範圍', () => {
  const cal = new Calibrator(), pup = patchPuppetYoke(new Puppet({ seed: 4 }));
  const holds = { neutral: [], left: ['leanL'], right: ['leanR'], up: ['pitchUp'], down: ['pitchDown'] };
  let t = 0;
  while (!cal.done) { for (const h of ['leanL', 'leanR', 'pitchUp', 'pitchDown']) pup.set(h, holds[cal.step.key].includes(h)); t += 33; cal.update(0.033, pup.step(t)); }
  const c = cal.result;
  assert.ok(Math.abs(c.roll0) < 0.02);
  assert.ok(c.rollL > 0.2 && c.rollL < 0.33 && c.rollR > 0.2 && c.rollR < 0.33, `傾斜 ${c.rollL} ${c.rollR}`);
  assert.ok(c.handUp < c.hand0 - 0.3 && c.handDown > c.hand0 + 0.3);
  // 用量到的校正值：最大傾斜 = 滿格
  const bc = new BodyControls({ calib: c }); pup.set('leanL', false); pup.set('leanR', true); pup.set('pitchDown', false);
  puppetRun(bc, pup, 1500, t); assert.ok(bc.lean > 0.95);
  // 坐著、傾斜很小的人：校正後小動作也能滿格（最小 5°）
  const small = new BodyControls({ calib: { ...c, rollR: 0.1 } });
  assert.equal(small.normLean(0.1 + c.roll0), 1);
});

// 模擬玩家：反應慢 react 秒，用身體修方向、到 55 節抬頭、爬升時看空速調機頭
function flyBot(diff, { react = 0.35, opts = {}, bot = 'good', maxT = 300 } = {}) {
  const m = new TakeoffMission({ diff, opts });
  const dt = 1 / 30, hist = [];
  let t = 0;
  while (!m.done && t < maxT) {
    t += dt;
    const f = m.fdm, fr = m.frame;
    hist.push({ t, cross: fr.cross, he: hdgErr(f.heading), kt: f.kt, trim: f.trim });
    while (hist.length > 2 && hist[1].t <= t - react) hist.shift();
    const s = hist[0];
    let lean = 0, pitch = 0;
    if (bot !== 'idle') {
      lean = Math.max(-1, Math.min(1, f.onGround ? -s.cross / 4 - s.he / 6 : -s.he / 10));
      if (bot === 'early' && m.phase === 'roll' && s.kt > 30) pitch = s.trim < 9 ? 1 : 0;
      if (m.phase === 'roll' && s.kt >= 55) pitch = s.trim < 9 ? 1 : 0;
      if (m.phase === 'climb') { const want = s.kt < 68 ? 6 : s.kt > 80 ? 10 : 8; pitch = Math.abs(want - s.trim) < 0.8 ? 0 : Math.sign(want - s.trim); }
    }
    m.input({ lean, pitch });
    if ((m.phase === 'check' || m.phase === 'power') && m.phaseT > 1.5 && bot !== 'idle') m.confirm();
    m.step(dt);
  }
  return { t, m, r: m.result() };
}

test('起飛任務：反應 0.35 秒的模擬玩家三種難度都能起飛、3 星，2 分鐘內', () => {
  for (const d of Object.keys(FLIGHT_DIFF)) {
    const { t, m, r } = flyBot(d);
    assert.ok(m.done, `${d} 完成`);
    assert.ok(r.stars === 3, `${d} 星星 ${r.stars}（分數 ${r.score}）`);
    assert.ok(t < 130, `${d} 花了 ${t.toFixed(0)} 秒`);
    assert.equal(r.retries, 0);
  }
});

test('起飛任務：抬頭太早扣分但仍能起飛；只靠傾斜模式可以玩完；簡單模式什麼都不做也會幫忙起飛', () => {
  const early = flyBot('normal', { bot: 'early' });
  assert.ok(early.m.done && early.r.rotate < 50 && early.r.stars <= 2, `抬頭太早 ${early.r.rotate}`);
  for (const d of Object.keys(FLIGHT_DIFF)) assert.ok(flyBot(d, { opts: { tiltOnly: true } }).m.done, `只靠傾斜 ${d}`);
  const lazy = flyBot('easy', { bot: 'idle' });
  assert.ok(lazy.m.done && lazy.r.stars >= 1, '簡單模式不會卡住');
});

test('起飛任務：偏出跑道不會墜毀，停下來重來', () => {
  const m = new TakeoffMission({ diff: 'hard', opts: { skipChecks: true, autoThrottle: true } });
  let retried = false;
  for (let t = 0; t < 60 && !retried; t += 1 / 30) { m.input({ lean: -1, pitch: 0 }); m.step(1 / 30); if (m.phase === 'reset') retried = true; }
  assert.ok(retried, '偏出跑道 → 重來');
  for (let t = 0; t < 12 && m.phase === 'reset'; t += 1 / 30) { m.input({ lean: 0 }); m.step(1 / 30); }
  assert.equal(m.phase, 'power'); assert.ok(onRunway(m.fdm.x, m.fdm.z), '回到跑道頭');
  assert.equal(m.result().retries, 1);
});
