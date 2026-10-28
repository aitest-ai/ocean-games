// 自動測試：用模擬人偶產生骨架序列，檢查辨識器是否「該觸發的有觸發、不該觸發的沒觸發」。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Recognizer } from '../src/recognizer.js';
import { scriptPoses } from '../src/puppet.js';
import { unpackPose } from '../src/pose.js';

function run(poses, opts = {}) {
  const ev = [];
  const r = new Recognizer({ ...opts, emit: (e) => ev.push(e) });
  for (const p of poses) r.feed(p, p.t);
  return { actions: ev.filter((e) => e.type !== 'status'), status: ev.filter((e) => e.type === 'status'), r };
}
const count = (a, type, side) => a.filter((e) => e.type === type && (side === undefined || e.side === side)).length;
const WARM = 1500; // 先站好讓它自動校準

for (const fps of [30, 15]) {
  test(`划槳：左右交替各 3 次（${fps} fps）`, () => {
    const s = [];
    for (let i = 0; i < 6; i++) s.push([WARM + i * 800, i % 2 ? 'paddle-right' : 'paddle-left']);
    const { actions } = run(scriptPoses(s, { durationMs: WARM + 6 * 800 + 600, fps }));
    assert.equal(count(actions, 'paddle', 'left'), 3);
    assert.equal(count(actions, 'paddle', 'right'), 3);
    assert.equal(count(actions, 'swing'), 0);
    assert.equal(count(actions, 'jump'), 0);
  });
}

test('雙槳：雙手同時划只算一次 both', () => {
  const { actions } = run(scriptPoses([[WARM, 'paddle-both'], [WARM + 900, 'paddle-both']], { durationMs: WARM + 1800 }));
  assert.equal(count(actions, 'paddle', 'both'), 2);
  assert.equal(count(actions, 'paddle', 'left') + count(actions, 'paddle', 'right'), 0);
});

test('傾斜：向左、回正、向右', () => {
  const { actions, r } = run(scriptPoses([[WARM, 'hold:leanL:on'], [WARM + 800, 'hold:leanL:off'], [WARM + 1600, 'hold:leanR:on']], { durationMs: WARM + 2400 }));
  const sides = actions.filter((e) => e.type === 'lean').map((e) => e.side);
  assert.deepEqual(sides, ['left', 'center', 'right']);
  assert.ok(r.state.lean > 0.6, 'lean value ' + r.state.lean);
});

test('舉手：單手、雙手', () => {
  const { actions } = run(scriptPoses([
    [WARM, 'hold:raiseL:on'], [WARM + 700, 'hold:raiseL:off'],
    [WARM + 1500, 'hold:raiseL:on'], [WARM + 1500, 'hold:raiseR:on'], [WARM + 2300, 'hold:raiseL:off'], [WARM + 2300, 'hold:raiseR:off'],
  ], { durationMs: WARM + 3000 }));
  assert.equal(count(actions, 'raise', 'left'), 1);
  assert.equal(count(actions, 'raise', 'both'), 1);
  assert.equal(count(actions, 'raise', 'right'), 0);
  assert.equal(count(actions, 'paddle'), 0);
});

test('跳躍兩次，落地不算蹲', () => {
  const { actions } = run(scriptPoses([[WARM, 'jump'], [WARM + 1200, 'jump']], { durationMs: WARM + 2200 }));
  assert.equal(count(actions, 'jump'), 2);
  assert.equal(count(actions, 'crouch'), 0);
});

test('蹲低：開始與結束各一次', () => {
  const { actions } = run(scriptPoses([[WARM, 'hold:crouch:on'], [WARM + 1000, 'hold:crouch:off']], { durationMs: WARM + 1800 }));
  assert.deepEqual(actions.filter((e) => e.type === 'crouch').map((e) => e.on), [true, false]);
  assert.equal(count(actions, 'jump'), 0);
});

test('揮臂：往左、往右', () => {
  const { actions } = run(scriptPoses([[WARM, 'swing-left'], [WARM + 900, 'swing-right']], { durationMs: WARM + 1800 }));
  assert.deepEqual(actions.filter((e) => e.type === 'swing').map((e) => e.dir), ['left', 'right']);
  assert.equal(count(actions, 'paddle'), 0);
});

