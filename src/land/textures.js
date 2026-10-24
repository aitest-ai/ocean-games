// 球場的程式生成貼圖（全部用 2D canvas 畫，沒有外部圖片素材）：
// 草地＋紅土＋白線的整片場地圖、近看用的細節雜訊、棒球、外野牆廣告板、記分板、後擋網、燈光光暈。
import { FIELD, BASES, LINE1, LINE3, polar, fenceR } from './dims.js';

// 可重現的亂數
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

function canvas(w, h = w) {
  const c = typeof OffscreenCanvas !== 'undefined' && !globalThis.document ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// 場地圖涵蓋的範圍（公尺）：x −52～52、z −16～88，外野牆內全部在裡面
export const FIELD_RECT = { x0: -52, z0: -16, size: 104 };

// 值雜訊（平滑的大塊明暗），用來做草地的修剪痕、磨損與紅土的濕度變化
function valueNoise(seed) {
  const R = rng(seed), N = 256, g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = R();
  const at = (x, y) => g[((y & (N - 1)) * N) + (x & (N - 1))];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// 整片場地：size = 貼圖邊長（低畫質 2048、中高 4096）
export function makeFieldCanvas(size = 2048) {
  const c = canvas(size), ctx = c.getContext('2d');
  const { x0, z0, size: W } = FIELD_RECT;
  const k = size / W;
  // 公尺 → 像素：+x（三壘側）往左畫，讓貼圖從捕手方向看起來跟現場一樣（實際對應在 UV 處理）
  ctx.setTransform(k, 0, 0, -k, -x0 * k, (z0 + W) * k);
  const px = 1 / k;

  const GRASS = '#46702d', GRASS2 = '#527e35', DIRT = '#97603f', TRACK = '#86573b', CHALK = 'rgba(248,246,236,0.95)';
  // 1. 全部先鋪草
  ctx.fillStyle = GRASS; ctx.fillRect(x0, z0, W, W);

  // 2. 外野修剪紋：沿兩條界線方向的格子（職棒常見的棋盤割草）
  ctx.save();
  ctx.beginPath(); fanPath(ctx, 0, 0, (a) => fenceR(a) - 3, -Math.PI / 4 - 0.4, Math.PI / 4 + 0.4); ctx.clip();
  ctx.fillStyle = GRASS2;
  const band = 4.6;
  for (let i = -30; i < 30; i++) for (let j = -30; j < 30; j++) {
    if ((i + j) & 1) continue;
    const a = [LINE3[0] * i * band + LINE1[0] * j * band, LINE3[1] * i * band + LINE1[1] * j * band];
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(a[0] + LINE3[0] * band, a[1] + LINE3[1] * band);
    ctx.lineTo(a[0] + (LINE3[0] + LINE1[0]) * band, a[1] + (LINE3[1] + LINE1[1]) * band);
    ctx.lineTo(a[0] + LINE1[0] * band, a[1] + LINE1[1] * band);
    ctx.fill();
  }
  ctx.restore();

  // 3. 警戒區（外野牆前 3 公尺的紅土跑道）
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) { const an = -Math.PI / 4 - 0.2 + (Math.PI / 2 + 0.4) * (i / 96); const p = polar(an, fenceR(Math.min(Math.max(an, -Math.PI / 4), Math.PI / 4)) - 1.4); if (i) ctx.lineTo(...p); else ctx.moveTo(...p); }
  ctx.strokeStyle = TRACK; ctx.lineWidth = 3.2; ctx.stroke();

  // 4. 內野紅土：投手板為圓心、半徑 50 呎的圓，只留界線外 1.5 公尺以內（再加本壘圓）
  const N3 = [Math.SQRT1_2, -Math.SQRT1_2], N1 = [-Math.SQRT1_2, -Math.SQRT1_2]; // 兩條界線往界外的法線
  const out = (L, N, r, o) => [L[0] * r + N[0] * o, L[1] * r + N[1] * o];
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, -1.5 * Math.SQRT2);
  ctx.lineTo(...out(LINE3, N3, 40, 1.5));
  ctx.lineTo(...out(LINE1, N1, 40, 1.5));
  ctx.closePath();
  ctx.clip();
  ctx.beginPath(); ctx.arc(BASES.rubber[0], BASES.rubber[1], FIELD.arc, 0, Math.PI * 2);
  ctx.fillStyle = DIRT; ctx.fill();
  ctx.restore();
  // 本壘周圍與後方捕手區
  ctx.fillStyle = DIRT;
  ctx.beginPath(); ctx.arc(0, 0.2, FIELD.homeCircle, 0, Math.PI * 2); ctx.fill();

  // 5. 內野草皮：菱形往內縮（留出 1.1 公尺寬的跑壘道），二壘、一壘、三壘角落切圓
  const inset = 1.1;
  const g = [
    [BASES.home[0], BASES.home[1] + inset * Math.SQRT2 + 2.6],
    [BASES.first[0] + inset * Math.SQRT2, BASES.first[1]],
    [BASES.second[0], BASES.second[1] - inset * Math.SQRT2],
    [BASES.third[0] - inset * Math.SQRT2, BASES.third[1]],
  ];
  ctx.save();
  ctx.beginPath(); ctx.moveTo(...g[0]); for (const p of g.slice(1)) ctx.lineTo(...p); ctx.closePath();
  ctx.fillStyle = GRASS; ctx.fill();
  ctx.clip();
  // 內野草的直條修剪紋（沿本壘—二壘方向）
  ctx.fillStyle = GRASS2;
  for (let x = -20; x < 20; x += 2.6) ctx.fillRect(x, 0, 1.3, 30);
  ctx.restore();
  // 壘包周圍的紅土切口
  ctx.fillStyle = DIRT;
  for (const b of [BASES.first, BASES.second, BASES.third]) { ctx.beginPath(); ctx.arc(b[0], b[1], 2.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(0, 0.2, FIELD.homeCircle, 0, Math.PI * 2); ctx.fill();

  // 6. 投手丘
  ctx.beginPath(); ctx.arc(BASES.rubber[0], BASES.rubber[1] + 0.15, FIELD.moundRadius, 0, Math.PI * 2); ctx.fillStyle = '#9d6443'; ctx.fill();

  // 7. 打者準備區（兩側界外各一個圓）
  for (const sx of [1, -1]) {
    ctx.beginPath(); ctx.arc(sx * 7.5, -3.5, 0.76, 0, Math.PI * 2); ctx.fillStyle = DIRT; ctx.fill();
    ctx.lineWidth = 0.08; ctx.strokeStyle = CHALK; ctx.stroke();
  }

  // ── 雜訊：大塊明暗（修剪方向、乾濕）＋每個像素的細碎變化 ──
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  const nA = valueNoise(11), nB = valueNoise(23);
  const R = rng(5);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const wx = x * px, wz = y * px; // 只用來取雜訊，方向不重要
      const isDirt = d[i] > d[i + 1] + 20;
      const big = nA(wx * 0.08, wz * 0.08) * 0.6 + nB(wx * 0.5, wz * 0.5) * 0.4;
      const fine = R();
      const m = isDirt ? 0.86 + big * 0.22 + (fine - 0.5) * 0.14 : 0.88 + big * 0.2 + (fine - 0.5) * 0.12;
      d[i] = Math.min(d[i] * m, 255); d[i + 1] = Math.min(d[i + 1] * m, 255); d[i + 2] = Math.min(d[i + 2] * m, 255);
    }
  }
  ctx.putImageData(img, 0, 0);

  // 8. 磨損：本壘、投手丘前、打擊區、一壘線跑道比較深
  ctx.globalCompositeOperation = 'multiply';
  const wear = (x, z, r, a) => {
    const gr = ctx.createRadialGradient(x, z, 0, x, z, r);
    gr.addColorStop(0, `rgba(110,70,50,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, z, r, 0, Math.PI * 2); ctx.fill();
  };
  wear(0, 0.3, 2.2, 0.5); wear(0, FIELD.pitch + 1.0, 1.3, 0.45); wear(0, FIELD.pitch - 1.0, 0.9, 0.35);
  for (const b of [BASES.first, BASES.second, BASES.third]) wear(b[0], b[1], 1.3, 0.35);
  ctx.globalCompositeOperation = 'source-over';

  // 9. 白線：界線（從本壘板角落一路到外野牆）、打擊區、捕手區
  ctx.strokeStyle = CHALK; ctx.lineWidth = 3 * 0.0254 * 1.4; ctx.lineCap = 'butt';
  const hw = FIELD.plateWidth / 2;
  for (const L of [LINE1, LINE3]) {
    const end = fenceR(Math.PI / 4);
    ctx.beginPath(); ctx.moveTo(L[0] * 1.85, L[1] * 1.85); ctx.lineTo(L[0] * end, L[1] * end); ctx.stroke();
  }
  const [bw, bl] = FIELD.box, mid = FIELD.plateWidth / 2;
  for (const sx of [1, -1]) {
    const xin = sx * (hw + FIELD.boxGap), xout = sx * (hw + FIELD.boxGap + bw);
    ctx.beginPath(); ctx.rect(Math.min(xin, xout), mid - bl / 2, bw, bl); ctx.stroke();
  }
  // 捕手區（少棒為 本壘後方 約 1.8 公尺的開口框）
  ctx.beginPath(); ctx.moveTo(-0.6, -0.55); ctx.lineTo(-0.6, -2.4); ctx.lineTo(0.6, -2.4); ctx.lineTo(0.6, -0.55); ctx.stroke();
  // 跑壘限制道（本壘到一壘後半段，界線外 3 呎）
  ctx.beginPath();
  ctx.moveTo(...out(LINE1, N1, FIELD.base / 2, 0.914));
  ctx.lineTo(...out(LINE1, N1, FIELD.base, 0.914));
  ctx.stroke();
  return c;
}
// 以 (cx, cz) 為中心、角度 a0→a1 的扇形路徑（角度 0 = 中外野，r(a) 可變）
function fanPath(ctx, cx, cz, r, a0, a1, cont = false) {
  const n = 64;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    const p = polar(a, r(a));
    if (i === 0 && !cont) ctx.moveTo(cx + p[0], cz + p[1]); else ctx.lineTo(cx + p[0], cz + p[1]);
  }
  if (!cont) ctx.lineTo(cx, cz);
  ctx.closePath();
}

// 近看用的細節雜訊（灰階、可重複貼）：草葉與紅土顆粒
export function makeDetailCanvas(size = 256) {
  const c = canvas(size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  const R = rng(9), n = valueNoise(31);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    // 細長的草葉感：沿 y 方向拉長的雜訊 + 細碎亂數（要能無縫拼接，所以雜訊取模）
    const v = 0.55 * n((x % size) * 0.25, (y % size) * 0.06) + 0.45 * R();
    const g = Math.round(110 + v * 145);
    d[i] = d[i + 1] = d[i + 2] = g; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// 棒球：白色皮面＋紅色縫線（球面上的 8 字形曲線，等距長方投影）
export function makeBallCanvas(size = 128) {
  const c = canvas(size * 2, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, size * 2, size);
  ctx.strokeStyle = '#c1272d'; ctx.lineWidth = size / 40;
  ctx.beginPath();
  for (let i = 0; i <= 400; i++) {
    const t = (i / 400) * Math.PI * 2;
    // 網球縫線參數式
    const a = 0.4, x = Math.cos(t) + a * Math.cos(3 * t), y = Math.sin(t) - a * Math.sin(3 * t), z = 2 * Math.sqrt(a * (1 - a)) * Math.sin(2 * t);
    const lon = Math.atan2(y, x), lat = Math.atan2(z, Math.hypot(x, y));
    const u = ((lon / (Math.PI * 2) + 0.5) * size * 2), v = (0.5 - lat / Math.PI) * size;
    if (i === 0) ctx.moveTo(u, v); else ctx.lineTo(u, v);
  }
  ctx.stroke();
  return c;
}

// 外野牆：深綠色護墊、上緣黃線，加上距離標示與校園風的標語（不放真實品牌）
export function makeWallCanvas(text, sub = '') {
  const c = canvas(1024, 128), ctx = c.getContext('2d');
  ctx.fillStyle = '#1f4a34'; ctx.fillRect(0, 0, 1024, 128);
  // 護墊的接縫
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < 1024; x += 128) ctx.fillRect(x, 0, 3, 128);
  ctx.fillStyle = '#f2c230'; ctx.fillRect(0, 0, 1024, 9);
  if (text) {
    ctx.fillStyle = '#f3f1e6'; ctx.font = 'bold 54px system-ui, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, sub ? 56 : 70);
    if (sub) { ctx.font = '28px system-ui, sans-serif'; ctx.fillStyle = '#cfe3d2'; ctx.fillText(sub, 512, 100); }
  }
  return c;
}

// 後擋網：細格子，透明的地方用 alphaTest 挖空
export function makeNetCanvas(size = 128) {
  const c = canvas(size), ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(40,44,48,1)'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= size; i += size / 8) { ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.moveTo(0, i); ctx.lineTo(size, i); }
  ctx.stroke();
  return c;
}

// 燈光光暈（夜間燈塔、太陽）
export function makeGlowCanvas(size = 128) {
  const c = canvas(size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,250,235,0.85)');
  g.addColorStop(0.35, 'rgba(255,240,210,0.22)'); g.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
}

// 記分板：每次狀態改變時重畫
export function makeScoreboard() {
  const c = canvas(1024, 512), ctx = c.getContext('2d');
  const F = 'system-ui, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  function draw(s = {}) {
    ctx.fillStyle = '#0d1a14'; ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = '#2f5a45'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, 1014, 502);
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd25a'; ctx.font = `bold 64px ${F}`; ctx.textAlign = 'left';
    ctx.fillText(s.title || '體感野球場', 40, 70);
    ctx.font = `bold 44px ${F}`; ctx.fillStyle = '#e8f4ec';
    ctx.textAlign = 'right'; ctx.fillText(s.right || '', 984, 70);
    // 大字：主要訊息（安打！、界外、揮空…）
    ctx.textAlign = 'center';
    ctx.font = `900 120px ${F}`; ctx.fillStyle = s.color || '#ffffff';
    ctx.fillText(s.big || '⚾', 512, 230);
    // 下方三格
    const cells = s.cells || [['安打', '0'], ['球數', '0 / 10'], ['分數', '0']];
    cells.forEach(([k, v], i) => {
      const x = 180 + i * 330;
      ctx.font = `36px ${F}`; ctx.fillStyle = '#9fc7b2'; ctx.fillText(k, x, 360);
      ctx.font = `bold 72px ${F}`; ctx.fillStyle = '#ffe9a8'; ctx.fillText(v, x, 438);
    });
  }
  draw();
  return { canvas: c, draw };
}
