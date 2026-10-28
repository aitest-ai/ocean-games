// 儀表錶面：用 2D canvas 畫進一張「圖集」（atlas），所有儀表共用一張貼圖、一個材質。
// 每個錶面畫兩次：color（白天看到的顏色）與 glow（夜間背光會發亮的部分：刻度、數字、指針）。
// 刻度位置全部用 scales.js 的換算函式算，所以指針指到的數字一定對得上錶面。
import { drawText, drawSeg } from '../glyphs.js';
import { canvas, rng } from '../tex.js';
import { asiAngle, vsiAngle, tachAngle, arcAngle, PITCH_PER_10, TACH_MAX } from './scales.js';

const D = Math.PI / 180;
const at = (a, r) => [Math.sin(a) * r, -Math.cos(a) * r];

// 畫筆：白天與夜間背光兩套顏色
const PAINT = {
  color: { bg: '#141517', bg2: '#0b0c0d', ink: '#f2f0ea', dim: '#9a9a96', white: '#f4f4f0', green: '#2fae4f', yellow: '#e8c23a', red: '#d8322c', orange: '#f08a1c', sky: ['#1f5fae', '#5fa6e6'], ground: ['#4d2f14', '#8a5a2c'], glow: false },
  glow: { bg: '#000', bg2: '#000', ink: '#ffeccc', dim: '#5a5040', white: '#ffeccc', green: '#2c8a40', yellow: '#a8902c', red: '#a8241f', orange: '#c86a10', sky: ['#0b1a2c', '#16304a'], ground: ['#140c05', '#22160a'], glow: true },
};

