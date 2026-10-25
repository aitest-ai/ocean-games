// 程式產生的小機場：跑道（標線、跑道號碼、接地區、瞄準點）、平行滑行道與聯絡道、停機坪、機棚、塔台、
// 風向袋、跑道邊燈、進場坡度指示燈（PAPI）、樹、海岸與遠山。全部程式產生，沒有外部素材。
// 位置與尺寸在 runway.js（任務判斷也用同一份）。
import * as THREE from '../land/three.js';
import { RUNWAY } from './runway.js';
import { landMap, fieldTile, groundMaterial } from './terrain.js';
import { seaWithHole } from './world.js';
import { canvas, fbmField, rng, tex } from './tex.js';
import { drawText } from './glyphs.js';
import { lightPoints } from './lights.js';

const R0 = RUNWAY;

// 跑道貼圖：寬 = 跑道寬 + 兩側路肩，長 = 跑道長。canvas 的 y = 沿著跑道（0 = 27 跑道頭，在畫面最下面）
function runwayCanvas(W, H) {
  const c0 = canvas(W, H), c = c0.getContext('2d'), R = rng(21);
  const mw = R0.width + 6, sx = W / mw, sy = H / R0.length; // 公尺 → 像素
  const X = (m) => (m + mw / 2) * sx, Y = (a) => H - a * sy; // m：橫向（右為正，面向 270°）；a：離 27 跑道頭
  // 柏油：中間比較深（輪胎痕），路肩比較淺
  c.fillStyle = '#4a4c4f'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#6a6c6a'; c.fillRect(0, 0, X(-R0.width / 2), H); c.fillRect(X(R0.width / 2), 0, W, H);
  const n = fbmField(64, { seed: 9, base: 4, oct: 4 });
  const img = c.getImageData(0, 0, W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, k = 0.9 + n[((y / H * 64 * 8) % 64 | 0) * 64 + (x / W * 64 | 0)] * 0.18 + (R() - 0.5) * 0.08;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  c.putImageData(img, 0, 0);
  // 接地區的輪胎痕（兩端）
  c.fillStyle = 'rgba(20,20,22,0.35)';
  for (const [a0, a1] of [[150, 450], [R0.length - 450, R0.length - 150]]) for (let k = 0; k < 40; k++) {
    const m = (R() - 0.5) * 6, len = 20 + R() * 60, a = a0 + R() * (a1 - a0 - len);
    c.fillRect(X(m - 0.25), Y(a + len), 0.5 * sx, len * sy);
  }
  c.fillStyle = '#eceae2';
  // 邊線
  for (const s of [-1, 1]) c.fillRect(X(s * (R0.width / 2 - 0.5) - 0.45), 0, 0.9 * sx, H);
  // 中心線（虛線 30 m、間隔 20 m）
  for (let a = 90; a < R0.length - 90; a += 50) c.fillRect(X(-0.45), Y(a + 30), 0.9 * sx, 30 * sy);
  // 兩端：跑道頭的斑馬線、號碼、接地區、瞄準點
  const end = (flip, num) => {
    const A = (a) => (flip ? R0.length - a : a); // flip：09 那一端（從西往東看）
    const box = (m0, m1, a0, a1) => { const ya = Y(A(a0)), yb = Y(A(a1)); c.fillRect(X(m0), Math.min(ya, yb), (m1 - m0) * sx, Math.abs(yb - ya)); };
    for (let k = 0; k < 8; k++) { const m = -R0.width / 2 + 2 + k * 2.55 + (k >= 4 ? 1.6 : 0); box(m, m + 1.6, 6, 36); }
    // 跑道號碼（從進場方向看是正的）
    c.save();
    c.translate(X(0), Y(A(52)));
    if (flip) c.rotate(Math.PI);
    c.scale(0.55, sy / sx); // 貼圖的橫向、縱向每公尺像素不同；跑道號碼又高又窄（高 14 公尺）
    drawText(c, num, 0, 0, 14 * sx, { color: '#eceae2', weight: 0.13 });
    c.restore();
    for (const a of [150, 300, 450]) for (const s of [-1, 1]) { const w = a === 150 ? 3 : a === 300 ? 2 : 1; for (let k = 0; k < w; k++) box(s * (3 + k * 1.8), s * (3 + k * 1.8) + s * 1.2, a, a + 22.5); }
    for (const s of [-1, 1]) box(s * 3, s * 7.5, R0.aimFromThr, R0.aimFromThr + 45);
  };
  end(false, '27'); end(true, '09');
  return c0;
}

// 草地的小圖樣（會重複）：細草的顏色變化＋割草機留下的深淺條紋
function grassCanvas(n) {
  const c0 = canvas(n), c = c0.getContext('2d');
  const f = fbmField(n, { seed: 41, base: 16, oct: 4 });
  const img = c.createImageData(n, n), d = img.data, R = rng(5);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = (y * n + x) * 4, v = f[y * n + x], stripe = ((x / n * 4) | 0) % 2 ? 1.05 : 0.95, k = (0.85 + v * 0.3 + (R() - 0.5) * 0.12) * stripe;
    d[i] = 92 * k; d[i + 1] = 126 * k; d[i + 2] = 58 * k; d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return c0;
}

function quad(x0, z0, x1, z1, y, u = 1, v = 1) {
  const g = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)).rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
  return g;
}

