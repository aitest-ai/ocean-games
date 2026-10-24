// 道場的材質貼圖：全部用程式即時畫出來（自製，沒有外部素材，不需要另外登錄授權）。
// 每張貼圖 RGB＝顏色（sRGB），A＝高度（凹凸用：木板縫、榻榻米編織紋）。
// size 依畫質分級決定（低 512、中 1024、高 2048），越大越清楚但產生越久、越佔記憶體。

// 可重複拼接的數值雜訊（period 格一循環），用固定亂數表，每次產生的畫面都一樣
function makeNoise(seed = 1) {
  const N = 256, tab = new Float32Array(N * N);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < tab.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; tab[i] = (s >>> 0) / 4294967296; }
  const at = (x, y, p) => tab[((((y % p) + p) % p) & 255) * N + ((((x % p) + p) % p) & 255)];
  // 2D 值雜訊，x、y 以「格」為單位，p＝循環格數（必須 ≤ 256）
  const noise = (x, y, p = 256) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi, p), b = at(xi + 1, yi, p), c = at(xi, yi + 1, p), d = at(xi + 1, yi + 1, p);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, p, oct = 3) => { let a = 0, w = 0.5, f = 1; for (let i = 0; i < oct; i++) { a += w * noise(x * f, y * f, p * f); w *= 0.5; f *= 2; } return a; };
  return { noise, fbm, rand: (i) => tab[(i * 7919) % tab.length] };
}

function canvasOf(size) {
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  return cv;
}

// 逐像素畫：fn(u, v) → [r, g, b, h]（0~1）
function paint(size, fn) {
  const cv = canvasOf(size), ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  let i = 0;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const [r, g, b, h] = fn((x + 0.5) / size, v);
      d[i++] = r * 255; d[i++] = g * 255; d[i++] = b * 255; d[i++] = h * 255;
    }
  }
  return img;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// 木紋：along＝沿著木頭纖維的方向、across＝橫跨木板（0~1）；年輪是幾條被輕微扭曲的直紋，再加上細細的纖維線
function grain(n, along, across, seed, { dark, light, rings = 5, warp = 0.35 }) {
  const w = n.fbm(along * 0.8 + seed * 13.1, across * 2 + seed * 7.7, 64, 3);
  const r = Math.sin((across * rings + w * warp * 4 + Math.sin(along * 1.3 + seed) * 0.15) * Math.PI * 2);
  const ring = Math.pow(0.5 + 0.5 * r, 2.5);
  const fiber = n.noise(along * 3 + seed * 5, across * 90, 256);
  const fleck = n.noise(along * 40 + seed * 50, across * 12, 256);
  return mixc(light, dark, clamp01(ring * 0.5 + fiber * 0.35 + w * 0.25 + fleck * 0.08 - 0.2));
}

// 1. 木地板：一張貼圖＝1.2×1.2 公尺，6 條 20 公分寬的木板，每條隨機斷開
export function woodFloor(size) {
  const n = makeNoise(11);
  const light = hex(0xc8935c), dark = hex(0x7a4b26);
  return paint(size, (u, v) => {
    const row = Math.floor(v * 6), fv = v * 6 - row;
    const off = n.rand(row + 3) * 0.8;
    const uu = (u + off) % 1, seg = uu < 0.55 ? 0 : 1;
    const plank = row * 2 + seg;
    const tone = 0.82 + n.rand(plank + 40) * 0.3;
    let c = grain(n, uu * 6, fv, plank, { dark, light, rings: 3.5 }).map((x) => x * tone);
    const edge = Math.min(fv, 1 - fv) * 0.2 * size / 1.2, endGap = Math.min(Math.abs(uu - 0.55), uu, 1 - uu) * 1.2 * size / 1.2;
    const gap = Math.min(edge, endGap);
    const groove = clamp01(gap / 1.5);
    c = c.map((x) => x * (0.45 + 0.55 * groove));
    return [...c, 0.55 + 0.4 * groove + n.noise(u * 300, v * 60, 256) * 0.05];
  });
}