// ── 共用筆劃 ──
function faceBg(c, P, r = 1) {
  if (P.glow) { c.fillStyle = '#000'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); return; }
  const g = c.createRadialGradient(0, -0.2, 0.1, 0, 0, r);
  g.addColorStop(0, P.bg); g.addColorStop(1, P.bg2);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
  // 錶面印刷的細微顆粒
  const R = rng(17);
  c.fillStyle = 'rgba(255,255,255,0.018)';
  for (let i = 0; i < 400; i++) { const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * r; c.fillRect(Math.sin(a) * rr, Math.cos(a) * rr, 0.006, 0.006); }
  // 外圈暗邊（錶面凹進錶框的陰影）
  const e = c.createRadialGradient(0, 0, r * 0.86, 0, 0, r);
  e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = e; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
}
function tick(c, a, r0, r1, w, color) {
  const [x0, y0] = at(a, r0), [x1, y1] = at(a, r1);
  c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'butt';
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
}
function band(c, a0, a1, r0, r1, color) {
  c.fillStyle = color; c.beginPath();
  c.arc(0, 0, r1, a0 - Math.PI / 2, a1 - Math.PI / 2); c.arc(0, 0, r0, a1 - Math.PI / 2, a0 - Math.PI / 2, true); c.closePath(); c.fill();
}
const num = (c, s, a, r, h, color, w = 0.13) => { const [x, y] = at(a, r); drawText(c, s, x, y, h, { color, weight: w }); };
function screwHoles(c, P) { // 錶面上的小螺絲（裝飾）
  if (P.glow) return;
  for (const a of [-50, 50]) {
    const [x, y] = at(a * D + Math.PI, 0.5);
    c.fillStyle = '#26282a'; c.beginPath(); c.arc(x, y, 0.035, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#0a0a0a'; c.lineWidth = 0.01; c.beginPath(); c.moveTo(x - 0.025, y); c.lineTo(x + 0.025, y); c.stroke();
  }
}

// ── 各儀表 ──
const FACES = {
  asi(c, P, spec) {
    const V = spec.vspeeds;
    faceBg(c, P);
    band(c, asiAngle(V.vs1), asiAngle(V.vno), 0.84, 0.93, P.green);
    band(c, asiAngle(V.vno), asiAngle(V.vne), 0.84, 0.93, P.yellow);
    band(c, asiAngle(V.vso), asiAngle(V.vfe), 0.76, 0.83, P.white);
    tick(c, asiAngle(V.vne), 0.72, 0.95, 0.035, P.red);
    for (let v = 40; v <= 160; v += 5) {
      const major = v % 10 === 0;
      tick(c, asiAngle(v), major ? 0.7 : 0.77, 0.94, major ? 0.026 : 0.014, P.ink);
    }
    for (let v = 40; v <= 160; v += 20) num(c, String(v), asiAngle(v), 0.55, 0.15, P.ink);
    drawText(c, 'AIRSPEED', 0, -0.3, 0.075, { color: P.dim, weight: 0.12 });
    drawText(c, 'KNOTS', 0, 0.3, 0.085, { color: P.ink, weight: 0.12 });
    screwHoles(c, P);
  },

  // 姿態儀錶面：外圈固定的傾斜刻度；中間是透明的窗（後面是會動的天空地面球）；橘色的小飛機固定在窗上
  aiFace(c, P) {
    c.save();
    c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.arc(0, 0, 0.8, 0, Math.PI * 2, true); c.clip('evenodd');
    faceBg(c, P);
    // 上半圈是天空色、下半圈地面色（真的姿態儀外圈也這樣，方便一眼看懂）
    if (!P.glow) {
      c.globalAlpha = 0.85;
      band(c, -90 * D, 90 * D, 0.8, 1.0, '#1c4f8c'); band(c, 90 * D, 270 * D, 0.8, 1.0, '#4a2e15');
      c.globalAlpha = 1;
    }
    for (const b of [10, 20, 30, 60]) for (const s of [-1, 1]) tick(c, s * b * D, 0.8, b % 30 === 0 ? 0.97 : 0.9, 0.025, P.white);
    for (const s of [-1, 1]) { // 45° 小三角、90° 長線
      const [x, y] = at(s * 45 * D, 0.82), [x1, y1] = at(s * 45 * D - 0.04, 0.92), [x2, y2] = at(s * 45 * D + 0.04, 0.92);
      c.fillStyle = P.white; c.beginPath(); c.moveTo(x, y); c.lineTo(x1, y1); c.lineTo(x2, y2); c.fill();
      tick(c, s * 90 * D, 0.8, 0.97, 0.03, P.white);
    }
    // 0° 的大三角（零度指標）
    c.fillStyle = P.orange; c.beginPath(); c.moveTo(0, -0.81); c.lineTo(-0.07, -0.95); c.lineTo(0.07, -0.95); c.fill();
    c.restore();
    // 窗內的橘色小飛機（固定）與中心點
    c.save();
    c.fillStyle = P.orange; c.strokeStyle = P.glow ? P.orange : '#3a1d02'; c.lineWidth = 0.012;
    const wing = (s) => { c.beginPath(); c.moveTo(s * 0.62, -0.02); c.lineTo(s * 0.2, -0.02); c.lineTo(s * 0.12, 0.08); c.lineTo(s * 0.18, 0.08); c.lineTo(s * 0.23, 0.03); c.lineTo(s * 0.62, 0.03); c.closePath(); c.fill(); c.stroke(); };
    wing(-1); wing(1);
    c.beginPath(); c.arc(0, 0, 0.035, 0, Math.PI * 2); c.fill(); c.stroke();
    // 下方的支架（從錶框伸上來）
    c.fillStyle = P.glow ? '#000' : '#151617';
    c.beginPath(); c.moveTo(-0.12, 0.8); c.lineTo(-0.03, 0.12); c.lineTo(0.03, 0.12); c.lineTo(0.12, 0.8); c.closePath(); c.fill();
    c.restore();
  },

  // 姿態儀的天空地面球（寬 1.7、高 3.1，單位 = 錶面半徑）
  aiBall(c, P) {
    const W = 0.85, H = 1.55;
    let g = c.createLinearGradient(0, -H, 0, 0);
    g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
    c.fillStyle = g; c.fillRect(-W, -H, 2 * W, H);
    g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, P.ground[1]); g.addColorStop(1, P.ground[0]);
    c.fillStyle = g; c.fillRect(-W, 0, 2 * W, H);
    c.fillStyle = P.white; c.fillRect(-W, -0.012, 2 * W, 0.024);
    const k = PITCH_PER_10 / 10;
    for (let p = 5; p <= 30; p += 5) for (const s of [-1, 1]) {
      const y = -s * p * k, half = p % 10 === 0 ? 0.22 : 0.11;
      c.fillStyle = P.white; c.fillRect(-half, y - 0.008, 2 * half, 0.016);
      if (p % 10 === 0) { drawText(c, String(p), -half - 0.1, y, 0.07, { color: P.white, weight: 0.14 }); drawText(c, String(p), half + 0.1, y, 0.07, { color: P.white, weight: 0.14 }); }
    }
    // 地面的透視線（下半部的放射線）
    c.strokeStyle = P.glow ? '#140c05' : 'rgba(255,255,255,0.35)'; c.lineWidth = 0.01;
    for (const a of [-60, -30, 30, 60]) { c.beginPath(); c.moveTo(0, 0.02); c.lineTo(Math.tan(a * D) * 0.6, 0.6); c.stroke(); }
  },

  alt(c, P) {
    faceBg(c, P);
    for (let i = 0; i < 50; i++) {
      const a = (i / 50) * Math.PI * 2, major = i % 5 === 0;
      tick(c, a, major ? 0.76 : 0.84, 0.94, major ? 0.03 : 0.015, P.ink);
    }
    for (let n = 0; n < 10; n++) num(c, String(n), (n / 10) * Math.PI * 2, 0.62, 0.17, P.ink, 0.14);
    drawText(c, 'ALT', 0, -0.36, 0.08, { color: P.dim });
    drawText(c, '100 FEET', 0, 0.28, 0.065, { color: P.dim });
    // 氣壓撥定窗（3 點鐘）
    if (!P.glow) { c.fillStyle = '#050505'; c.fillRect(0.36, -0.08, 0.32, 0.16); c.strokeStyle = '#333'; c.lineWidth = 0.01; c.strokeRect(0.36, -0.08, 0.32, 0.16); }
    drawText(c, '29.92', 0.52, 0, 0.075, { color: P.white, weight: 0.13 });
    // 一萬呎以下的斜紋警示窗
    if (!P.glow) {
      c.save(); c.beginPath(); c.rect(-0.12, -0.55, 0.24, 0.1); c.clip();
      c.fillStyle = '#eee'; c.fillRect(-0.12, -0.55, 0.24, 0.1);
      c.fillStyle = '#111'; for (let x = -0.3; x < 0.3; x += 0.06) { c.beginPath(); c.moveTo(x, -0.45); c.lineTo(x + 0.03, -0.45); c.lineTo(x + 0.13, -0.55); c.lineTo(x + 0.1, -0.55); c.fill(); }
      c.restore();
    }
    screwHoles(c, P);
  },

  tc(c, P) {
    faceBg(c, P);
    drawText(c, 'TURN COORDINATOR', 0, -0.62, 0.068, { color: P.dim });
    // 機翼水平與標準轉彎（20°）的參考線
    for (const s of [-1, 1]) {
      tick(c, s * 90 * D, 0.7, 0.92, 0.035, P.white);
      tick(c, s * 110 * D, 0.7, 0.92, 0.035, P.white);
      num(c, s < 0 ? 'L' : 'R', s * 118 * D, 0.62, 0.11, P.ink, 0.15);
    }
    drawText(c, '2 MIN', 0, 0.78, 0.07, { color: P.ink });
    drawText(c, 'NO PITCH', 0, -0.47, 0.05, { color: P.dim });
    drawText(c, 'INFORMATION', 0, -0.39, 0.05, { color: P.dim });
    // 側滑球的玻璃管
    const cy = -0.85, R = 1.4;
    c.strokeStyle = P.glow ? '#2a2620' : '#d8d4c8'; c.lineWidth = 0.16; c.lineCap = 'round';
    c.beginPath(); c.arc(0, cy, R, (90 + 22) * D, (90 - 22) * D, true); c.stroke();
    c.strokeStyle = P.glow ? '#000' : '#bdb8aa'; c.lineWidth = 0.13;
    c.beginPath(); c.arc(0, cy, R, (90 + 21) * D, (90 - 21) * D, true); c.stroke();
    for (const s of [-1, 1]) { // 管子上的兩條參考線
      const a = (90 + s * 4.2) * D;
      c.strokeStyle = '#111'; c.lineWidth = 0.014; c.lineCap = 'butt';
      c.beginPath(); c.moveTo(Math.cos(a) * (R - 0.09), cy + Math.sin(a) * (R - 0.09)); c.lineTo(Math.cos(a) * (R + 0.09), cy + Math.sin(a) * (R + 0.09)); c.stroke();
    }
    screwHoles(c, P);
  },

  hiCard(c, P) {
    if (!P.glow) { c.fillStyle = '#151618'; c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill(); }
    else { c.fillStyle = '#000'; c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill(); }
    for (let d = 0; d < 360; d += 5) tick(c, d * D, d % 10 === 0 ? 0.78 : 0.86, 0.96, d % 10 === 0 ? 0.026 : 0.014, P.ink);
    const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let d = 0; d < 360; d += 30) {
      const s = lab[d] || String(d / 10);
      const [x, y] = at(d * D, 0.62);
      drawText(c, s, x, y, lab[d] ? 0.17 : 0.14, { color: lab[d] ? P.white : P.ink, weight: 0.14, rotate: d * D });
    }
  },
  hiOverlay(c, P) {
    // 透明背景，只有固定的記號：上方的航向指標、每 45° 的小三角、中間的小飛機
    c.fillStyle = P.orange;
    c.beginPath(); c.moveTo(0, -0.74); c.lineTo(-0.06, -0.97); c.lineTo(0.06, -0.97); c.fill();
    for (let d = 45; d < 360; d += 45) {
      const [x, y] = at(d * D, 0.985), [x1, y1] = at(d * D - 0.035, 1.0), [x2, y2] = at(d * D + 0.035, 1.0);
      const [x0, y0] = at(d * D, 0.92);
      c.fillStyle = P.white; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.fill();
      void x; void y;
    }
    c.strokeStyle = P.orange; c.lineWidth = 0.035; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(0, -0.42); c.lineTo(0, 0.36); c.moveTo(-0.32, -0.04); c.lineTo(0.32, -0.04); c.moveTo(-0.13, 0.3); c.lineTo(0.13, 0.3); c.stroke();
  },

  vsi(c, P) {
    faceBg(c, P);
    const marks = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1500, 2000];
    for (const s of [-1, 1]) for (const v of marks) {
      if (v === 0 && s < 0) continue;
      const major = v % 500 === 0;
      tick(c, vsiAngle(s * v), major ? 0.72 : 0.82, 0.94, major ? 0.03 : 0.016, P.ink);
    }
    for (const s of [-1, 1]) for (const v of [5, 10, 15, 20]) num(c, String(v), vsiAngle(s * v * 100), 0.6, 0.14, P.ink);
    num(c, '0', vsiAngle(0), 0.6, 0.14, P.ink);
    drawText(c, 'UP', -0.1, -0.36, 0.075, { color: P.ink });
    drawText(c, 'DOWN', -0.1, 0.36, 0.075, { color: P.ink });
    drawText(c, 'VERTICAL SPEED', 0.1, -0.1, 0.05, { color: P.dim });
    drawText(c, '100 FT/MIN', 0.12, 0.08, 0.05, { color: P.dim });
    screwHoles(c, P);
  },

  tach(c, P, spec) {
    faceBg(c, P);
    const [g0, g1] = spec.engine.green, red = spec.engine.redline;
    band(c, tachAngle(g0), tachAngle(g1), 0.84, 0.93, P.green);
    tick(c, tachAngle(red), 0.74, 0.95, 0.035, P.red);
    for (let r = 0; r <= TACH_MAX; r += 100) {
      const major = r % 500 === 0;
      tick(c, tachAngle(r), major ? 0.74 : 0.84, 0.94, major ? 0.028 : 0.014, P.ink);
    }
    for (let r = 0; r <= TACH_MAX; r += 500) num(c, String(r / 100), tachAngle(r), 0.6, 0.14, P.ink);
    drawText(c, 'RPM', 0, -0.3, 0.09, { color: P.ink });
    drawText(c, '×100', 0, -0.17, 0.065, { color: P.dim });
    if (!P.glow) { c.fillStyle = '#050505'; c.fillRect(-0.24, 0.32, 0.48, 0.13); }
    drawText(c, '0412.6', 0, 0.385, 0.075, { color: P.glow ? '#2a2620' : '#e8e4da' });
    drawText(c, 'HOURS', 0, 0.55, 0.05, { color: P.dim });
    screwHoles(c, P);
  },

  // 小儀表（2¼ 吋）：上半圈的弧（-60° ~ 60°）
  small(c, P, spec, g) {
    faceBg(c, P);
    const { min, max, bands = [], red = [], label, sub, nums = [], ticks = 10 } = g.scale;
    const a = (v) => arcAngle(v, min, max, -60, 60);
    for (const [v0, v1, col] of bands) band(c, a(v0), a(v1), 0.74, 0.86, P[col]);
    for (let i = 0; i <= ticks; i++) tick(c, a(min + (i / ticks) * (max - min)), i % (ticks / 2) === 0 ? 0.64 : 0.72, 0.88, i % (ticks / 2) === 0 ? 0.04 : 0.022, P.ink);
    for (const v of red) tick(c, a(v), 0.6, 0.9, 0.05, P.red);
    for (const [v, s] of nums) num(c, s, a(v), 0.48, 0.16, P.ink, 0.15);
    drawText(c, label, 0, 0.18, 0.15, { color: P.ink, weight: 0.13 });
    if (sub) drawText(c, sub, 0, 0.42, 0.11, { color: P.dim, weight: 0.13 });
  },

  // 磁羅盤的刻度帶（圓柱展開；寬：高 = 8：1）
  compassBand(c, P) {
    const W = 8, H = 1; // 單位：高 = 1
    c.fillStyle = P.glow ? '#000' : '#e9e4d6'; c.fillRect(-W / 2, -H / 2, W, H);
    const lab = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
    for (let d = 0; d <= 360; d += 5) {
      const x = -W / 2 + (d / 360) * W;
      c.strokeStyle = P.glow ? '#3a3020' : '#111'; c.lineWidth = d % 10 === 0 ? 0.03 : 0.018;
      c.beginPath(); c.moveTo(x, H / 2); c.lineTo(x, H / 2 - (d % 10 === 0 ? 0.28 : 0.16)); c.stroke();
      if (d % 30 === 0 && d < 360) drawText(c, lab[d] || String(d / 10), x, -0.05, 0.36, { color: P.glow ? '#3a3020' : '#111', weight: 0.13 });
    }
  },
};

