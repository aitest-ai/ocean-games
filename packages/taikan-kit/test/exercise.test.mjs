// 健身動作分析的自動測試：用「合成人體」（src/exercise/synth.js，3D 火柴人投影到鏡頭畫面）產生骨架序列，
// 檢查：標準動作要算到次數、不標準的要被提示、站著不動或亂晃不能亂算，以及漏格、抖動、視角、校正。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExerciseAnalyzer, Calibrator, RepCounter, angle, synthSequence, SynthPerson } from '../src/exercise/index.js';
import { tiltFromVertical } from '../src/exercise/features.js';

const WARM = 2500; // 先站好讓它量基準
function run(exercise, script, { durationMs, profile, base, ...opts } = {}) {
  const ev = [];
  const a = new ExerciseAnalyzer({ exercise, profile, base, emit: (e) => ev.push(e) });
  const end = durationMs ?? Math.max(...script.map((s) => s[0])) + 4000;
  for (const p of synthSequence(script, { durationMs: end, seed: 11, ...opts })) a.feed(p);
  const reps = ev.filter((e) => e.type === 'rep');
  return {
    a, ev, reps,
    partial: ev.filter((e) => e.type === 'partial'),
    tips: ev.filter((e) => e.type === 'hint' && e.kind === 'tip'),
    tip: (code) => ev.filter((e) => e.type === 'hint' && e.kind === 'tip' && e.code === code).length,
    status: ev.filter((e) => e.type === 'status').map((e) => e.code),
  };
}
const series = (n, motion, opts = {}, every = 3000, start = WARM, ms) => Array.from({ length: n }, (_, i) => [start + i * every, motion, typeof opts === 'function' ? opts(i) : opts, ms]);
const FRONT = { yaw: 0 }, SIDE = { yaw: 90 }, ANGLED = { yaw: 45 };

// ── 基本幾何與狀態機 ──
test('角度計算：直角、直線、往右倒的線', () => {
  assert.equal(Math.round(angle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })), 90);
  assert.equal(Math.round(angle({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 })), 180);
  assert.equal(Math.round(tiltFromVertical({ x: 0, y: 1 }, { x: 1, y: 0 })), 45);
});

test('狀態機：在門檻附近抖動不會重複算；中斷後要先回到休息姿勢', () => {
  const c = new RepCounter({ start: 0.2, count: 0.6, release: 0.1, minMs: 300 });
  const out = [];
  let t = 0;
  const feed = (m) => { const e = c.step(m, (t += 33)); if (e) out.push(e.type); };
  for (let i = 0; i < 20; i++) feed(0); // 先站著（上膛）
  for (let i = 0; i < 20; i++) feed(i / 20);           // 往下
  for (let i = 0; i < 40; i++) feed(0.6 + (i % 2 ? 0.05 : -0.05)); // 在「到位」門檻上下抖
  for (let i = 0; i < 10; i++) feed(0.4 + (i % 2 ? 0.08 : -0.08)); // 在中間抖（沒有低於 release）
  for (let i = 0; i < 10; i++) feed(0);
  assert.deepEqual(out, ['rep']);
  // 中斷時蹲在下面：回來時不能直接算一下
  for (let i = 0; i < 10; i++) feed(0.8);
  c.interrupt();
  for (let i = 0; i < 10; i++) feed(0.8);
  for (let i = 0; i < 10; i++) feed(0);
  assert.deepEqual(out, ['rep']);
});

test('狀態機：太快（不可能是人做的）不算；半途反彈會回報', () => {
  const c = new RepCounter({ start: 0.2, count: 0.6, release: 0.1, minMs: 400, bounce: 0.3 });
  const out = [];
  let t = 0;
  const feed = (m) => { const e = c.step(m, (t += 33)); if (e) out.push(e.type); };
  for (let i = 0; i < 10; i++) feed(0);
  [0.3, 0.9, 0.3, 0].forEach(feed); // 4 格就做完一下
  for (let i = 0; i < 10; i++) feed(0);
  assert.deepEqual(out, ['noise']);
  for (const m of [0.3, 0.6, 0.9, 1, 0.9, 0.6, 0.5, 0.6, 0.9, 1, 0.6, 0.3, 0]) for (let k = 0; k < 3; k++) feed(m);
  assert.deepEqual(out, ['noise', 'bounce', 'rep']);
});

