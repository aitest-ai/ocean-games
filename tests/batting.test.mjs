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

// ── 球種、3×3 好球帶、揮棒高低 ──
import { PITCH_TYPES, ZONE, STRIKE_CELLS, BALL_CELLS, cellTarget, cellOf, idealShift, makeTune, TUNE_DEFAULT, SCORE } from '../src/game/batting-logic.js';
import { sampleFromHands, swingFeatures, describeSwing, baselineFrom, patchBatPuppet, DEFAULT_BASE } from '../src/game/batting-swing.js';
import { Recognizer } from '../packages/taikan-kit/src/recognizer.js';
import { Puppet } from '../packages/taikan-kit/src/puppet.js';
import { unpackPose } from '../packages/taikan-kit/src/pose.js';
import { readFileSync } from 'node:fs';

test('九宮格：9 個好球格都在好球帶內、8 個壞球位置都在外面，而且判得回同一格', () => {
  for (const c of STRIKE_CELLS) {
    const [x, y] = cellTarget(c);
    assert.ok(Math.abs(x) < ZONE.halfWidth && y > ZONE.low && y < ZONE.high, 'cell ' + c);
    assert.deepEqual(cellOf(x, y), { strike: true, cell: c });
  }
  // 由捕手看：0 在左上（三壘側、高），8 在右下
  assert.ok(cellTarget(0)[0] > cellTarget(2)[0] && cellTarget(0)[1] > cellTarget(6)[1]);
  for (const c of BALL_CELLS) {
    const [x, y] = cellTarget(c);
    const r = cellOf(x, y);
    assert.equal(r.strike, false, c);
    assert.equal(r.cell, c);
  }
});

test('球種：五種都有，球速、軌跡不同，最後都進到指定的格子', () => {
  const d = DIFFICULTY.hard;
  const P = Object.fromEntries(Object.keys(PITCH_TYPES).map((k) => [k, makePitch(d, () => 0.5, { type: k, cell: 4 })]));
  assert.deepEqual(Object.keys(P).sort(), ['changeup', 'curve', 'fastball', 'slider', 'splitter']);
  for (const [k, p] of Object.entries(P)) {
    const [x, y] = p.pos(p.T);
    assert.ok(Math.abs(x - p.target[0]) < 1e-6 && Math.abs(y - p.target[1]) < 1e-6, k + ' 要進到目標格');
    assert.ok(p.T > 0.5 && p.T < 1.4, k + ' T ' + p.T);
  }
  // 球速：直球最快、曲球最慢
  assert.ok(P.fastball.kmh > P.splitter.kmh && P.splitter.kmh >= P.slider.kmh && P.slider.kmh > P.changeup.kmh && P.changeup.kmh > P.curve.kmh);
  // 變化：比「沒有變化」的路徑多出的位移（看最後 1/3 段）
  const extra = (p, u) => { const q = p.pos(u * p.T); const base = p.pos(u * p.T).map((v, i) => v - (i < 2 ? p.brk[i] * Math.pow(u, PITCH_TYPES[p.type].late) : 0)); return [q[0] - base[0], q[1] - base[1]]; };
  assert.ok(P.curve.brk[1] < -0.3, '曲球往下掉最多');
  assert.ok(P.slider.brk[0] < -0.2 && Math.abs(P.slider.brk[0]) > Math.abs(P.slider.brk[1]), '滑球主要往一壘側橫移');
  // 指叉球：掉落幾乎都發生在最後 1/4（看起來像直球）；曲球比較早開始掉
  const lateShare = (p) => 1 - Math.abs(extra(p, 0.75)[1] / p.brk[1]);
  assert.ok(lateShare(P.splitter) > 0.65, 'splitter late ' + lateShare(P.splitter));
  assert.ok(lateShare(P.curve) < lateShare(P.splitter), '曲球比指叉球早開始掉');
});

