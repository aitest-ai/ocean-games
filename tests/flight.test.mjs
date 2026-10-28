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
