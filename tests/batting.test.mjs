// 打擊練習的規則測試：投球會進好球帶、時機判定的方向、擊球飛行的結果分類、三種難度的模擬玩家。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIFFICULTY, makePitch, judgeSwing, flyBall, Session, rng, PLATE_Z } from '../src/game/batting-logic.js';
import { FIELD, BASES, fenceR, isFair } from '../src/land/dims.js';

test('場地尺寸：少棒 60 呎場地', () => {
  assert.ok(Math.abs(FIELD.base - 18.288) < 1e-3);
  assert.ok(Math.abs(FIELD.pitch - 14.021) < 1e-3);
  assert.ok(Math.abs(Math.hypot(...BASES.second) - 25.863) < 1e-2, '本壘到二壘 84 呎 10¼ 吋');
  assert.ok(Math.abs(fenceR(Math.PI / 4) - 60.96) < 1e-2, '界線全壘打牆 200 呎');
  assert.ok(isFair(0, 30) && !isFair(30, 10) && !isFair(0, -3));
});

test('投球：好球會通過好球帶、到本壘的時間符合球速', () => {
  const R = rng(3);
  for (const d of Object.values(DIFFICULTY)) {
    for (let i = 0; i < 50; i++) {
      const p = makePitch(d, R);
      const [x, y, z] = p.pos(p.T);
      assert.ok(Math.abs(z - PLATE_Z) < 1e-6);
      if (p.strike) {
        assert.ok(Math.abs(x) <= FIELD.plateWidth / 2 + 0.01, 'x ' + x);
        assert.ok(y >= FIELD.strikeZone[0] && y <= FIELD.strikeZone[1], 'y ' + y);
      }
      assert.ok(p.T > 0.55 && p.T < 1.3, 'T ' + p.T);
    }
  }
});

test('時機：剛好 → 打進場內；太早 → 拉向三壘側界外；太晚 → 一壘側；差太多 → 揮空', () => {
  const d = DIFFICULTY.normal, R = rng(5);
  const p = { strike: true, target: [0, 0.75] };
  const ok = judgeSwing(0, d, { pitch: p, rand: R });
  assert.ok(ok.contact && ok.q > 0.95 && Math.abs(ok.spray) < 0.1);
  const early = judgeSwing(-d.window * 1.4, d, { pitch: p, rand: R });
  assert.ok(early.contact && early.spray > Math.PI / 4, '太早 → 三壘側界外');
  const late = judgeSwing(d.window * 1.4, d, { pitch: p, rand: R });
  assert.ok(late.contact && late.spray < -Math.PI / 4, '太晚 → 一壘側界外');
  const lefty = judgeSwing(-d.window * 1.4, d, { pitch: p, lefty: true, rand: R });
  assert.ok(lefty.spray < -Math.PI / 4, '左打者太早 → 一壘側');
  assert.equal(judgeSwing(d.window * 2, d, { pitch: p, rand: R }).contact, false);
  assert.equal(judgeSwing(-0.5, d, { pitch: p, rand: R }).contact, false);
});

test('擊球飛行：強勁平飛 → 全壘打；角度太偏 → 界外；軟弱滾地 → 出局', () => {
  const d = DIFFICULTY.normal;
  assert.equal(flyBall({ spray: 0, launch: 28, exit: 38 }, d).result, 'homer');
  assert.equal(flyBall({ spray: 1.1, launch: 20, exit: 30 }, d).result, 'foul');
  assert.equal(flyBall({ spray: 0.2, launch: 2, exit: 12 }, d).result, 'out');
  assert.equal(flyBall({ spray: -0.3, launch: 14, exit: 27 }, d).result, 'hit');
  const wall = flyBall({ spray: 0, launch: 18, exit: 34 }, d);
  assert.ok(['long', 'homer'].includes(wall.result));
});

// 模擬玩家：揮棒時間誤差為常態分布（標準差 sigma 秒），好球都揮、壞球有三成會追打
function play(d, sigma, seed, n = 20) {
  const R = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(R(), 1e-9))) * Math.cos(2 * Math.PI * R());
  const stars = [], hits = [];
  for (let s = 0; s < n; s++) {
    const S = new Session(d);
    while (!S.done) {
      const p = makePitch(d, R);
      if (!p.strike && R() > 0.3) { S.record('take'); continue; }
      const j = judgeSwing(gauss() * sigma, d, { strength: 0.7, pitch: p, rand: R });
      S.record(j.contact ? flyBall(j, d).result : 'miss');
    }
    stars.push(S.stars()); hits.push(S.hits / d.pitches);
  }
  return { stars, hit: hits.reduce((a, b) => a + b, 0) / n };
}

test('難度：時機誤差 0.09 秒的模擬玩家，三種難度都至少 2 星；越難安打率越低', () => {
  const r = Object.fromEntries(Object.entries(DIFFICULTY).map(([k, d]) => [k, play(d, 0.09, 11)]));
  for (const [k, x] of Object.entries(r)) assert.ok(Math.min(...x.stars) >= 2, k + ' stars ' + x.stars);
  assert.ok(r.easy.hit > r.normal.hit && r.normal.hit > r.hard.hit, JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x.hit.toFixed(2)]))));
  assert.ok(r.easy.hit > 0.8, 'easy hit rate ' + r.easy.hit);
});

test('難度：時機比較不準（誤差 0.15 秒）的學生，簡單模式仍能拿 2 星以上', () => {
  const x = play(DIFFICULTY.easy, 0.15, 13);
  assert.ok(Math.min(...x.stars) >= 2, 'stars ' + x.stars);
});

test('球會飛過本壘板、到達捕手手套（不會在本壘前停住）', async () => {
  const { makePitch, MITT_Z, PLATE_Z, DIFFICULTY } = await import('../src/game/batting-logic.js');
  for (const k of Object.keys(DIFFICULTY)) {
    const p = makePitch(DIFFICULTY[k], () => 0.5);
    const tMitt = p.T + (MITT_Z - PLATE_Z) / p.vel(p.T)[2]; // 與 batting.js 的算法相同
    assert.ok(tMitt > p.T, '手套時間要在本壘板之後');
    assert.ok(p.pos(tMitt)[2] <= MITT_Z + 0.01, '球要到手套的位置');
  }
});