// 警示燈條：每個燈一格（未亮／亮各一張）
function annunciator(c, P, spec, lit) {
  const list = spec.annunciators, n = list.length;
  const W = 8, H = 1, w = W / n;
  for (let i = 0; i < n; i++) {
    const L = list[i], x = -W / 2 + i * w;
    const col = L.color === 'red' ? '#ff4a3a' : L.color === 'amber' ? '#ffb02e' : '#53d769';
    if (P.glow) {
      c.fillStyle = '#000'; c.fillRect(x, -H / 2, w, H);
      if (lit) { c.fillStyle = col; c.globalAlpha = 0.25; c.fillRect(x + 0.04, -H / 2 + 0.06, w - 0.08, H - 0.12); c.globalAlpha = 1; }
    } else {
      c.fillStyle = '#0c0c0c'; c.fillRect(x, -H / 2, w, H);
      c.fillStyle = lit ? col : '#1a1916'; c.globalAlpha = lit ? 0.35 : 1; c.fillRect(x + 0.04, -H / 2 + 0.06, w - 0.08, H - 0.12); c.globalAlpha = 1;
    }
    const lines = L.text.split('\n');
    lines.forEach((t, j) => drawText(c, t, x + w / 2, (j - (lines.length - 1) / 2) * 0.32, 0.22, { color: lit ? (P.glow ? col : '#fff6e0') : (P.glow ? '#000' : '#4a4436'), weight: 0.15 }));
  }
}

