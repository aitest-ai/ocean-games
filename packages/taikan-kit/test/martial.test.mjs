// 武術擴充（martial/）的自動測試：全身模擬人偶 → 辨識器。人偶的出拳是「朝鏡頭」伸，
// 跟真人正面出拳在畫面上的樣子一樣（手臂變短），所以測到的是單鏡頭真正的難點。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MartialRecognizer, scriptMartial, stanceFeedback } from '../martial/index.js';
import { Recognizer } from '../src/recognizer.js';

function run(script, { durationMs, fps = 30, seed = 1, jitter = 0.003, disabled, sensitivity, seated = false, onFrame } = {}) {
  const events = [];
  const rec = new MartialRecognizer({ emit: (e) => events.push(e), ...(disabled ? { disabled } : {}), ...(sensitivity ? { sensitivity } : {}) });
  const poses = scriptMartial(seated ? [[0, 'seated:on'], ...script] : script, { durationMs, fps, seed, jitter });
  for (const p of poses) { rec.feed(p, p.t); onFrame?.(rec, p.t); }
  return { events, rec };
}
const count = (ev, type, side) => ev.filter((e) => e.type === type && (!side || e.side === side)).length;

// 左右交替出拳 n 下，每下間隔 gap 毫秒
const punches = (n, start = 1500, gap = 900) => Array.from({ length: n }, (_, i) => [start + i * gap, i % 2 ? 'punch-right' : 'punch-left']);

test('站好不動會自動校準，站直時馬步深度約為 0', () => {
  const { rec } = run([], { durationMs: 2000 });
  assert.ok(rec.state.calibrated);
  assert.ok(rec.state.fullBody);
  assert.ok(rec.state.stance.depth < 0.1, JSON.stringify(rec.state.stance));
});

test('馬步：腳寬與深度隨動作改變，深度大致跟實際蹲的程度一致', () => {
  const samples = [];
  run([[0, 'hold:wide:on'], [1500, 'depth:0.3'], [4000, 'depth:0.6'], [6500, 'depth:0.9']], {
    durationMs: 9000,
    onFrame: (rec, t) => { if ([1400, 3900, 6400, 8900].some((x) => Math.abs(t - x) < 17)) samples.push({ ...rec.state.stance }); },
  });
  const d = samples.map((s) => s.depth);
  assert.ok(d[0] < 0.12, 'wide but standing: ' + d[0]);
  for (const [i, want] of [[1, 0.3], [2, 0.6], [3, 0.9]]) assert.ok(Math.abs(d[i] - want) < 0.12, `depth ${want}: got ${d[i]}`);
  assert.ok(samples.every((s) => s.width > 1.8), 'feet apart');
});

test('馬步回饋：依序提醒張腳、蹲低、膝蓋、上身，做對時說「很好」', () => {
  const said = [];
  const at = [[900, 'narrow'], [2500, 'shallow'], [5500, 'good'], [7500, 'kneesIn'], [9500, 'lean']];
  run([[1000, 'hold:wide:on'], [1600, 'depth:0.15'], [3000, 'depth:0.55'], [6000, 'hold:kneesIn:on'], [8000, 'hold:kneesIn:off'], [8000, 'hold:leanFwd:on']], {
    durationMs: 10000,
    onFrame: (rec, t) => {
      const m = at.find(([x]) => Math.abs(t - x) < 17);
      if (m) said.push([m[1], stanceFeedback(rec.state.stance, { target: 0.4, fullBody: rec.state.fullBody }).key]);
    },
  });
  assert.deepEqual(said, [['narrow', 'width'], ['shallow', 'deeper'], ['good', 'good'], ['kneesIn', 'knees'], ['lean', 'upright']]);
});

test('蹲太低會提醒「不用蹲那麼低」', () => {
  let key;
  run([[0, 'hold:wide:on'], [1500, 'depth:1.2']], { durationMs: 5000, onFrame: (rec) => { key = stanceFeedback(rec.state.stance, { target: 0.3 }).key; } });
  assert.equal(key, 'tooDeep');
});

