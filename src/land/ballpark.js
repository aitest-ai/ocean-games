// 棒球場場地底座（可重用）：程式生成的少棒球場，含內外野草地與紅土、壘包、投手丘、本壘板、白線、
// 外野牆與界外標竿、後擋網、球員休息區、看台與觀眾、記分板、燈塔、天空與遠山。
//
//   import { createBallpark } from '../land/ballpark.js';
//   const park = createBallpark(renderer, { tier: 'low' | 'mid' | 'rt', time: 'day' | 'dusk' | 'night' });
//   scene.add(park.root); park.setTime('night'); park.update(dt, camera); park.scoreboard.draw({...});
//
// 尺寸都來自 dims.js（少棒 60 呎場地），座標：本壘尖端 = 原點、+z 朝中外野、三壘在 +x。
import * as THREE from './three.js';
import { FIELD, BASES, LINE1, LINE3, polar, fenceR } from './dims.js';
import { FIELD_RECT, makeFieldCanvas, makeDetailCanvas, makeWallCanvas, makeNetCanvas, makeGlowCanvas, makeScoreboard, rng } from './textures.js';

// 各畫質的取捨（說明寫在 docs/baseball-plan.md「畫質分級」）
export const PARK_TIERS = {
  low: { fieldTex: 2048, detail: false, shadows: 0, crowd: 0.3, seats: false, trees: 70, aniso: 1, towerSpots: false, berm: 40 },
  mid: { fieldTex: 4096, detail: true, shadows: 1024, crowd: 0.5, seats: true, trees: 180, aniso: 4, towerSpots: false, berm: 120 },
  rt: { fieldTex: 4096, detail: true, shadows: 2048, crowd: 0.75, seats: true, trees: 360, aniso: 8, towerSpots: true, berm: 260 },
};

// 三個時段：太陽位置、天空、燈光
export const TIMES = {
  day: { label: '白天', sunElev: 58, sunAz: 205, turbidity: 3.2, rayleigh: 1.2, mie: 0.004, sun: 3.2, hemi: 0.9, sky: 0.9, exposure: 0.55, lights: 0, fog: [520, 1800] },
  dusk: { label: '黃昏', sunElev: 3.5, sunAz: 182, turbidity: 6, rayleigh: 2.6, mie: 0.012, sun: 2.4, hemi: 0.6, sky: 0.55, exposure: 1.0, lights: 0.55, fog: [420, 1500] },
  night: { label: '夜間', sunElev: -14, sunAz: 182, turbidity: 2, rayleigh: 0.6, mie: 0.004, sun: 0, hemi: 0.16, sky: 0.25, exposure: 0.85, lights: 1, fog: [300, 1200] },
};

const SRGB = (hex) => new THREE.Color(hex);