test('難度決定球種：簡單只有直球，挑戰五種都會出現', () => {
  const R = rng(9), seen = (d) => new Set(Array.from({ length: 400 }, () => makePitch(d, R).type));
  assert.deepEqual([...seen(DIFFICULTY.easy)], ['fastball']);
  assert.deepEqual([...seen(DIFFICULTY.normal)].sort(), ['changeup', 'curve', 'fastball']);
  assert.equal(seen(DIFFICULTY.hard).size, 5);
});

test('可調設定：球速倍率、時機寬容度倍率有作用，超出範圍會被夾住', () => {
  const slow = makePitch(DIFFICULTY.normal, () => 0.5, { type: 'fastball', cell: 4, tune: makeTune({ speedScale: 0.8 }) });
  const norm = makePitch(DIFFICULTY.normal, () => 0.5, { type: 'fastball', cell: 4 });
  assert.ok(Math.abs(slow.kmh / norm.kmh - 0.8) < 0.03);
  assert.equal(makeTune({ windowScale: 99 }).windowScale, 1.8);
  assert.equal(makeTune({ heightTol: 'x' }).heightTol, TUNE_DEFAULT.heightTol);
  const p = { strike: true, target: [0, 0.75] }, d = DIFFICULTY.hard;
  assert.equal(judgeSwing(d.window * 1.5, d, { pitch: p, rand: rng(1) }).foulTip, true, '預設：1.5 倍寬容度外是擦棒');
  assert.ok(judgeSwing(d.window * 1.5, d, { pitch: p, rand: rng(1), tune: makeTune({ windowScale: 1.8 }) }).qt > 0, '寬容度調大後算打到');
});

test('內外角：內角要早一點、外角要晚一點揮（由球的位置算，不是偵測）', () => {
  const d = DIFFICULTY.normal;
  const inside = { strike: true, target: cellTarget(3) }, outside = { strike: true, target: cellTarget(5) };
  assert.ok(idealShift(inside, d) < 0 && idealShift(outside, d) > 0, '右打者：三壘側＝內角，要提早');
  assert.ok(idealShift(inside, d, { lefty: true }) > 0, '左打者相反');
  const at = (p, e) => judgeSwing(e, d, { pitch: p, rand: rng(2) }).qt;
  assert.ok(at(inside, idealShift(inside, d)) > at(inside, -idealShift(inside, d)), '內角提早打比較好');
  assert.ok(Math.abs(idealShift(inside, d, { tune: makeTune({ inOut: 0 }) })) < 1e-12, 'inOut＝0 就不分內外角');
});

test('揮棒高低：對準球的高度 → 打進場內；揮在球下面 → 往上飛；揮在球上面 → 滾地；差太多 → 揮空', () => {
  const d = DIFFICULTY.normal;
  for (const c of STRIKE_CELLS) {
    const p = { strike: true, target: cellTarget(c) };
    const e = idealShift(p, d);
    const good = judgeSwing(e, d, { pitch: p, swing: { plane: 0, heightM: p.target[1], power: 1, reliable: true }, rand: rng(c + 1) });
    assert.ok(good.contact && !good.foulTip && good.qh > 0.95, 'cell ' + c);
    const res = flyBall(good, d, [p.target[0], p.target[1], 0.25]).result;
    assert.notEqual(res, 'foul', 'cell ' + c + ' 對準了不該界外');
    const under = judgeSwing(e, d, { pitch: p, swing: { plane: 0, heightM: p.target[1] - 0.18, power: 1, reliable: true }, rand: rng(3) });
    const over = judgeSwing(e, d, { pitch: p, swing: { plane: 0, heightM: p.target[1] + 0.18, power: 1, reliable: true }, rand: rng(3) });
    assert.ok(under.launch > good.launch + 15, 'cell ' + c + ' 揮在下面 → 仰角變大');
    assert.ok(over.launch < 10, 'cell ' + c + ' 揮在上面 → 滾地 ' + over.launch);
    const way = judgeSwing(e, d, { pitch: p, swing: { plane: 0, heightM: p.target[1] + 0.6, power: 1, reliable: true }, rand: rng(3) });
    assert.equal(way.contact, false, 'cell ' + c + ' 差 60 公分 → 揮空');
  }
  // 簡單模式：高低差很多也不會揮空（只改變方向）
  const p = { strike: true, target: cellTarget(4) };
  assert.equal(judgeSwing(0, DIFFICULTY.easy, { pitch: p, swing: { plane: 0, heightM: 1.3, power: 1 }, rand: rng(4) }).contact, true);
  // 挑對低球比較寬容、劈對高球比較寬容
  const low = { strike: true, target: cellTarget(7) };
  const q = (plane) => judgeSwing(0, d, { pitch: low, swing: { plane, heightM: low.target[1] + 0.15, power: 1, reliable: true }, rand: rng(5) }).qh;
  assert.ok(q(1) > q(0) && q(0) >= q(-1));
});