for (const fps of [30, 15]) {
  test(`出拳：左右交替 10 下，左右都算對（每秒 ${fps} 格）`, () => {
    const { events } = run(punches(10), { durationMs: 11000, fps });
    assert.equal(count(events, 'punch', 'left'), 5, JSON.stringify(events));
    assert.equal(count(events, 'punch', 'right'), 5);
  });
}

test('出拳：快速連打（每 0.5 秒一下）也不會漏或重複', () => {
  const { events } = run(punches(12, 1500, 500), { durationMs: 8500 });
  assert.equal(count(events, 'punch'), 12);
});

test('出拳的反應時間：從開始出拳到收到事件不超過 0.3 秒（遊戲的判定時間窗會補償）', () => {
  const { events } = run([[1500, 'punch-left']], { durationMs: 3000 });
  assert.equal(events.length, 1);
  assert.ok(events[0].time - 1500 <= 300, 'latency ' + (events[0].time - 1500));
});

test('蹲馬步時出拳（馬步沖拳）一樣算', () => {
  const { events } = run([[0, 'hold:wide:on'], [500, 'depth:0.6'], ...punches(8, 3000)], { durationMs: 11000 });
  assert.equal(count(events, 'punch'), 8);
});

test('坐著出拳一樣算；坐姿回饋看背挺直、雙拳收腰', () => {
  let fb;
  const { events } = run(punches(8), { durationMs: 9000, seated: true, onFrame: (rec, t) => { if (Math.abs(t - 1300) < 17) fb = stanceFeedback(rec.state.stance, { seated: true }); } });
  assert.equal(count(events, 'punch'), 8);
  assert.equal(fb.key, 'good');
  let fb2;
  run([[1000, 'hold:leanFwd:on']], { durationMs: 2500, seated: true, onFrame: (rec) => { fb2 = stanceFeedback(rec.state.stance, { seated: true }); } });
  assert.equal(fb2.key, 'upright');
});

test('不該算出拳：站著小幅抖動、雙手舉高（開始／暫停手勢）、蹲下站起', () => {
  const raise = [1000, 3000, 5000].flatMap((t) => [[t, 'hold:raiseL:on'], [t, 'hold:raiseR:on'], [t + 1200, 'hold:raiseL:off'], [t + 1200, 'hold:raiseR:off']]);
  for (let seed = 1; seed <= 5; seed++) {
    const { events } = run([...raise, [7000, 'hold:wide:on'], [7500, 'depth:0.8'], [10000, 'depth:0']], { durationMs: 12000, seed, jitter: 0.006 });
    assert.equal(count(events, 'punch'), 0, `seed ${seed}: ` + JSON.stringify(events));
  }
});

test('提膝（實驗）：預設關閉不送出；打開後左右都算，蹲馬步不會誤算', () => {
  const script = [[1500, 'knee-left'], [3000, 'knee-right'], [4500, 'knee-left'], [6000, 'hold:wide:on'], [6500, 'depth:0.9']];
  assert.equal(count(run(script, { durationMs: 9000 }).events, 'knee'), 0);
  const { events } = run(script, { durationMs: 9000, disabled: [] });
  assert.equal(count(events, 'knee', 'left'), 2, JSON.stringify(events));
  assert.equal(count(events, 'knee', 'right'), 1);
});

test('跟原本的辨識器一起用：雙手舉高仍是開始／暫停，出拳不會被當成舉手', () => {
  const ev = [];
  const base = new Recognizer({ disabled: ['paddle', 'lean', 'jump', 'swing', 'crouch'], emit: (e) => ev.push(e) });
  const poses = scriptMartial([...punches(8), [9000, 'hold:raiseL:on'], [9000, 'hold:raiseR:on'], [10500, 'hold:raiseL:off'], [10500, 'hold:raiseR:off']], { durationMs: 12000 });
  for (const p of poses) base.feed(p, p.t);
  const raises = ev.filter((e) => e.type === 'raise');
  assert.equal(raises.length, 1, JSON.stringify(raises));
  assert.equal(raises[0].side, 'both');
});