// 無線電（通訊導航機、應答機）的面板與七段顯示
function radio(c, P, spec, which) {
  const W = 4, H = 1;
  c.fillStyle = P.glow ? '#000' : '#17181a'; c.fillRect(-W / 2, -H / 2, W, H);
  if (!P.glow) { c.strokeStyle = '#2a2b2e'; c.lineWidth = 0.03; c.strokeRect(-W / 2 + 0.02, -H / 2 + 0.02, W - 0.04, H - 0.04); }
  const win = (x, w) => { if (!P.glow) { c.fillStyle = '#070707'; c.fillRect(x, -0.28, w, 0.5); } };
  const on = P.glow ? '#ffb347' : '#ffb347', off = P.glow ? 'rgba(0,0,0,0)' : 'rgba(255,180,80,0.06)';
  if (which === 'com') {
    win(-1.7, 1.45); win(0.2, 1.45);
    drawSeg(c, '118.30', -1.62, -0.2, 0.34, { on, off }); drawSeg(c, '121.50', 0.28, -0.2, 0.34, { on, off });
    drawText(c, 'COM', -1.0, 0.36, 0.11, { color: P.glow ? '#3a3020' : '#bdb8aa' }); drawText(c, 'STBY', 0.9, 0.36, 0.11, { color: P.glow ? '#3a3020' : '#bdb8aa' });
  } else {
    win(-0.9, 1.5);
    drawSeg(c, '1200', -0.78, -0.2, 0.34, { on, off });
    drawText(c, 'ALT', 0.95, -0.05, 0.14, { color: P.glow ? '#3a7a3a' : '#7fd07f' });
    drawText(c, 'XPDR', -0.15, 0.36, 0.11, { color: P.glow ? '#3a3020' : '#bdb8aa' });
  }
}


