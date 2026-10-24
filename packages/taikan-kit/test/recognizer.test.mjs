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
    const { actions } = run(clip.frames.map(unpackPose));
    const got = {};
    for (const e of actions) { const k = e.type + (e.side ? ':' + e.side : '') + (e.dir ? ':' + e.dir : '') + (e.on !== undefined ? ':' + e.on : ''); got[k] = (got[k] || 0) + 1; }
    assert.deepEqual(got, clip.expect, f);
  }
});
