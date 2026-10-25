// 成績與歷史（階段三）：全部從這台裝置的紀錄算出來，不上傳。
import { EXERCISES } from '../../packages/taikan-kit/src/exercise/exercises.js';
import { LEVELS } from './levels.js';
import { PLANS } from './plans.js';
import { estimateKcal } from './estimate.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtMin = (sec) => `${Math.floor(sec / 60)} 分 ${sec % 60} 秒`;
function nameOf(s) {
  if (s.planId) { const p = PLANS.find((x) => x.id === s.planId); return p?.sessions[s.planIndex]?.name || p?.name || '訓練計畫'; }
  return LEVELS.find((l) => l.id === s.levelId)?.name || s.levelId || '自由練習';
}

// 最近 28 天每天的訓練分鐘數（長條圖，SVG）
function chart(sessions, today) {
  const days = [];
  for (let i = 27; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push(d); }
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const min = days.map((d) => sessions.filter((s) => s.day === key(d)).reduce((a, s) => a + (s.durationSec || 0), 0) / 60);
  const max = Math.max(20, ...min);
  const W = 560, H = 120, bw = W / 28;
  const bars = min.map((m, i) => `<rect x="${i * bw + 2}" y="${H - 18 - (m / max) * (H - 30)}" width="${bw - 4}" height="${(m / max) * (H - 30)}" rx="3" fill="${m ? 'var(--ok)' : 'rgba(255,255,255,0.08)'}"><title>${key(days[i])}：${Math.round(m)} 分鐘</title></rect>`).join('');
  const labels = days.map((d, i) => (d.getDay() === 1 ? `<text x="${i * bw + bw / 2}" y="${H - 3}" font-size="11" fill="currentColor" text-anchor="middle">${d.getMonth() + 1}/${d.getDate()}</text>` : '')).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="最近 28 天每天的訓練分鐘數">${bars}${labels}</svg>`;
}

// 某個動作最近 10 次的平均品質（小折線）
function spark(vals) {
  if (vals.length < 2) return '';
  const W = 120, H = 30;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - 3 - v * (H - 6)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="spark" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2"/></svg>`;
}

export function renderHistory(el, progress, { weight } = {}) {
  const S = progress.d.sessions;
  const total = S.reduce((a, s) => a + (s.durationSec || 0), 0);
  const done = S.filter((s) => s.completed).length;
  const per = {};
  for (const s of S) for (const [ex, n] of Object.entries(s.reps || {})) {
    const p = (per[ex] ||= { reps: 0, good: 0, q: [] });
    p.reps += n; p.good += s.good?.[ex] || 0;
  }
  // 每個動作的品質趨勢：用整次訓練的平均品質（有做那個動作的訓練）
  for (const ex of Object.keys(per)) per[ex].q = S.filter((s) => s.reps?.[ex] && s.avgQuality != null).slice(-10).map((s) => s.avgQuality);
  const kcalAll = weight ? S.map((s) => estimateKcal(s, weight)).filter(Boolean) : [];
  const kSum = kcalAll.reduce((a, k) => ({ low: a.low + k.low, high: a.high + k.high }), { low: 0, high: 0 });
  el.innerHTML = `
    <div class="bigstat"><div><b>${S.length}</b><span>訓練次數（完整 ${done}）</span></div><div><b>${Math.round(total / 60)}</b><span>總分鐘</span></div><div><b>${progress.weekDays()}</b><span>本週天數</span></div><div><b>${progress.d.badges}</b><span>徽章</span></div></div>
    <h2>最近 28 天</h2>${chart(S, new Date(progress.now()))}
    <p class="note">每週練 3 天左右、中間有休息日就很好。不需要每天練。</p>
    <h2>各動作</h2>
    <table><tr><th>動作</th><th>總次數</th><th>標準</th><th>品質趨勢（最近 10 次）</th></tr>
    ${Object.entries(per).map(([ex, p]) => `<tr><td>${EXERCISES[ex]?.icon || ''} ${EXERCISES[ex]?.name || ex}</td><td>${p.reps}${EXERCISES[ex]?.hold ? ' 秒' : ''}</td><td>${p.reps ? Math.round((p.good / p.reps) * 100) : 0}%</td><td>${spark(p.q)}</td></tr>`).join('') || '<tr><td colspan="4">還沒有紀錄</td></tr>'}</table>
    <p class="note">「標準」與品質只算鏡頭看得清楚的項目；看不到的項目沒有被檢查，不代表做錯。</p>
    ${weight ? `<p class="note">🔥 粗估總消耗：約 ${kSum.low}～${kSum.high} 大卡（依你填的體重 ${esc(weight)} 公斤與一般運動強度表估算，<b>誤差可能很大，只供參考</b>，不代表減脂效果）。</p>` : '<p class="note">想看粗估消耗熱量，可以在選單填體重（只存在這台裝置）。</p>'}
    <h2>最近的訓練</h2>
    <table><tr><th>日期</th><th>內容</th><th>時間</th><th>結果</th></tr>
    ${S.slice(-15).reverse().map((s) => `<tr><td>${s.day}</td><td>${esc(nameOf(s))}${s.lowImpact ? '（低衝擊）' : ''}</td><td>${fmtMin(s.durationSec || 0)}</td><td>${s.completed ? '★'.repeat(s.stars || 1) : s.stopped ? '中途休息' : '—'}</td></tr>`).join('') || '<tr><td colspan="4">還沒有紀錄</td></tr>'}</table>`;
}
