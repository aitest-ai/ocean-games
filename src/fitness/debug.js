// 除錯畫面（網址加 ?debug）：讓不熟程式的人也看得出「哪裡判錯」。
//   - 狀態機現在在哪一步、用力程度和三條門檻
//   - 即時關節角度、各部位看得清不清楚
//   - 視角判斷與每一項檢查的可信度
//   - 最近的事件（算一下、沒到位、提示）
// 另外可以錄下骨架（只有座標數字）或載入骨架檔重播，方便把真機的問題帶回來重現。
import { CONF_TEXT, VIEW_NAMES } from '../../packages/taikan-kit/src/exercise/index.js';

const STATE_TEXT = { top: '休息姿勢（等待開始）', moving: '動作中（還沒到位）', reached: '已到位（等回到休息姿勢）' };
const STATUS_NAME = { ok: '正常', lost: '看不到人', crowd: '兩個人', cut: '超出畫面', noFeet: '看不到腳', noHands: '看不到手', tooFar: '太遠', wrongView: '視角不對', baseline: '等待量站姿' };
const r = (x, d = 0) => (x == null || !isFinite(x) ? '—' : (+x).toFixed(d));

export function renderDebug(el, { analyzer, frame, log, calib, source, kit }) {
  if (!el || el.hidden) return;
  const f = frame?.f;
  const th = frame?.thresholds;
  const bar = (m) => {
    if (m == null || !th) return '<div class="dbar"><i style="width:0"></i></div>';
    const X = (v) => `${Math.min(Math.max(v / 1.4, 0), 1) * 100}%`;
    return `<div class="dbar"><i style="width:${X(m)}"></i><b style="left:${X(th.release)}" title="回到休息">↩</b><b style="left:${X(th.start)}" title="開始">▶</b><b style="left:${X(th.count)}" title="到位">✓</b><b class="tg" style="left:${X(1)}" title="個人目標">★</b></div>`;
  };
  const rows = f ? [
    ['膝角 左／右', `${r(f.kneeL)}° / ${r(f.kneeR)}°`],
    ['髖角 左／右', `${r(f.hipL)}° / ${r(f.hipR)}°`],
    ['軀幹傾斜', `${r(f.trunk, 1)}°（正面＝左右歪、側面＝前傾）`],
    ['手臂側舉 左／右', `${r(f.armL)}° / ${r(f.armR)}°`],
    ['腿外展 左／右', `${r(f.legL, 1)}° / ${r(f.legR, 1)}°`],
    ['兩腳距離', `${r(f.spread, 2)} 肩寬`],
    ['髖左右偏移', `${r(f.shift, 2)} 肩寬`],
    ['寬高比（猜視角）', `${r(f.widthRatio, 2)}`],
  ] : [];
  const vis = f ? Object.entries({ 頭: f.vis.head, 肩: f.vis.shoulders, 髖: f.vis.hips, 膝: f.vis.knees, 踝: f.vis.ankles, 手腕: f.vis.wrists }).map(([k, v]) => `<span class="${v >= 0.7 ? 'g' : v >= 0.45 ? 'y' : 'r'}">${k} ${r(v * 100)}</span>`).join(' ') : '';
  const checks = analyzer ? analyzer.checkList().map((c) => `<tr><td>${c.label}</td><td class="lv-${c.level}">${CONF_TEXT[c.level]}（${r(c.conf * 100)}%）</td><td>${c.last ? `${c.last.value}${c.last.score != null ? `・${r(c.last.score * 100)}分` : ''}` : '—'}</td></tr>`).join('') : '';
  const exp = analyzer ? (analyzer.def.experimental || []).map((x) => `<li><b>${x.label}</b>：${x.why}</li>`).join('') : '';
  const b = frame?.base;
  const st = kit?.stats;
  el.innerHTML = `
    <h3>🔧 除錯畫面 <small>（網址有 ?debug 才會出現）</small></h3>
    ${calib ? `<p><b>校正中</b>：${calib.phase === 'stand' ? '量站姿' : calib.phase === 'rom' ? '量舒服幅度' : '完成'}・${r(calib.progress * 100)}%<br>${calib.msg}</p>` : ''}
    <p><b>追蹤</b>：${STATUS_NAME[frame?.status] || '—'}　<b>來源</b>：${source || '—'}　<b>骨架</b>：${frame?.fps ?? '—'} 格/秒${st ? `（鏡頭 ${st.fps} 格/秒、推論 ${r(st.inferMs)} ms）` : ''}</p>
    <p><b>視角</b>：${frame ? `${VIEW_NAMES[frame.view]}（估計轉了 ${frame.yaw}°）` : '—'}　<b>算次數可信度</b>：<span class="lv-${frame?.countLevel}">${frame ? CONF_TEXT[frame.countLevel] : '—'}</span></p>
    <p><b>狀態機</b>：${frame ? (frame.armed ? STATE_TEXT[frame.state] : '等你回到休息姿勢才開始算') : '—'}${frame?.stateMs != null ? `（${r(frame.stateMs / 1000, 1)} 秒）` : ''}</p>
    <p><b>用力程度</b> ${r(frame?.m, 2)}（1 = 個人目標）${bar(frame?.m)}<small>門檻：開始 ${r(th?.start, 2)}・到位 ${r(th?.count, 2)}・回到休息 ${r(th?.release, 2)}（遲滯：回到休息的門檻比開始低，抖動不會重複算）</small></p>
    <p><b>次數</b>：${frame?.reps ? `${frame.reps.total}${analyzer?.def.perSide ? `（左 ${frame.reps.left}・右 ${frame.reps.right}）` : ''}・沒到位 ${frame.reps.partial}` : '—'}　<b>個人目標</b>：${analyzer?.def.calib ? analyzer.def.calib.show(frame?.target ?? 0) : '（不需要）'}</p>
    <table class="dt">${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    <p class="vis"><b>看得清楚程度</b>：${vis}</p>
    <table class="dt"><tr><th>姿勢檢查</th><th>這個視角的可信度</th><th>上一下</th></tr>${checks}</table>
    ${exp ? `<details><summary>不提示的項目與原因</summary><ul>${exp}</ul></details>` : ''}
    <p><b>站姿基準</b>：${b ? `軀幹/腳 ${r(b.q0T, 2)}・肩寬比 ${r(b.r0, 2)}・手機歪 ${r(b.trunk0, 1)}°・兩腳 ${r(b.spread0, 2)}` : '還沒量'}</p>
    <div class="dlog">${(log || []).slice(-8).reverse().map((x) => `<div>${x}</div>`).join('')}</div>
    <div class="dbtns"><button data-dbg="rec">⏺ 錄骨架 10 秒</button><label class="btn">📂 載入骨架檔重播<input type="file" accept=".json" data-dbg="load" hidden></label></div>`;
}