// 2. 榻榻米：一張貼圖＝一塊 0.9×1.8 公尺的蓆子；藺草編織紋沿長邊，兩條長邊有黑色布邊
export function tatami(size) {
  const n = makeNoise(23);
  const straw = hex(0xb9b37a), old = hex(0xa59a60), green = hex(0x9fa766);
  return paint(size, (u, v) => {
    // u：寬（0.9 m）、v：長（1.8 m）
    const border = Math.min(u, 1 - u) * 0.9;
    if (border < 0.035) {
      const cloth = 0.06 + 0.03 * Math.sin(v * 1800) + n.noise(u * 200, v * 400, 256) * 0.03;
      return [cloth, cloth, cloth * 1.1, 0.75];
    }
    const lines = 0.9 / 0.0045;   // 每條藺草約 4.5 mm
    const fl = u * lines, li = Math.floor(fl), f = fl - li;
    const ridge = Math.sin(f * Math.PI);
    const weave = 0.5 + 0.5 * Math.sin(v * 1.8 / 0.012 * Math.PI + (li % 2) * Math.PI);
    const tone = n.fbm(u * 6, v * 3, 64, 3);
    let c = mixc(mixc(straw, green, n.noise(li * 0.37, 3, 256) * 0.5), old, tone * 0.8);
    c = c.map((x) => x * (0.72 + 0.28 * ridge) * (0.95 + 0.05 * weave));
    return [...c, 0.4 + 0.45 * ridge * (0.85 + 0.15 * weave)];
  });
}

// 3. 灰泥牆：米白色、低頻斑駁
export function plaster(size) {
  const n = makeNoise(5);
  const base = hex(0xe9e1d0);
  return paint(size, (u, v) => {
    const m = n.fbm(u * 8, v * 8, 8, 4);
    const s = n.noise(u * 220, v * 220, 256);
    const c = base.map((x) => x * (0.88 + m * 0.16 + s * 0.03));
    return [...c, 0.5 + m * 0.3 + s * 0.15];
  });
}

// 4. 深色木板（牆裙、柱子、樑、天花板、木架）：直的木板，15 公分寬
export function woodPanel(size, { tone = 0x6b4426, light = 0xa06d40, boards = 8, gaps = true } = {}) {
  const n = makeNoise(31);
  const dark = hex(tone), lt = hex(light);
  return paint(size, (u, v) => {
    const b = Math.floor(u * boards), fu = u * boards - b;
    let c = grain(n, v * 4 + n.rand(b) * 3, fu, b + 9, { dark, light: lt, rings: 3 });
    c = c.map((x) => x * (0.85 + n.rand(b + 77) * 0.25));
    const gap = gaps ? clamp01(Math.min(fu, 1 - fu) * size / boards / 1.5) : 1;
    c = c.map((x) => x * (0.5 + 0.5 * gap));
    return [...c, 0.5 + 0.4 * gap];
  });
}

// 5. 皮革（沙包）：暗紅色、細紋，上下各一條縫線
export function leather(size) {
  const n = makeNoise(41);
  const base = hex(0x7c2a20), dark = hex(0x4a1712);
  return paint(size, (u, v) => {
    const g = n.fbm(u * 40, v * 40, 40, 3);
    const crack = Math.pow(n.noise(u * 160, v * 160, 256), 4);
    let c = mixc(base, dark, clamp01(g * 0.9 - 0.15 + crack));
    let h = 0.6 - crack * 0.4 + g * 0.1;
    for (const sv of [0.06, 0.94, 0.5]) {
      const d = Math.abs(v - sv) * size;
      if (d < 3) { const st = 0.5 + 0.5 * Math.sin(u * 600); c = c.map((x) => x * (0.55 + 0.25 * st)); h = 0.35 + 0.3 * st; }
    }
    return [...c, h];
  });
}

// 6. 木樁人的硬木：深色、紋路密
export function hardwood(size) {
  const n = makeNoise(53);
  const dark = hex(0x3d2414), light = hex(0x7a5032);
  return paint(size, (u, v) => {
    const c = grain(n, v * 4, u, 2, { dark, light, rings: 9, warp: 0.6 });
    return [...c, 0.5 + n.noise(u * 200, v * 40, 256) * 0.2];
  });
}

// 7. 紙拉門（窗）：白紙＋木格子；A＝紙（1）或木格（0），紙會透光
export function shoji(size) {
  const n = makeNoise(61);
  const paper = hex(0xf4efe2), wood = hex(0x8a6038);
  return paint(size, (u, v) => {
    const cols = 4, rows = 6, bar = 0.012, frame = 0.04;
    const fu = (u * cols) % 1, fv = (v * rows) % 1;
    const inFrame = u < frame || u > 1 - frame || v < frame || v > 1 - frame;
    const isBar = inFrame || Math.min(fu, 1 - fu) < bar * cols || Math.min(fv, 1 - fv) < bar * rows;
    if (isBar) return [...wood.map((x) => x * (0.8 + n.noise(u * 90, v * 90, 256) * 0.3)), 0];
    const fiber = n.fbm(u * 30, v * 30, 30, 3);
    return [...paper.map((x) => x * (0.92 + fiber * 0.1)), 1];
  });
}
