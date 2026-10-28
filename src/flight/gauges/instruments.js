// 可重用的儀表元件。每個儀表 = 一個 THREE.Group（原點 = 錶孔中心、儀表板前表面；+z 朝向飛行員），
// 裡面有「不會動的零件」（錶框、錶面、玻璃、螺絲：標記 static，之後由駕駛艙產生器合併）與
// 「會動的零件」（指針、姿態球、航向盤）。update(state, dt) 讀飛行狀態物件，指針經過 Needle 的慣性。
//
//   const inst = createInstrument('asi', { spec, atlas, mats, radius: 0.0365 });
//   panel.add(inst.group); … inst.update(flightState, dt);
import * as THREE from '../../land/three.js';
import { part } from '../geo.js';
import { Needle } from '../needle.js';
import { asiAngle, altHands, vsiAngle, tachAngle, tcAngle, slipAngle, aiOffset, arcAngle } from './scales.js';

const D = Math.PI / 180;

// 平面四邊形，UV 對到圖集裡的一格（rect）
export function atlasQuad(w, h, rect, sub = [0, 0, 1, 1]) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const [a, b, c, d] = sub;
  for (let i = 0; i < uv.count; i++) {
    const u = a + uv.getX(i) * (c - a), v = b + uv.getY(i) * (d - b);
    uv.setXY(i, rect.u0 + u * (rect.u1 - rect.u0), rect.v0 + v * (rect.v1 - rect.v0));
  }
  return g;
}
// 任意平面形狀（指針），全部 UV 指到圖集裡的單色小格
function swatchShape(points, rect) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ShapeGeometry(s);
  const uv = g.attributes.uv, u = (rect.u0 + rect.u1) / 2, v = (rect.v0 + rect.v1) / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u, v);
  return g;
}

// 指針形狀（指向 +y，長度以錶面半徑 R 為單位）
const NEEDLES = {
  long: (R) => [[-0.035 * R, -0.18 * R], [0.035 * R, -0.18 * R], [0.028 * R, 0.55 * R], [0, 0.86 * R], [-0.028 * R, 0.55 * R]],
  short: (R) => [[-0.06 * R, -0.12 * R], [0.06 * R, -0.12 * R], [0.075 * R, 0.3 * R], [0, 0.56 * R], [-0.075 * R, 0.3 * R]],
  thin: (R) => [[-0.012 * R, -0.05 * R], [0.012 * R, -0.05 * R], [0.012 * R, 0.8 * R], [0.05 * R, 0.8 * R], [0, 0.94 * R], [-0.05 * R, 0.8 * R], [-0.012 * R, 0.8 * R]],
  small: (R) => [[-0.05 * R, -0.2 * R], [0.05 * R, -0.2 * R], [0.04 * R, 0.5 * R], [0, 0.82 * R], [-0.04 * R, 0.5 * R]],
};

// 錶框、凹槽、錶面、玻璃、螺絲（全部 static）
function housing(g, { R, atlas, mats, faceRect, knob, depth = 0.012, screws = true }) {
  const ri = R, ro = R + 0.0048;
  const ring = new THREE.LatheGeometry([[ri, -depth], [ri, 0.0015], [ri + 0.0012, 0.0045], [ro - 0.0012, 0.0055], [ro, 0.0025], [ro + 0.0008, 0]].map(([r, z]) => new THREE.Vector2(r, z)), 40);
  ring.rotateX(Math.PI / 2);
  part(g, ring, mats.plastic, { color: 0x101112 });
  if (faceRect) part(g, atlasQuad(2 * R, 2 * R, faceRect), mats.gauge, { pos: [0, 0, -depth + 0.002], cast: false });
  part(g, new THREE.CircleGeometry(ri, 36), mats.glass, { pos: [0, 0, 0.0005], cast: false, recv: false }).renderOrder = 5;
  if (screws) for (let i = 0; i < 4; i++) {
    const a = (45 + i * 90) * D, r = ro + 0.0065;
    part(g, new THREE.CylinderGeometry(0.0026, 0.0028, 0.002, 10).rotateX(Math.PI / 2), mats.metal, { pos: [Math.cos(a) * r, Math.sin(a) * r, 0.001], color: 0x8a8e92 });
  }
  if (knob) { // 調整旋鈕（左下或右下）
    const s = knob === 'left' ? -1 : 1;
    const k = new THREE.CylinderGeometry(0.0075, 0.008, 0.012, 16).rotateX(Math.PI / 2);
    part(g, k, mats.plastic, { pos: [s * (ro - 0.002), -(ro - 0.002), 0.008], color: 0x151515 });
  }
}

