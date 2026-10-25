// 居家徒手訓練教練：鍵盤模擬（畫面按鈕）真的會讓辨識器做出對應的結果、本機儲存。
// 動作辨識本身的測試在 packages/taikan-kit/test/exercise.test.mjs。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExerciseAnalyzer, Calibrator } from '../packages/taikan-kit/src/exercise/index.js';
import { FitnessSim } from '../src/fitness/sim.js';

// 在 node 裡模擬瀏覽器的 localStorage
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i], get length() { return mem.size; },
};
const store = await import('../src/fitness/store.js');

// 推進模擬：每 33 毫秒一格，按鍵在指定時間按下
function drive(exercise, presses, { view = null, ms = 30000, base = null, profile } = {}) {
  const sim = new FitnessSim({ exercise });
  if (view != null) sim.setView(view);
  const ev = [];
  const a = new ExerciseAnalyzer({ exercise, base, profile, emit: (e) => ev.push(e) });
  const q = [...presses].sort((a, b) => a[0] - b[0]);
  for (let t = 0; t < ms; t += 33) {
    while (q.length && q[0][0] <= t) sim.press(q.shift()[1]);
    const p = sim.person.step(t);
    if (p) p.others = sim.others;
    a.feed(p, { aspect: sim.aspect });
  }
  return { ev, a, reps: ev.filter((e) => e.type === 'rep').length, tips: ev.filter((e) => e.type === 'hint' && e.kind === 'tip').map((e) => e.code) };
}
const every = (n, act, gap, start = 2500) => Array.from({ length: n }, (_, i) => [start + i * gap, act]);

test('鍵盤模擬：深蹲「標準」5 下 → 算 5 下；「蹲太淺」→ 不算並提示', () => {
  assert.equal(drive('squat', every(5, 'good', 3000), { view: 90 }).reps, 5);
  const bad = drive('squat', every(4, 'bad1', 3000), { view: 90 });
  assert.equal(bad.reps, 0);
  assert.ok(bad.tips.includes('depth'));
});

test('鍵盤模擬：深蹲「上半身太往前倒」側面會提示、正面不會（看不到）', () => {
  assert.ok(drive('squat', every(4, 'bad2', 3000), { view: 90 }).tips.includes('trunk'));
  assert.ok(!drive('squat', every(4, 'bad2', 3000), { view: 0 }).tips.includes('trunk'));
});

test('鍵盤模擬：開合跳標準 10 下；手只舉到肩膀 → 提示', () => {
  assert.equal(drive('jack', every(10, 'good', 1300)).reps, 10);
  assert.ok(drive('jack', every(6, 'bad1', 1300)).tips.includes('arms'));
});

test('鍵盤模擬：側抬腿自動左右輪流；身體歪 → 提示', () => {
  const r = drive('legRaise', every(6, 'good', 2600));
  assert.equal(r.a.reps.left, 3);
  assert.equal(r.a.reps.right, 3);
  assert.ok(drive('legRaise', every(6, 'bad1', 2600)).tips.includes('lean'));
});

test('鍵盤模擬：亂動、走出畫面、兩人入鏡都不會算次數', () => {
  const r = drive('squat', [...every(6, 'idle', 3300), [8000, 'away'], [10000, 'away'], [14000, 'crowd'], [17000, 'crowd']], { ms: 26000 });
  assert.equal(r.reps, 0);
  assert.ok(r.ev.some((e) => e.type === 'status' && e.code === 'lost'));
  assert.ok(r.ev.some((e) => e.type === 'status' && e.code === 'crowd'));
});

test('鍵盤模擬：切換視角（V）會被偵測成正面 → 斜角 → 側面', () => {
  const sim = new FitnessSim({ exercise: 'squat' });
  const views = [];
  const a = new ExerciseAnalyzer({ exercise: 'squat', emit: (e) => { if (e.type === 'view') views.push(e.view); } });
  for (let t = 0; t < 12000; t += 33) {
    if (t === 3003 || t === 6006) sim.press('view');
    a.feed(sim.person.step(t), { aspect: sim.aspect });
  }
  assert.deepEqual(views, ['angled', 'side']);
});

test('完整流程：校正（站姿＋舒服幅度）→ 用個人目標計次', () => {
  const sim = new FitnessSim({ exercise: 'squat' });
  const c = new Calibrator({ exercise: 'squat' });
  let t = 0;
  for (; t < 20000 && c.phase !== 'done'; t += 33) {
    if (c.phase === 'rom' && !sim.person.busy()) sim.press('good');
    c.feed(sim.person.step(t), { aspect: sim.aspect });
  }
  assert.equal(c.phase, 'done');
  store.saveTarget('squat', c.result.target);
  const profile = store.loadProfile();
  assert.ok(Math.abs(profile.targets.squat - c.result.target) < 1e-9);
  const r = drive('squat', every(4, 'good', 3000), { base: c.result.baseline, profile });
  assert.equal(r.reps, 4);
});

test('本機儲存：只用 taikan.fitness.* 鍵名，可以一次清除', () => {
  store.save('settings', { a: 1 });
  localStorage.setItem('ocean-games.shared', '{}'); // 別的遊戲的設定不能被清掉
  assert.deepEqual(store.load('settings', null), { a: 1 });
  assert.ok([...mem.keys()].filter((k) => k !== 'ocean-games.shared').every((k) => k.startsWith('taikan.fitness.')));
  store.clearAll();
  assert.equal(store.load('settings', 'none'), 'none');
  assert.equal(localStorage.getItem('ocean-games.shared'), '{}');
});
