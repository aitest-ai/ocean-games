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

// ── 階段二：訓練結構、對戰、進度 ──
const { Session, buildSteps } = await import('../src/fitness/session.js');
const { Battle } = await import('../src/fitness/battle.js');
const { Progress, dayKey } = await import('../src/fitness/progress.js');
const { LEVELS, WARMUP, COOLDOWN, REST_MIN_SEC } = await import('../src/fitness/levels.js');

const fakeRep = (exercise, { good = true, quality = 0.9, side, time = 0 } = {}) => ({ type: 'rep', exercise, good, quality, side, time, results: [{ code: 'tempo', ok: good, conf: 1 }, { code: 'lean', ok: good, conf: 1 }] });
// 把一次訓練跑完：暖身、收操照時間跑；每一組依序送 rep
function playSession(level, { diff = 'normal', quality = 0.9, good = true, stopAt = null } = {}) {
  const ev = [];
  const s = new Session(level, { diff, emit: (e) => ev.push(e) });
  const battle = new Battle(s.plannedReps());
  let t = 0, guard = 0;
  while (!s.done && guard++ < 100000) {
    if (stopAt && s.step.type === stopAt) { s.stop(); break; }
    const st = s.step;
    if (st.type === 'set') {
      const side = st.perSide ? (s.setReps.left <= s.setReps.right ? 'left' : 'right') : undefined;
      t += 2500;
      const e = fakeRep(st.exercise, { good, quality, side, time: t });
      battle.hit(e);
      s.rep(e);
      s.tick(2.5);
    } else s.tick(0.5);
  }
  return { s, ev, battle };
}

test('訓練結構：一定是 暖身 → 主訓練（組、休息交錯）→ 收操', () => {
  const steps = buildSteps(LEVELS[2]);
  const types = steps.map((x) => x.type);
  assert.deepEqual(types.slice(0, WARMUP.length), WARMUP.map(() => 'warmup'));
  assert.deepEqual(types.slice(-COOLDOWN.length), COOLDOWN.map(() => 'cooldown'));
  const main = types.slice(WARMUP.length, -COOLDOWN.length);
  assert.deepEqual(main, ['set', 'rest', 'set', 'rest', 'set', 'rest', 'set']);
});

test('暖身與收操不能跳過；用鏡頭時看不到人就不倒數', () => {
  const s = new Session(LEVELS[0]);
  assert.equal(s.step.type, 'warmup');
  s.endSet(); s.skipRest();                 // 這些對暖身都沒有作用
  assert.equal(s.step.type, 'warmup');
  for (let i = 0; i < 1000; i++) s.tick(0.1, { present: false });
  assert.equal(s.step.id, WARMUP[0].id);    // 看不到人：100 秒過去還在第一段
  s.tick(WARMUP[0].sec + 0.1, { present: true });
  assert.equal(s.step.id, WARMUP[1].id);
  assert.equal(typeof s.skipWarmup, 'undefined');
  assert.equal(typeof s.skipCooldown, 'undefined');
});

test('組間休息：至少 15 秒才能跳過，可以多休息', () => {
  const s = new Session(LEVELS[0]);
  while (s.step.type !== 'set') s.tick(1);
  for (let i = 0; i < 8; i++) s.rep(fakeRep('squat'));
  assert.equal(s.step.type, 'rest');
  s.tick(REST_MIN_SEC - 1);
  assert.equal(s.skipRest(), false);
  s.extendRest(15);
  assert.equal(s.step.sec, LEVELS[0].rest + 15);
  s.tick(2);
  assert.equal(s.skipRest(), true);
  assert.equal(s.step.type, 'set');
});