function needleMesh(group, shape, R, atlas, mats, z, color = 'white') {
  const m = new THREE.Mesh(swatchShape(NEEDLES[shape](R), atlas.rects[color]), mats.gauge);
  m.position.z = z; m.castShadow = true;
  group.add(m);
  return m;
}
function cap(group, R, mats, z, r = 0.11) {
  part(group, new THREE.CylinderGeometry(R * r, R * r * 1.15, 0.002, 16).rotateX(Math.PI / 2), mats.plastic, { pos: [0, 0, z], color: 0x0c0c0c });
}

// ── 各種儀表 ──
const BUILD = {
  asi(g, c) {
    housing(g, { ...c, faceRect: c.atlas.rects.asi });
    const n = needleMesh(g, 'long', c.R, c.atlas, c.mats, -0.0085); cap(g, c.R, c.mats, -0.007);
    const k = new Needle({ wn: 9, zeta: 0.85 });
    return (s, dt) => { n.rotation.z = -asiAngle(k.update(s.ias, dt)); };
  },

  ai(g, c) {
    const { R, atlas, mats } = c;
    housing(g, { ...c, faceRect: atlas.rects.aiFace, knob: 'left' });
    const roll = new THREE.Group(); roll.position.z = -0.0105; g.add(roll);
    const ball = new THREE.Mesh(atlasQuad(1.7 * R, 3.1 * R, atlas.rects.aiBall), mats.gauge);
    roll.add(ball);
    // 跟著球轉的傾斜指標（白色小三角）
    const ptr = new THREE.Mesh(swatchShape([[0, 0.79 * R], [-0.06 * R, 0.66 * R], [0.06 * R, 0.66 * R]], atlas.rects.white), mats.gauge);
    ptr.position.z = 0.0003; roll.add(ptr);
    const kr = new Needle({ wn: 10, zeta: 0.9 }), kp = new Needle({ wn: 10, zeta: 0.9 });
    // 真空不足（或電源關）時陀螺會慢慢倒下來：這裡只做「慢慢歪到一邊」
    let spin = 1;
    return (s, dt) => {
      spin += ((s.vac > 3.5 ? 1 : 0) - spin) * Math.min(dt * 0.15, 1);
      const r = kr.update(s.roll * spin + (1 - spin) * 25, dt), p = kp.update(s.pitch * spin - (1 - spin) * 12, dt);
      roll.rotation.z = r * D;
      ball.position.y = -aiOffset(p) * R;
    };
  },

  alt(g, c) {
    housing(g, { ...c, faceRect: c.atlas.rects.alt, knob: 'left' });
    const h3 = needleMesh(g, 'thin', c.R, c.atlas, c.mats, -0.0092);
    const h2 = needleMesh(g, 'short', c.R, c.atlas, c.mats, -0.0086);
    const h1 = needleMesh(g, 'long', c.R, c.atlas, c.mats, -0.008);
    cap(g, c.R, c.mats, -0.0068);
    const k = new Needle({ wn: 7, zeta: 0.9 });
    return (s, dt) => {
      const h = altHands(k.update(s.alt, dt));
      h1.rotation.z = -h.h100; h2.rotation.z = -h.h1000; h3.rotation.z = -h.h10000;
    };
  },

  tc(g, c) {
    const { R, atlas, mats } = c;
    housing(g, { ...c, faceRect: atlas.rects.tc });
    // 小飛機（後視圖）：機翼、機身圓點、垂直尾翼
    const plane = new THREE.Mesh(swatchShape([
      [-0.66 * R, -0.03 * R], [-0.14 * R, -0.03 * R], [-0.1 * R, -0.09 * R], [0.1 * R, -0.09 * R], [0.14 * R, -0.03 * R], [0.66 * R, -0.03 * R],
      [0.66 * R, 0.03 * R], [0.12 * R, 0.04 * R], [0.03 * R, 0.08 * R], [0.02 * R, 0.25 * R], [-0.02 * R, 0.25 * R], [-0.03 * R, 0.08 * R], [-0.12 * R, 0.04 * R], [-0.66 * R, 0.03 * R],
    ], atlas.rects.white), mats.gauge);
    plane.position.z = -0.0085; plane.castShadow = true; g.add(plane);
    const ball = new THREE.Mesh(new THREE.CircleGeometry(0.06 * R, 16), mats.plastic);
    ball.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(ball.geometry.attributes.position.count * 3).fill(0.02), 3));
    ball.position.z = -0.0092; g.add(ball);
    const kr = new Needle({ wn: 6, zeta: 0.9 }), kb = new Needle({ wn: 5, zeta: 0.75 });
    return (s, dt) => {
      plane.rotation.z = -tcAngle(kr.update(s.turnRate, dt));
      const th = slipAngle(kb.update(s.slip, dt));
      ball.position.x = Math.sin(th) * 1.4 * R;
      ball.position.y = (0.85 - Math.cos(th) * 1.4) * R;
    };
  },

  hi(g, c) {
    const { R, atlas, mats } = c;
    housing(g, { ...c, faceRect: null, knob: 'right' });
    part(g, new THREE.CircleGeometry(R, 32), mats.plastic, { pos: [0, 0, -0.011], color: 0x0b0b0c, cast: false });
    const card = new THREE.Mesh(atlasQuad(2 * R * 0.97, 2 * R * 0.97, atlas.rects.hiCard), mats.gauge);
    card.position.z = -0.0095; g.add(card);
    part(g, atlasQuad(2 * R, 2 * R, atlas.rects.hiOverlay), mats.gauge, { pos: [0, 0, -0.007], cast: true });
    const k = new Needle({ wn: 8, zeta: 0.9, wrap: 360 });
    return (s, dt) => { card.rotation.z = k.update(s.heading, dt) * D; };
  },

  vsi(g, c) {
    housing(g, { ...c, faceRect: c.atlas.rects.vsi });
    const n = needleMesh(g, 'long', c.R, c.atlas, c.mats, -0.0085); cap(g, c.R, c.mats, -0.007);
    const k = new Needle({ wn: 2.4, zeta: 1 }); // 爬升率表本來就會慢一點（約 1.5 秒）
    return (s, dt) => { n.rotation.z = -vsiAngle(k.update(s.vs, dt)); };
  },

  tach(g, c) {
    housing(g, { ...c, faceRect: c.atlas.rects.tach });
    const n = needleMesh(g, 'long', c.R, c.atlas, c.mats, -0.0085); cap(g, c.R, c.mats, -0.007);
    const k = new Needle({ wn: 6, zeta: 0.85 });
    return (s, dt) => { n.rotation.z = -tachAngle(k.update(s.rpm, dt)); };
  },

  small(g, c) {
    const def = c.spec.smallGauges.find((x) => x.id === c.id);
    housing(g, { ...c, faceRect: c.atlas.rects['small:' + c.id], depth: 0.009 });
    const n = needleMesh(g, 'small', c.R, c.atlas, c.mats, -0.0065); cap(g, c.R, c.mats, -0.005, 0.14);
    const k = new Needle({ wn: 3, zeta: 0.95 });
    const { min, max } = def.scale;
    return (s, dt) => { n.rotation.z = -arcAngle(k.update(def.value(s), dt), min, max, -60, 60); };
  },
};