export function createBallpark(renderer, { tier = 'mid', time = 'day' } = {}) {
  const T = PARK_TIERS[tier] || PARK_TIERS.mid;
  const root = new THREE.Group();
  root.name = 'ballpark';
  const R = rng(42);
  const maxAniso = renderer.capabilities.getMaxAnisotropy?.() || 1;
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  // ── 材質 ──
  const tex = (c, { repeat, srgb = true, mip = true } = {}) => {
    const t = keep(new THREE.CanvasTexture(c));
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(T.aniso, maxAniso);
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
    if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
    return t;
  };
  const mat = (o) => keep(new THREE.MeshStandardMaterial(o));
  const M = {
    concrete: mat({ color: SRGB('#a8a49c'), roughness: 0.85 }),
    concreteDark: mat({ color: SRGB('#6f6b66'), roughness: 0.9 }),
    roof: mat({ color: SRGB('#2c4a5c'), roughness: 0.55, metalness: 0.4 }),
    steel: mat({ color: SRGB('#8d949a'), roughness: 0.45, metalness: 0.7 }),
    pad: mat({ color: SRGB('#1f4a34'), roughness: 0.9 }),
    yellow: mat({ color: SRGB('#f2c230'), roughness: 0.6 }),
    white: mat({ color: SRGB('#f2f0e8'), roughness: 0.6 }),
    rubber: mat({ color: SRGB('#f4f2ea'), roughness: 0.7 }),
    seat: mat({ color: SRGB('#2f6fb3'), roughness: 0.6 }),
    bench: mat({ color: SRGB('#7a5a3c'), roughness: 0.8 }),
    dugoutIn: mat({ color: SRGB('#3b3f44'), roughness: 0.95 }),
    trunk: mat({ color: SRGB('#5a4330'), roughness: 0.95 }),
    leaves: mat({ color: SRGB('#3d6a2e'), roughness: 0.9 }),
    berm: mat({ color: SRGB('#4b7a2b'), roughness: 0.95 }),
    ground: mat({ color: SRGB('#4a6e2e'), roughness: 1 }),
    lamp: mat({ color: SRGB('#d8dde0'), roughness: 0.3, emissive: SRGB('#fff6e0'), emissiveIntensity: 0 }),
    board: mat({ color: SRGB('#000000'), roughness: 0.6, emissive: SRGB('#ffffff'), emissiveIntensity: 1 }),
  };
  for (const k of ['concrete', 'concreteDark', 'roof', 'pad', 'berm', 'seat']) M[k].side = THREE.DoubleSide;
  const detail = T.detail ? tex(makeDetailCanvas(256), { repeat: [1, 1], srgb: false }) : null;

  // ── 場地（草地、紅土、白線全部在一張程式生成的大貼圖上） ──
  const fieldMap = tex(makeFieldCanvas(T.fieldTex));
  const fieldMat = mat({ map: fieldMap, roughness: 0.95 });
  const poolU = { value: 0 }; // 夜間燈光的「亮區」：內野最亮，往外野邊緣變暗
  fieldShader(fieldMat, detail, FIELD_RECT, poolU);
  {
    const { x0, z0, size } = FIELD_RECT;
    const g = new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2).translate(x0 + size / 2, 0, z0 + size / 2);
    worldUV(g, x0, z0, size);
    const m = new THREE.Mesh(g, fieldMat);
    m.receiveShadow = true; m.name = 'field';
    root.add(m);
    // 投手丘：同一張貼圖、隆起 15 cm（丘頂平台半徑約 0.6 m，往外緩降）
    const mg = new THREE.CircleGeometry(FIELD.moundRadius, 48, 0, Math.PI * 2).rotateX(-Math.PI / 2);
    const mg2 = radialMesh(FIELD.moundRadius, 10, 48, (r) => {
      const u = Math.max(r - 0.6, 0) / (FIELD.moundRadius - 0.6);
      return FIELD.moundHeight * (1 - u * u * (3 - 2 * u));
    });
    mg.dispose();
    mg2.translate(BASES.rubber[0], 0, BASES.rubber[1] + 0.15);
    worldUV(mg2, x0, z0, size);
    const moundMat = fieldMat.clone(); keep(moundMat);
    moundMat.polygonOffset = true; moundMat.polygonOffsetFactor = -2; moundMat.polygonOffsetUnits = -2;
    fieldShader(moundMat, detail, FIELD_RECT, poolU);
    const mound = new THREE.Mesh(mg2, moundMat);
    mound.receiveShadow = true; mound.name = 'mound';
    root.add(mound);
  }
  // 場外的地面（大片草地）
  {
    const g = new THREE.CircleGeometry(1600, 48).rotateX(-Math.PI / 2).translate(0, -0.03, 30);
    const m = new THREE.Mesh(g, M.ground); m.receiveShadow = true; root.add(m);
  }

  // ── 本壘板、壘包、投手板 ──
  const plateShape = new THREE.Shape();
  {
    const w = FIELD.plateWidth / 2, d = FIELD.plateWidth;
    // 尖端朝捕手（z = 0），前緣（17 吋）朝投手
    plateShape.moveTo(0, 0); plateShape.lineTo(w, w); plateShape.lineTo(w, d); plateShape.lineTo(-w, d); plateShape.lineTo(-w, w); plateShape.closePath();
    const g = new THREE.ExtrudeGeometry(plateShape, { depth: 0.012, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.012, 0);
    const m = new THREE.Mesh(g, M.rubber); m.receiveShadow = true; m.name = 'homePlate'; root.add(m);
  }
  const bag = new THREE.BoxGeometry(FIELD.baseSize, 0.07, FIELD.baseSize);
  const s = FIELD.baseSize;
  const bagPos = {
    first: [LINE1[0] * (FIELD.base - s / 2) + LINE3[0] * s / 2, LINE1[1] * (FIELD.base - s / 2) + LINE3[1] * s / 2],
    second: BASES.second,
    third: [LINE3[0] * (FIELD.base - s / 2) + LINE1[0] * s / 2, LINE3[1] * (FIELD.base - s / 2) + LINE1[1] * s / 2],
  };
  for (const [k, p] of Object.entries(bagPos)) {
    const m = new THREE.Mesh(bag, M.white);
    m.position.set(p[0], 0.035, p[1]); m.rotation.y = Math.PI / 4; m.castShadow = true; m.receiveShadow = true; m.name = k;
    root.add(m);
  }
  {
    const [w, d] = FIELD.rubber;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), M.rubber);
    m.position.set(0, FIELD.moundHeight + 0.01, FIELD.pitch + d / 2); m.name = 'rubber'; root.add(m);
  }

  // ── 外野牆（弧形，界線 200 呎 → 中外野 215 呎）與界外標竿 ──
  const wallTex = tex(makeWallCanvas(''), { repeat: [1, 1] });
  {
    const a0 = -Math.PI / 4, a1 = Math.PI / 4, n = 72, H = FIELD.wallHeight;
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); pts.push(polar(a, fenceR(a))); }
    const front = stripGeometry(pts, 0, H, 14.4);
    const wall = new THREE.Mesh(front, mat({ map: wallTex, roughness: 0.9 }));
    wall.receiveShadow = true; wall.castShadow = true; wall.name = 'outfieldWall';
    root.add(wall);
    const back = stripGeometry(pts.map((p) => [p[0] * 1.004, p[1] * 1.004]).reverse(), 0, H, 14.4);
    root.add(new THREE.Mesh(back, M.pad));
    // 距離標示與標語（校園風，不放真實品牌）
    const sign = (a, text, sub, w = 7) => {
      const t = tex(makeWallCanvas(text, sub));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 8), mat({ map: t, roughness: 0.85 }));
      const p = polar(a, fenceR(a) - 0.03);
      m.position.set(p[0], FIELD.wallHeight / 2, p[1]);
      m.lookAt(0, FIELD.wallHeight / 2, 0);
      root.add(m);
    };
    sign(0, '⚾ 體感野球', '215 ft・65.5 m', 12);
    sign(0.62, '61 m', '200 ft', 6);
    sign(-0.62, '61 m', '200 ft', 6);
    sign(0.33, '安全第一・空手揮棒', '', 11);
    sign(-0.33, '海洋・陸地 體感系列', '', 11);
    for (const L of [LINE1, LINE3]) {
      const r = FIELD.fenceLine;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 9, 10), M.yellow);
      pole.position.set(L[0] * r, 4.5, L[1] * r); pole.castShadow = true; root.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 6), M.yellow);
      flag.position.set(L[0] * r + (L[0] > 0 ? 0.32 : -0.32) * Math.SQRT1_2, 5.6, L[1] * r - 0.32 * Math.SQRT1_2);
      flag.lookAt(0, 5.6, 0); flag.material.side = THREE.DoubleSide;
      root.add(flag);
    }
  }

  // ── 界外區的圍欄、後擋網、球員休息區 ──
  const N3 = [Math.SQRT1_2, -Math.SQRT1_2], N1 = [-Math.SQRT1_2, -Math.SQRT1_2];
  const sideP = (L, N, t, o = FIELD.foulWidth) => [L[0] * t + N[0] * o, L[1] * t + N[1] * o];
  const DUG = [5.5, 13.5]; // 休息區沿界線的位置（公尺）
  const netTex = tex(makeNetCanvas(128), { repeat: [1, 1], srgb: false });
  const netMat = mat({ color: SRGB('#2a2e33'), alphaMap: netTex, transparent: false, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8 });
  {
    // 後擋網：半徑 25 呎的弧，下段 1 m 矮牆＋上方 8 m 網
    const arcPts = [];
    for (let i = 0; i <= 24; i++) { const a = (3 * Math.PI) / 4 + (Math.PI / 2) * (i / 24); arcPts.push(polar(a, FIELD.backstop)); }
    const low = new THREE.Mesh(stripGeometry(arcPts, 0, 1.0, 4), M.pad); low.receiveShadow = true; root.add(low);
    const net = stripGeometry(arcPts, 1.0, 8.5, 1.2, 6.4);
    root.add(new THREE.Mesh(net, netMat));
    for (let i = 0; i <= 24; i += 4) {
      const p = arcPts[i];
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 9, 8), M.steel);
      post.position.set(p[0] * 1.01, 4.5, p[1] * 1.01); post.castShadow = true; root.add(post);
    }
    // 兩側界外圍欄（休息區那段留開口）
    for (const [L, N] of [[LINE1, N1], [LINE3, N3]]) {
      const seg = (t0, t1, h, m) => {
        const pts = []; for (let i = 0; i <= 8; i++) pts.push(sideP(L, N, t0 + (t1 - t0) * (i / 8)));
        const mesh = new THREE.Mesh(stripGeometry(pts, 0, h, 4), m); mesh.receiveShadow = true; root.add(mesh);
        return pts;
      };
      // 後擋網的弧接到界外圍欄（弧的端點離本壘 7.62 m，圍欄在界線外 7.5 m）
      seg(0.4, DUG[0], 1.1, M.pad);
      const side = []; for (let i = 0; i <= 6; i++) side.push(sideP(L, N, 0.4 + (DUG[0] - 0.4) * (i / 6)));
      root.add(new THREE.Mesh(stripGeometry(side, 1.1, 5.5, 1.2, 3.6), netMat));
      seg(DUG[1], FIELD.fenceLine, 1.1, M.pad);
      // 外野牆端點（標竿）到界外圍欄
      const pole = [L[0] * FIELD.fenceLine, L[1] * FIELD.fenceLine];
      root.add(new THREE.Mesh(stripGeometry([pole, sideP(L, N, FIELD.fenceLine)], 0, FIELD.wallHeight, 4), M.pad));
      buildDugout(L, N);
    }
  }

  function buildDugout(L, N) {
    const g = new THREE.Group();
    const len = DUG[1] - DUG[0], depth = 3.2, h = 2.3;
    const c = sideP(L, N, (DUG[0] + DUG[1]) / 2, FIELD.foulWidth + depth / 2);
    g.position.set(c[0], 0, c[1]);
    g.rotation.y = Math.atan2(-L[1], L[0]);
    // 本地座標：x 沿界線、z 往界外（後方）。前緣在 z = −depth/2
    const box = (w, hh, d, x, y, z, m, cast = true) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m);
      b.position.set(x, y, z); b.castShadow = cast; b.receiveShadow = true; g.add(b); return b;
    };
    const flip = L[0] > 0 ? -1 : 1; // 讓開口朝向球場
    box(len, 0.18, depth + 0.4, 0, h, 0, M.roof);                         // 屋頂
    box(len, h, 0.2, 0, h / 2, flip * depth / 2, M.concrete);             // 後牆
    box(0.2, h, depth, -len / 2, h / 2, 0, M.concrete);                  // 側牆
    box(0.2, h, depth, len / 2, h / 2, 0, M.concrete);
    box(len, 0.9, 0.2, 0, 0.45, -flip * depth / 2, M.pad);                // 前方矮牆
    box(len - 1, 0.1, 0.5, 0, 0.45, flip * (depth / 2 - 0.5), M.bench, false); // 長椅
    box(len - 0.4, 0.02, depth - 0.3, 0, 0.01, 0, M.dugoutIn, false);     // 地面
    root.add(g);
  }

  // ── 看台（本壘後方弧形＋一、三壘兩側）、觀眾、屋頂 ──
  const ROWS = 12, TREAD = 0.82, RISE = 0.42;
  const stands = [];
  {
    // 本壘後方：從後擋網後面 3 m 起
    const home = [];
    for (let i = 0; i <= 28; i++) { const a = (3 * Math.PI) / 4 + (Math.PI / 2) * (i / 28); home.push(polar(a, FIELD.backstop + 3)); }
    stands.push({ pts: home, base: 0.6, roof: true });
    for (const [L, N] of [[LINE1, N1], [LINE3, N3]]) {
      const pts = []; for (let i = 0; i <= 12; i++) pts.push(sideP(L, N, 2 + (34 - 2) * (i / 12), FIELD.foulWidth + 4.2));
      stands.push({ pts: L === LINE1 ? pts : pts.reverse(), base: 0.4 });
    }
  }
  const seatSpots = [];
  for (const st of stands) {
    const { pts, base } = st;
    // 外推方向（遠離本壘）
    const outward = (p, i) => {
      const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      const tx = q[0] - o[0], tz = q[1] - o[1], l = Math.hypot(tx, tz) || 1;
      let nx = tz / l, nz = -tx / l;
      if (nx * p[0] + nz * p[1] < 0) { nx = -nx; nz = -nz; }
      return [nx, nz];
    };
    const norms = pts.map(outward);
    const pos = [], idx = [];
    const add = (p) => (pos.push(...p), pos.length / 3 - 1);
    for (let r = 0; r <= ROWS; r++) {
      const y = base + r * RISE, d0 = r * TREAD, d1 = d0 + TREAD;
      const row = pts.map((p, i) => [[p[0] + norms[i][0] * d0, y, p[1] + norms[i][1] * d0], [p[0] + norms[i][0] * d1, y, p[1] + norms[i][1] * d1], [p[0] + norms[i][0] * d0, y - (r ? RISE : base), p[1] + norms[i][1] * d0]]);
      for (let i = 0; i < pts.length - 1; i++) {
        // 踏面
        const a = add(row[i][0]), b = add(row[i][1]), c = add(row[i + 1][1]), d = add(row[i + 1][0]);
        idx.push(a, b, c, a, c, d);
        // 立面
        const e = add(row[i][2]), f = add(row[i + 1][2]);
        idx.push(e, a, d, e, d, f);
      }
      if (r < ROWS) {
        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i], p1 = pts[i + 1], n0 = norms[i], n1 = norms[i + 1];
          const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          const k = Math.max(1, Math.floor(L / 0.56));
          for (let j = 0; j < k; j++) {
            const u = (j + 0.5) / k;
            // 每隔幾個座位留走道
            if (i % 4 === 3 && j === k - 1) continue;
            const px = p0[0] + (p1[0] - p0[0]) * u + (n0[0] + (n1[0] - n0[0]) * u) * (d0 + 0.5);
            const pz = p0[1] + (p1[1] - p0[1]) * u + (n0[1] + (n1[1] - n0[1]) * u) * (d0 + 0.5);
            seatSpots.push([px, y, pz, Math.atan2(px, pz)]);
          }
        }
      }
    }
    // 看台後牆
    const back = pts.map((p, i) => [p[0] + norms[i][0] * (ROWS + 1) * TREAD, p[1] + norms[i][1] * (ROWS + 1) * TREAD]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.concrete); m.receiveShadow = true; m.castShadow = true; root.add(m);
    const bw = new THREE.Mesh(stripGeometry(back, 0, base + ROWS * RISE + 1.4, 6), M.concreteDark);
    bw.castShadow = true; root.add(bw);
    if (st.roof) {
      // 本壘後方看台的屋頂：斜屋頂＋柱子
      const front = pts.map((p, i) => [p[0] + norms[i][0] * 3.5, p[1] + norms[i][1] * 3.5]);
      const yT = base + ROWS * RISE + 4.2;
      const rp = [], ri = [];
      pts.forEach((_, i) => { rp.push(front[i][0], yT - 0.6, front[i][1], back[i][0], yT, back[i][1]); });
      for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; ri.push(a, a + 1, a + 3, a, a + 3, a + 2); }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3)); rg.setIndex(ri); rg.computeVertexNormals();
      const roof = new THREE.Mesh(rg, M.roof.clone()); keep(roof.material); roof.material.side = THREE.DoubleSide; roof.castShadow = true; root.add(roof);
      for (let i = 0; i < pts.length; i += 7) {
        const p = back[i];
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, yT, 8), M.steel);
        col.position.set(p[0] - norms[i][0] * 0.3, yT / 2, p[1] - norms[i][1] * 0.3); col.castShadow = true; root.add(col);
      }
    }
  }

  // 座位與觀眾（InstancedMesh：一次畫完）
  const crowd = { bodies: null, heads: null, excite: 0, uniforms: { uTime: { value: 0 }, uExcite: { value: 0 } } };
  {
    const dummy = new THREE.Object3D();
    if (T.seats) {
      const seatG = new THREE.BoxGeometry(0.46, 0.08, 0.42).translate(0, 0.22, 0);
      const seats = new THREE.InstancedMesh(seatG, M.seat, seatSpots.length);
      seatSpots.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, p[3], 0); dummy.updateMatrix(); seats.setMatrixAt(i, dummy.matrix); });
      seats.receiveShadow = true; root.add(seats);
    }
    const people = seatSpots.filter(() => R() < T.crowd);
    // 坐姿的人：身體（上衣顏色）與頭（膚色、帽子）分成兩組
    const bodyG = mergeGeoms([
      new THREE.BoxGeometry(0.4, 0.5, 0.26).translate(0, 0.52, 0.02),
      new THREE.BoxGeometry(0.38, 0.16, 0.4).translate(0, 0.28, -0.12),
    ]);
    const headG = new THREE.SphereGeometry(0.11, 8, 6).translate(0, 0.9, 0.02);
    const SHIRTS = ['#c8102e', '#1d4f91', '#f2f2f2', '#2b2b2b', '#f2c230', '#2e8b57', '#e87722', '#6a3d9a', '#8ecae6', '#ff6f91', '#1d4f91', '#c8102e'];
    const SKIN = ['#e9c4a3', '#d6a77a', '#b98257', '#8d5a3b', '#f1d2b8'];
    const bodyMat = mat({ roughness: 0.85 }), headMat = mat({ roughness: 0.7 });
    for (const m of [bodyMat, headMat]) cheer(m, crowd.uniforms);
    crowd.bodies = new THREE.InstancedMesh(bodyG, bodyMat, Math.max(people.length, 1));
    crowd.heads = new THREE.InstancedMesh(headG, headMat, Math.max(people.length, 1));
    const col = new THREE.Color();
    people.forEach((p, i) => {
      dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, p[3] + (R() - 0.5) * 0.3, 0); dummy.scale.setScalar(0.85 + R() * 0.3); dummy.updateMatrix();
      crowd.bodies.setMatrixAt(i, dummy.matrix); crowd.heads.setMatrixAt(i, dummy.matrix);
      crowd.bodies.setColorAt(i, col.set(SHIRTS[Math.floor(R() * SHIRTS.length)]));
      crowd.heads.setColorAt(i, col.set(SKIN[Math.floor(R() * SKIN.length)]));
    });
    crowd.bodies.count = crowd.heads.count = people.length;
    crowd.bodies.castShadow = tier === 'rt';
    root.add(crowd.bodies, crowd.heads);
    crowd.count = people.length;
  }

  // ── 外野草坡（坐在草地上看球的人）與遠景 ──
  {
    const pts = [];
    for (let i = 0; i <= 60; i++) { const a = -Math.PI / 4 - 0.12 + (Math.PI / 2 + 0.24) * (i / 60); pts.push(a); }
    const pos = [], idx = [];
    const rings = 8;
    pts.forEach((a) => {
      for (let j = 0; j <= rings; j++) {
        const u = j / rings, r = fenceR(a) + 0.6 + u * 16;
        const y = 4.5 * Math.sin(Math.min(u * 1.25, 1) * Math.PI / 2) - (u > 0.85 ? (u - 0.85) * 12 : 0);
        const p = polar(a, r); pos.push(p[0], y, p[1]);
      }
    });
    for (let i = 0; i < pts.length - 1; i++) for (let j = 0; j < rings; j++) {
      const a = i * (rings + 1) + j, b = a + rings + 1;
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.berm); m.receiveShadow = true; root.add(m);
    // 草坡上的觀眾（小點）
    const n = T.berm;
    const sitG = mergeGeoms([new THREE.BoxGeometry(0.4, 0.45, 0.3).translate(0, 0.25, 0), new THREE.SphereGeometry(0.11, 6, 5).translate(0, 0.6, 0)]);
    const sit = new THREE.InstancedMesh(sitG, mat({ roughness: 0.85 }), n);
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 4 + R() * Math.PI / 2, u = 0.25 + R() * 0.55, r = fenceR(a) + 0.6 + u * 16;
      const y = 4.5 * Math.sin(Math.min(u * 1.25, 1) * Math.PI / 2);
      const p = polar(a, r);
      dummy.position.set(p[0], y, p[1]); dummy.rotation.set(-0.2, Math.atan2(p[0], p[1]), 0); dummy.updateMatrix();
      sit.setMatrixAt(i, dummy.matrix); sit.setColorAt(i, col.setHSL(R(), 0.5, 0.45));
    }
    root.add(sit);
  }
  // 樹林
  {
    const n = T.trees;
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 7, 7).translate(0, 6, 0), M.leaves, n);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6).translate(0, 1.5, 0), M.trunk, n);
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    let k = 0;
    while (k < n) {
      const a = (R() - 0.5) * Math.PI * 2, r = 92 + R() * 90;
      const p = polar(a, r);
      // 不要種在看台上
      if (Math.abs(a) > Math.PI / 4 + 0.15 && r < 130) continue;
      const sc = 0.7 + R() * 0.8;
      dummy.position.set(p[0], 0, p[1]); dummy.rotation.set(0, R() * 6, 0); dummy.scale.set(sc, sc * (0.8 + R() * 0.5), sc); dummy.updateMatrix();
      crown.setMatrixAt(k, dummy.matrix); trunk.setMatrixAt(k, dummy.matrix);
      crown.setColorAt(k, col.setHSL(0.27 + R() * 0.06, 0.45, 0.22 + R() * 0.1));
      k++;
    }
    crown.castShadow = tier === 'rt';
    root.add(crown, trunk);
  }
  // 遠山（一圈起伏的山稜，霧會讓它變淡）
  {
    const n = 160, pos = [], idx = [];
    const nz = (a) => 0.5 + 0.3 * Math.sin(a * 3 + 1) + 0.2 * Math.sin(a * 7 + 2) + 0.12 * Math.sin(a * 17);
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 520, h = 25 + 70 * nz(a);
      pos.push(Math.sin(a) * r, -2, Math.cos(a) * r, Math.sin(a) * (r + 60), h, Math.cos(a) * (r + 60));
    }
    for (let i = 0; i < n; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    M.hills = mat({ color: SRGB('#465c48'), roughness: 1, side: THREE.DoubleSide });
    root.add(new THREE.Mesh(g, M.hills));
  }

  // ── 記分板（左中外野牆後方） ──
  const scoreboard = makeScoreboard();
  const boardTex = tex(scoreboard.canvas, { mip: false });
  M.board.map = boardTex; M.board.emissiveMap = boardTex;
  {
    const a = 0.42, p = polar(a, fenceR(a) + 13);
    const g = new THREE.Group();
    g.position.set(p[0], 0, p[1]); g.lookAt(0, 0, 0);
    const W = 12, H = 6, y0 = 6;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, H + 0.8, 0.6), M.concreteDark); frame.position.set(0, y0 + H / 2, -0.32); frame.castShadow = true;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(W, H), M.board); panel.position.set(0, y0 + H / 2, 0.0);
    for (const x of [-W / 3, W / 3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, y0, 0.6), M.concreteDark); leg.position.set(x, y0 / 2, -0.32); leg.castShadow = true; g.add(leg);
    }
    g.add(frame, panel); root.add(g);
    scoreboard.texture = boardTex;
    scoreboard.update = (s) => { scoreboard.draw(s); boardTex.needsUpdate = true; };
  }

  // ── 燈塔（6 座）：夜間燈具發光＋光暈 ──
  const glowTex = tex(makeGlowCanvas(128));
  const glowMat = keep(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff3dc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  const towers = [];
  {
    const spots = [[0.42, 86], [-0.42, 86], [1.08, 50], [-1.08, 50], [2.2, 34], [-2.2, 34]];
    for (const [a, r] of spots) {
      const p = polar(a, r), H = 26;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, H, 10), M.steel);
      pole.position.set(p[0], H / 2, p[1]); pole.castShadow = true; root.add(pole);
      const head = new THREE.Group();
      head.position.set(p[0], H + 1.2, p[1]);
      head.lookAt(0, 0, 28);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3.2, 0.3), M.steel); head.add(frame);
      const lampG = new THREE.CylinderGeometry(0.28, 0.32, 0.2, 10).rotateX(Math.PI / 2);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const l = new THREE.Mesh(lampG, M.lamp); l.position.set(-1.9 + i * 1.27, -1 + j * 1.0, 0.25); head.add(l);
      }
      const glow = new THREE.Sprite(glowMat); glow.scale.set(16, 16, 1); glow.position.set(0, 0, 0.8); head.add(glow);
      root.add(head);
      towers.push({ head, pos: [p[0], H + 1.2, p[1]] });
    }
  }

  // ── 天空、星星、太陽與燈光 ──
  const sky = new THREE.Sky(); sky.scale.setScalar(4500); root.add(sky);
  const stars = (() => {
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = R(), v = R() * 0.9 + 0.08;
      const th = u * Math.PI * 2, ph = Math.acos(1 - v);
      pos.set([Math.sin(ph) * Math.cos(th) * 3000, Math.cos(ph) * 3000, Math.sin(ph) * Math.sin(th) * 3000], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, keep(new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false })));
    root.add(p); return p;
  })();
  const moon = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTex, color: 0xdfe8ff, transparent: true, opacity: 0, depthWrite: false, fog: false })));
  moon.scale.set(160, 160, 1); moon.position.set(-1400, 1100, 2000); root.add(moon);

  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a32, 1); root.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 3);
  key.target.position.set(0, 0, 18);
  root.add(key, key.target);
  if (T.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.set(T.shadows, T.shadows);
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = tier === 'rt' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  }
  // 高畫質：夜間每座燈塔再加一盞聚光燈（球場地面會有一圈圈的亮區）
  const spots = [];
  if (T.towerSpots) {
    for (const t of towers) {
      const s = new THREE.SpotLight(0xfff1dc, 0, 160, 0.55, 0.6, 1.2);
      s.position.set(...t.pos); s.target.position.set(t.pos[0] * 0.15, 0, 22 + t.pos[2] * 0.1);
      root.add(s, s.target); spots.push(s);
    }
  }

  // 陰影範圍（預設整個球場；打擊練習會縮到內野，陰影更清楚）
  let shadowFocus = { x: 0, z: 30, half: 70 };
  const keyDir = new THREE.Vector3(0, 1, 0);
  function setShadowFocus(x, z, half) { shadowFocus = { x, z, half }; placeKey(); }
  // 主光放在陰影焦點的「光源方向」160 m 外，陰影相機才會罩住焦點
  function placeKey() {
    key.target.position.set(shadowFocus.x, 0, shadowFocus.z);
    key.position.copy(keyDir).multiplyScalar(160).add(key.target.position);
    applyShadowCam();
  }
  function applyShadowCam() {
    if (!T.shadows) return;
    const c = key.shadow.camera, h = shadowFocus.half;
    c.left = -h; c.right = h; c.top = h; c.bottom = -h; c.near = 1; c.far = 600;
    c.updateProjectionMatrix();
  }

  const farMats = [[M.leaves, 'far'], [M.trunk, 'far'], [M.hills, 'far'], [M.berm, 'near'], [M.ground, 'near']].map(([m, k]) => [m, m.color.clone(), k]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null;
  const state = { time: null };
  const sunDir = new THREE.Vector3();
  function setTime(name, scene) {
    const P = TIMES[name] || TIMES.day;
    state.time = name; state.preset = P;
    const el = THREE.MathUtils.degToRad(P.sunElev), az = THREE.MathUtils.degToRad(P.sunAz);
    // 方位角：0 = 中外野方向（+z），180 = 本壘後方
    sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const U = sky.material.uniforms;
    U.turbidity.value = P.turbidity; U.rayleigh.value = P.rayleigh; U.mieCoefficient.value = P.mie; U.mieDirectionalG.value = 0.8;
    U.sunPosition.value.copy(sunDir);
    // 夜間：天空換成深藍黑色，靠星星、月光與球場燈；球場外的山、樹、草坡跟著變暗
    sky.visible = name !== 'night';
    if (scene) scene.background = name === 'night' ? new THREE.Color(0x05080f) : null;
    const far = name === 'night' ? 0.18 : name === 'dusk' ? 0.8 : 1;
    for (const [m, c, k] of farMats) m.color.copy(c).multiplyScalar(k === 'near' ? Math.max(far, 0.5) : far);
    poolU.value = name === 'night' ? 1 : name === 'dusk' ? 0.35 : 0;
    stars.material.opacity = name === 'night' ? 0.9 : 0;
    moon.material.opacity = name === 'night' ? 0.9 : 0;
    const lights = P.lights;
    M.lamp.emissiveIntensity = lights * 6;
    glowMat.opacity = lights * (name === 'night' ? 0.9 : 0.4);
    M.board.emissiveIntensity = name === 'day' ? 0.9 : name === 'dusk' ? 1.1 : 1.3;
    for (const s of spots) s.intensity = name === 'night' ? 900 : name === 'dusk' ? 250 : 0;
    // 主光：白天＝太陽；黃昏＝低角度暖色陽光；夜間＝燈塔的綜合光（從本壘後上方打下來）
    if (name === 'night') {
      key.color.set(0xfff2de); key.intensity = 2.4;
      keyDir.set(-8, 60, -30).normalize();
      hemi.color.set(0x30405a); hemi.groundColor.set(0x1c2414); hemi.intensity = P.hemi + 0.35;
    } else {
      key.color.set(name === 'dusk' ? 0xffd0a0 : 0xfff6ea); key.intensity = P.sun;
      // 黃昏：太陽幾乎貼地，再加上剛點亮的球場燈（從上方打下），主光方向取兩者之間
      if (name === 'dusk') keyDir.copy(sunDir).add(new THREE.Vector3(0, 0.45, 0)).normalize(); else keyDir.copy(sunDir);
      hemi.color.set(name === 'dusk' ? 0xe6c8b8 : 0xcfe6ff); hemi.groundColor.set(0x4a5a32); hemi.intensity = P.hemi;
    }
    placeKey();
    renderer.toneMappingExposure = P.exposure;
    // 環境光照（反射）用天空算一次
    const envScene = new THREE.Scene();
    const sky2 = new THREE.Sky(); sky2.scale.setScalar(1000); sky2.material.uniforms = THREE.UniformsUtils.clone(sky.material.uniforms);
    envScene.add(sky2);
    if (name === 'night') envScene.background = new THREE.Color(0x0a0f1a);
    envRT?.dispose();
    envRT = pmrem.fromScene(envScene, 0.04, 1, 2000);
    sky2.geometry.dispose(); sky2.material.dispose();
    if (scene) {
      scene.environment = envRT.texture;
      scene.environmentIntensity = name === 'night' ? 0.25 : name === 'dusk' ? 0.6 : P.sky;
      const fogC = name === 'night' ? new THREE.Color(0x0c1220) : name === 'dusk' ? new THREE.Color(0xd59a78) : new THREE.Color(0xb9d2e6);
      scene.fog = new THREE.Fog(fogC, P.fog[0], P.fog[1]);
    }
  }

  // 每一格：觀眾動畫、光暈跟著鏡頭
  function update(dt) {
    crowd.uniforms.uTime.value += dt;
    crowd.excite = Math.max(crowd.excite - dt * 0.35, 0);
    crowd.uniforms.uExcite.value = crowd.excite;
  }
  function cheer(level = 1) { crowd.excite = Math.max(crowd.excite, level); }

  return {
    root, tier, T, dims: FIELD, bases: BASES, bagPos, towers, scoreboard, crowd,
    lights: { key, hemi, spots }, sky,
    setTime, update, cheer, setShadowFocus,
    get time() { return state.time; },
    dispose() { for (const d of disposables) d.dispose?.(); envRT?.dispose(); pmrem.dispose(); },
  };
}