// 模擬玩家：每一球決定揮不揮，揮棒時間誤差 sigma、高低誤差 hSigma（公尺）
function playFull(d, { sigma = 0.08, hSigma = 0.08, swingBalls = 0.3, seed = 1, n = 20, strategy = 'good' } = {}) {
  const R = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(R(), 1e-9))) * Math.cos(2 * Math.PI * R());
  const stars = [], scores = [], hits = [];
  for (let s = 0; s < n; s++) {
    const S = new Session(d);
    while (!S.done) {
      const p = makePitch(d, R);
      let swing = null, e;
      if (strategy === 'none') { S.record(p.strike ? 'looking' : 'take', { type: p.type }); continue; }
      if (strategy === 'random') {
        // 亂揮：每球都揮、時間隨便（±0.5 秒）、高低隨便
        e = (R() - 0.5) * 1.0;
        swing = { plane: Math.floor(R() * 3) - 1, heightM: 0.2 + R() * 1.1, power: 1, reliable: true };
      } else {
        if (!p.strike && R() > swingBalls) { S.record('take', { type: p.type }); continue; }
        e = idealShift(p, d) + gauss() * sigma;
        swing = { plane: 0, heightM: p.target[1] + gauss() * hSigma, power: 0.9, reliable: true };
      }
      const j = judgeSwing(e, d, { pitch: p, swing, rand: R });
      S.record(j.contact ? flyBall(j, d, [p.target[0], p.target[1], 0.25]).result : 'miss', { type: p.type });
    }
    stars.push(S.stars()); scores.push(S.score); hits.push(S.hits / d.pitches);
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { stars, score: avg(scores), hit: avg(hits), minStars: Math.min(...stars) };
}

test('模擬玩家：時機與高低都還算準的學生，三種難度（含各種球種）都至少 2 星', () => {
  for (const [k, d] of Object.entries(DIFFICULTY)) {
    const r = playFull(d, { sigma: 0.07, hSigma: 0.07, seed: 21 });
    assert.ok(r.minStars >= 2, `${k} stars ${r.stars}`);
  }
});

test('不揮棒、亂揮棒都拿不到高分', () => {
  for (const [k, d] of Object.entries(DIFFICULTY)) {
    const none = playFull(d, { strategy: 'none', seed: 31 });
    const rand = playFull(d, { strategy: 'random', seed: 32, n: 60 });
    const good = playFull(d, { sigma: 0.07, hSigma: 0.07, seed: 33 });
    // 只看不揮：只有壞球的「選得好」分數
    assert.ok(none.score <= d.pitches * d.ballRate * SCORE.take * 2 + 1, `${k} none ${none.score}`);
    assert.ok(none.hit === 0);
    assert.ok(rand.hit < 0.3, `${k} random hit ${rand.hit.toFixed(2)}`);
    assert.ok(rand.score < good.score * 0.45, `${k} random ${rand.score.toFixed(0)} vs good ${good.score.toFixed(0)}`);
    // 亂揮：普通、挑戰拿不到 3 星、拿到 2 星的機會低於 1 成；簡單模式本來就很寬鬆（給動作慢的學生），
    // 亂揮碰巧拿 3 星的機會也要低於 5%
    const three = rand.stars.filter((x) => x === 3).length / rand.stars.length;
    assert.ok(k === 'easy' ? three < 0.05 : three === 0, `${k} random stars ${rand.stars}`);
    if (k !== 'easy') assert.ok(rand.stars.filter((x) => x >= 2).length / rand.stars.length < 0.1, `${k} random stars ${rand.stars}`);
  }
});