export function createInstrument(type, { spec, atlas, mats, radius, id }) {
  const group = new THREE.Group();
  group.name = 'inst:' + (id || type);
  const update = BUILD[type](group, { spec, atlas, mats, R: radius, id });
  return { type, id: id || type, group, update };
}

// 磁羅盤（裝在遮光罩上）：外殼、浮在液體裡的圓柱刻度盤、白色基準線
export function createCompass({ atlas, mats }) {
  const group = new THREE.Group();
  group.name = 'inst:compass';
  // 外殼：前面開口（看得到刻度盤），其他五面封起來
  const W = 0.064, H = 0.05, Dp = 0.05, t = 0.004;
  for (const [w, h, d, x, y, z] of [[W, H, t, 0, 0, -Dp / 2], [t, H, Dp, -W / 2, 0, 0], [t, H, Dp, W / 2, 0, 0], [W, t, Dp, 0, H / 2, 0], [W, t, Dp, 0, -H / 2, 0]])
    part(group, new THREE.BoxGeometry(w, h, d), mats.plastic, { pos: [x, y, z], color: 0x111214 });
  part(group, new THREE.BoxGeometry(W + 0.004, 0.006, 0.012), mats.plastic, { pos: [0, H / 2 + 0.001, Dp / 2 - 0.004], color: 0x111214 }); // 遮光簷
  part(group, new THREE.BoxGeometry(0.03, 0.012, 0.03), mats.plastic, { pos: [0, -0.03, -0.005], color: 0x111214 });
  part(group, new THREE.BoxGeometry(W - t, H - t, 0.001), mats.plastic, { pos: [0, 0, -Dp / 2 + t], color: 0x2a2620, cast: false }); // 液體裡的暗色背景
  // 正面的玻璃窗（略凸）
  part(group, new THREE.PlaneGeometry(0.05, 0.028), mats.glass, { pos: [0, 0.002, 0.0255], cast: false, recv: false }).renderOrder = 5;
  const cyl = new THREE.CylinderGeometry(0.021, 0.021, 0.016, 48, 1, true);
  const uv = cyl.attributes.uv, r = atlas.rects.compassBand;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + (1 - uv.getX(i)) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
  const card = new THREE.Mesh(cyl, mats.gauge);
  card.position.set(0, 0.002, 0); group.add(card);
  part(group, new THREE.BoxGeometry(0.0012, 0.022, 0.001), mats.gauge, { pos: [0, 0.002, 0.0235] }); // 基準線
  // 磁羅盤會晃：阻尼小一點（真的羅盤轉彎後會來回擺幾下）
  const k = new Needle({ wn: 2.2, zeta: 0.45, wrap: 360 });
  let swing = 0;
  return {
    type: 'compass', id: 'compass', group,
    update(s, dt) {
      swing += ((s.onGround ? 0 : s.roll * 0.15) - swing) * Math.min(dt * 2, 1); // 傾斜時的轉彎誤差（示意）
      card.rotation.y = k.update(s.heading + swing, dt) * D;
      card.rotation.z = -s.roll * D * 0.25; card.rotation.x = s.pitch * D * 0.2; // 刻度盤在液體裡微微傾斜
    },
  };
}