// ── 深蹲 ──
for (const [name, camera] of [['側面', SIDE], ['正面', FRONT], ['斜角 45°', ANGLED]]) {
  test(`深蹲：標準動作 10 下（${name}）全部算到、品質好、沒有糾正提示`, () => {
    const r = run('squat', series(10, 'squat'), { camera });
    assert.equal(r.reps.length, 10);
    assert.ok(r.reps.every((x) => x.quality >= 0.75), r.reps.map((x) => x.quality).join(','));
    assert.equal(r.tips.length, 0, r.tips.map((x) => x.text).join('|'));
  });
}

test('深蹲：蹲太淺不算，並提示「再蹲低一點」', () => {
  const r = run('squat', series(6, 'squat', { depth: 40 }), { camera: SIDE });
  assert.equal(r.reps.length, 0);
  assert.ok(r.partial.length >= 5);
  assert.ok(r.tip('depth') >= 3);
});

test('深蹲：側面看到上半身太往前倒 → 照樣算，但提示胸口抬高', () => {
  const r = run('squat', series(6, 'squat', { lean: 25 }), { camera: SIDE });
  assert.equal(r.reps.length, 6);
  assert.ok(r.tip('trunk') >= 2);
  assert.ok(r.reps.every((x) => x.issues.includes('trunk')));
});

test('深蹲：正面看不出前後傾 → 不亂報，並標示「這個角度看不到」', () => {
  const r = run('squat', series(6, 'squat', { lean: 25 }), { camera: FRONT });
  assert.equal(r.reps.length, 6);
  assert.equal(r.tip('trunk'), 0);
  const trunk = r.reps[0].results.find((x) => x.code === 'trunk');
  assert.equal(trunk.level, 'none');
  assert.equal(r.a.checkList().find((x) => x.code === 'trunk').viewOnly, true);
});

test('深蹲：太快提示放慢；速度用影格時間計算', () => {
  const r = run('squat', series(6, 'squat', {}, 1500, WARM, 1000), { camera: SIDE });
  assert.equal(r.reps.length, 6);
  assert.ok(r.tip('tempo') >= 2);
  assert.ok(r.reps.every((x) => x.durationMs < 1000));
});

test('深蹲：重心偏一邊（正面）→ 提示重心放中間', () => {
  const r = run('squat', series(6, 'squat', { shift: 0.12 }), { camera: FRONT });
  assert.equal(r.reps.length, 6);
  assert.ok(r.tip('balance') >= 2);
});

test('深蹲：膝蓋內夾（單鏡頭不可靠）→ 不提示、不扣分', () => {
  const r = run('squat', series(6, 'squat', { kneeIn: 18 }), { camera: FRONT });
  assert.equal(r.reps.length, 6);
  assert.equal(r.tips.length, 0);
  assert.ok(r.reps.every((x) => x.quality >= 0.75));
});

test('深蹲：沒站直又蹲下（半途反彈）→ 只算一下，並提示每下都要站直', () => {
  const P = new SynthPerson({ seed: 3, camera: SIDE });
  const ev = [];
  const a = new ExerciseAnalyzer({ exercise: 'squat', emit: (e) => ev.push(e) });
  const depthAt = (t) => {
    // 0~WARM 站著；之後 0→80°（1 秒）→ 40°（0.8 秒）→ 80°（0.8 秒）→ 0（1 秒）
    let u = t - WARM;
    if (u < 0) return 0;
    const seg = [[1000, 0, 80], [800, 80, 40], [800, 40, 80], [1000, 80, 0]];
    for (const [d, a0, a1] of seg) { if (u < d) return a0 + (a1 - a0) * (0.5 - Math.cos(Math.PI * u / d) / 2); u -= d; }
    return 0;
  };
  for (let t = 0; t < WARM + 6000; t += 33) {
    const d = depthAt(t);
    P.hold = t < WARM ? null : { name: 'squat', u: 0.5, opts: { depth: d } }; // bump(0.5) = 1 → 深度剛好 = d
    a.feed(P.step(t));
  }
  assert.equal(ev.filter((e) => e.type === 'rep').length, 1);
  assert.ok(ev.some((e) => e.type === 'hint' && e.code === 'bounce'));
});

