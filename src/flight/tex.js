// 程式產生的駕駛艙貼圖（不使用任何外部圖片）：噪聲、由高度圖算法線圖、皮革、布料、頂棚、塑膠紋、
// 地毯、擋風玻璃的髒污與細刮痕。每張都很小（低畫質 256～512 px），靠法線圖與粗糙度變化做出質感。
import * as THREE from '../land/three.js';

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

export function canvas(w, h = w) {
  const c = typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// 可平鋪的 value noise（週期 = period 格），fbm 疊加
export function noise2(seed, period) {
  const R = rng(seed), N = period * period, tab = new Float32Array(N);
  for (let i = 0; i < N; i++) tab[i] = R();
  const at = (x, y) => tab[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
export function fbmField(size, { seed = 1, base = 4, oct = 4, gain = 0.5 } = {}) {
  const ns = Array.from({ length: oct }, (_, i) => noise2(seed + i * 101, base << i));
  const f = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, a = 1, t = 0;
    for (let i = 0; i < oct; i++) { const k = (base << i) / size; v += ns[i](x * k, y * k) * a; t += a; a *= gain; }
    f[y * size + x] = v / t;
  }
  return f;
}

// 高度場 → 法線圖（可平鋪）
export function normalFromHeight(h, size, strength = 2) {
  const c = canvas(size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grayCanvas(h, size, map) {
  const c = canvas(size), ctx = c.getContext('2d'), img = ctx.createImageData(size, size), d = img.data;
  for (let i = 0; i < size * size; i++) { const [r, g, b] = map(h[i], i); d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function tex(c, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

// 皮革（遮光罩、握把）：細胞狀的皺紋
export function leather(size, seed = 3) {
  const R = rng(seed), h = new Float32Array(size * size), cells = [];
  const n = Math.round(size * size / 90);
  for (let i = 0; i < n; i++) cells.push([R() * size, R() * size]);
  // 簡化 Worley：每格只找附近的點
  const grid = new Map(), G = 12;
  for (const p of cells) { const k = `${Math.floor(p[0] / G)},${Math.floor(p[1] / G)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(p); }
  const nz = noise2(seed + 9, 8);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let d1 = 1e9, d2 = 1e9;
    const gx = Math.floor(x / G), gy = Math.floor(y / G);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gk = `${((gx + i) % Math.ceil(size / G) + Math.ceil(size / G)) % Math.ceil(size / G)},${((gy + j) % Math.ceil(size / G) + Math.ceil(size / G)) % Math.ceil(size / G)}`;
      for (const p of grid.get(gk) || []) {
        let dx = Math.abs(p[0] - x), dy = Math.abs(p[1] - y);
        dx = Math.min(dx, size - dx); dy = Math.min(dy, size - dy);
        const dd = dx * dx + dy * dy;
        if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
      }
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    h[y * size + x] = Math.min(edge / 3, 1) * 0.8 + nz(x / size * 8, y / size * 8) * 0.2;
  }
  return { normal: normalFromHeight(h, size, 1.6), rough: grayCanvas(h, size, (v) => { const g = 150 + (1 - v) * 70; return [g, g, g]; }) };
}

// 布料（座椅）：斜紋編織＋一點毛絨
export function fabric(size, seed = 5) {
  const h = new Float32Array(size * size), nz = noise2(seed, 16), R = rng(seed);
  const p = Math.max(2, Math.round(size / 96)); // 一條紗的寬（px）
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / p) | 0, v = (y / p) | 0;
    const warp = ((u + v) % 4) < 2;          // 2/2 斜紋
    const fx = (x % p) / p, fy = (y % p) / p;
    const bump = warp ? Math.sin(fy * Math.PI) : Math.sin(fx * Math.PI);
    h[y * size + x] = bump * 0.75 + nz(x / size * 16, y / size * 16) * 0.15 + R() * 0.1;
  }
  return {
    normal: normalFromHeight(h, size, 1.2),
    color: grayCanvas(h, size, (v) => { const g = 0.75 + v * 0.3; return [g * 200, g * 205, g * 212]; }),
  };
}

// 一般的細紋（塑膠內裝、頂棚、地毯）
export function grain(size, { seed = 7, base = 32, oct = 3, strength = 1, dots = 0 } = {}) {
  const h = fbmField(size, { seed, base, oct, gain: 0.55 });
  if (dots) { // 頂棚的小孔
    const step = Math.max(4, Math.round(size / dots));
    for (let y = step / 2; y < size; y += step) for (let x = ((y / step) % 2) * step / 2 + step / 4; x < size; x += step) {
      const i = Math.floor(y) * size + Math.floor(x);
      h[i] -= 0.8; if (h[i + 1] !== undefined) h[i + 1] -= 0.4;
    }
  }
  return { normal: normalFromHeight(h, size, strength), height: h };
}

// 擋風玻璃的髒污：灰塵斑點、雨痕、雨刷沒有的弧形細刮痕（alpha 越亮越髒）
export function windshieldDirt(size, seed = 11) {
  const c = canvas(size), ctx = c.getContext('2d'), R = rng(seed);
  const h = fbmField(size, { seed, base: 3, oct: 5, gain: 0.6 });
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const edge = Math.max(Math.abs(x / size - 0.5), Math.abs(y / size - 0.5)) * 2; // 邊緣比較髒
    const v = Math.max(0, h[i] - 0.45) * 1.6 + Math.pow(edge, 4) * 0.45 + (1 - y / size) * 0.05;
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255; d[i * 4 + 3] = Math.min(255, v * 140);
  }
  ctx.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  // 乾掉的水滴痕
  for (let i = 0; i < size * 0.5; i++) {
    const x = R() * size, y = R() * size, r = (0.3 + R() * 1.2) * size / 512;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    const a = 0.03 + R() * 0.07;
    g.addColorStop(0, `rgba(255,255,255,${a * 0.3})`); g.addColorStop(0.8, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, Math.PI * 2); ctx.fill();
  }
  // 往下流的雨痕
  for (let i = 0; i < 26; i++) {
    const x = R() * size; let y = R() * size * 0.6;
    ctx.strokeStyle = `rgba(255,255,255,${0.05 + R() * 0.06})`; ctx.lineWidth = (1 + R() * 1.5) * size / 512;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) { y += size * 0.02 * (0.5 + R()); ctx.lineTo(x + (R() - 0.5) * size * 0.008, y); }
    ctx.stroke();
  }
  // 弧形細刮痕（擦玻璃留下的）
  for (let i = 0; i < 70; i++) {
    const cx = size * (0.3 + R() * 0.4), cy = size * (1.1 + R() * 0.6), r = size * (0.5 + R() * 0.6), a = -Math.PI / 2 + (R() - 0.5) * 1.4;
    ctx.strokeStyle = `rgba(255,255,255,${0.04 + R() * 0.07})`; ctx.lineWidth = 0.7 * size / 512 + 0.3;
    ctx.beginPath(); ctx.arc(cx, cy, r, a, a + 0.05 + R() * 0.25); ctx.stroke();
  }
  return c;
}

// 漆面磨損：邊緣與常摸的地方顏色變淺（給儀表板、側板用）。回傳 0~1 的場
export const wearField = (size, seed = 13) => fbmField(size, { seed, base: 6, oct: 5, gain: 0.55 });
