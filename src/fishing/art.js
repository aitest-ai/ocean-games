// Field-guide art for the fishing game.
//
// Every catchable (fish, sea turtle, litter) has ONE side-view picture. The game uses it three ways:
//   1. the field-guide card and the fridge thumbnails (as is),
//   2. the shadow under the water (the same outline, darkened and blurred — see shadowSprites),
//   3. the moment it is lifted out of the water.
// Official pictures go in assets/fishing/<folder>/<id>.png (see assets/fishing/README.md). Until a
// file is there, a simple placeholder is painted here from the `art.placeholder` block of the data.
// Official pictures may come on a plain magenta background: it is keyed out automatically, and the
// picture is cropped to the subject, so the scale does not depend on the margins.

const W = 768, H = 384; // placeholder canvas (2 : 1, head on the left)

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}
const hash = (str) => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };

// ── placeholder painters ────────────────────────────────────────────────────
function paintFish(ctx, p, id) {
  const r = rng(hash(id));
  const depth = p.depth ?? 0.36;              // body depth / body length
  const peak = p.peak ?? 0.38;                 // where the body is deepest (0 snout … 1 tail base)
  const x0 = 24, x1 = W * (p.tailStart ?? 0.8), mid = H * 0.5;
  const len = x1 - x0, hd = depth * len;
  const prof = (u) => {
    // smooth hump with its maximum at `peak`, a blunt snout and a narrow tail base
    const a = u < peak ? Math.sin((u / peak) * Math.PI / 2) ** (p.snout ?? 0.7) : Math.cos(((u - peak) / (1 - peak)) * Math.PI / 2) ** 0.9;
    return Math.max(a, p.peduncle ?? 0.2);
  };
  const top = (u) => mid - prof(u) * hd * 0.55 * (p.back ?? 1);
  const bot = (u) => mid + prof(u) * hd * 0.45 * (p.belly ?? 1);
  const X = (u) => x0 + u * len;
  const N = 48;
  const body = new Path2D();
  body.moveTo(X(0), mid + hd * 0.04);
  for (let i = 0; i <= N; i++) body.lineTo(X(i / N), top(i / N));
  for (let i = N; i >= 0; i--) body.lineTo(X(i / N), bot(i / N));
  body.closePath();
  const c = p.colors || {};
  const finCol = c.fin || '#33424a';

  // fins first (behind the body)
  ctx.fillStyle = finCol; ctx.globalAlpha = 0.92;
  // tail (caudal fin)
  const pt = prof(1) * hd * 0.5, spread = hd * (p.tailSpread ?? 0.55), fork = p.tailFork ?? 0.4;
  ctx.beginPath();
  ctx.moveTo(X(0.98), mid - pt);
  ctx.quadraticCurveTo(X(1.05), mid - spread * 0.6, W - 18, mid - spread);
  ctx.quadraticCurveTo(W - 18 - fork * 90, mid, W - 18, mid + spread);
  ctx.quadraticCurveTo(X(1.05), mid + spread * 0.6, X(0.98), mid + pt);
  ctx.closePath(); ctx.fill();
  // dorsal fin(s)
  const dorsal = (u0, u1, hgt, spiny) => {
    ctx.beginPath();
    ctx.moveTo(X(u0), top(u0) + 4);
    const n = spiny ? Math.round((u1 - u0) * 40) : 1;
    if (spiny) for (let i = 0; i <= n; i++) { const u = u0 + ((u1 - u0) * i) / n; ctx.lineTo(X(u), top(u) - hgt * (i % 2 ? 0.7 : 1) * (0.6 + 0.4 * Math.sin((i / n) * Math.PI))); }
    else ctx.quadraticCurveTo(X((u0 + u1) / 2), top((u0 + u1) / 2) - hgt * 1.6, X(u1), top(u1) + 2);
    ctx.lineTo(X(u1), top(u1) + 6);
    ctx.closePath(); ctx.fill();
  };
  const d = p.dorsal || {};
  if (d.spiny) dorsal(d.spiny[0], d.spiny[1], hd * (d.spinyH ?? 0.22), true);
  if (d.soft) dorsal(d.soft[0], d.soft[1], hd * (d.softH ?? 0.16), false);
  if (d.finlets) for (let i = 0; i < d.finlets; i++) { const u = 0.8 - i * 0.035; ctx.beginPath(); ctx.moveTo(X(u - 0.012), top(u) + 2); ctx.lineTo(X(u), top(u) - 10); ctx.lineTo(X(u + 0.012), top(u) + 2); ctx.fill(); }
  // anal fin
  const a = p.anal || [0.62, 0.8];
  ctx.fillStyle = c.anal || finCol;
  ctx.beginPath(); ctx.moveTo(X(a[0]), bot(a[0]) - 4);
  ctx.quadraticCurveTo(X((a[0] + a[1]) / 2), bot((a[0] + a[1]) / 2) + hd * (p.analH ?? 0.18), X(a[1]), bot(a[1]) - 2);
  ctx.closePath(); ctx.fill();
  if (d.finlets) for (let i = 0; i < d.finlets; i++) { const u = 0.8 - i * 0.035; ctx.beginPath(); ctx.moveTo(X(u - 0.012), bot(u) - 2); ctx.lineTo(X(u), bot(u) + 10); ctx.lineTo(X(u + 0.012), bot(u) - 2); ctx.fill(); }
  // pelvic fin
  ctx.fillStyle = c.pelvic || finCol;
  ctx.beginPath(); ctx.moveTo(X(0.3), bot(0.3) - 6); ctx.lineTo(X(0.36), bot(0.32) + hd * 0.2); ctx.lineTo(X(0.42), bot(0.4) - 4); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;

  // body with a back → side → belly gradient
  const g = ctx.createLinearGradient(0, mid - hd * 0.55, 0, mid + hd * 0.45);
  g.addColorStop(0, c.back || '#2c3b44'); g.addColorStop(0.5, c.side || '#6d7f88'); g.addColorStop(1, c.belly || '#d9dfe1');
  ctx.fillStyle = g; ctx.fill(body);
  ctx.save(); ctx.clip(body);
  const pat = p.pattern || {};
  ctx.fillStyle = pat.color || 'rgba(0,0,0,0.6)'; ctx.strokeStyle = pat.color || 'rgba(0,0,0,0.6)';
  if (pat.type === 'bars') {
    const n = pat.count || 6, w = (pat.width ?? 0.5) * len / n;
    for (let i = 0; i < n; i++) { const u = (pat.from ?? 0.08) + (i + 0.5) * ((pat.to ?? 0.95) - (pat.from ?? 0.08)) / n; ctx.fillRect(X(u) - w / 2, 0, w, H); }
  } else if (pat.type === 'stripes') {
    ctx.lineWidth = pat.width || 9;
    const n = pat.count || 5, tilt = pat.tilt ?? 0.25;
    for (let i = 0; i < n; i++) { const y = mid - hd * 0.5 + (i + 0.5) * hd / n; ctx.beginPath(); ctx.moveTo(x0, y + tilt * 120); ctx.lineTo(X(1.1), y - tilt * 120); ctx.stroke(); }
  } else if (pat.type === 'spots') {
    const n = pat.count || 60;
    for (let i = 0; i < n; i++) { const u = 0.1 + r() * 0.85, y = top(u) + (bot(u) - top(u)) * (0.1 + r() * 0.8); ctx.beginPath(); ctx.arc(X(u), y, (pat.size || 5) * (0.6 + r() * 0.8), 0, 7); ctx.fill(); }
  } else if (pat.type === 'mottled') {
    for (let i = 0; i < (pat.count || 26); i++) { const u = r(), y = top(u) + (bot(u) - top(u)) * r() * 0.85; ctx.globalAlpha = 0.25 + r() * 0.4; ctx.beginPath(); ctx.ellipse(X(u), y, 14 + r() * 26, 9 + r() * 16, r() * 3, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else if (pat.type === 'mackerel') {
    ctx.lineWidth = pat.width || 5;
    for (let i = 0; i < (pat.count || 14); i++) {
      const u0 = 0.18 + i * 0.05; ctx.beginPath();
      for (let k = 0; k <= 10; k++) { const u = u0 + k * 0.006, y = top(u0) + 4 + k * hd * 0.035; ctx.lineTo(X(u) + Math.sin(k * 1.4 + i) * 8, y); }
      ctx.stroke();
    }
  }
  if (pat.scutes) {
    ctx.fillStyle = pat.scutes;
    for (let u = 0.3; u < 0.97; u += 0.018) { const y = mid - hd * 0.04 + (u < 0.45 ? -(0.45 - u) * hd * 0.5 : 0); ctx.fillRect(X(u) - 4, y - 5, 7, 10); }
  }
  if (pat.band) { ctx.fillStyle = pat.band.color; ctx.fillRect(0, mid + hd * pat.band.y - hd * pat.band.h / 2, W, hd * pat.band.h); }
  // lateral line
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2;
  ctx.beginPath(); for (let i = 3; i <= N; i++) { const u = i / N; ctx.lineTo(X(u), top(u) + (bot(u) - top(u)) * 0.3); } ctx.stroke();
  // soft shading for some roundness
  const sh = ctx.createLinearGradient(0, mid - hd * 0.55, 0, mid + hd * 0.45);
  sh.addColorStop(0, 'rgba(255,255,255,0.12)'); sh.addColorStop(0.45, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // gill cover, pectoral fin, eye, mouth
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
  const gx = X(p.gill ?? 0.24);
  ctx.beginPath(); ctx.moveTo(gx, top(0.24) + 10); ctx.quadraticCurveTo(gx + 18, mid, gx, bot(0.24) - 10); ctx.stroke();
  ctx.fillStyle = c.pectoral || finCol; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.ellipse(gx + 34, mid + hd * 0.06, 34, 12, 0.35, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  const ex = X(p.eyeX ?? 0.1), ey = mid - hd * (p.eyeY ?? 0.14), er = Math.max(hd * (p.eye ?? 0.09), 7);
  ctx.fillStyle = c.eye || '#e8d9a8'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, 7); ctx.fill();
  ctx.fillStyle = '#0b0b0b'; ctx.beginPath(); ctx.arc(ex + er * 0.1, ey, er * 0.55, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(ex - er * 0.2, ey - er * 0.25, er * 0.18, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x0 + 2, mid + hd * 0.05); ctx.lineTo(x0 + len * (p.mouth ?? 0.06), mid + hd * 0.08); ctx.stroke();
  if (p.spines) { // venomous / sharp spines, drawn as dark tips on the dorsal fin
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2;
    for (let u = (d.spiny || [0.3])[0]; u < ((d.spiny || [0, 0.55])[1]); u += 0.025) { ctx.beginPath(); ctx.moveTo(X(u), top(u)); ctx.lineTo(X(u) + 2, top(u) - hd * 0.22); ctx.stroke(); }
  }
}

function paintTurtle(ctx, p) {
  const c = p.colors || {};
  const mid = H * 0.55;
  ctx.fillStyle = c.skin || '#7d8a5a';
  // flippers, head
  ctx.beginPath(); ctx.ellipse(250, mid + 70, 130, 34, 0.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(560, mid + 60, 70, 24, -0.4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(120, mid - 10, 70, 46, -0.15, 0, 7); ctx.fill();
  // shell
  const g = ctx.createLinearGradient(0, mid - 140, 0, mid + 50);
  g.addColorStop(0, c.shell || '#6a5434'); g.addColorStop(1, c.shellEdge || '#3d3122');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(180, mid + 30); ctx.bezierCurveTo(230, mid - 170, 560, mid - 170, 640, mid + 30); ctx.closePath(); ctx.fill();
  ctx.fillStyle = c.plastron || '#d9c78f';
  ctx.beginPath(); ctx.moveTo(190, mid + 28); ctx.quadraticCurveTo(410, mid + 75, 635, mid + 28); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 4;
  for (const x of [300, 410, 520]) { ctx.beginPath(); ctx.moveTo(x, mid + 25); ctx.lineTo(x + 10, mid - 100); ctx.stroke(); }
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(85, mid - 22, 8, 0, 7); ctx.fill();
}

function paintJunk(ctx, p) {
  const c = p.colors || {};
  const mid = H / 2;
  ctx.lineJoin = 'round';
  if (p.shape === 'bottle') {
    ctx.fillStyle = c.body || 'rgba(170,220,255,0.85)';
    ctx.beginPath(); ctx.roundRect(150, mid - 70, 380, 140, 40); ctx.fill();
    ctx.beginPath(); ctx.moveTo(530, mid - 55); ctx.quadraticCurveTo(600, mid - 30, 610, mid - 22); ctx.lineTo(610, mid + 22); ctx.quadraticCurveTo(600, mid + 30, 530, mid + 55); ctx.fill();
    ctx.fillStyle = c.cap || '#1f6fd1'; ctx.fillRect(610, mid - 26, 40, 52);
    ctx.fillStyle = c.label || '#e8f3ff'; ctx.fillRect(260, mid - 70, 140, 140);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(180, mid - 40); ctx.lineTo(520, mid - 40); ctx.stroke();
  } else if (p.shape === 'bag') {
    ctx.fillStyle = c.body || 'rgba(240,240,235,0.85)';
    ctx.beginPath(); ctx.moveTo(200, mid - 90); ctx.quadraticCurveTo(380, mid - 140, 560, mid - 80); ctx.quadraticCurveTo(620, mid + 40, 540, mid + 110); ctx.quadraticCurveTo(380, mid + 150, 220, mid + 100); ctx.quadraticCurveTo(140, mid, 200, mid - 90); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 4;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(240 + i * 50, mid - 80); ctx.quadraticCurveTo(260 + i * 50, mid, 230 + i * 55, mid + 90); ctx.stroke(); }
    ctx.lineWidth = 14; ctx.strokeStyle = c.body || 'rgba(240,240,235,0.85)';
    ctx.beginPath(); ctx.arc(250, mid - 110, 40, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(500, mid - 105, 40, Math.PI, 0); ctx.stroke();
  } else if (p.shape === 'net') {
    ctx.strokeStyle = c.body || '#2f8f6a'; ctx.lineWidth = 6;
    for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(380 + i * 45 - 120, mid - 130); ctx.quadraticCurveTo(380 + i * 30, mid, 380 + i * 45 + 120, mid + 130); ctx.stroke(); ctx.beginPath(); ctx.moveTo(380 + i * 45 + 120, mid - 130); ctx.quadraticCurveTo(380 + i * 35, mid, 380 + i * 45 - 120, mid + 130); ctx.stroke(); }
    ctx.fillStyle = c.float || '#ff8a1a'; ctx.beginPath(); ctx.ellipse(170, mid - 60, 34, 24, 0, 0, 7); ctx.fill();
  } else if (p.shape === 'slipper') {
    ctx.fillStyle = c.body || '#3b6fd8';
    ctx.beginPath(); ctx.ellipse(380, mid + 20, 260, 80, 0, 0, 7); ctx.fill();
    ctx.fillStyle = c.sole || '#f2f2ee'; ctx.beginPath(); ctx.ellipse(380, mid + 40, 255, 62, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = c.strap || '#f2f2ee'; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(220, mid - 10); ctx.quadraticCurveTo(300, mid - 120, 400, mid - 20); ctx.stroke();
  } else if (p.shape === 'can') {
    ctx.fillStyle = c.body || '#c9302c';
    ctx.beginPath(); ctx.roundRect(200, mid - 90, 360, 180, 20); ctx.fill();
    ctx.fillStyle = c.rim || '#c7ccd2'; ctx.fillRect(190, mid - 90, 22, 180); ctx.fillRect(548, mid - 90, 22, 180);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(230, mid - 60, 300, 18);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.moveTo(380, mid - 90); ctx.lineTo(420, mid + 10); ctx.lineTo(360, mid + 90); ctx.lineTo(340, mid); ctx.fill();
  }
}

export function paintPlaceholder(item) {
  const cv = canvas(W, H), ctx = cv.getContext('2d');
  const p = item.art?.placeholder || {};
  if (item.kind === 'junk') paintJunk(ctx, p);
  else if (p.shape === 'turtle') paintTurtle(ctx, p);
  else paintFish(ctx, p, item.id);
  return cropToAlpha(cv);
}

// ── official pictures ───────────────────────────────────────────────────────
// key out a plain magenta (#FF00FF-ish) background, if the picture has one
export function keyMagenta(cv) {
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data;
  const corner = (x, y) => { const i = (y * cv.width + x) * 4; return d[i + 3] > 250 && d[i] > 180 && d[i + 2] > 180 && d[i + 1] < 110; };
  const n = [corner(2, 2), corner(cv.width - 3, 2), corner(2, cv.height - 3), corner(cv.width - 3, cv.height - 3)].filter(Boolean).length;
  if (n < 2) return false;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const m = Math.min(r, b) - g;              // how magenta: red and blue high, green low
    if (m <= 40) continue;
    const k = Math.min((m - 40) / 90, 1);
    d[i + 3] = Math.round(d[i + 3] * (1 - k));
    // remove the pink fringe on the edge (despill)
    const cap = g + (Math.max(r, b) - g) * (1 - k) * 0.6;
    d[i] = Math.min(r, cap + 20); d[i + 2] = Math.min(b, cap + 20);
  }
  ctx.putImageData(img, 0, 0);
  return true;
}

// crop to the non-transparent pixels (plus a small margin)
export function cropToAlpha(cv, margin = 4) {
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = cv;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return cv;
  x0 = Math.max(x0 - margin, 0); y0 = Math.max(y0 - margin, 0); x1 = Math.min(x1 + margin, w - 1); y1 = Math.min(y1 + margin, h - 1);
  const out = canvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

function loadImage(url) {
  return new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error('missing ' + url)); im.src = url; });
}

// the picture for one catchable: the official file if it exists, else the placeholder
// returns { image (canvas), official, file }
export async function loadArt(item, base = '../') {
  const file = item.art?.file;
  if (file) {
    try {
      const im = await loadImage(base + file);
      const max = 1024, s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const cv = canvas(Math.round(im.naturalWidth * s), Math.round(im.naturalHeight * s));
      const ctx = cv.getContext('2d');
      if (item.art.facing === 'right') { ctx.translate(cv.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(im, 0, 0, cv.width, cv.height);
      keyMagenta(cv);
      return { image: cropToAlpha(cv), official: true, file };
    } catch { /* no official picture yet */ }
  }
  return { image: paintPlaceholder(item), official: false, file };
}

// ── shadows ─────────────────────────────────────────────────────────────────
// the picture's outline, darkened, at three blur levels (shallow → deep)
export function shadowSprites(image, color = 'rgb(3, 16, 26)') {
  const sw = 192, sh = Math.max(Math.round(sw * image.height / image.width), 16);
  const pad = Math.round(sh * 0.5);
  const base = canvas(sw + pad * 2, sh + pad * 2), bctx = base.getContext('2d');
  bctx.drawImage(image, pad, pad, sw, sh);
  bctx.globalCompositeOperation = 'source-in';
  bctx.fillStyle = color; bctx.fillRect(0, 0, base.width, base.height);
  const blur = (f) => {
    // a cheap blur that also works where ctx.filter does not: shrink, then scale back up smoothly
    const small = canvas(Math.max(Math.round(base.width / f), 2), Math.max(Math.round(base.height / f), 2));
    const sctx = small.getContext('2d'); sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(base, 0, 0, small.width, small.height);
    const out = canvas(base.width, base.height), octx = out.getContext('2d'); octx.imageSmoothingQuality = 'high';
    octx.drawImage(small, 0, 0, out.width, out.height);
    return out;
  };
  return { levels: [blur(3), blur(6), blur(11)], aspect: sh / sw, pad: pad / sw };
}

// a small PNG data URL for <img> thumbnails
export function thumbURL(image, w = 240) {
  const h = Math.round(w * image.height / image.width);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(image, 0, 0, w, h);
  return cv.toDataURL('image/png');
}
