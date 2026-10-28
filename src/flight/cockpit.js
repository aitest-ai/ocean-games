// 駕駛艙產生器：讀「機艙規格」（例如 aircraft/trainer.js）→ 用程式產生整個駕駛艙（儀表板、遮光罩、
// 擋風玻璃與窗框、操縱盤、中控台與把手、座椅、頂棚、側門、地板與踏板、上單翼與支柱）。
//
//   const cp = buildCockpit(TRAINER, { tier: 'low' });
//   aircraft.add(cp.root); 每一格：cp.update(flightState, dt)；換時段：cp.setLighting({ night, sunDir, ... })
//
// 效能（平板低畫質目標 30 fps 以上）：不動的零件依材質合併（約 10 次 draw call）；錶面全部在一張圖集；
// 角落的陰暗用「頂點顏色」先算好（低畫質不用即時陰影也有立體感）；高、中畫質才開即時陰影。
import * as THREE from '../land/three.js';
import { part, mergeStatic, roundedBox, tube, lathe, planarUV, boxUV, merge, frameLoop } from './geo.js';
import { buildAtlas } from './gauges/faces.js';
import { createInstrument, createCompass, createAnnunciator, atlasQuad } from './gauges/instruments.js';
import { createMaterials, COCKPIT_TIERS } from './materials.js';
import { canvas, fbmField, rng, tex } from './tex.js';
import { drawText } from './glyphs.js';

const D = Math.PI / 180;
const smooth = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };

