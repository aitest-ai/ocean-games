// 儀表用的「線條字型」：每個字是一組 SVG 路徑（寬 6、高 10 的格子，y 向下），用圓頭線條畫出來。
// 這是本專案自己畫的字形（不是任何既有字型的衍生），所以烘焙進貼圖沒有字型授權問題。
// 只需要儀表上會出現的字：數字、大寫英文、幾個符號。中文說明一律用網頁文字（DOM），不畫進貼圖。
const G = {
  '0': 'M0 3 A3 3 0 0 1 6 3 L6 7 A3 3 0 0 1 0 7 Z',
  '1': 'M1.2 2.2 L3.6 0 L3.6 10',
  '2': 'M0.3 2.7 A2.85 2.7 0 0 1 5.8 2.9 C5.8 5 3.4 6.2 0.2 10 L6 10',
  '3': 'M0.6 0 L5.6 0 L2.5 4.1 A3 2.95 0 1 1 0.2 8.7',
  '4': 'M4.4 10 L4.4 0 L0 7 L6 7',
  '5': 'M5.5 0 L1 0 L0.6 4.5 C1.4 3.8 2.2 3.7 3 3.7 A3 3.1 0 1 1 0.2 8.7',
  '6': 'M5.1 0.6 C1.8 -0.2 0 2.6 0 6.8 A3 3.2 0 0 0 6 6.8 A3 3.2 0 0 0 0 6.8',
  '7': 'M0 0 L6 0 L2.2 10',
  '8': 'M3 4.6 A2.6 2.3 0 0 1 3 0 A2.6 2.3 0 0 1 3 4.6 A3 2.7 0 0 0 3 10 A3 2.7 0 0 0 3 4.6',
  '9': 'M0.9 9.4 C4.2 10.2 6 7.4 6 3.2 A3 3.2 0 0 0 0 3.2 A3 3.2 0 0 0 6 3.2',
  A: 'M0 10 L3 0 L6 10 M1 6.6 L5 6.6',
  B: 'M0 10 L0 0 L3.6 0 A2.3 2.4 0 0 1 3.6 4.8 L0 4.8 M3.6 4.8 A2.6 2.6 0 0 1 3.6 10 L0 10',
  C: 'M5.8 1.6 A3.2 5 0 1 0 5.8 8.4',
  D: 'M0 0 L0 10 L2.4 10 A3.6 5 0 0 0 2.4 0 Z',
  E: 'M6 0 L0 0 L0 10 L6 10 M0 5 L4.6 5',
  F: 'M6 0 L0 0 L0 10 M0 5 L4.6 5',
  G: 'M5.8 1.6 A3.2 5 0 1 0 6 8 L6 5.6 L3.4 5.6',
  H: 'M0 0 L0 10 M6 0 L6 10 M0 5 L6 5',
  I: 'M3 0 L3 10 M1.2 0 L4.8 0 M1.2 10 L4.8 10',
  J: 'M5 0 L5 7.4 A2.5 2.6 0 0 1 0 7.4',
  K: 'M0 0 L0 10 M6 0 L0 6.2 M2.1 4.3 L6 10',
  L: 'M0 0 L0 10 L5.6 10',
  M: 'M0 10 L0 0 L3 6 L6 0 L6 10',
  N: 'M0 10 L0 0 L6 10 L6 0',
  O: 'M3 0 A3 5 0 0 1 3 10 A3 5 0 0 1 3 0',
  P: 'M0 10 L0 0 L3.5 0 A2.5 2.6 0 0 1 3.5 5.2 L0 5.2',
  Q: 'M3 0 A3 5 0 0 1 3 10 A3 5 0 0 1 3 0 M3.6 7 L6 10.4',
  R: 'M0 10 L0 0 L3.5 0 A2.5 2.6 0 0 1 3.5 5.2 L0 5.2 M3 5.2 L6 10',
  S: 'M5.6 1.4 C4.6 -0.4 0.4 -0.4 0.4 2.6 C0.4 5.2 5.8 4.6 5.8 7.4 C5.8 10.6 1.2 10.6 0.2 8.4',
  T: 'M0 0 L6 0 M3 0 L3 10',
  U: 'M0 0 L0 7 A3 3 0 0 0 6 7 L6 0',
  V: 'M0 0 L3 10 L6 0',
  W: 'M0 0 L1.5 10 L3 3.4 L4.5 10 L6 0',
  X: 'M0 0 L6 10 M6 0 L0 10',
  Y: 'M0 0 L3 5 L6 0 M3 5 L3 10',
  Z: 'M0 0 L6 0 L0 10 L6 10',
  '.': 'M2.9 9.6 L3.1 9.6',
  ',': 'M3.2 9.4 L2.4 11',
  '-': 'M1 5.4 L5 5.4',
  '+': 'M3 2.6 L3 8.4 M0.2 5.5 L5.8 5.5',
  '/': 'M5 0 L1 10',
  ':': 'M3 3 L3 3.1 M3 9.4 L3 9.5',
  '°': 'M1.1 1.6 A1.3 1.3 0 1 1 3.7 1.6 A1.3 1.3 0 1 1 1.1 1.6',
  '×': 'M1 3 L5 9 M5 3 L1 9',
};
const ADV = { '.': 3, ',': 3, ':': 3, '1': 5, I: 4.5, ' ': 4.5, '°': 4.2 };
const cache = {};
const pathOf = (ch) => (G[ch] ? (cache[ch] ||= new Path2D(G[ch])) : null);