test('雙手揮棒：往左、往右各一次，不會多算成單手揮臂或划槳', () => {
  const { actions } = run(scriptPoses([[WARM, 'bat-left'], [WARM + 1000, 'bat-right']], { durationMs: WARM + 2000 }));
  const bats = actions.filter((e) => e.type === 'bat');
  assert.deepEqual(bats.map((e) => e.dir), ['left', 'right']);
  assert.ok(bats.every((e) => ['high', 'mid', 'low'].includes(e.height)));
  assert.equal(count(actions, 'swing'), 0);
  assert.equal(count(actions, 'paddle'), 0);
  // 人偶前 0.2 秒是往後拉，往前揮到一半（開始後約 0.4 秒內）就要送出（打擊要抓時機）
  assert.ok(bats[0].time - WARM < 400, 'latency ' + (bats[0].time - WARM));
});

test('單手揮臂不算雙手揮棒；關閉 bat 時雙手揮棒退回成單手揮臂', () => {
  const one = run(scriptPoses([[WARM, 'swing-left']], { durationMs: WARM + 900 }));
  assert.equal(count(one.actions, 'bat'), 0);
  const off = run(scriptPoses([[WARM, 'bat-left']], { durationMs: WARM + 900 }), { disabled: ['bat'] });
  assert.equal(count(off.actions, 'bat'), 0);
  assert.ok(count(off.actions, 'swing') >= 1);
});

test('誤判：站著小幅亂動 + 大量抖動，不應觸發任何動作', () => {
  const s = [];
  for (let i = 0; i < 8; i++) s.push([WARM + i * 1000, 'wave']);
  const { actions } = run(scriptPoses(s, { durationMs: WARM + 9000, jitter: 0.008, seed: 3 }));
  assert.deepEqual(actions.filter((e) => e.type !== 'lean'), []);
  assert.equal(count(actions, 'lean'), 0);
});

test('關閉的動作不會送出', () => {
  const { actions } = run(scriptPoses([[WARM, 'jump'], [WARM + 1000, 'paddle-left']], { durationMs: WARM + 2000 }), { disabled: ['jump'] });
  assert.equal(count(actions, 'jump'), 0);
  assert.equal(count(actions, 'paddle', 'left'), 1);
});

test('人離開畫面 → status lost；回來 → ok', () => {
  const poses = scriptPoses([], { durationMs: 3000 });
  const gap = poses.map((p) => (p.t > 1200 && p.t < 2000 ? { t: p.t, kp: {} } : p));
  const { status } = run(gap);
  const seq = status.filter((e) => e.tracking).map((e) => e.tracking);
  assert.ok(seq.includes('lost') && seq.lastIndexOf('ok') > seq.indexOf('lost'), seq.join(','));
});

test('預錄檔（fixtures）都能播放並得到預期動作', () => {
  for (const f of readdirSync(new URL('../fixtures/', import.meta.url)).filter((n) => n.endsWith('.json'))) {
    const clip = JSON.parse(readFileSync(new URL('../fixtures/' + f, import.meta.url)));
    // options：例如打擊模式的預錄檔要開 sideOk；expectTypes：只比對這幾種事件（人偶影像經 MediaPipe 的骨架會有些傾斜等雜訊事件）
    const { actions } = run(clip.frames.map(unpackPose), clip.options || {});
    const got = {};
    for (const e of actions) {
      if (clip.expectTypes && !clip.expectTypes.includes(e.type)) continue; const k = e.type + (e.side ? ':' + e.side : '') + (e.dir ? ':' + e.dir : '') + (e.on !== undefined ? ':' + e.on : ''); got[k] = (got[k] || 0) + 1; }
    assert.deepEqual(got, clip.expect, f);
  }
});

test('兩個人同時入鏡超過 1 秒 → status crowd；離開後恢復 ok', () => {
  const poses = scriptPoses([], { durationMs: 4000 }).map((p) => ({ ...p, others: p.t > 1500 && p.t < 3000 ? 1 : 0 }));
  const { status } = run(poses);
  const seq = status.filter((e) => e.tracking).map((e) => e.tracking);
  assert.deepEqual(seq.slice(-2), ['crowd', 'ok']);
});