// skyline 排版：由高到低放，每個放在「目前最低」的位置（比一排一排放省空間，中畫質剛好 2048²）
export function packAtlas(items, S) {
  const Wpx = S * 4, step = Math.max(4, S / 64);
  const pad = Math.max(2, S / 128);
  const sky = new Int32Array(Math.ceil(Wpx / step)).fill(0);
  const sorted = [...items].sort((a, b) => b[2] - a[2] || b[1] - a[1]);
  const pos = {};
  let bottom = 0;
  for (const [id, w, h] of sorted) {
    const cols = Math.ceil((w + pad) / step);
    let best = null;
    for (let cx = 0; cx + cols <= sky.length; cx++) {
      let top = 0;
      for (let k = cx; k < cx + cols; k++) top = Math.max(top, sky[k]);
      if (!best || top < best.top) best = { cx, top };
    }
    for (let k = best.cx; k < best.cx + cols; k++) sky[k] = best.top + h + pad;
    pos[id] = { x: best.cx * step, y: best.top, w, h };
    bottom = Math.max(bottom, best.top + h);
  }
  let Hpx = 1; while (Hpx < bottom) Hpx *= 2;
  return { pos, Wpx, Hpx };
}

export function atlasItems(spec, S) {
  return [
    ['asi', S, S], ['aiFace', S, S], ['alt', S, S], ['tc', S, S], ['hiCard', S, S], ['hiOverlay', S, S], ['vsi', S, S], ['tach', S, S],
    ['aiBall', Math.round(S * 0.6), Math.round(S * 1.1)],
    ...spec.smallGauges.map((g) => ['small:' + g.id, S / 2, S / 2]),
    ['compassBand', S * 2, S / 4],
    ['annOff', S * 2, S / 4], ['annOn', S * 2, S / 4],
    ['radioCom', S, S / 4], ['radioXpdr', S, S / 4],
    ['white', 16, 16], ['orange', 16, 16], ['black', 16, 16], ['steel', 16, 16],
  ];
}