// ── 幾何小工具 ──

// 依世界座標設定 UV（整片場地貼圖用）
function worldUV(g, x0, z0, size) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) - x0) / size; uv[i * 2 + 1] = (p.getZ(i) - z0) / size; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// 圓形高度場（投手丘）
function radialMesh(R, rings, segs, h) {
  const pos = [0, h(0), 0], idx = [];
  for (let j = 1; j <= rings; j++) for (let i = 0; i < segs; i++) {
    const r = (R * j) / rings, a = (i / segs) * Math.PI * 2;
    pos.push(Math.sin(a) * r, h(r), Math.cos(a) * r);
  }
  for (let i = 0; i < segs; i++) idx.push(0, 1 + i, 1 + ((i + 1) % segs));
  for (let j = 1; j < rings; j++) for (let i = 0; i < segs; i++) {
    const a = 1 + (j - 1) * segs + i, b = 1 + (j - 1) * segs + ((i + 1) % segs), c = a + segs, d = b + segs;
    idx.push(a, c, d, a, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // 法線朝上（index 方向可能相反）
  const n = g.attributes.normal; let up = 0; for (let i = 0; i < n.count; i++) up += n.getY(i);
  if (up < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  return g;
}

// 沿著一串地面點拉起來的直立牆（y0～y1），u 每 uLen 公尺重複一次；vLen 給網子用
function stripGeometry(pts, y0, y1, uLen, vLen = 0) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  pts.forEach((p, i) => {
    if (i) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    pos.push(p[0], y0, p[1], p[0], y1, p[1]);
    const u = acc / uLen;
    uv.push(u, 0, u, vLen ? (y1 - y0) / uLen : 1);
  });
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// 合併幾個簡單幾何（觀眾的身體）
function mergeGeoms(list) {
  const pos = [], nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    g0.dispose(); if (g !== g0) g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// 場地材質的 shader 加料：近看細節（草葉、紅土顆粒）＋夜間燈光亮區
function fieldShader(material, detailTex, rect, poolU) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: detailTex };
    sh.uniforms.uDetailScale = { value: rect.size / 1.7 };
    sh.uniforms.uPool = poolU;
    sh.uniforms.uRect = { value: new THREE.Vector3(rect.x0, rect.z0, rect.size) };
    sh.fragmentShader = 'uniform sampler2D uDetail;\nuniform float uDetailScale;\nuniform float uPool;\nuniform vec3 uRect;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      ${detailTex ? 'diffuseColor.rgb *= mix(0.8, 1.2, texture2D(uDetail, vMapUv * uDetailScale).r);' : ''}
      vec2 wp = uRect.xy + vMapUv * uRect.z;
      float pool = mix(1.12, 0.42, smoothstep(22.0, 78.0, length(wp - vec2(0.0, 24.0))));
      diffuseColor.rgb *= mix(1.0, pool, uPool);`);
  };
  material.customProgramCacheKey = () => 'field' + (detailTex ? 'd' : '');
}

// 觀眾：歡呼時上下跳（在 shader 裡算，不必每格改 instance 矩陣）
function cheer(material, uniforms) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime; sh.uniforms.uExcite = uniforms.uExcite;
    sh.vertexShader = 'uniform float uTime;\nuniform float uExcite;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
      float idle = 0.012 * sin(uTime * (1.5 + ph) + ph * 30.0);
      float jumpy = uExcite * step(0.35, ph) * abs(sin(uTime * (7.0 + ph * 3.0) + ph * 20.0)) * 0.22;
      transformed.y += idle + jumpy;`);
  };
  material.customProgramCacheKey = () => 'crowd';
}
