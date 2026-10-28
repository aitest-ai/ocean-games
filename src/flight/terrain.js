// 地面（程式產生）：兩層貼圖。
// 1) 大範圍的「土地利用圖」（低解析度）：樹林、田的大區塊顏色、河、路、村莊；
// 2) 會重複的「田的圖樣」（512 px，約 2.4 公里一格）：一塊一塊方向不同的田與田埂，
//    用兩種大小、轉個角度疊起來，就看不出重複。乘在第一層上面。
// 這樣產生只要幾十毫秒（平板也一樣），從 300～1500 呎往下看像台灣西部的平原。
import * as THREE from '../land/three.js';
import { canvas, fbmField, rng, tex } from './tex.js';

const FIELDS = [[0.92, 1.0, 0.86], [1.04, 1.06, 0.9], [1.12, 1.08, 0.92], [0.86, 0.94, 0.84], [1.25, 1.12, 0.9], [1.18, 1.0, 0.86], [1.06, 0.92, 0.84], [0.8, 0.88, 0.82]];

// 可平鋪的田：每塊田畫在四個位移位置，邊界接得起來
export function fieldTile(size = 512, seed = 3) {
  const c0 = canvas(size), c = c0.getContext('2d'), R = rng(seed);
  c.fillStyle = 'rgb(128,128,128)'; c.fillRect(0, 0, size, size);
  const rows = 9;
  for (let j = 0; j < rows; j++) {
    const ang = (R() - 0.5) * 0.5, h = size / rows;
    let x = 0;
    while (x < size) {
      const w = size * (0.05 + R() * 0.09);
      const f = FIELDS[(R() * FIELDS.length) | 0], k = 0.9 + R() * 0.2;
      for (const ox of [0, -size, size]) for (const oy of [0, -size, size]) {
        c.save(); c.translate(x + w / 2 + ox, j * h + h / 2 + oy); c.rotate(ang);
        c.fillStyle = `rgb(${128 * f[0] * k | 0},${128 * f[1] * k | 0},${128 * f[2] * k | 0})`;
        c.fillRect(-w / 2, -h / 2, w, h);
        c.strokeStyle = 'rgba(70,80,60,0.5)'; c.lineWidth = size / 600;
        c.strokeRect(-w / 2, -h / 2, w, h);
        c.restore();
      }
      x += w;
    }
  }
  return c0;
}

// 大範圍土地利用圖。keep(u, v) 回傳 false 的地方（例如機場）畫成平坦的草地顏色
export function landMap(size, { seed = 3, meters = 40000, keep = () => true, towns = 8, roads = 6 } = {}) {
  const cv = canvas(size), c = cv.getContext('2d'), R = rng(seed);
  const n = 128, f = fbmField(n, { seed, base: 3, oct: 5 }), g = fbmField(n, { seed: seed + 7, base: 6, oct: 3 });
  const img = c.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k0 = ((y / size * n) | 0) * n + ((x / size * n) | 0);
    const v = f[k0], gg = g[k0], i = (y * size + x) * 4;
    let r = 96 + gg * 40, gr = 124 + gg * 18, b = 62 + gg * 10;           // 田（大區塊的顏色差）
    if (v > 0.6) { const t = Math.min((v - 0.6) * 8, 1); r += (46 - r) * t; gr += (68 - gr) * t; b += (42 - b) * t; } // 樹林
    if (!keep(x / size, y / size)) { r = 92; gr = 118; b = 64; }
    d[i] = r; d[i + 1] = gr; d[i + 2] = b; d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const px = size / meters;
  c.lineCap = 'round';
  c.strokeStyle = 'rgb(66,92,104)';
  for (let k = 0; k < 2; k++) {
    let x = size * (0.3 + R() * 0.5), y = size, a = -Math.PI / 2;
    c.lineWidth = Math.max(1.2, (40 + R() * 20) * px);
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 220 && y > 0; s++) { a += (R() - 0.5) * 0.5 - (x / size - 0.2) * 0.02; x += Math.cos(a) * size / 160; y += Math.sin(a) * size / 160; c.lineTo(x, y); }
    c.stroke();
  }
  c.strokeStyle = 'rgba(176,170,160,0.85)';
  for (let k = 0; k < roads; k++) {
    c.lineWidth = Math.max(0.8, 14 * px);
    let x = R() * size, y = R() * size, a = R() * Math.PI * 2;
    c.beginPath(); c.moveTo(x, y);
    for (let s = 0; s < 60; s++) { a += (R() - 0.5) * 0.25; x += Math.cos(a) * size / 60; y += Math.sin(a) * size / 60; c.lineTo(x, y); }
    c.stroke();
  }
  for (let t = 0; t < towns; t++) {
    const cx = R() * size, cy = R() * size;
    if (!keep(cx / size, cy / size)) continue;
    const rad = (300 + R() * 600) * px;
    for (let k = 0; k < 160; k++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * rad;
      c.fillStyle = R() < 0.3 ? '#a4644e' : R() < 0.6 ? '#c9c4b8' : '#9a9a94';
      c.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, Math.max(1, 16 * px), Math.max(1, 12 * px));
    }
  }
  return cv;
}

// 地面材質：土地利用圖 × 兩層田的圖樣（2.4 km 與 3.7 km、轉 37°），太遠的地方圖樣淡掉避免閃爍
export function groundMaterial(map, tile, meters, aniso = 4) {
  const m = new THREE.MeshLambertMaterial({ map: tex(map, { repeat: false, aniso }) });
  const t = tex(tile, { srgb: false, aniso });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTile = { value: t };
    sh.uniforms.uRep = { value: new THREE.Vector2(meters / 2400, meters / 3700) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDist;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvDist = -mvPosition.z;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uTile; uniform vec2 uRep; varying float vDist;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 u1 = vMapUv * uRep.x;
          vec2 u2 = mat2(0.8, 0.6, -0.6, 0.8) * vMapUv * uRep.y + 0.37;
          vec3 t = texture2D(uTile, u1).rgb * texture2D(uTile, u2).rgb * 4.0;
          diffuseColor.rgb *= mix(t, vec3(1.0), smoothstep(6000.0, 20000.0, vDist));
        }`);
  };
  return m;
}