// ── 揮棒特徵（從骨架累積）──
function runSwings(poses, kind) {
  const samples = [], out = [];
  const r = new Recognizer({ sideOk: true, emit: (e) => { if (e.type === 'bat') out.push(e); } });
  for (const p of poses) {
    const n0 = out.length;
    r.feed(p, p.t);
    const s = sampleFromHands(p.t, r.state.hands); if (s) samples.push(s);
    if (out.length > n0) { const e = out[out.length - 1]; e.f = swingFeatures(samples, { t: e.time, onset: e.onset }); e.d = describeSwing(e.f, DEFAULT_BASE[kind]); }
  }
  return out;
}
function puppetSwings(plane) {
  const pup = patchBatPuppet(new Puppet({ seed: 3, jitter: 0.003 }));
  const poses = [];
  for (let t = 0; t < 9000; t += 1000 / 30) { if ([1500, 4000, 6500].some((x) => Math.abs(t - x) < 16)) pup.trigger('bat-' + plane, t); poses.push(pup.step(t)); }
  return runSwings(poses, 'keyboard');
}

test('鍵盤模擬的三種揮法：挑（低、往上）、平、劈（高、往下）都分得出來，而且仍然是一次 bat', () => {
  const up = puppetSwings('up'), flat = puppetSwings('flat'), down = puppetSwings('down');
  for (const [name, ev, plane] of [['up', up, 1], ['flat', flat, 0], ['down', down, -1]]) {
    assert.equal(ev.length, 3, name + ' 次數');
    for (const e of ev) { assert.ok(e.f.ok, name); assert.equal(e.d.plane, plane, `${name} slopeRel ${e.d.slopeRel}`); }
  }
  assert.ok(up[0].d.heightM < flat[0].d.heightM && flat[0].d.heightM < down[0].d.heightM, '挑＝低、劈＝高');
  assert.ok(up[0].d.heightM < ZONE.rowY(1) && down[0].d.heightM > ZONE.rowY(1));
});

test('人偶影像經 MediaPipe 的揮棒（正面、側身、坐著）：每次都量得到高度與方向', () => {
  for (const n of ['mp-bat-front', 'mp-bat-side', 'mp-bat-side-seated']) {
    const clip = JSON.parse(readFileSync(new URL(`../packages/taikan-kit/fixtures/${n}.json`, import.meta.url)));
    const ev = runSwings(clip.frames.map(unpackPose), 'camera');
    assert.equal(ev.length, 2, n);
    for (const e of ev) {
      assert.ok(e.f.ok && e.f.frames >= 3, n + ' frames');
      assert.ok(e.d.heightM > 0.3 && e.d.heightM < 1.2, `${n} heightM ${e.d.heightM}`);
    }
  }
});

test('個人基準：揮棒測試至少 3 次有效才算，取中位數', () => {
  assert.equal(baselineFrom([{ ok: true, h: 0, slope: 0, speed: 5 }, { ok: false }]), null);
  const b = baselineFrom([{ ok: true, h: -0.5, slope: -30, speed: 8 }, { ok: true, h: -0.2, slope: -10, speed: 9 }, { ok: true, h: -0.3, slope: -50, speed: 20 }]);
  assert.deepEqual(b, { h: -0.3, slope: -30, speed: 9, n: 3 });
});