export const glyphWidth = (str, h) => {
  let w = 0;
  for (const ch of str) w += (ADV[ch] ?? 6) + 2;
  return Math.max(w - 2, 0) * (h / 10);
};

// drawText(ctx, '120', x, y, 0.1)：(x, y) 是文字的中心（align: 'center'）或左緣／右緣中線
// weight = 線寬佔字高的比例（0.11 ≈ 一般儀表字）。y 方向沿用 canvas（向下為正）。
export function drawText(ctx, str, x, y, h, { align = 'center', weight = 0.12, color, rotate = 0 } = {}) {
  str = String(str).toUpperCase();
  const s = h / 10, w = glyphWidth(str, h);
  ctx.save();
  ctx.translate(x, y);
  if (rotate) ctx.rotate(rotate);
  ctx.translate(align === 'center' ? -w / 2 : align === 'right' ? -w : 0, -h / 2);
  ctx.scale(s, s);
  if (color) ctx.strokeStyle = color;
  ctx.lineWidth = weight * 10;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let cx = 0;
  for (const ch of str) {
    const p = pathOf(ch);
    if (p) { ctx.save(); ctx.translate(cx, 0); ctx.stroke(p); ctx.restore(); }
    cx += (ADV[ch] ?? 6) + 2;
  }
  ctx.restore();
}

// 七段顯示器的數字（無線電頻率、應答機）：segments a~g
const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abfgcd', '-': 'g', ' ': '' };
export function drawSeg(ctx, str, x, y, h, { on = '#ffb347', off = 'rgba(255,180,80,0.07)' } = {}) {
  const w = h * 0.5, t = h * 0.11;
  const segs = {
    a: [0, 0, 1, 0], b: [1, 0, 1, 0.5], c: [1, 0.5, 1, 1], d: [0, 1, 1, 1], e: [0, 0.5, 0, 1], f: [0, 0, 0, 0.5], g: [0, 0.5, 1, 0.5],
  };
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineWidth = t;
  let cx = x;
  for (const ch of String(str)) {
    if (ch === '.') { ctx.fillStyle = on; ctx.beginPath(); ctx.arc(cx - w * 0.25, y + h, t * 0.6, 0, Math.PI * 2); ctx.fill(); continue; }
    const lit = SEG[ch] ?? '';
    for (const [k, [x0, y0, x1, y1]] of Object.entries(segs)) {
      ctx.strokeStyle = lit.includes(k) ? on : off;
      const sk = 0.12 * h; // 斜體
      const px = (u, v) => cx + u * w + (1 - v) * sk;
      ctx.beginPath();
      const inset = 0.16;
      const ux0 = x0 + (x1 - x0) * inset, uy0 = y0 + (y1 - y0) * inset, ux1 = x1 - (x1 - x0) * inset, uy1 = y1 - (y1 - y0) * inset;
      ctx.moveTo(px(ux0, uy0), y + uy0 * h); ctx.lineTo(px(ux1, uy1), y + uy1 * h); ctx.stroke();
    }
    cx += w * 1.55;
  }
  ctx.restore();
}