// ── 亂動不能亂算 ──
for (const exercise of ['squat', 'jack', 'legRaise']) {
  test(`${exercise}：站著不動 60 秒（含抖動）→ 0 次`, () => {
    for (const camera of [FRONT, SIDE]) {
      const r = run(exercise, [], { camera, durationMs: 60000, jitter: 0.004 });
      assert.equal(r.reps.length, 0);
      assert.equal(r.partial.length, 0);
    }
  });
  test(`${exercise}：抓頭、彎腰撿東西、伸懶腰、往旁邊走 → 0 次`, () => {
    const script = [];
    for (let k = 0; k < 3; k++) for (const [i, m] of ['fidget', 'pickup', 'stretch', 'sidestep'].entries()) script.push([WARM + (k * 4 + i) * 3200, m]);
    const r = run(exercise, script, { camera: FRONT });
    assert.equal(r.reps.length, 0, `${exercise} 誤算 ${r.reps.length} 次`);
  });
}

test('走近、走遠鏡頭（身體在畫面裡變大變小）→ 不會被當成深蹲', () => {
  const walk = (dz) => (P) => { P.offset = [0, 0, dz]; };
  const script = [];
  for (let i = 0; i <= 40; i++) script.push([WARM + i * 150, walk(0.8 * Math.sin(i / 40 * Math.PI))]);
  const r = run('squat', script, { camera: FRONT, durationMs: WARM + 9000 });
  assert.equal(r.reps.length, 0);
  assert.equal(r.partial.length, 0);
});

test('兩個人同框 → 提示只留一位、不計次', () => {
  const ev = [];
  const a = new ExerciseAnalyzer({ exercise: 'squat', emit: (e) => ev.push(e) });
  for (const p of synthSequence(series(3, 'squat'), { durationMs: WARM + 10000, camera: SIDE })) a.feed({ ...p, others: 1 });
  assert.ok(ev.some((e) => e.type === 'status' && e.code === 'crowd'));
  assert.equal(ev.filter((e) => e.type === 'rep').length, 0);
});

// ── 鏡頭品質：漏格、亂跳、不穩定的格數 ──
test('深蹲：每秒 12～30 格不穩定、漏 15% 的格、偶發亂跳 → 10 下仍全部算到、不重複', () => {
  const fps = (t, rand) => 33 + rand() * 50; // 每格間隔 33～83 毫秒
  for (const seed of [1, 2, 3]) {
    const r = run('squat', series(10, 'squat'), { camera: SIDE, fps, drop: 0.15, spike: 0.05, jitter: 0.005, seed });
    assert.equal(r.reps.length, 10, `seed ${seed}: ${r.reps.length}`);
  }
});

test('開合跳：每秒 15 格 + 漏格 → 15 下全部算到', () => {
  const r = run('jack', series(15, 'jack', {}, 1200), { camera: FRONT, fps: 15, drop: 0.1, jitter: 0.004 });
  assert.equal(r.reps.length, 15);
});

test('中途走出畫面：那一下作廢、回來後繼續算，並提示看不到人', () => {
  const leave = (P) => { P.present = false; }, back = (P) => { P.present = true; };
  const script = [...series(4, 'squat'), [WARM + 4 * 3000 + 1000, leave], [WARM + 4 * 3000 + 2600, back], ...series(3, 'squat', {}, 3000, WARM + 6 * 3000)];
  // 第 5 下（WARM+12000 開始）蹲到一半就看不到人
  script.push([WARM + 4 * 3000, 'squat']);
  const r = run('squat', script, { camera: SIDE, durationMs: WARM + 9 * 3000 + 3000 });
  assert.ok(r.status.includes('lost'));
  assert.equal(r.reps.length, 7);
});