// ── 圖集 ──
// cell: S = 大儀表一格的像素（低畫質 256、中 512、高 512）
export function buildAtlas(spec, { S = 512 } = {}) {
  const items = atlasItems(spec, S);
  const { pos, Wpx, Hpx } = packAtlas(items, S);
  const out = { S, W: Wpx, H: Hpx, rects: {} };
  for (const [id, r] of Object.entries(pos)) out.rects[id] = { u0: r.x / Wpx, u1: (r.x + r.w) / Wpx, v0: 1 - (r.y + r.h) / Hpx, v1: 1 - r.y / Hpx, px: r };
  for (const pass of ['color', 'glow']) {
    const cv = canvas(Wpx, Hpx), c = cv.getContext('2d');
    const P = PAINT[pass];
    if (pass === 'glow') { c.fillStyle = '#000'; c.fillRect(0, 0, Wpx, Hpx); }
    for (const [id, r] of Object.entries(pos)) {
      c.save();
      c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
      c.translate(r.x + r.w / 2, r.y + r.h / 2);
      if (['white', 'orange', 'black', 'steel'].includes(id)) {
        const col = { white: P.glow ? '#ffeccc' : '#f4f2ec', orange: P.glow ? '#c86a10' : '#f08a1c', black: P.glow ? '#000' : '#0b0b0b', steel: P.glow ? '#000' : '#9aa0a6' }[id];
        c.fillStyle = col; c.fillRect(-r.w, -r.h, r.w * 2, r.h * 2);
      } else if (id === 'aiBall') { c.scale(r.w / 1.7, r.h / 3.1); FACES.aiBall(c, P, spec); }
      else if (id === 'compassBand' || id === 'annOff' || id === 'annOn') {
        c.scale(r.w / 8, r.h / 1);
        if (id === 'compassBand') FACES.compassBand(c, P, spec); else annunciator(c, P, spec, id === 'annOn');
      } else if (id === 'radioCom' || id === 'radioXpdr') { c.scale(r.w / 4, r.h); radio(c, P, spec, id === 'radioCom' ? 'com' : 'xpdr'); }
      else if (id.startsWith('small:')) { c.scale(r.w / 2, r.h / 2); FACES.small(c, P, spec, spec.smallGauges.find((g) => 'small:' + g.id === id)); }
      else { c.scale(r.w / 2, r.h / 2); FACES[id](c, P, spec); }
      c.restore();
    }
    out[pass] = cv;
  }
  return out;
}