// 側身站（打棒球的站姿）：兩肩疊在一起，遠側的肩、髖、手被擋住（可信度很低）
function sidePoses({ swingAt = 1800, fps = 20, durationMs = 3200, hideFarWrist = true } = {}) {
  const poses = [];
  for (let t = 0; t <= durationMs; t += 1000 / fps) {
    const u = Math.min(Math.max((t - swingAt) / 250, 0), 1);           // 揮棒 0.25 秒：手從身後揮到身前
    const hx = 0.4 + 0.22 * u, hy = 0.5 - 0.03 * Math.sin(u * Math.PI);
    const kp = {
      nose: { x: 0.5, y: 0.25, v: 0.9 },
      leftShoulder: { x: 0.5, y: 0.35, v: 0.95 }, rightShoulder: { x: 0.505, y: 0.35, v: 0.15 },
      leftHip: { x: 0.5, y: 0.62, v: 0.9 }, rightHip: { x: 0.5, y: 0.62, v: 0.1 },
      leftElbow: { x: hx - 0.02, y: 0.45, v: 0.8 }, rightElbow: { x: hx - 0.02, y: 0.45, v: 0.2 },
      leftWrist: { x: hx, y: hy, v: 0.9 }, rightWrist: { x: hx + 0.01, y: hy, v: hideFarWrist ? 0.1 : 0.9 },
    };
    poses.push({ t, kp });
  }
  return poses;
}

test('側身站：只看得到一邊的肩與手，也能認出雙手揮棒，而且不會變成「看不到你」', () => {
  const { actions, status } = run(sidePoses(), { sideOk: true });
  assert.equal(count(actions, 'bat'), 1);
  assert.ok(!status.some((e) => e.tracking === 'lost'), '不該判成看不到人');
});

test('側身站：沒揮棒時不會亂觸發', () => {
  const { actions } = run(sidePoses({ swingAt: 99999 }), { sideOk: true });
  assert.equal(count(actions, 'bat'), 0);
});

test('沒開側身模式時，側身站仍維持原本行為（看不到兩肩＝看不到人）', () => {
  const { actions, r } = run(sidePoses(), {});
  assert.equal(count(actions, 'bat'), 0);
  assert.equal(r.state.tracking, 'lost');
});

// 揮棒延遲：fixtures/mp-bat-*.json 是 three.js 人偶揮棒影像經 MediaPipe（30 fps）算出的骨架，
// 檔案裡記著真實的「雙手開始往前加速」時間（onsets）與擊球時間（contacts）
test('揮棒起動 batStart：人偶揮棒後 260 毫秒內送出，而且比 bat 早或同時；收棒不會再觸發', () => {
  for (const n of ['mp-bat-front', 'mp-bat-side', 'mp-bat-side-seated']) {
    const clip = JSON.parse(readFileSync(new URL(`../fixtures/${n}.json`, import.meta.url)));
    const { actions } = run(clip.frames.map(unpackPose), { sideOk: true });
    const starts = actions.filter((e) => e.type === 'batStart'), bats = actions.filter((e) => e.type === 'bat');
    assert.equal(starts.length, clip.onsets.length, n + ' batStart 次數');
    assert.equal(bats.length, clip.onsets.length, n + ' bat 次數');
    clip.onsets.forEach((on, i) => {
      const lag = starts[i].time - on;
      assert.ok(lag >= 0 && lag <= 260, `${n} 第 ${i + 1} 次 batStart 延遲 ${lag} ms`);
      assert.ok(starts[i].time <= bats[i].time, n + ' batStart 要比 bat 早');
      assert.ok(bats[i].time - on <= 300, `${n} 第 ${i + 1} 次 bat 延遲 ${bats[i].time - on} ms`);
      assert.ok(Math.abs(bats[i].onset - on) <= 120, `${n} bat.onset ${bats[i].onset} 應接近真實起動 ${on}`);
    });
  }
});

test('側身站＋抖動與小動作：不會觸發揮棒起動', () => {
  const rnd = ((s) => () => ((s = (s * 16807) % 2147483647) / 2147483647))(7);
  const poses = sidePoses({ swingAt: 99999, durationMs: 6000, fps: 30 }).map((p) => {
    const kp = {};
    const wob = 0.012 * Math.sin(p.t / 300);   // 手在肩膀旁邊小幅晃動（等球時）
    for (const [k, v] of Object.entries(p.kp)) kp[k] = { ...v, x: v.x + (rnd() - 0.5) * 0.008 + (k.includes('Wrist') || k.includes('Elbow') ? wob : 0), y: v.y + (rnd() - 0.5) * 0.008 };
    return { t: p.t, kp };
  });
  const { actions } = run(poses, { sideOk: true });
  assert.equal(count(actions, 'batStart') + count(actions, 'bat'), 0);
});
