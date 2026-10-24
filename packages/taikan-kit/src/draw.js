// 在 2D canvas 上畫骨架（只畫線和點，不碰任何影像）。測試頁、遊戲的說明動畫與角落小窗共用。
const BONES = [['leftShoulder', 'rightShoulder'], ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'], ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'], ['leftHip', 'rightHip'], ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'], ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle']];

// pose: { kp }（鏡像正規化座標）；opts: color 骨架顏色、hand 手腕顏色、labels 是否標「左手／右手」、
// zoom/cx/cy：把骨架放大並以 (cx, cy) 為中心（說明動畫用，讓人偶填滿小畫框）
export function drawSkeleton(ctx, pose, { color = '#63b8ff', hand = '#ffb547', head = '#e8f1f7', labels = false, width = 6, zoom = 1, cx = 0.5, cy = 0.5 } = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  if (!pose || !pose.kp) return;
  const k = pose.kp, s = Math.min(W, H) / 400;
  const P = (n) => (k[n] && k[n].v > 0.25 ? [((k[n].x - cx) * zoom + 0.5) * W, ((k[n].y - cy) * zoom + 0.5) * H] : null);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = width * s * Math.max(zoom * 0.6, 1);
  ctx.strokeStyle = color;
  for (const [a, b] of BONES) {
    const A = P(a), B = P(b);
    if (A && B) { ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.stroke(); }
  }
  for (const n of ['leftWrist', 'rightWrist']) {
    const A = P(n);
    if (A) { ctx.fillStyle = hand; ctx.beginPath(); ctx.arc(A[0], A[1], 9 * s * Math.max(zoom * 0.6, 1), 0, 7); ctx.fill(); }
  }
  const N = P('nose'), L = P('leftShoulder'), R = P('rightShoulder');
  if (N) {
    const r = L && R ? Math.hypot(R[0] - L[0], R[1] - L[1]) * 0.33 : 0.045 * W;
    ctx.strokeStyle = head; ctx.lineWidth = 4 * s * Math.max(zoom * 0.6, 1);
    ctx.beginPath(); ctx.arc(N[0], N[1], r, 0, 7); ctx.stroke();
  }
  if (labels) {
    ctx.fillStyle = '#9bb4c6'; ctx.font = `${13 * s * 2}px system-ui, sans-serif`;
    const lw = P('leftWrist'), rw = P('rightWrist');
    if (lw) ctx.fillText('左手', lw[0] - 34 * s * 2, lw[1] - 10 * s * 2);
    if (rw) ctx.fillText('右手', rw[0] + 8 * s * 2, rw[1] - 10 * s * 2);
  }
  ctx.restore();
}