test('完整打完一關：做完預定次數一定打倒怪獸；品質影響星星，不影響輸贏', () => {
  for (const lv of LEVELS) {
    const good = playSession(lv, { quality: 0.95 });
    assert.equal(good.s.summary().completed, true);
    assert.equal(good.battle.defeated, true, lv.id);
    assert.equal(good.battle.stars(), 3);
    const sloppy = playSession(lv, { quality: 0.3, good: false });
    assert.equal(sloppy.battle.defeated, true, lv.id + '（品質差也打得倒）');
    assert.equal(sloppy.battle.stars(), 1);
    assert.equal(sloppy.battle.combo, 0);
  }
});

test('連擊：標準的一下 +1；不標準的不加但也不歸零；停太久才歸零', () => {
  const b = new Battle(20);
  b.hit(fakeRep('jack', { time: 1000 })); b.hit(fakeRep('jack', { time: 2000 }));
  assert.equal(b.combo, 2);
  b.hit(fakeRep('jack', { good: false, quality: 0.4, time: 3000 }));
  assert.equal(b.combo, 2);
  b.hit(fakeRep('jack', { time: 4000 }));
  assert.equal(b.combo, 3);
  b.hit(fakeRep('jack', { time: 20000 }));
  assert.equal(b.combo, 1);
});

test('時間上限：超過就取消剩下的組、直接收操', () => {
  const ev = [];
  const s = new Session(LEVELS[4], { capMin: 3, emit: (e) => ev.push(e) });
  while (s.step.type !== 'set') s.tick(1);
  s.tick(200); // 一組做很久
  assert.ok(ev.some((e) => e.type === 'timeCap'));
  assert.equal(s.step.type, 'cooldown');
});

test('不舒服停止：立刻結束，記錄為「停止」不是「失敗」', () => {
  const { s } = playSession(LEVELS[1], { stopAt: 'rest' });
  const sum = s.summary();
  assert.equal(sum.stopped, true);
  assert.equal(sum.completed, false);
  const p = new Progress();
  const out = p.record(sum);
  assert.equal(out.unlocked, null); // 沒做完不解鎖，但不扣東西
  assert.equal(p.d.unlocked, 1);
});

function memStore() { const m = {}; return { load: (k) => (m[k] ? JSON.parse(m[k]) : null), save: (k, v) => { m[k] = JSON.stringify(v); }, m }; }

test('進度：完成第一關解鎖第二關；任務、個人最佳；只存在本機', () => {
  const io = memStore();
  let now = new Date(2026, 9, 26, 19).getTime();
  const p = new Progress({ ...io, now: () => now });
  assert.equal(p.unlockedExercises().join(), 'squat');
  const qs = p.quests();
  assert.equal(qs.length, 3);
  assert.equal(qs[0].id, 'session');
  assert.ok(qs.every((q) => !['jackCombo', 'legStraight'].includes(q.id)), '沒解鎖的動作不會出任務');
  const { s, battle } = playSession(LEVELS[0]);
  const out = p.record(s.summary(), { stars: battle.stars(), score: battle.score });
  assert.equal(out.unlocked.id, LEVELS[1].id);
  assert.ok(out.questsDone.includes('完成一次完整訓練（含暖身與收操）'));
  assert.ok(out.newBests.some((x) => x.startsWith('深蹲')));
  // 重新讀取（模擬關掉再打開）
  const p2 = new Progress({ ...io, now: () => now });
  assert.equal(p2.d.unlocked, 2);
  assert.equal(p2.d.sessions.length, 1);
  assert.equal(Object.keys(io.m).join(), 'progress');
});