// ── 開合跳 ──
test('開合跳：標準 15 下（正面）全部算到；低衝擊版（不跳）也算', () => {
  for (const hop of [1, 0]) {
    const r = run('jack', series(15, 'jack', { hop }, 1200), { camera: FRONT });
    assert.equal(r.reps.length, 15);
    assert.ok(r.reps.every((x) => x.quality >= 0.75));
  }
});

test('開合跳：手只舉到肩膀 → 照算但提示舉到頭頂；腳沒張開 → 不算並提示', () => {
  const half = run('jack', series(8, 'jack', { arms: 0.5 }, 1200), { camera: FRONT });
  assert.equal(half.reps.length, 8);
  assert.ok(half.tip('arms') >= 2);
  const legs = run('jack', series(8, 'jack', { legs: 0.25 }, 1200), { camera: FRONT });
  assert.equal(legs.reps.length, 0);
  assert.ok(legs.tip('legs') >= 2);
});

test('開合跳：側面對鏡頭看不出來 → 不算、請玩家轉向鏡頭', () => {
  const r = run('jack', series(8, 'jack', {}, 1200), { camera: SIDE });
  assert.equal(r.reps.length, 0);
  assert.ok(r.status.includes('wrongView'));
});

test('開合跳：伸懶腰（手舉高、腳沒動）不算', () => {
  const r = run('jack', series(6, 'stretch', {}, 3000), { camera: FRONT });
  assert.equal(r.reps.length, 0);
});

// ── 側抬腿 ──
test('側抬腿：左右輪流各 4 下，分邊計次、品質好', () => {
  const r = run('legRaise', series(8, 'legRaise', (i) => ({ side: i % 2 ? 'right' : 'left' }), 2600), { camera: FRONT });
  assert.equal(r.reps.length, 8);
  assert.equal(r.a.reps.left, 4);
  assert.equal(r.a.reps.right, 4);
  assert.ok(r.reps.every((x) => x.quality >= 0.75));
  assert.equal(r.tips.length, 0);
});

test('側抬腿：上半身往另一邊倒（代償）→ 提示上半身直立', () => {
  const r = run('legRaise', series(6, 'legRaise', (i) => ({ side: i % 2 ? 'right' : 'left', lean: 16 }), 2600), { camera: FRONT });
  assert.equal(r.reps.length, 6);
  assert.ok(r.tip('lean') >= 2);
});

test('側抬腿：只抬一點點（10°）不算', () => {
  const r = run('legRaise', series(6, 'legRaise', { angle: 10 }, 2600), { camera: FRONT });
  assert.equal(r.reps.length, 0);
});

test('側抬腿：手機放歪 8°（不是玩家歪）→ 不會誤報身體歪', () => {
  const r = run('legRaise', series(6, 'legRaise', (i) => ({ side: i % 2 ? 'right' : 'left' }), 2600), { camera: { yaw: 0, roll: 8 } });
  assert.equal(r.reps.length, 6);
  assert.equal(r.tip('lean'), 0);
});

// ── 視角 ──
test('視角判斷：正面、斜角、側面', () => {
  for (const [yaw, want] of [[0, 'front'], [15, 'front'], [45, 'angled'], [80, 'side'], [90, 'side']]) {
    const r = run('squat', [], { camera: { yaw }, durationMs: 4000 });
    assert.equal(r.a.view.name, want, `yaw ${yaw}: ${r.a.view.name}（估計 ${r.a.view.yaw.toFixed(0)}°）`);
  }
});

test('不同擺法：手機放地上（低角度）、橫放 16:9、放遠 3.5 公尺 → 深蹲都算得到', () => {
  for (const camera of [{ yaw: 90, height: 0.25 }, { yaw: 60, aspect: 16 / 9, distance: 3.2 }, { yaw: 0, distance: 3.5, height: 1.1 }]) {
    const r = run('squat', series(6, 'squat'), { camera });
    assert.equal(r.reps.length, 6, JSON.stringify(camera));
  }
});