// 警示燈條：未亮的燈是 static，亮的燈是另外疊上去的發光片（依 state.warn 開關）
export function createAnnunciator({ spec, atlas, mats, size }) {
  const [w, h] = size, n = spec.annunciators.length;
  const group = new THREE.Group();
  group.name = 'inst:annunciator';
  part(group, new THREE.BoxGeometry(w + 0.008, h + 0.008, 0.006), mats.plastic, { pos: [0, 0, 0.001], color: 0x0d0d0d });
  part(group, atlasQuad(w, h, atlas.rects.annOff), mats.gauge, { pos: [0, 0, 0.0045], cast: false });
  const lit = spec.annunciators.map((L, i) => {
    const m = new THREE.Mesh(atlasQuad(w / n, h, atlas.rects.annOn, [i / n, 0, (i + 1) / n, 1]), mats.lamp);
    m.position.set(-w / 2 + (i + 0.5) * (w / n), 0, 0.0048);
    m.visible = false; m.renderOrder = 4;
    group.add(m);
    return { key: L.key, m };
  });
  let test = 0;
  return {
    type: 'annunciator', id: 'annunciator', group,
    test(sec = 2) { test = sec; },  // 「按下測試」：全部亮
    update(s, dt) {
      test = Math.max(test - dt, 0);
      for (const L of lit) L.m.visible = s.master && (test > 0 || !!s.warn[L.key]);
    },
  };
}
