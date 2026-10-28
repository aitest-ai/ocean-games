// 鏡像回饋：在鏡頭畫面（或沒有鏡頭時的深色背景）上疊骨架，依姿勢檢查結果變色。
//   綠 = 這一部分做得好、橘 = 這一部分有提示、灰色虛線 = 這個角度看不到（不判斷）、藍 = 還沒有結果
// 骨架的座標是鏡像的正規化座標（跟照鏡子一樣），影像本身用 CSS 左右翻轉，兩者對得上。
export const COLORS = { ok: '#5fd39a', warn: '#ffb547', unknown: '#8696a3', neutral: '#63b8ff', head: '#e8f1f7' };

const BONES = {
  arms: [['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'], ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist']],
  torso: [['leftShoulder', 'rightShoulder'], ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'], ['leftHip', 'rightHip']],
  legs: [['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'], ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle']],
};
// 每一項姿勢檢查對應到骨架的哪一部分
export const CHECK_GROUPS = { depth: ['legs'], trunk: ['torso'], balance: ['torso', 'legs'], tempo: [], arms: ['arms'], legs: ['legs'], sym: ['arms'], height: ['legs'], lean: ['torso'] };

// 影像（寬高比 aspect）放進 cw × ch 的畫框、保持比例、置中（同 CSS object-fit: contain）
export function fitRect(cw, ch, aspect) {
  let w = cw, h = cw / aspect;
  if (h > ch) { h = ch; w = ch * aspect; }
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

// kp：鏡像正規化座標的關節；rect：影像在畫布上的位置；status：{ arms|torso|legs: 'ok'|'warn'|'unknown'|'neutral' }
export function drawBody(ctx, kp, rect, { status = {}, width = 6, labels = null, minV = 0.3 } = {}) {
  if (!kp) return;
  const P = (n) => (kp[n] && kp[n].v > minV ? [rect.x + kp[n].x * rect.w, rect.y + kp[n].y * rect.h] : null);
  const s = Math.max(rect.h / 600, 0.6);
  ctx.save();
  ctx.lineCap = 'round';
  for (const [g, bones] of Object.entries(BONES)) {
    const st = status[g] || 'neutral';
    ctx.strokeStyle = COLORS[st];
    ctx.lineWidth = width * s * (st === 'warn' ? 1.4 : 1);
    ctx.setLineDash(st === 'unknown' ? [10 * s, 8 * s] : []);
    for (const [a, b] of bones) {
      const A = P(a), B = P(b);
      if (!A || !B) continue;
      // 看不太清楚的關節畫淡一點（誠實顯示：這裡是猜的）
      ctx.globalAlpha = Math.min(kp[a].v, kp[b].v) < 0.6 ? 0.45 : 1;
      ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.setLineDash([]);
  for (const n of ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle']) {
    const A = P(n);
    if (!A) continue;
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = kp[n].v < 0.6 ? 0.4 : 0.9;
    ctx.beginPath(); ctx.arc(A[0], A[1], 4.5 * s, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const N = P('nose'), L = P('leftShoulder'), R = P('rightShoulder');
  if (N) {
    const r = L && R ? Math.max(Math.hypot(R[0] - L[0], R[1] - L[1]) * 0.33, 12 * s) : 18 * s;
    ctx.strokeStyle = COLORS.head; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.arc(N[0], N[1], r, 0, 7); ctx.stroke();
  }
  // 除錯：在關節旁邊標角度
  if (labels) {
    ctx.font = `${Math.round(15 * s)}px ui-monospace, monospace`;
    ctx.textBaseline = 'middle';
    for (const { at, text } of labels) {
      const A = P(at);
      if (!A || !text) continue;
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(A[0] + 10, A[1] - 11 * s, w, 22 * s);
      ctx.fillStyle = '#ffe28a'; ctx.fillText(text, A[0] + 14, A[1]);
    }
  }
  ctx.restore();
}

// 依最近一次結果與目前視角，決定骨架每一部分的顏色
export function groupStatus(checkList, recent) {
  const st = { arms: 'neutral', torso: 'neutral', legs: 'neutral' };
  const seen = { arms: [], torso: [], legs: [] };
  for (const c of checkList) for (const g of CHECK_GROUPS[c.code] || []) seen[g].push(c);
  for (const g of Object.keys(st)) {
    const cs = seen[g];
    if (!cs.length) continue;
    if (cs.every((c) => c.level === 'none')) { st[g] = 'unknown'; continue; }
    if (!recent) continue;
    const rs = cs.map((c) => recent.find((r) => r.code === c.code)).filter((r) => r && r.score != null && r.conf >= 0.5);
    if (rs.some((r) => !r.ok)) st[g] = 'warn';
    else if (rs.length) st[g] = 'ok';
  }
  return st;
}