test('活動天數：連續天數只鼓勵；斷了說「歡迎回來」不責備；練太多會提醒休息', () => {
  const io = memStore();
  let day = 1;
  const p = new Progress({ ...io, now: () => new Date(2026, 9, day, 19).getTime() });
  const sum = playSession(LEVELS[0]).s.summary();
  for (day = 1; day <= 4; day++) p.record(sum);
  day = 4;
  assert.equal(p.streak(), 4);
  assert.match(p.canTrain().text, /休息日/);
  day = 9;
  assert.equal(p.streak(), 0);
  assert.match(p.welcome(), /歡迎回來/);
  assert.doesNotMatch(p.welcome(), /中斷|失敗|可惜|斷了/);
  p.record(sum); p.record(sum);
  assert.equal(p.canTrain().warn, true);
  p.record(sum);
  assert.equal(p.canTrain().ok, false);
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

// ── 階段三：更多動作、訓練計畫、低衝擊、維持類、成績 ──
const { PLANS } = await import('../src/fitness/plans.js');
const { estimateKcal } = await import('../src/fitness/estimate.js');
const { EXERCISES } = await import('../packages/taikan-kit/src/exercise/index.js');
const { SKILLS, LOW_IMPACT, SEATED_WARMUP } = await import('../src/fitness/levels.js');

// 階段二的 playSession 只會送 rep；這裡也送「維持」類的每一秒
function playAny(level, { lowImpact = false, quality = 0.9 } = {}) {
  const s = new Session(level, { lowImpact });
  const battle = new Battle(s.plannedReps());
  let t = 0, guard = 0;
  while (!s.done && guard++ < 200000) {
    const st = s.step;
    if (st.type === 'set' && st.hold) { t += 1000; battle.holdTick(); s.holdSec({ type: 'hold', exercise: st.exercise }); s.tick(1); }
    else if (st.type === 'set') {
      const side = st.perSide ? (s.setReps.left <= s.setReps.right ? 'left' : 'right') : undefined;
      t += 2000; const e = fakeRep(st.exercise, { quality, side, time: t }); battle.hit(e); s.rep(e); s.tick(2);
    } else s.tick(0.5);
  }
  return { s, battle };
}

test('每個動作都有技能、鍵盤模擬的動作與示範；實驗動作有標記', async () => {
  const { VARIANTS } = await import('../src/fitness/sim.js');
  const { DEMOS } = await import('../src/fitness/demos.js');
  for (const id of Object.keys(EXERCISES)) {
    assert.ok(SKILLS[id], `${id} 沒有技能`);
    assert.ok(VARIANTS[id], `${id} 沒有鍵盤模擬`);
    assert.ok(DEMOS[id], `${id} 沒有示範動作`);
  }
  assert.deepEqual(Object.values(EXERCISES).filter((d) => d.beta).map((d) => d.id).sort(), ['bridge', 'plank', 'pushUp']);
});

test('訓練計畫：3 個計畫各 12 次、次數每週增加；每一次都是完整的暖身／主訓練／收操', () => {
  for (const p of PLANS) {
    assert.equal(p.sessions.length, 12);
    const w1 = p.sessions[0].sets[0][1], w4 = p.sessions[9].sets[0][1];
    assert.ok(w4 > w1, `${p.id} 第 4 週要比第 1 週多`);
    for (const lv of p.sessions) {
      const types = buildSteps(lv).map((x) => x.type);
      assert.equal(types[0], 'warmup'); assert.equal(types[types.length - 1], 'cooldown');
      for (const [ex] of lv.sets) assert.ok(EXERCISES[ex] && !EXERCISES[ex].beta, `${lv.id} 用到 ${ex}`);
    }
  }
  const low = PLANS.find((p) => p.id === 'lowImpact');
  assert.ok(low.sessions.every((lv) => lv.sets.every(([ex]) => !['jack', 'highKnees'].includes(ex))), '低衝擊計畫不能有跳躍');
  const seated = PLANS.find((p) => p.id === 'seated');
  assert.equal(buildSteps(seated.sessions[0])[0].id, SEATED_WARMUP[0].id);
});

test('低衝擊模式：開合跳換成左右踏步、高抬腿換成抬膝踏步', () => {
  const lv = LEVELS.find((l) => l.id === 'c2-1');
  const sets = buildSteps(lv, { lowImpact: true }).filter((x) => x.type === 'set').map((x) => x.exercise);
  assert.ok(!sets.includes('highKnees') && sets.includes('march'));
  const sets2 = buildSteps(LEVELS[1], { lowImpact: true }).filter((x) => x.type === 'set').map((x) => x.exercise);
  assert.ok(!sets2.includes('jack') && sets2.includes('stepJack'));
  for (const v of Object.values(LOW_IMPACT)) assert.ok(EXERCISES[v]);
});

test('第二章、訓練計畫、低衝擊：做完預定次數（含靠牆深蹲的秒數）一定打得倒', () => {
  const all = [...LEVELS, ...PLANS.flatMap((p) => p.sessions)];
  for (const lv of all) for (const lowImpact of [false, true]) {
    const { s, battle } = playAny(lv, { lowImpact });
    assert.equal(s.summary().completed, true, lv.id);
    assert.equal(battle.defeated, true, `${lv.id}${lowImpact ? '（低衝擊）' : ''}`);
  }
});

test('靠牆深蹲的組：撐到預定秒數就完成', () => {
  const lv = LEVELS.find((l) => l.id === 'c2-2');
  const s = new Session(lv);
  while (!(s.step.type === 'set' && s.step.hold)) {
    const st = s.step;
    if (st.type === 'set') for (let i = 0; i < st.reps; i++) s.rep(fakeRep(st.exercise, { side: st.perSide ? (i % 2 ? 'right' : 'left') : undefined }));
    else s.tick(1);
  }
  const need = s.step.reps;
  for (let i = 0; i < need - 1; i++) s.holdSec({ exercise: 'wallSit' });
  assert.equal(s.step.exercise, 'wallSit');
  s.holdSec({ exercise: 'wallSit' });
  assert.equal(s.step.type, 'rest');
  assert.equal(s.summary().reps.wallSit, need);
});

test('進度：訓練計畫完整做完才前進；第一章打完解鎖第二章', () => {
  const io = memStore();
  const p = new Progress({ ...io, now: () => new Date(2026, 9, 26, 19).getTime() });
  const plan = PLANS[0];
  const stopped = playSession(plan.sessions[0], { stopAt: 'rest' }).s.summary();
  p.record(stopped);
  assert.equal(p.planNext(plan.id), 0);
  p.record(playAny(plan.sessions[0]).s.summary());
  assert.equal(p.planNext(plan.id), 1);
  for (const lv of LEVELS.slice(0, 5)) p.record(playAny(lv).s.summary());
  assert.equal(LEVELS[p.d.unlocked - 1].id, 'c2-1');
  assert.ok(p.unlockedExercises().includes('highKnees'));
});

test('粗估熱量：沒填體重就不算；有填就給一個範圍', () => {
  const sum = playAny(LEVELS[1]).s.summary();
  assert.equal(estimateKcal(sum, ''), null);
  assert.equal(estimateKcal(sum, 10), null);
  const k = estimateKcal(sum, 60);
  assert.ok(k.low > 5 && k.high > k.low && k.high < 400, JSON.stringify(k));
});

test('鍵盤模擬（階段三動作）：標準動作算得到、常見錯誤會提示', () => {
  assert.equal(drive('highKnees', every(8, 'good', 800)).reps, 8);
  assert.ok(drive('highKnees', every(6, 'bad2', 800), { view: 90 }).tips.includes('upright'));
  assert.equal(drive('lunge', every(4, 'good', 3200), { view: 90 }).reps, 4);
  assert.equal(drive('calfRaise', every(5, 'good', 2600)).reps, 5);
  const wall = drive('wallSit', [[2500, 'good']], { view: 90, ms: 26000 });
  assert.ok(wall.ev.filter((e) => e.type === 'hold').length >= 15);
  assert.equal(drive('seatedKnee', every(6, 'good', 2000)).reps, 6);
  assert.equal(drive('seatedArms', every(6, 'good', 2000)).reps, 6);
  assert.equal(drive('pushUp', every(5, 'good', 2600)).reps, 5);
  assert.ok(drive('plank', [[1000, 'bad1']], { ms: 16000 }).tips.includes('line'));
  assert.equal(drive('stepJack', every(8, 'good', 1300)).reps, 8);
});
