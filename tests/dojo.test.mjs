// 道場流程的自動測試（不需要 GPU）：模擬學生（全身模擬人偶）看示範做動作 → 武術辨識器 → 打分流程。
// 走的是跟遊戲一樣的路：人偶產生骨架 → MartialRecognizer → Routine，不是直接送「出拳」事件。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Routine, DIFFICULTY, buildSteps } from '../src/dojo/routine.js';
import { MartialPuppet, MartialRecognizer, applyAction } from '../packages/taikan-kit/martial/index.js';

// 模擬學生：慢示範 react 秒才跟上（蹲馬步），出拳時間有 ±jitter 秒的誤差，偶爾出錯手
function play(diff, { settings = {}, react = 0.8, jitter = 0.12, wrongHand = 0, idle = false, skipAll = false, seed = 1 } = {}) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const r = new Routine(diff, settings);
  const pup = new MartialPuppet({ seed, jitter: 0.003 });
  pup.seated = !!settings.seated;
  const rec = new MartialRecognizer({ disabled: settings.knee ? [] : ['knee'], emit: (e) => { const g = r.hit(e.type, e.side); if (g) grades.push(g.grade); } });
  const grades = [];
  const dt = 1 / 30;
  let t = 0, stepIndex = -1, stepStart = 0, plan = null, queue = [];
  while (!r.done && t < 600) {
    if (r.i !== stepIndex) {
      stepIndex = r.i; stepStart = t; plan = r.demoPlan(); queue = [];
      if (skipAll && r.step.kind !== 'cooldown') { r.skip(); continue; }
      if (!idle) {
        // 照示範做：先站好（或蹲好），再在每個拍子附近出拳
        applyAction(pup, plan.wide ? 'hold:wide:on' : 'hold:wide:off', t * 1000);
        queue.push([stepStart + react, `depth:${plan.depth}`]);
        for (const [at, a] of plan.actions) {
          const side = a.endsWith('left') ? 'left' : 'right';
          const act = rand() < wrongHand ? a.replace(side, side === 'left' ? 'right' : 'left') : a;
          queue.push([stepStart + at + (rand() * 2 - 1) * jitter, act]);
        }
        queue.sort((a, b) => a[0] - b[0]);
      }
    }
    while (queue.length && queue[0][0] <= t) applyAction(pup, queue.shift()[1], t * 1000);
    const pose = pup.step(t * 1000);
    rec.feed(pose, t * 1000);
    r.update(dt, { seen: rec.state.seen, fullBody: rec.state.fullBody, stance: rec.state.stance, hint: rec.state.hint, calibrate: () => rec.calibrate() });
    t += dt;
  }
  return { r, res: r.result(), t, grades };
}

for (const diff of Object.keys(DIFFICULTY)) {
  test(`${diff}：跟著示範做的學生，每段都完成並拿到 3 星`, () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { res, t } = play(diff, { seed });
      assert.equal(res.stars, 3, `seed ${seed}: ` + JSON.stringify(res));
      assert.ok(t < 200, 'too long: ' + t);
    }
  });
  test(`${diff}：動作比較不準（時間誤差 ±0.35 秒、偶爾出錯手）也至少 2 星`, () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { res } = play(diff, { seed, jitter: 0.35, wrongHand: 0.15, react: 2 });
      assert.ok(res.stars >= 2, `seed ${seed}: ` + JSON.stringify(res));
    }
  });
}

test('什麼都不做（只站著）：每段時間到就自動往下，一場會結束，給 1 星', () => {
  const { r, res, t } = play('normal', { idle: true });
  assert.ok(r.done);
  assert.equal(res.stars, 1);
  assert.ok(t < 120, 'ends in time: ' + t);
});

test('每段都可以跳過；全部跳過也能結束，跳過的段落不算分', () => {
  const { r, res } = play('hard', { skipAll: true });
  assert.ok(r.done);
  assert.ok(res.lines.every((l) => l.text === '跳過'), JSON.stringify(res.lines));
});

test('坐著玩：坐姿馬步＋出拳，可以拿到 3 星', () => {
  for (const diff of Object.keys(DIFFICULTY)) {
    const { res, r } = play(diff, { settings: { seated: true } });
    assert.equal(res.stars, 3, diff + ': ' + JSON.stringify(res));
    assert.ok(r.steps.find((s) => s.kind === 'stance').seated);
    assert.ok(!r.steps.some((s) => s.stance), '坐著時沖拳不要求馬步');
  }
});

test('選單的「不做馬步」「不出拳」「提膝（實驗）」會改變段落', () => {
  const kinds = (s) => buildSteps('normal', s).map((x) => x.kind + (x.prop ? ':' + x.prop : x.target ? ':' + x.target : ''));
  assert.deepEqual(kinds({}), ['ready', 'stance:0.4', 'punch:bag', 'punch:dummy', 'cooldown']);
  assert.deepEqual(kinds({ noStance: true }), ['ready', 'punch:bag', 'punch:dummy', 'cooldown']);
  assert.deepEqual(kinds({ noPunch: true }), ['ready', 'stance:0.4', 'cooldown']);
  assert.deepEqual(kinds({ knee: true }), ['ready', 'stance:0.4', 'punch:bag', 'punch:dummy', 'knee', 'cooldown']);
  assert.ok(!buildSteps('normal', { noStance: true }).find((s) => s.prop === 'dummy').stance);
  assert.ok(!buildSteps('normal', { knee: true, seated: true }).some((s) => s.kind === 'knee'), '坐著不做提膝');
});

test('提膝（實驗）打開時，跟著做也能完成', () => {
  const { res } = play('normal', { settings: { knee: true } });
  const k = res.lines.find((l) => l.title.startsWith('提膝'));
  assert.ok(k.score >= 80, JSON.stringify(res));
});

test('出錯手會判「換另一隻手」，不算錯過', () => {
  const r = new Routine('easy', { noStance: true });
  r.update(0.1, { seen: true, fullBody: true }); r.update(1.6, { seen: true, fullBody: true }); // 準備：站好 1.5 秒
  assert.equal(r.step.prop, 'bag');
  r.update(r.step.cues[0].at + 0.1, {});
  assert.equal(r.hit('punch', 'right').grade, 'side');
  r.update(r.step.cues[1].at - r.t + 0.1, {});
  assert.equal(r.hit('punch', 'right').grade, 'perfect');
  assert.equal(r.hit('punch', 'left').grade, 'free', '拍子之外的出拳只給沙包反應，不算分');
});