export function airportScenery(W) {
  const S = W.scene, low = W.tier === 'low', an = W.T.aniso;
  const root = new THREE.Group(); root.name = 'airport'; S.add(root);
  // ── 大地與海：陸地從 x = -1800（海岸）往東 40 公里 ──
  const size = 40000, x0 = -1800;
  const toUV = (x, z) => [(x - x0) / size, (z + size / 2) / size];
  const [ua, va] = toUV(-1300, -700), [ub, vb] = toUV(1300, 700);
  const keep = (u, v) => !(u > ua && u < ub && v > va && v < vb);
  const mapC = landMap(low ? 512 : 1024, { seed: 5, meters: size, keep });
  { // 海岸的沙灘（西邊緣）
    const c = mapC.getContext('2d'), w = mapC.width * 140 / size;
    c.fillStyle = '#c9b88e'; c.fillRect(0, 0, Math.max(1.5, w), mapC.height);
  }
  const groundMat = groundMaterial(mapC, fieldTile(low ? 256 : 512, 5), size, an);
  const land = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), groundMat);
  land.position.set(x0 + size / 2, 0, 0); root.add(land);
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x1d4a66, roughness: 0.2, metalness: 0 });
  root.add(new THREE.Mesh(seaWithHole(x0, -size / 2, x0 + size, size / 2), seaMat));
  // 遠山（東邊高、西邊是海）
  const hills = new THREE.CylinderGeometry(21000, 21000, 1, 180, 1, true), hp = hills.attributes.position, hf = fbmField(64, { seed: 9, base: 4, oct: 4 });
  for (let i = 0; i < hp.count; i++) {
    const a = Math.atan2(hp.getZ(i), hp.getX(i)), k = ((a / (Math.PI * 2) + 1) % 1) * 63;
    const landSide = Math.max(0, Math.cos(a)); // +x（東）最高
    hp.setY(i, hp.getY(i) > 0 ? (landSide > 0.15 ? 150 + landSide * (700 + hf[(k | 0) + 512] * 1500) : -30) : -60);
  }
  hills.computeVertexNormals();
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x4f6150, side: THREE.BackSide });
  root.add(new THREE.Mesh(hills, hillMat));

  // ── 機場草地（近看有細節）──
  const gt = tex(grassCanvas(low ? 128 : 256), { aniso: an });
  const grassMat = new THREE.MeshLambertMaterial({ map: gt });
  root.add(new THREE.Mesh(quad(-1300, -700, 1300, 700, 0.03, 2600 / 24, 1400 / 24), grassMat));

  // ── 跑道 ──
  const rw = R0.width + 6;
  const rt = tex(runwayCanvas(low ? 128 : 256, low ? 2048 : 4096), { repeat: false, aniso: an });
  const rwMat = new THREE.MeshStandardMaterial({ map: rt, roughness: 0.85, metalness: 0 });
  {
    // 跑道沿 x：u = 橫向（面向 270° 時右邊 = 北 = -z），v = 從 27 跑道頭（x = +400）往西
    const g = new THREE.BufferGeometry();
    const xa = R0.thrX, xb = R0.thrX - R0.length, za = rw / 2, zb = -rw / 2, y = 0.12;
    g.setAttribute('position', new THREE.Float32BufferAttribute([xa, y, za, xa, y, zb, xb, y, zb, xa, y, za, xb, y, zb, xb, y, za], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
    g.computeVertexNormals();
    root.add(new THREE.Mesh(g, rwMat));
  }
  // ── 滑行道、聯絡道、停機坪（深灰柏油＋黃色中心線）──
  const tw = new THREE.MeshStandardMaterial({ color: 0x55575a, roughness: 0.9 });
  const yel = new THREE.MeshBasicMaterial({ color: 0xd9b23a });
  const twZ = 75;
  const taxi = [quad(R0.thrX + 10, twZ - 6, R0.thrX - R0.length - 10, twZ + 6, 0.08), quad(140, 95, 340, 190, 0.08)];
  for (const x of [R0.thrX - 10, 0, R0.thrX - R0.length + 10]) taxi.push(quad(x - 7, rw / 2, x + 7, twZ, 0.08));
  for (const g of taxi) root.add(new THREE.Mesh(g, tw));
  root.add(new THREE.Mesh(quad(R0.thrX + 5, twZ - 0.15, R0.thrX - R0.length - 5, twZ + 0.15, 0.1), yel));
  for (const x of [R0.thrX - 10, 0, R0.thrX - R0.length + 10]) root.add(new THREE.Mesh(quad(x - 0.15, rw / 2 + 2, x + 0.15, twZ, 0.1), yel));
  // 跑道等待線（黃色雙線）
  for (const x of [R0.thrX - 10, 0, R0.thrX - R0.length + 10]) for (const dz of [0, 1]) root.add(new THREE.Mesh(quad(x - 7, rw / 2 + 18 + dz, x + 7, rw / 2 + 18.3 + dz, 0.11), yel));

  // ── 建築：兩座機棚（圓弧屋頂）、塔台、小辦公室 ──
  const wall = new THREE.MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.8 }), roof = new THREE.MeshStandardMaterial({ color: 0x8a9298, roughness: 0.5, metalness: 0.4 });
  const door = new THREE.MeshStandardMaterial({ color: 0x5d6770, roughness: 0.7 }), glassM = new THREE.MeshStandardMaterial({ color: 0x1d2a33, roughness: 0.1, metalness: 0.2, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const hangar = (x, z, w, d, h) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wall); b.position.set(x, h / 2, z); root.add(b);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, d, 20, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(0), roof);
    r.scale.set(1, 0.35, 1); r.position.set(x, h, z); root.add(r);
    const dr = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.85, h * 0.85), door); dr.position.set(x, h * 0.43, z - d / 2 - 0.05); dr.rotation.y = Math.PI; root.add(dr);
  };
  hangar(300, 215, 34, 28, 9); hangar(255, 215, 30, 26, 8);
  { const t = new THREE.Mesh(new THREE.BoxGeometry(5, 14, 5), wall); t.position.set(190, 7, 205); root.add(t);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 3.6, 3.2, 8), glassM); cab.position.set(190, 15.6, 205); root.add(cab);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 0.6, 8), roof); cap.position.set(190, 17.5, 205); root.add(cap);
    const off = new THREE.Mesh(new THREE.BoxGeometry(24, 5, 10), wall); off.position.set(165, 2.5, 210); root.add(off);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(20, 1.6), glassM); win.position.set(165, 3, 204.9); win.rotation.y = Math.PI; root.add(win);
  }
  // ── 風向袋（跑道頭旁，橘白相間）──
  { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 8), new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 0.6, roughness: 0.4 })); pole.position.set(R0.thrX - 120, 3, -40); root.add(pole);
    const cv = canvas(64, 16), c = cv.getContext('2d'); for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#f2f2f2' : '#ef6c1a'; c.fillRect(i * 13, 0, 13, 16); }
    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.55, 3.2, 12, 1, true).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex(cv), side: THREE.DoubleSide, roughness: 0.9 }));
    sock.position.set(R0.thrX - 120 - 1.6, 5.7, -40); sock.rotation.y = 0.5; sock.rotation.z = -0.15; root.add(sock);
  }
  // ── 樹（一團一團）──
  {
    const n = low ? 160 : 420, R = rng(77);
    const g = new THREE.SphereGeometry(1, 7, 5); g.scale(1, 1.2, 1);
    const trees = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: 0x3f5a32 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let x, z;
      do { x = -1250 + R() * 2500; z = (R() < 0.5 ? -1 : 1) * (140 + R() * 520); } while (Math.abs(z) < 260 && x > 120 && x < 360);
      const s = 3 + R() * 4;
      m.compose(new THREE.Vector3(x, s * 1.1, z), q, new THREE.Vector3(s, s, s));
      trees.setMatrixAt(i, m); trees.setColorAt(i, col.setHSL(0.27 + R() * 0.06, 0.35, 0.22 + R() * 0.08));
    }
    root.add(trees);
  }
  // ── 燈：跑道邊燈（白）、跑道頭（綠）、跑道尾（紅）、滑行道邊燈（藍）、PAPI ──
  const pts = [], cols = [];
  const addL = (x, z, c) => { pts.push(x, 0.5, z); cols.push(...c); };
  for (let a = 0; a <= R0.length; a += 60) for (const s of [-1, 1]) addL(R0.thrX - a, s * (R0.width / 2 + 1.5), [1, 0.95, 0.8]);
  for (let k = -5; k <= 5; k++) { addL(R0.thrX + 1, k * 2.2, [0.3, 1, 0.4]); addL(R0.thrX - R0.length - 1, k * 2.2, [1, 0.25, 0.2]); }
  for (let a = 0; a <= R0.length; a += 40) for (const s of [-1, 1]) addL(R0.thrX - a, twZ + s * 7, [0.3, 0.45, 1]);
  const lamps = lightPoints(pts, cols, { px: 5 });
  root.add(lamps);
  // PAPI：四個燈箱在跑道左側（面向 270°，左邊是南 = +z）
  const papi = [];
  const glowC = canvas(64), gc = glowC.getContext('2d'), gg = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
  gg.addColorStop(0, 'rgba(255,255,255,1)'); gg.addColorStop(0.35, 'rgba(255,255,255,0.8)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
  gc.fillStyle = gg; gc.fillRect(0, 0, 64, 64);
  const glowT = tex(glowC, { repeat: false });
  { const px = R0.thrX - R0.papiFromThr, box = new THREE.BoxGeometry(1.2, 0.7, 0.8);
    for (let k = 0; k < 4; k++) {
      const z = R0.width / 2 + R0.papiSide + k * 9;
      const b = new THREE.Mesh(box, new THREE.MeshStandardMaterial({ color: 0x2c2c2c })); b.position.set(px, 0.4, z); root.add(b);
      const lm = new THREE.SpriteMaterial({ map: glowT, color: 0xffffff, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
      const sp = new THREE.Sprite(lm); sp.position.set(px + 0.65, 0.5, z); sp.scale.set(1.6, 1.6, 1); root.add(sp);
      papi.push({ sp, angle: [3.5, 3.17, 2.83, 2.5][k] }); // 每個燈的切換角度（度）：在這個角度以上看是白色
    }
  }

  return {
    root, papi,
    // 進場坡度指示燈：從飛機的位置看，高於該燈的角度 = 白、低於 = 紅
    updatePapi(planePos) {
      for (const p of papi) {
        const dx = planePos.x - p.sp.position.x, dz = planePos.z - p.sp.position.z, dy = planePos.y - p.sp.position.y;
        const ang = Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
        p.sp.material.color.set(ang > p.angle ? 0xffffff : 0xff2a1a);
        const dist = Math.hypot(dx, dz);
        const s = Math.max(1.6, dist * 0.008); p.sp.scale.set(s, s, 1); // 遠處也看得到
      }
    },
    setTime(name) {
      const k = name === 'night' ? 0.06 : name === 'dusk' ? 0.65 : 1;
      groundMat.color.setScalar(k); grassMat.color.setScalar(k); hillMat.color.set(0x4f6150).multiplyScalar(k);
      rwMat.color.setScalar(name === 'night' ? 0.25 : 1); tw.color.set(0x55575a).multiplyScalar(name === 'night' ? 0.25 : 1);
      seaMat.color.set(name === 'night' ? 0x040910 : 0x1d4a66);
      lamps.material.uniforms.uIntensity.value = name === 'night' ? 1.6 : name === 'dusk' ? 0.9 : 0.25;
      lamps.material.uniforms.uPx.value = name === 'night' ? 6 : 4;
      glassM.emissiveIntensity = name === 'night' ? 0.6 : 0;
    },
    update() {},
  };
}