// ── 校正 ──
function calibrate(exercise, script, opts) {
  const c = new Calibrator({ exercise });
  for (const p of synthSequence(script, { durationMs: 30000, seed: 5, ...opts })) { c.feed(p); if (c.phase === 'done') break; }
  return c;
}

test('校正：柔軟度有限的人（只能蹲到大腿約 55°）→ 個人目標變低，之後正常計次', () => {
  // 先面向鏡頭量站姿，再轉成側身做 3 下
  const turn = (P) => { P.camera.yaw = 90; };
  const c = calibrate('squat', [[3500, turn], ...series(3, 'squat', { depth: 55 }, 3000, 5000)], { camera: { yaw: 0 } });
  assert.equal(c.phase, 'done');
  assert.equal(c.result.used, 'measured');
  const target = c.result.target;
  assert.ok(target > 0.2 && target < 0.32, 'target ' + target);
  const profile = { targets: { squat: target } };
  const mine = run('squat', series(6, 'squat', { depth: 55 }), { camera: SIDE, profile, base: c.result.baseline });
  assert.equal(mine.reps.length, 6);
  assert.ok(mine.reps.every((x) => x.quality >= 0.75));
  // 沒有校正（用預設目標）時，同樣的動作會被說「蹲太淺」
  const def = run('squat', series(6, 'squat', { depth: 55 }), { camera: SIDE });
  assert.ok(def.tip('depth') + def.partial.length > 0);
});

test('校正：看不到腳時不會開始，會說明怎麼調整', () => {
  const c = calibrate('squat', [], { camera: { yaw: 0, distance: 1.4, height: 1.3 }, durationMs: 5000 });
  assert.equal(c.phase, 'stand');
  assert.match(c.msg, /入鏡|往後退/);
});

test('校正：側抬腿左右各 2 下 → 個人角度', () => {
  const c = calibrate('legRaise', series(4, 'legRaise', (i) => ({ side: i % 2 ? 'right' : 'left', angle: 30 }), 2600, 3000), { camera: FRONT });
  assert.equal(c.phase, 'done');
  assert.ok(c.result.target > 22 && c.result.target < 30, 'target ' + c.result.target);
});

test('校正：開合跳只需要量站姿', () => {
  const c = calibrate('jack', [], { camera: FRONT });
  assert.equal(c.phase, 'done');
  assert.equal(c.result.target, null);
  assert.ok(c.result.baseline.spread0 > 0.4);
});

// ── 預錄骨架檔（和真機「錄骨架」同一種格式）──
import { readFileSync, readdirSync } from 'node:fs';
import { unpackPose } from '../src/pose.js';
test('預錄骨架檔（fixtures/exercise）重播：次數與提示符合預期', () => {
  const dir = new URL('../fixtures/exercise/', import.meta.url);
  const files = readdirSync(dir).filter((n) => n.endsWith('.json'));
  assert.ok(files.length >= 5);
  for (const f of files) {
    const clip = JSON.parse(readFileSync(new URL(f, dir)));
    const ev = [];
    const a = new ExerciseAnalyzer({ exercise: clip.exercise, emit: (e) => ev.push(e) });
    for (const row of clip.frames) a.feed(unpackPose(row), { aspect: clip.aspect });
    const reps = ev.filter((e) => e.type === 'rep').length;
    const tips = new Set(ev.filter((e) => e.type === 'hint' && e.kind === 'tip').map((e) => e.code));
    assert.equal(reps, clip.expect.reps, `${f}：算到 ${reps} 下`);
    for (const t of clip.expect.tips) assert.ok(tips.has(t), `${f}：應該提示 ${t}`);
    if (!clip.expect.tips.length) assert.equal(tips.size, 0, `${f}：不該有提示，卻有 ${[...tips]}`);
  }
});