export function buildCockpit(spec, { tier = 'mid' } = {}) {
  const T = COCKPIT_TIERS[tier] || COCKPIT_TIERS.mid;
  const C = spec.cabin, P = spec.panel, col = spec.colors;
  const atlas = buildAtlas(spec, { S: T.atlas });
  const mats = createMaterials(atlas, T);
  const root = new THREE.Group(); root.name = 'cockpit';
  const halfW = C.width / 2;

  // ── 儀表板 ──
  const panelG = new THREE.Group(); panelG.name = 'panel';
  panelG.position.set(0, C.panelY, C.panelZ);
  panelG.rotation.x = C.panelTilt;
  root.add(panelG);
  const PW = P.width, PH = C.panelH;
  const outline = new THREE.Shape();
  const rc = 0.025;
  outline.moveTo(-PW / 2, 0); outline.lineTo(PW / 2, 0); outline.lineTo(PW / 2, PH - rc);
  outline.quadraticCurveTo(PW / 2, PH, PW / 2 - rc, PH); outline.lineTo(-PW / 2 + rc, PH); outline.quadraticCurveTo(-PW / 2, PH, -PW / 2, PH - rc); outline.closePath();
  const hole = (x, y, r) => { const h = new THREE.Path(); h.absarc(x, y, r, 0, Math.PI * 2, true); outline.holes.push(h); };
  const rectHole = (x, y, w, h) => { const p = new THREE.Path(); p.moveTo(x - w / 2, y - h / 2); p.lineTo(x - w / 2, y + h / 2); p.lineTo(x + w / 2, y + h / 2); p.lineTo(x + w / 2, y - h / 2); p.closePath(); outline.holes.push(p); };
  for (const I of P.instruments) hole(I.at[0], I.at[1], (I.type === 'small' ? P.smallRadius : P.bigRadius) + 0.0006);
  for (const R of P.radios) rectHole(R.at[0], R.at[1], R.size[0], R.size[1]);
  for (const s of [-1, 1]) hole(s * C.seatX, spec.controls.yokeAt[1], 0.02);
  const panelGeo = new THREE.ExtrudeGeometry(outline, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 36 });
  panelGeo.translate(0, 0, -0.02);
  mats.panel = new THREE.MeshStandardMaterial({ name: 'panel', vertexColors: true, fog: false, roughness: 0.78, metalness: 0, map: panelTexture(spec, T), normalMap: mats.plastic.normalMap, normalScale: new THREE.Vector2(0.25, 0.25) });
  mats.panel.map.repeat.set(1 / PW, 1 / PH); mats.panel.map.offset.set(0.5, 0);
  mats.panel.map.wrapS = mats.panel.map.wrapT = THREE.ClampToEdgeWrapping;
  part(panelG, panelGeo, mats.panel, { color: 0xffffff });

  // 儀表
  const instruments = [];
  for (const I of P.instruments) {
    const inst = createInstrument(I.type, { spec, atlas, mats, radius: I.type === 'small' ? P.smallRadius : P.bigRadius, id: I.id });
    inst.group.position.set(I.at[0], I.at[1], 0);
    panelG.add(inst.group); instruments.push(inst);
  }
  const ann = createAnnunciator({ spec, atlas, mats, size: P.annunciator.size });
  ann.group.position.set(P.annunciator.at[0], P.annunciator.at[1], 0);
  panelG.add(ann.group); instruments.push(ann);
  // 無線電：凹進去的盒子＋面板＋旋鈕
  for (const R of P.radios) {
    const [w, h] = R.size;
    part(panelG, new THREE.BoxGeometry(w, h, 0.14), mats.plastic, { pos: [R.at[0], R.at[1], -0.07], color: 0x111214 });
    part(panelG, atlasQuad(w - 0.004, h - 0.004, atlas.rects[R.id]), mats.gauge, { pos: [R.at[0], R.at[1], 0.0012], cast: false });
    for (const s of [-1, 1]) {
      part(panelG, new THREE.CylinderGeometry(0.0075, 0.008, 0.014, 18).rotateX(Math.PI / 2), mats.plastic, { pos: [R.at[0] + s * (w / 2 - 0.012), R.at[1] - 0.004, 0.007], color: 0x1a1a1a });
      part(panelG, new THREE.CylinderGeometry(0.0045, 0.0045, 0.008, 14).rotateX(Math.PI / 2), mats.plastic, { pos: [R.at[0] + s * (w / 2 - 0.012), R.at[1] - 0.004, 0.017], color: 0x232323 });
    }
  }
  // 開關列（翹板開關，MASTER 是紅色雙聯）
  const SW = P.switches;
  SW.list.forEach((name, i) => {
    const x = SW.at[0] + i * SW.gap, y = SW.at[1];
    part(panelG, roundedBox(0.022, 0.034, 0.006, 0.002, 2), mats.plastic, { pos: [x, y, 0.003], color: 0x0c0c0c });
    const on = name === 'MASTER' || name === 'BCN' || name === 'NAV';
    const sw = roundedBox(0.015, 0.026, 0.01, 0.003, 2);
    part(panelG, sw, mats.plastic, { pos: [x, y, 0.009], rot: [on ? -0.18 : 0.18, 0, 0], color: name === 'MASTER' ? 0x9c1a14 : 0x1d1d1d });
    part(panelG, new THREE.BoxGeometry(0.012, 0.002, 0.002), mats.plastic, { pos: [x, y + (on ? 0.009 : -0.009), 0.0145], rot: [on ? -0.18 : 0.18, 0, 0], color: 0xd8d8d8, cast: false });
  });
  // 鑰匙孔
  {
    const [x, y] = P.key.at;
    part(panelG, lathe([[0, 0], [0.016, 0], [0.017, 0.004], [0.012, 0.009], [0, 0.009]], 24).rotateX(Math.PI / 2), mats.metal, { pos: [x, y, 0], color: 0x9da2a8 });
    part(panelG, roundedBox(0.026, 0.008, 0.012, 0.003), mats.plastic, { pos: [x, y, 0.014], rot: [0, 0, 0.5], color: 0x202020 });
  }
  // 斷路器
  for (let i = 0; i < P.breakers.labels.length; i++) {
    const x = P.breakers.at[0] + i * P.breakers.gap, y = P.breakers.at[1];
    part(panelG, new THREE.CylinderGeometry(0.0055, 0.006, 0.006, 12).rotateX(Math.PI / 2), mats.plastic, { pos: [x, y, 0.003], color: 0x0f0f0f });
    part(panelG, new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 12).rotateX(Math.PI / 2), mats.plastic, { pos: [x, y, 0.008], color: 0xe8e4da, cast: false });
  }
  // 出風口（球型）
  for (const [x, y] of P.vents) {
    part(panelG, lathe([[0.03, 0], [0.032, 0.004], [0.026, 0.008], [0.02, 0.006]], 24).rotateX(Math.PI / 2), mats.plastic, { pos: [x, y, 0], color: 0x1a1a1a });
    part(panelG, new THREE.SphereGeometry(0.021, 18, 12), mats.plastic, { pos: [x, y, -0.004], color: 0x2a2a2a });
    part(panelG, new THREE.CylinderGeometry(0.009, 0.009, 0.004, 16).rotateX(Math.PI / 2), mats.plastic, { pos: [x, y, 0.016], color: 0x080808, cast: false });
  }
  // 置物箱門把
  part(panelG, roundedBox(0.04, 0.012, 0.012, 0.004), mats.metal, { pos: [P.glovebox.at[0], P.glovebox.at[1] + P.glovebox.size[1] / 2 - 0.018, 0.006], color: 0x8c9196 });

  // 推拉式把手（油門、混合比、化油器加溫）：會動
  const knobs = {};
  for (const K of P.knobs) {
    const g = new THREE.Group(); g.name = 'knob:' + K.id;
    g.position.set(K.at[0], K.at[1], 0);
    part(panelG, lathe([[0.013, 0], [0.012, 0.006], [0.008, 0.008]], 20).rotateX(Math.PI / 2), mats.metal, { pos: [K.at[0], K.at[1], 0], color: 0xa0a4a8 });
    part(g, new THREE.CylinderGeometry(0.0045, 0.0045, 0.08, 12).rotateX(Math.PI / 2), mats.metal, { pos: [0, 0, -0.03], color: 0xd0d4d8 });
    const r = K.shape === 'small' ? 0.011 : 0.016;
    const prof = K.shape === 'ribbed'
      ? [[0, 0], [0.006, 0], [r, 0.004], ...Array.from({ length: 9 }, (_, i) => [r - (i % 2) * 0.0018, 0.006 + i * 0.0022]), [r * 0.7, 0.028], [0, 0.03]]
      : [[0, 0], [0.006, 0], [r, 0.006], [r * 1.02, 0.016], [r * 0.85, 0.026], [0, 0.03]];
    part(g, lathe(prof, 24).rotateX(Math.PI / 2), mats.plastic, { pos: [0, 0, 0.012], color: K.color });
    panelG.add(g);
    knobs[K.id] = g;
  }
  // 襟翼開關：槽＋會上下移動的小翼型把手
  const flapLever = new THREE.Group();
  {
    const [x, y] = P.flaps.at;
    part(panelG, roundedBox(0.03, 0.075, 0.004, 0.002), mats.plastic, { pos: [x, y, 0.002], color: 0x0a0a0a });
    part(panelG, new THREE.BoxGeometry(0.006, 0.062, 0.002), mats.plastic, { pos: [x, y, 0.0045], color: 0x000000, cast: false });
    flapLever.position.set(x, y, 0);
    const knob = new THREE.Shape(); knob.moveTo(-0.017, -0.004); knob.quadraticCurveTo(-0.018, 0.006, -0.01, 0.006); knob.lineTo(0.017, 0.0); knob.lineTo(-0.01, -0.006); knob.closePath();
    const kg = new THREE.ExtrudeGeometry(knob, { depth: 0.014, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2 });
    part(flapLever, kg, mats.plastic, { pos: [0, 0, 0.008], color: 0xe6e3dc });
    part(flapLever, new THREE.BoxGeometry(0.004, 0.004, 0.012), mats.metal, { pos: [0, 0, 0.004] });
    panelG.add(flapLever);
  }

  // ── 儀表板下方：膝部飾板、防火牆、踏板、中央台座 ──
  const panelBottom = new THREE.Vector3(0, 0, 0).applyEuler(panelG.rotation).add(panelG.position);
  const panelTop = new THREE.Vector3(0, PH, 0).applyEuler(panelG.rotation).add(panelG.position);
  const fwZ = C.panelZ - 0.36;
  {
    // 膝部飾板：從儀表板下緣往前下斜到防火牆（兩片，中間讓出台座）
    for (const s of [-1, 1]) {
      const g = new THREE.PlaneGeometry(halfW - 0.07, Math.hypot(0.26, 0.3), 6, 4);
      g.rotateX(Math.atan2(0.26, 0.3));
      const m = part(root, g, mats.plastic, { pos: [s * (0.07 + (halfW - 0.07) / 2), panelBottom.y - 0.13, panelBottom.z - 0.13], color: col.trimDark, ao: true });
      m.rotation.y = 0; boxUV(m.geometry, 6);
    }
    part(root, new THREE.PlaneGeometry(C.width, 0.5), mats.plastic, { pos: [0, 0.25, fwZ], color: 0x3a3c3e, ao: true });
    // 地毯地板
    const fl = new THREE.PlaneGeometry(C.width, C.rearZ - fwZ, 8, 12).rotateX(-Math.PI / 2);
    planarUV(fl, 'x', 'z', 3);
    part(root, fl, mats.carpet, { pos: [0, 0.002, (C.rearZ + fwZ) / 2], color: col.carpet, ao: true, cast: false });
    // 方向舵踏板（左右座各兩個）
    for (const sx of [-1, 1]) for (const px of [-0.085, 0.085]) {
      const x = sx * C.seatX + px;
      part(root, roundedBox(0.075, 0.13, 0.018, 0.006, 2), mats.metal, { pos: [x, 0.2, fwZ + 0.13], rot: [-0.5, 0, 0], color: 0x5a5e62, ao: true });
      for (let k = 0; k < 4; k++) part(root, new THREE.BoxGeometry(0.068, 0.006, 0.004), mats.plastic, { pos: [x, 0.16 + k * 0.027, fwZ + 0.14 + k * 0.012], rot: [-0.5, 0, 0], color: 0x111111, cast: false });
      part(root, tube([[x, 0.27, fwZ + 0.09], [x, 0.38, fwZ + 0.02], [x, 0.48, fwZ + 0.01]], 0.008, 6, 8), mats.metal, { color: 0x6a6e72, ao: true });
    }
    // 中央台座（配平輪、燃油選擇器）
    const pz0 = panelBottom.z - 0.05, pz1 = panelBottom.z + 0.16;
    // shape 的 x = -z（往前為正），轉 90° 之後剛好回到 z
    const ped = new THREE.Shape(); ped.moveTo(-pz0, 0); ped.lineTo(-pz1, 0); ped.lineTo(-pz1, 0.22); ped.quadraticCurveTo(-(pz1 - 0.02), 0.5, -(panelBottom.z + 0.01), panelBottom.y); ped.lineTo(-pz0, panelBottom.y); ped.closePath();
    const pg = new THREE.ExtrudeGeometry(ped, { depth: 0.13, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 10 });
    pg.rotateY(Math.PI / 2); pg.translate(-0.065, 0, 0);
    boxUV(pg, 6);
    part(root, pg, mats.plastic, { color: col.trimDark, ao: true });
    // 配平輪：一半露在台座外
    const trim = new THREE.CylinderGeometry(0.075, 0.075, 0.022, 40).rotateZ(Math.PI / 2);
    part(root, trim, mats.plastic, { pos: [0, 0.34, pz1 - 0.05], color: 0x161616, ao: true });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      part(root, new THREE.BoxGeometry(0.024, 0.006, 0.004), mats.plastic, { pos: [0, 0.34 + Math.cos(a) * 0.076, pz1 - 0.05 + Math.sin(a) * 0.076], rot: [-a, 0, 0], color: 0x202020, cast: false });
    }
    part(root, new THREE.BoxGeometry(0.004, 0.012, 0.014), mats.plastic, { pos: [0.014, 0.42, pz1 - 0.01], color: 0xe8e4da, cast: false }); // 起飛位置標記
    // 燃油選擇器（地板上）
    part(root, new THREE.CylinderGeometry(0.06, 0.065, 0.012, 32), mats.plastic, { pos: [0, 0.008, pz1 + 0.12], color: 0x1b1b1b, ao: true });
    part(root, roundedBox(0.11, 0.022, 0.024, 0.008), mats.plastic, { pos: [0, 0.026, pz1 + 0.12], color: 0xb52b22 });
  }

  // ── 遮光罩（皮革包覆、圓弧前緣）──
  const gz = panelTop.z, gy = panelTop.y;
  {
    const sh = new THREE.Shape();
    const dep = C.glareDepth;
    sh.moveTo(0, gy - 0.012);
    sh.lineTo(-0.04, gy - 0.012);
    sh.quadraticCurveTo(-0.052, gy - 0.01, -0.05, gy + 0.004);
    sh.quadraticCurveTo(-0.046, gy + 0.018, -0.022, gy + 0.02);
    sh.lineTo(dep, gy + 0.035);
    sh.lineTo(dep, gy - 0.012);
    sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: C.width - 0.04, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.02, bevelSegments: 3, curveSegments: 12 });
    g.rotateY(Math.PI / 2);         // shape x → -z（往前）、擠出方向 → +x
    g.translate(-(C.width - 0.04) / 2, 0, gz);
    boxUV(g, 5);
    part(root, g, mats.leather, { color: col.glare });
  }
  const shieldBase = { y: gy + 0.035, z: gz - C.glareDepth + 0.01 };

  // ── 擋風玻璃、窗框、頂棚、側壁 ──
  const roofY = C.roofY;
  const wsTop = { y: roofY - 0.02, z: C.windshieldTopZ };
  const pillarX = halfW - 0.02;
  // 擋風玻璃表面：(u, v) → 位置（中間往前凸、兩側往後包）
  const wsPoint = (u, v) => {
    const x = u * (pillarX - 0.01);
    const bulge = 1 - u * u;
    const zb = shieldBase.z - 0.05 * bulge, zt = wsTop.z - 0.02 * bulge;
    const z = zb + (zt - zb) * v - 0.025 * Math.sin(Math.PI * v) * bulge + Math.pow(Math.abs(u), 3) * 0.06;
    const y = shieldBase.y + (wsTop.y - shieldBase.y) * v;
    return [x, y, z];
  };
  const winGeoms = [];
  {
    const nu = 18, nv = 8, pos = [], uv = [], glow = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const q = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]];
      for (const [a, b] of q) {
        const u = -1 + (2 * a) / nu, v = b / nv;
        pos.push(...wsPoint(u, v)); uv.push(a / nu, v); glow.push(Math.max(0, 1 - v * 3.5) * (1 - Math.abs(u) * 0.6));
      }
    }
    winGeoms.push(glassGeom(pos, uv, glow));
  }
  // 窗框：A 柱、上緣橫樑、擋風玻璃下緣壓條
  const pillarPts = (s) => Array.from({ length: 7 }, (_, k) => { const p = wsPoint(s, k / 6); return [p[0] + s * 0.012, p[1], p[2] + 0.012]; });
  for (const s of [-1, 1]) {
    const pts = pillarPts(s);
    const g = tube(pts, 0.021, 10, 16);
    part(root, g, mats.plastic, { color: col.frame, ao: true });
    // 柱子內側的黑色橡膠條
    part(root, tube(pts.map(([x, y, z]) => [x - s * 0.02, y, z + 0.01]), 0.007, 6, 16), mats.plastic, { color: 0x111111, cast: false });
  }
  part(root, tube(Array.from({ length: 9 }, (_, k) => { const p = wsPoint(-1 + k / 4, 1); return [p[0], p[1] + 0.01, p[2] + 0.02]; }), 0.03, 10, 24), mats.plastic, { color: col.frame });
  part(root, tube(Array.from({ length: 9 }, (_, k) => { const p = wsPoint(-1 + k / 4, 0.0); return [p[0], p[1] - 0.003, p[2] + 0.004]; }), 0.008, 6, 24), mats.plastic, { color: 0x0a0a0a, cast: false });

  // 頂棚（略拱）
  {
    const g = new THREE.PlaneGeometry(C.width, C.rearZ - wsTop.z + 0.04, 10, 10).rotateX(Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, 0.035 * (1 - (x / halfW) ** 2) - 0.035 * (Math.abs(x) / halfW) ** 6); }
    g.computeVertexNormals();
    planarUV(g, 'x', 'z', 2.5);
    part(root, g, mats.headliner, { pos: [0, roofY, (C.rearZ + wsTop.z) / 2], color: col.headliner, ao: true });
    // 頂部中央飾條（頂燈、出風口）
    part(root, roundedBox(0.16, 0.03, 0.62, 0.012, 2), mats.plastic, { pos: [0, roofY + 0.02, 0.08], color: col.trim, ao: true });
    part(root, roundedBox(0.07, 0.008, 0.11, 0.003), mats.paint, { pos: [0, roofY + 0.003, 0.12], color: 0xf0ede4, cast: false }); // 頂燈罩
    // 頂部小面板：頂燈、地圖燈開關
    part(root, roundedBox(0.12, 0.01, 0.07, 0.003), mats.plastic, { pos: [0, roofY + 0.002, -0.08], color: 0x1c1d1f });
    for (const k of [-1, 0, 1]) part(root, roundedBox(0.012, 0.01, 0.02, 0.003), mats.plastic, { pos: [k * 0.035, roofY - 0.006, -0.08], rot: [k ? 0.3 : -0.3, 0, 0], color: 0x2c2c2c });
    for (const k of [-1, 1]) { // 地圖燈（小圓燈）
      part(root, lathe([[0.016, 0], [0.018, 0.008], [0.012, 0.014], [0, 0.015]], 16), mats.metal, { pos: [k * 0.2, roofY - 0.002, -0.02], rot: [Math.PI, 0, 0], color: 0x6a6e72 });
    }
    for (const s of [-1, 1]) {
      // 翼根出風口（上單翼的特色）
      part(root, lathe([[0.024, 0], [0.026, 0.01], [0.02, 0.016]], 16), mats.plastic, { pos: [s * (halfW - 0.07), roofY - 0.012, wsTop.z + 0.1], rot: [Math.PI, 0, 0], color: 0x1b1b1b });
      part(root, new THREE.CylinderGeometry(0.016, 0.016, 0.06, 14), mats.plastic, { pos: [s * (halfW - 0.07), roofY - 0.045, wsTop.z + 0.1], color: 0x2c2c2c });
      // 遮陽板
      part(root, roundedBox(0.34, 0.012, 0.15, 0.005, 2), mats.plastic, { pos: [s * 0.28, roofY - 0.012, wsTop.z + 0.1], rot: [0.12, 0, 0], color: 0x3c3f42, ao: true });
    }
    // 天窗（後方頂棚，淡綠色）
    const sky = new THREE.PlaneGeometry(0.62, 0.32).rotateX(Math.PI / 2);
    const sp = sky.attributes.position, suv = sky.attributes.uv, spos = [], suvs = [], sg = [];
    const idx = sky.index.array;
    for (const i of idx) { spos.push(sp.getX(i), sp.getY(i) + roofY + 0.042, sp.getZ(i) + 0.72); suvs.push(suv.getX(i), suv.getY(i)); sg.push(0); }
    winGeoms.push(glassGeom(spos, suvs, sg));
    part(root, roundedBox(0.66, 0.02, 0.36, 0.008), mats.plastic, { pos: [0, roofY + 0.03, 0.72], color: col.frame, ao: true, cast: false }).scale.set(1, 1, 1);
  }

  // 側壁、門、側窗
  for (const s of [-1, 1]) {
    const x = s * halfW;
    const [z0, z1] = C.doorZ;
    // 門板下半（內飾板）
    const door = roundedBox(0.03, C.sillY + 0.02, z1 - z0, 0.01, 2);
    boxUV(door, 6);
    part(root, door, mats.plastic, { pos: [x, (C.sillY - 0.02) / 2, (z0 + z1) / 2], color: col.trim, ao: true });
    part(root, roundedBox(0.07, 0.05, 0.36, 0.02, 3), mats.leather, { pos: [x - s * 0.04, 0.56, 0.12], color: 0x2a2c30, ao: true }); // 扶手
    // 門板上半的布面飾板與分隔線
    const ins = roundedBox(0.012, 0.2, z1 - z0 - 0.16, 0.006, 2); boxUV(ins, 4);
    part(root, ins, mats.fabric, { pos: [x - s * 0.018, C.sillY - 0.14, (z0 + z1) / 2 + 0.02], color: 0x4a5160, ao: true });
    part(root, roundedBox(0.014, 0.012, z1 - z0 - 0.1, 0.004), mats.metal, { pos: [x - s * 0.019, C.sillY - 0.255, (z0 + z1) / 2 + 0.02], color: 0x7d8186, ao: true });
    part(root, roundedBox(0.02, 0.18, 0.4, 0.008, 2), mats.plastic, { pos: [x - s * 0.02, 0.28, -0.1], color: col.trimDark, ao: true }); // 置物袋
    part(root, tube([[x - s * 0.01, 0.66, -0.25], [x - s * 0.04, 0.66, -0.2], [x - s * 0.04, 0.66, -0.12], [x - s * 0.01, 0.66, -0.07]], 0.008, 8, 12), mats.metal, { color: 0xa8acb0 }); // 門把
    // 窗框（窗戶四周）
    const yTop = roofY - 0.03, yBot = C.sillY;
    const frontAt = (y) => { const v = (y - shieldBase.y) / (wsTop.y - shieldBase.y); return wsPoint(s, Math.min(Math.max(v, 0), 1))[2] + 0.06; };
    const zf0 = Math.max(frontAt(yBot), z0), zf1 = frontAt(yTop);
    frameLoop(root, [[x, yBot, z1], [x, yBot, zf0], [x, yTop, zf1], [x, yTop, z1]], 0.02, mats.plastic, { color: col.frame, ao: true });
    // 窗戶上緣到頂棚之間的牆（上單翼的翼根就在外面）
    part(root, roundedBox(0.03, roofY + 0.05 - yTop, C.rearZ - zf1, 0.01, 2), mats.plastic, { pos: [x, (roofY + 0.05 + yTop) / 2, (zf1 + C.rearZ) / 2], color: col.trim, ao: true });
    part(root, roundedBox(0.05, 0.04, z1 - zf0 + 0.04, 0.012, 2), mats.plastic, { pos: [x - s * 0.015, yBot - 0.005, (zf0 + z1) / 2], color: col.trim, ao: true }); // 窗台
    // 側窗玻璃
    {
      const pos = [], uv = [], gl = [];
      const quad = (a, b, c, d) => { for (const p of [a, b, c, a, c, d]) { pos.push(...p); uv.push((p[2] - zf0) / (z1 - zf0) * 0.5 + 0.25, (p[1] - yBot) / (yTop - yBot) * 0.6 + 0.2); gl.push(0); } };
      quad([x + s * 0.01, yBot, zf0], [x + s * 0.01, yBot, z1], [x + s * 0.01, yTop, z1], [x + s * 0.01, yTop, zf1]);
      // 後側窗
      quad([x + s * 0.01, yBot + 0.04, z1 + 0.06], [x + s * 0.01, yBot + 0.04, C.rearZ - 0.05], [x + s * 0.01, yTop - 0.02, C.rearZ - 0.12], [x + s * 0.01, yTop - 0.02, z1 + 0.06]);
      winGeoms.push(glassGeom(pos, uv, gl));
    }
    // 門與後窗之間的 B 柱、後段側壁、窗戶以上的牆
    part(root, roundedBox(0.04, roofY - yBot, 0.08, 0.012, 2), mats.plastic, { pos: [x, (roofY + yBot) / 2, z1 + 0.03], color: col.frame, ao: true });
    part(root, roundedBox(0.03, yBot, C.rearZ - z1, 0.01, 2), mats.plastic, { pos: [x, yBot / 2, (z1 + C.rearZ) / 2], color: col.trim, ao: true });
    frameLoop(root, [[x, yBot + 0.04, z1 + 0.06], [x, yBot + 0.04, C.rearZ - 0.05], [x, yTop - 0.02, C.rearZ - 0.12], [x, yTop - 0.02, z1 + 0.06]], 0.016, mats.plastic, { color: col.frame, ao: true });
    // 腳下空間的側壁（防火牆到門之間，從地板到擋風玻璃下緣）
    const kz0 = fwZ, kz1 = z0 + 0.02, ky1 = shieldBase.y;
    const kick = new THREE.PlaneGeometry(kz1 - kz0, ky1, 3, 4).rotateY(-s * Math.PI / 2);
    part(root, kick, mats.plastic, { pos: [x - s * 0.004, ky1 / 2, (kz0 + kz1) / 2], color: col.trimDark, ao: true });
  }
  // 後壁（行李區）
  part(root, new THREE.PlaneGeometry(C.width, roofY, 4, 4).rotateY(Math.PI), mats.plastic, { pos: [0, roofY / 2, C.rearZ], color: col.trimDark, ao: true });

  // ── 座椅 ──
  for (const s of [-1, 1]) {
    const x = s * C.seatX;
    const cush = roundedBox(0.46, 0.11, 0.48, 0.045, 4);
    boxUV(cush, 4);
    part(root, cush, mats.fabric, { pos: [x, 0.3, 0.2], color: col.seat, ao: true });
    const back = roundedBox(0.46, 0.66, 0.1, 0.05, 4);
    boxUV(back, 4);
    part(root, back, mats.fabric, { pos: [x, 0.7, 0.48], rot: [-0.2, 0, 0], color: col.seat, ao: true });
    for (const k of [-1, 1]) { // 側邊支撐（深色皮革）
      part(root, roundedBox(0.06, 0.6, 0.12, 0.03, 3), mats.leather, { pos: [x + k * 0.21, 0.69, 0.47], rot: [-0.2, 0, 0], color: col.seatBolster, ao: true });
      part(root, roundedBox(0.06, 0.1, 0.48, 0.03, 3), mats.leather, { pos: [x + k * 0.21, 0.31, 0.2], color: col.seatBolster, ao: true });
    }
    // 座椅滑軌與骨架
    for (const k of [-1, 1]) part(root, new THREE.BoxGeometry(0.03, 0.03, 0.8), mats.metal, { pos: [x + k * 0.17, 0.016, 0.2], color: 0x777b80, ao: true });
    part(root, new THREE.BoxGeometry(0.42, 0.2, 0.42), mats.plastic, { pos: [x, 0.14, 0.2], color: 0x1d1f22, ao: true });
    // 安全帶：腰帶＋肩帶＋金屬扣
    part(root, tube([[x - 0.2, 0.37, 0.36], [x - 0.08, 0.38, 0.12], [x + 0.08, 0.38, 0.12], [x + 0.2, 0.37, 0.36]], 0.012, 4, 16), mats.fabric, { color: 0x2b3b52, cast: false, ao: true });
    part(root, tube([[x + s * 0.2, 1.02, 0.56], [x + s * 0.06, 0.82, 0.42], [x - s * 0.04, 0.55, 0.3], [x - s * 0.08, 0.4, 0.14]], 0.012, 4, 20), mats.fabric, { color: 0x2b3b52, cast: false, ao: true });
    part(root, roundedBox(0.05, 0.012, 0.04, 0.004), mats.metal, { pos: [x - s * 0.02, 0.39, 0.12], color: 0xb8bcc0 });
  }

  // ── 操縱盤（羊角式，左右各一，跟著升降舵與副翼動）──
  const yokes = [];
  const ya = spec.controls.yokeAt[1];
  const yokeBase = new THREE.Vector3(0, ya, 0).applyEuler(panelG.rotation).add(panelG.position);
  for (const s of [-1, 1]) {
    const shaft = new THREE.Group(); shaft.name = 'yoke';
    shaft.position.set(s * C.seatX, yokeBase.y, yokeBase.z);
    root.add(shaft);
    // 防塵套（固定在儀表板上）
    part(root, lathe(Array.from({ length: 8 }, (_, i) => [0.024 - (i % 2) * 0.004 - i * 0.0015, i * 0.007]), 20).rotateX(Math.PI / 2), mats.plastic, { pos: [s * C.seatX, yokeBase.y, yokeBase.z], color: 0x121212 });
    part(shaft, new THREE.CylinderGeometry(0.011, 0.011, 0.36, 16).rotateX(Math.PI / 2), mats.metal, { pos: [0, 0, 0.08], color: 0xc8ccd0 });
    const wheel = new THREE.Group(); wheel.position.z = 0.26; shaft.add(wheel);
    part(wheel, roundedBox(0.075, 0.06, 0.04, 0.014, 3), mats.plastic, { color: col.yoke });
    part(wheel, new THREE.CylinderGeometry(0.019, 0.019, 0.004, 24).rotateX(Math.PI / 2), mats.paint, { pos: [0, 0.004, 0.021], color: 0xd9d4c6, cast: false }); // 中央徽章（原創：一片翅膀）
    part(wheel, roundedBox(0.026, 0.004, 0.002, 0.001), mats.paint, { pos: [0, 0.006, 0.0235], rot: [0, 0, 0.18], color: 0x2a4d7a, cast: false });
    for (const k of [-1, 1]) {
      const arm = [[k * 0.03, -0.012, 0], [k * 0.085, -0.036, 0.004], [k * 0.13, -0.034, 0.006], [k * 0.158, -0.006, 0.006]];
      part(wheel, tube(arm, 0.011, 10, 14), mats.plastic, { color: col.yoke });
      const grip = [[k * 0.158, -0.012, 0.006], [k * 0.163, 0.03, 0.004], [k * 0.157, 0.072, 0.0], [k * 0.146, 0.09, -0.004]];
      part(wheel, tube(grip, 0.0165, 12, 14), mats.leather, { color: 0x161616 });
      part(wheel, new THREE.SphereGeometry(0.0165, 12, 8), mats.leather, { pos: [k * 0.146, 0.09, -0.004], color: 0x161616 });
    }
    // 左手握把上的按鈕（無線電發話鍵、電動配平）
    part(wheel, new THREE.CylinderGeometry(0.0055, 0.0055, 0.008, 12), mats.plastic, { pos: [-0.148, 0.093, -0.002], color: 0xb02020 });
    part(wheel, roundedBox(0.012, 0.008, 0.01, 0.003), mats.plastic, { pos: [-0.138, 0.05, 0.022], color: 0x303030 });
    mergeStatic(wheel); mergeStatic(shaft);
    yokes.push({ shaft, wheel, z0: shaft.position.z });
  }

  // ── 磁羅盤（遮光罩上方中央）──
  const compass = createCompass({ atlas, mats });
  compass.group.position.set(0.0, shieldBase.y + 0.035, gz - 0.07);
  root.add(compass.group); instruments.push(compass);

  // ── 機外：上單翼、支柱、主輪（從側窗看得到）──
  const wingY = roofY + 0.06;
  for (const s of [-1, 1]) {
    const af = new THREE.Shape(); // 翼型（z：前緣 → 後緣，y：厚度）
    const c = 1.55, t = 0.18;
    af.moveTo(0, 0);
    af.bezierCurveTo(0, t * 0.6, c * 0.18, t, c * 0.32, t);
    af.bezierCurveTo(c * 0.6, t * 0.95, c * 0.85, t * 0.4, c, 0.01);
    af.lineTo(c, -0.005);
    af.bezierCurveTo(c * 0.7, -0.02, c * 0.2, -0.03, 0, 0);
    const span = 4.9;
    const wg = new THREE.ExtrudeGeometry(af, { depth: span, bevelEnabled: false, curveSegments: 10, steps: 6 });
    wg.rotateY(-Math.PI / 2); // 擠出 → -x，翼型 x → +z
    const p = wg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const xx = -p.getX(i); // 0 → span
      p.setX(i, s * (halfW + 0.02 + xx));
      p.setY(i, p.getY(i) + xx * 0.03); // 上反角
      p.setZ(i, p.getZ(i) - 0.5 + xx * 0.012);
    }
    wg.computeVertexNormals();
    planarUV(wg, 'x', 'z', 1.2);
    part(root, wg, mats.paint, { pos: [0, wingY, 0], color: 0xf2f1ec, cast: false });
    // 翼尖的紅色條紋與航行燈
    part(root, new THREE.BoxGeometry(0.25, 0.012, 1.4), mats.paint, { pos: [s * (halfW + span - 0.3), wingY + span * 0.03 - 0.008, 0.25], color: s < 0 ? 0xb3261e : 0x1f6b3a, cast: false });
    // 支柱（扁圓管）：從機身下方到機翼中段
    const strut = tube([[s * (halfW + 0.05), 0.12, 0.15], [s * 2.55, wingY + 0.06, 0.05]], 0.035, 8, 4);
    strut.scale(1, 1, 1);
    part(root, strut, mats.paint, { color: 0xe4e3de, cast: false });
    // 主輪
    part(root, tube([[s * (halfW + 0.05), 0.0, 0.42], [s * 1.12, -0.85, 0.45]], 0.03, 6, 4), mats.metal, { color: 0x8e9398, cast: false });
    const wp = new THREE.SphereGeometry(0.2, 18, 12); wp.scale(0.6, 0.8, 1.6);
    part(root, wp, mats.paint, { pos: [s * 1.15, -0.95, 0.45], color: 0xf2f1ec, cast: false });
    part(root, new THREE.CylinderGeometry(0.22, 0.22, 0.1, 22).rotateZ(Math.PI / 2), mats.plastic, { pos: [s * 1.15, -1.06, 0.45], color: 0x111111, cast: false });
  }
  // 機頭整流罩的上緣（從擋風玻璃下面延伸出去）
  {
    const g = new THREE.CylinderGeometry(0.42, 0.34, 1.7, 24, 4, true, -Math.PI / 2, Math.PI);
    g.rotateX(Math.PI / 2); g.rotateZ(0);
    part(root, g, mats.paint, { pos: [0, shieldBase.y - 0.33, shieldBase.z - 0.85], scale: [1.25, 1, 1], color: 0xf2f1ec, cast: false });
  }

  // ── 頂點環境遮蔽（角落、腳下、儀表板下方比較暗）──
  const ao = (x, y, z) => {
    let k = 1;
    k *= 0.35 + 0.65 * smooth(y / 0.55);                                        // 地板
    if (z < C.panelZ + 0.05 && y < C.panelY + 0.02) k *= 0.45 + 0.55 * smooth((z - fwZ) / 0.5); // 儀表板下方的腳下空間
    k *= 1 - 0.3 * smooth((Math.abs(x) - (halfW - 0.12)) / 0.12);              // 側壁
    k *= 1 - 0.25 * smooth((y - (roofY - 0.12)) / 0.12) * smooth((Math.abs(x) - 0.3) / 0.25); // 頂棚角落
    k *= 1 - 0.3 * smooth((z - (C.rearZ - 0.3)) / 0.3);                         // 後方
    return k;
  };
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (o.isMesh && o.userData.static && o.userData.ao) {
    const m = new THREE.Matrix4().copy(o.matrixWorld);
    const g = o.geometry, p = g.attributes.position, c = g.attributes.color, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m); const k = ao(v.x, v.y, v.z); c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
  } });

  // ── 合併不動的零件 ──
  // 會動的小組件先各自合併（之後它們底下就沒有 static 網格），再把其餘全部合併到 root
  for (const g of [...Object.values(knobs), flapLever]) mergeStatic(g);
  const merged = mergeStatic(root);
  const windows = new THREE.Mesh(merge(winGeoms.map((g) => g)), mats.window);
  windows.geometry.setAttribute('glow', new THREE.Float32BufferAttribute(new Float32Array(winGeoms.flatMap((g) => [...g.attributes.glow.array])), 1));
  windows.renderOrder = 10; windows.name = 'windows';
  root.add(windows);
  // 不動的網格只算一次矩陣
  root.traverse((o) => { if (o.isMesh && o.name.startsWith('merged:')) { o.matrixAutoUpdate = false; o.updateMatrix(); } });

  // ── 夜間燈光（遮光罩下的儀表板泛光燈、頂燈）──
  const flood = new THREE.SpotLight(0xffc89a, 0, 1.8, 1.2, 0.8, 1.2);
  flood.position.set(-0.08, gy - 0.03, gz + 0.12);
  flood.target.position.set(-0.08, C.panelY + 0.05, C.panelZ - 0.05);
  const dome = new THREE.PointLight(0xfff0d8, 0, 2.5, 1.6);
  dome.position.set(0, roofY - 0.04, 0.12);
  root.add(flood, flood.target, dome);

  const lighting = { panel: 0, dome: 0 };
  function setLighting({ backlight = 0, flood: f = 0, dome: d = 0, sunDir, sunColor, sky, night = 0 }) {
    lighting.panel = backlight;
    mats.gauge.emissiveIntensity = backlight;
    flood.intensity = f; dome.intensity = d;
    const U = mats.window.uniforms;
    if (sunDir) U.uSun.value.copy(sunDir);
    if (sunColor) U.uSunColor.value.copy(sunColor);
    if (sky) U.uSky.value.copy(sky);
    U.uNight.value = night * Math.min(backlight, 1);
    U.uAmb.value = 1 - night * 0.85;
  }

  // ── 每一格 ──
  function update(s, dt) {
    for (const I of instruments) I.update(s, dt);
    for (const Y of yokes) {
      Y.shaft.position.z = Y.z0 + s.elevator * spec.controls.yokeTravel - spec.controls.yokeTravel * 0.2;
      Y.wheel.rotation.z = -s.aileron * 40 * D;
    }
    if (knobs.throttle) knobs.throttle.position.z = (1 - s.throttle) * 0.055;
    if (knobs.mixture) knobs.mixture.position.z = (1 - s.mixture) * 0.055;
    flapLever.position.y = P.flaps.at[1] + 0.026 - (s.flaps / 30) * 0.052;
  }

  const stats = { merged, atlas: `${atlas.W}×${atlas.H}` };
  return { root, spec, mats, atlas, instruments, annunciator: ann, update, setLighting, stats, eye: new THREE.Vector3(...C.eye) };
}

function glassGeom(pos, uv, glow) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
  return g;
}

// 儀表板的漆面貼圖：深灰霧面漆、使用磨損、所有開關與把手的文字、小牌子、螺絲與分板縫（全部用程式畫）
function panelTexture(spec, T) {
  const P = spec.panel, PW = P.width, PH = spec.cabin.panelH;
  const W = T.panelTex, H = Math.round(W * PH / PW);
  const cv = canvas(W, H), c = cv.getContext('2d');
  const X = (x) => (x / PW + 0.5) * W, Y = (y) => (1 - y / PH) * H, S = W / PW; // 公尺 → 像素
  c.fillStyle = '#' + spec.colors.panel.toString(16).padStart(6, '0');
  c.fillRect(0, 0, W, H);
  // 漆面的斑駁（大尺度）與磨損（邊緣、把手周圍）
  const n = 128, f = fbmField(n, { seed: 31, base: 4, oct: 4 });
  const img = c.getImageData(0, 0, W, H), d = img.data;
  const R = rng(41);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const v = f[((y * n / H) | 0) * n + ((x * n / W) | 0)];
    const edge = Math.max(0, 1 - Math.min(x, W - x, y, H - y) / (W * 0.012));
    const k = 0.92 + v * 0.16 + edge * 0.25 + (R() - 0.5) * 0.04;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  c.putImageData(img, 0, 0);
  // 把手、開關附近被手摸亮的地方
  const scuff = (x, y, r, a = 0.12) => { const g = c.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * S); g.addColorStop(0, `rgba(160,165,170,${a})`); g.addColorStop(1, 'rgba(160,165,170,0)'); c.fillStyle = g; c.fillRect(X(x) - r * S, Y(y) - r * S, 2 * r * S, 2 * r * S); };
  for (const K of P.knobs) scuff(K.at[0], K.at[1], 0.04);
  scuff(P.key.at[0], P.key.at[1], 0.035);
  for (let i = 0; i < P.switches.list.length; i++) scuff(P.switches.at[0] + i * P.switches.gap, P.switches.at[1] - 0.01, 0.025, 0.08);
  // 分板縫與螺絲
  c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = Math.max(1, S * 0.0015);
  for (const [x, y0, y1] of P.seams) { c.beginPath(); c.moveTo(X(x), Y(y0)); c.lineTo(X(x), Y(y1)); c.stroke(); }
  const screw = (x, y) => { c.fillStyle = '#1a1b1d'; c.beginPath(); c.arc(X(x), Y(y), S * 0.0035, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#6a6e72'; c.lineWidth = S * 0.0008; c.stroke(); c.beginPath(); c.moveTo(X(x) - S * 0.0022, Y(y)); c.lineTo(X(x) + S * 0.0022, Y(y)); c.stroke(); };
  for (const x of [-0.545, -0.012, 0.165, 0.545]) for (const y of [0.02, PH - 0.025]) screw(x, y);
  // 錶孔周圍的淡淡陰影（錶框壓在漆面上）
  for (const I of P.instruments) {
    const r = (I.type === 'small' ? P.smallRadius : P.bigRadius) + 0.006;
    const g = c.createRadialGradient(X(I.at[0]), Y(I.at[1]), r * S * 0.9, X(I.at[0]), Y(I.at[1]), r * S * 1.25);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(X(I.at[0]) - r * S * 1.3, Y(I.at[1]) - r * S * 1.3, r * S * 2.6, r * S * 2.6);
  }
  // 文字（白色絲印）
  const ink = '#e6e3da', lab = (s, x, y, h = 0.0075) => drawText(c, s, X(x), Y(y), h * S, { color: ink, weight: 0.13 });
  P.switches.list.forEach((name, i) => {
    const x = P.switches.at[0] + i * P.switches.gap;
    const parts = name.split(' ');
    parts.forEach((t, j) => lab(t, x, P.switches.at[1] + 0.03 + (parts.length - 1 - j) * 0.0095, 0.0068));
  });
  lab('ON', P.switches.at[0] - 0.026, P.switches.at[1] + 0.012, 0.006); lab('OFF', P.switches.at[0] - 0.026, P.switches.at[1] - 0.012, 0.006);
  for (const K of P.knobs) lab(K.label, K.at[0], K.at[1] + (K.shape === 'small' ? 0.026 : 0.03), 0.0062);
  lab('FULL RICH', P.knobs[1].at[0], P.knobs[1].at[1] - 0.03, 0.005);
  lab('OPEN', P.knobs[0].at[0], P.knobs[0].at[1] - 0.03, 0.005);
  { const [x, y] = P.flaps.at; lab('FLAPS', x, y + 0.05, 0.0065); [0, 10, 20, 30].forEach((v, i) => lab(v === 30 ? 'FULL' : String(v), x + 0.03, y + 0.026 - i * 0.0173, 0.0052)); }
  { const [x, y] = P.key.at; lab('OFF R L BOTH START', x, y + 0.03, 0.0045); lab('MAGNETOS', x, y - 0.026, 0.0055); }
  { const B = P.breakers; lab('CIRCUIT BREAKERS', B.at[0] + B.gap * (B.labels.length - 1) / 2, B.at[1] + 0.017, 0.0052); B.labels.forEach((t, i) => lab(t, B.at[0] + i * B.gap, B.at[1] - 0.014, 0.0036)); }
  // 小牌子：設計機動速度、機尾編號、「本機僅限目視飛行」
  const plate = (x, y, w, h, lines, bg = '#d9d4c4', fg = '#1a1a1a') => {
    c.fillStyle = bg; c.fillRect(X(x - w / 2), Y(y + h / 2), w * S, h * S);
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = S * 0.0008; c.strokeRect(X(x - w / 2), Y(y + h / 2), w * S, h * S);
    lines.forEach((t, i) => drawText(c, t, X(x), Y(y + h / 2 - (i + 0.8) * h / (lines.length + 0.6)), Math.min(h / (lines.length + 1.2), 0.006) * S, { color: fg, weight: 0.14 }));
  };
  for (const p of P.placards) plate(p.at[0], p.at[1], p.size[0], p.size[1], p.lines.map((t) => (t === '$TAIL' ? spec.tail : t)), p.dark ? '#202224' : '#d9d4c4', p.dark ? '#e6e3da' : '#1a1a1a');
  // 置物箱的門縫
  { const g = P.glovebox; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = S * 0.0018; c.strokeRect(X(g.at[0] - g.size[0] / 2), Y(g.at[1] + g.size[1] / 2), g.size[0] * S, g.size[1] * S); }
  // 無線電區的深色底框
  c.fillStyle = 'rgba(0,0,0,0.35)';
  const r0 = P.radios[0], r1 = P.radios[P.radios.length - 1];
  c.fillRect(X(r0.at[0] - r0.size[0] / 2 - 0.008), Y(r0.at[1] + r0.size[1] / 2 + 0.008), (r0.size[0] + 0.016) * S, (r0.at[1] - r1.at[1] + r0.size[1] + 0.016) * S);
  return tex(cv, { repeat: false, aniso: T.aniso });
}
