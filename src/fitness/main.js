// 居家徒手訓練教練（fitness/index.html 的進入點）
//
// 流程：安全檢查 → 選單 → 擺好手機＋校正（站直量基準、第一次再量舒服的幅度）→ 倒數 → 做一組 → 結果
// 輸入：kit.on('pose') 的原始關節點 → 動作分析器（packages/taikan-kit/src/exercise/）→ 次數、提示、可信度。
// 沒有鏡頭時用「鍵盤模擬」：按鍵讓合成人體做動作，走跟鏡頭一樣的辨識流程。
import { createTaikan } from '../../packages/taikan-kit/src/index.js';
import { ExerciseAnalyzer, Calibrator, EXERCISES, VIEW_NAMES, CONF_TEXT, SynthPerson } from '../../packages/taikan-kit/src/exercise/index.js';
import { FitnessSim, SIM_KEYS, variantNames } from './sim.js';
import { drawBody, fitRect, groupStatus } from './mirror.js';
import { renderDebug } from './debug.js';
import { Sfx } from './audio.js';
import { load, save, loadProfile, saveTarget, clearAll } from './store.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const REP_CHOICES = { squat: [5, 8, 10, 12, 15], jack: [10, 15, 20, 30], legRaise: [5, 8, 10, 12] };
const SET_LIMIT_MS = 4 * 60 * 1000; // 一組最多 4 分鐘（鼓勵休息）

const settings = { input: 'camera', exercise: 'squat', showVideo: true, sound: true, reps: { squat: 10, jack: 20, legRaise: 8 }, ...load('settings', {}) };
if (params.get('input') === 'keyboard') settings.input = 'keyboard';
const persist = () => save('settings', settings);

const kit = createTaikan();
window.kit = kit;
const sfx = new Sfx();
sfx.on = settings.sound;
let sim = null, analyzer = null, calibrator = null, baseline = null;
let phase = 'safety';
let lastPose = null, frame = null, recent = null, recentAt = 0;
let setStart = 0, setLog = [], hintsGiven = [];
const log = [];
const logLine = (s) => { log.push(`${new Date().toLocaleTimeString('zh-TW', { hour12: false })} ${s}`); if (log.length > 40) log.shift(); };
window.fitness = { get analyzer() { return analyzer; }, get calibrator() { return calibrator; }, get sim() { return sim; }, get phase() { return phase; }, get frame() { return frame; } };

if (DEBUG) { document.body.classList.add('has-debug'); $('debug').hidden = false; $('mDebug').href = '?'; $('mDebug').textContent = '關閉除錯畫面'; }

// ── 畫面切換 ──
const OVERLAYS = ['safety', 'menu', 'summary', 'pause'];
function show(id) {
  for (const o of OVERLAYS) $(o).hidden = o !== id;
  $('setup').hidden = id !== 'setup';
  $('simKeys').hidden = !sim || !(id === 'setup' || id === null);
}

// ── 安全檢查 ──
const boxes = [...document.querySelectorAll('#safetyList input')];
for (const b of boxes) b.onchange = () => { $('safetyOk').disabled = !boxes.every((x) => x.checked); };
$('safetyOk').onclick = () => { save('safetyAck', new Date().toISOString().slice(0, 10)); phase = 'menu'; show('menu'); };
$('mSafety').onclick = () => { phase = 'safety'; show('safety'); };

// ── 選單 ──
const demos = [];
function buildMenu() {
  $('exGrid').innerHTML = Object.values(EXERCISES).map((d) => `
    <button class="excard" data-ex="${d.id}" aria-pressed="${settings.exercise === d.id}">
      <canvas width="180" height="240" data-demo="${d.id}" aria-hidden="true"></canvas>
      <div><b>${d.icon} ${d.name}</b>
        <span>手機放：<b>${VIEW_NAMES[d.bestView]}</b>${d.bestView === 'side' ? '（正面也可以）' : ''}</span>
        <span>檢查：${d.checks.map((c) => c.label).join('、')}</span></div>
    </button>`).join('');
  demos.length = 0;
  for (const cv of document.querySelectorAll('canvas[data-demo]')) demos.push(makeDemo(cv, cv.dataset.demo));
  $('exGrid').onclick = (e) => {
    const b = e.target.closest('.excard');
    if (!b) return;
    settings.exercise = b.dataset.ex; persist();
    for (const x of document.querySelectorAll('.excard')) x.setAttribute('aria-pressed', x === b);
    syncMenu();
  };
  seg('mInput', settings.input, (v) => { settings.input = v; persist(); syncMenu(); });
  for (const box of document.querySelectorAll('[data-set]')) {
    box.checked = !!settings[box.dataset.set];
    box.onchange = () => { settings[box.dataset.set] = box.checked; sfx.on = settings.sound; persist(); };
  }
  $('mReps').onchange = (e) => { settings.reps[settings.exercise] = Number(e.target.value); persist(); };
  syncMenu();
}
function seg(id, value, onPick) {
  const el = $(id);
  const sync = (v) => { for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.v === v); };
  sync(value);
  el.onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { sync(v); onPick(v); } };
}
function syncMenu() {
  const d = EXERCISES[settings.exercise];
  const unit = d.perSide ? '下（每邊）' : '下';
  $('mReps').innerHTML = REP_CHOICES[d.id].map((n) => `<option value="${n}" ${settings.reps[d.id] === n ? 'selected' : ''}>${n} ${unit}</option>`).join('');
  $('mInputNote').innerHTML = settings.input === 'camera'
    ? `手機或平板立好，${d.placement}`
    : '用鍵盤（或畫面上的按鈕）讓模擬人做動作，走的是和鏡頭一樣的辨識流程，可以試「標準」和「常見錯誤」。';
  const prof = loadProfile();
  $('mCalib').innerHTML = Object.values(EXERCISES).filter((x) => x.calib).map((x) => {
    const v = prof.targets[x.calib.key];
    return `${x.name}：${v != null ? `你的舒服幅度 <b>${x.calib.show(v)}</b>（${prof.updated[x.calib.key]} 量的）` : '還沒量過（第一次會先量 3 下）'}`;
  }).join('<br>') + '<br>每次開始都會先「站直 2 秒」量你的站姿（手機每次擺的位置都不一樣）。';
}

// 選單卡片與擺放畫面的小示範：合成人體反覆做標準動作（從建議的手機位置看過去）
function makeDemo(cv, ex, yaw) {
  const d = EXERCISES[ex];
  const P = new SynthPerson({ seed: 2, jitter: 0, sway: 0, camera: { yaw: yaw ?? (d.bestView === 'side' ? 90 : 0), aspect: cv.width / cv.height, distance: 2.9 } });
  const motion = { squat: 'squat', jack: 'jack', legRaise: 'legRaise' }[ex];
  let side = 'left';
  return {
    cv, P,
    draw(now) {
      if (!P.busy()) { P.play(motion, ex === 'legRaise' ? { side } : {}); side = side === 'left' ? 'right' : 'left'; P.play('squat', { depth: 0 }, ex === 'jack' ? 200 : 700); }
      const pose = P.step(now);
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, cv.width, cv.height);
      drawBody(ctx, pose.kp, { x: 0, y: 0, w: cv.width, h: cv.height }, { width: 5 });
    },
  };
}

$('mClear').onclick = () => {
  if (!confirm('確定要清除這台裝置上的設定、個人校正與紀錄嗎？')) return;
  clearAll();
  location.reload();
};

// ── 開始一組 ──
$('mStart').onclick = startSet;
$('rAgain').onclick = startSet;
$('rMenu').onclick = toMenu;
$('sBack').onclick = toMenu;
$('pQuit').onclick = toMenu;
$('hEnd').onclick = () => endSet('manual');
$('hPause').onclick = () => pause('暫停', '休息一下、喝口水，準備好再繼續。');
$('pResume').onclick = resume;
$('hStop').onclick = () => {
  endSet('stop');
  $('rTitle').textContent = '先停下來休息';
  $('rBody').innerHTML = `<p class="sub">做得對：<b>不舒服就停</b>是最重要的安全規則。</p>
    <ul style="text-align:left;line-height:1.7"><li>先坐下或躺下休息、慢慢深呼吸、喝點水。</li>
    <li>如果有<b>胸痛、胸悶、呼吸困難、頭暈想吐</b>，或疼痛沒有很快消退，請立刻尋求醫療協助。</li>
    <li>關節或肌肉疼痛：今天先不要再練這個動作，之後仍會痛請諮詢醫師或物理治療師。</li></ul>`;
};

async function ensureInput() {
  const want = settings.input;
  if (want === 'keyboard') {
    if (kit.source !== 'keyboard' || !sim) {
      sim = new FitnessSim({ exercise: settings.exercise, onInfo: (t) => bubble(t, 'praise', '鍵盤模擬') });
      await kit.use(sim);
    }
    sim.setExercise(settings.exercise);
    sim.setView(0); // 先面向鏡頭量站姿
    $('video').classList.add('hide');
  } else {
    sim = null;
    if (kit.source !== 'camera') await kit.useCamera({ video: $('video'), onStatus: (t) => { $('mStatus').textContent = t; } });
    $('video').classList.toggle('hide', !settings.showVideo);
  }
  $('hSource').textContent = settings.input === 'camera' ? '📷 鏡頭' : '⌨️ 鍵盤模擬';
}

function aspectNow() {
  if (kit.source === 'camera') { const v = $('video'); return v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 0.75; }
  if (kit.source === 'replay') return replayAspect;
  return sim?.aspect ?? 0.75;
}

async function startSet() {
  persist();
  await sfx.enable();
  $('mStatus').textContent = '';
  try { await ensureInput(); }
  catch (err) {
    phase = 'menu'; show('menu');
    $('mStatus').textContent = '⚠️ 無法使用鏡頭：' + (err.name === 'NotAllowedError' ? '請在瀏覽器允許使用鏡頭' : err.name === 'NotFoundError' ? '找不到鏡頭' : err.message) + '。可以先改用鍵盤模擬。';
    return;
  }
  const d = EXERCISES[settings.exercise];
  const prof = loadProfile();
  const needRom = !!d.calib && ($('mRecal').checked || prof.targets[d.calib.key] == null);
  calibrator = new Calibrator({ exercise: d.id, rom: needRom, emit: onCalibEvent });
  analyzer = null; recent = null;
  phase = 'setup';
  show('setup');
  $('hud').hidden = true;
  $('sTitle').textContent = `${d.icon} ${d.name}：擺好手機`;
  $('sPlace').innerHTML = d.placement;
  $('sStep').textContent = needRom ? '第 1 步：面向鏡頭站直不動 2 秒　第 2 步：做幾下「舒服幅度」的動作' : '面向鏡頭站直不動 2 秒，就會開始。';
  $('sSkipRom').hidden = true;
  setupDemo = makeDemo($('demoCv'), d.id);
  $('demoCap').textContent = `手機放${VIEW_NAMES[d.bestView]}時，畫面會像這樣`;
  logLine(`開始：${d.name}（${needRom ? '量站姿＋舒服幅度' : '量站姿'}）`);
}
let setupDemo = null;

function onCalibEvent(e) {
  if (e.type === 'calib') { $('sMsg').textContent = e.msg; logLine('校正：' + e.msg); }
  if (e.type === 'baseline') {
    baseline = e.baseline;
    sfx.play('calib');
    const d = EXERCISES[settings.exercise];
    if (calibrator.phase === 'rom') {
      $('sTitle').textContent = `${d.icon} ${d.name}：量你舒服的幅度`;
      $('sStep').textContent = d.calib.prompt + (d.bestView === 'side' ? '（建議先轉成側身再做）' : '');
      $('sSkipRom').hidden = false;
      if (sim && d.bestView === 'side') setTimeout(() => sim?.setView(90), 1200);
    }
  }
  if (e.type === 'calibrated') {
    const d = EXERCISES[settings.exercise];
    if (e.targetKey && e.used === 'measured') saveTarget(e.targetKey, e.target);
    logLine(`校正完成：${e.targetKey ? `${d.calib.show(e.target)}（${e.used === 'measured' ? '量到的' : '預設'}）` : '站姿'}`);
    setTimeout(() => beginCountdown(), 900);
  }
}
$('sSkipRom').onclick = () => { if (calibrator?.phase === 'rom') calibrator.finish(lastPose?.t ?? 0, false); };

function beginCountdown() {
  const d = EXERCISES[settings.exercise];
  analyzer = new ExerciseAnalyzer({ exercise: d.id, profile: loadProfile(), base: baseline, emit: onAnalyzerEvent });
  setLog = []; hintsGiven = []; recent = null;
  phase = 'count';
  show(null);
  $('hud').hidden = false;
  $('hEx').textContent = `${d.icon} ${d.name}`;
  updateCounter();
  if (sim && d.bestView === 'side') sim.setView(90);
  const turn = d.bestView === 'side' && kit.source === 'camera' ? '可以轉成側身了' : '';
  let n = turn ? 5 : 3;
  const el = $('count');
  el.hidden = false; el.textContent = n;
  if (turn) bubble(turn, 'praise', '側面最看得清楚蹲的深度和上半身角度');
  clearInterval(beginCountdown.timer);
  beginCountdown.timer = setInterval(() => {
    n--;
    if (n > 0) { el.textContent = n; sfx.play('tick'); }
    else { clearInterval(beginCountdown.timer); el.textContent = '開始！'; sfx.play('go'); phase = 'train'; setStart = performance.now(); setTimeout(() => { el.hidden = true; }, 700); }
  }, 900);
}

function onAnalyzerEvent(e) {
  if (phase !== 'train') return;
  const d = analyzer.def;
  if (e.type === 'rep') {
    setLog.push(e);
    recent = e.results; recentAt = performance.now();
    sfx.play(e.good ? 'good' : 'rep');
    const c = document.querySelector('.counter');
    c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    updateCounter();
    $('hQuality').innerHTML = e.quality == null ? '' : `上一下：<b>${Math.round(e.quality * 100)}</b> 分${e.good ? ' 👍' : ''}`;
    logLine(`算一下 #${e.n}${e.side ? `（${e.side === 'left' ? '左' : '右'}）` : ''} 品質 ${e.quality ?? '—'}・${(e.durationMs / 1000).toFixed(1)} 秒${e.issues.length ? '・' + e.issues.join(',') : ''}`);
    const target = settings.reps[d.id];
    const done = d.perSide ? analyzer.reps.left >= target && analyzer.reps.right >= target : analyzer.reps.total >= target;
    if (done) setTimeout(() => endSet('done'), 900);
  } else if (e.type === 'partial') {
    recent = e.results; recentAt = performance.now();
    sfx.play('partial');
    logLine('沒到位（不算）');
  } else if (e.type === 'hint') {
    if (e.kind === 'tip') hintsGiven.push(e.code);
    sfx.play(e.kind === 'praise' ? 'combo' : 'hint');
    bubble(e.text, e.kind, e.kind === 'tip' ? `這項判斷的可信度：${CONF_TEXT[e.level]}` : '');
    logLine(`提示：${e.text}`);
  } else if (e.type === 'status') logLine(`追蹤：${e.code}`);
  else if (e.type === 'view') logLine(`視角：${VIEW_NAMES[e.view]}（${e.yaw}°）`);
}

let bubbleTimer;
function bubble(text, kind = 'tip', sub = '') {
  const el = $('hBubble');
  el.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
  el.className = `bubble show ${kind}`;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => { el.className = `bubble ${kind}`; }, kind === 'tip' ? 3200 : 2000);
}

function updateCounter() {
  const d = EXERCISES[settings.exercise], target = settings.reps[d.id];
  const r = analyzer?.reps || { total: 0, left: 0, right: 0 };
  if (d.perSide) {
    $('hCount').textContent = r.total;
    $('hTarget').textContent = `/ ${target * 2}`;
    $('hSides').textContent = `左 ${r.left}・右 ${r.right}（每邊 ${target} 下）`;
  } else { $('hCount').textContent = r.total; $('hTarget').textContent = `/ ${target}`; $('hSides').textContent = ''; }
}

function pause(title, text) {
  if (phase !== 'train' && phase !== 'count') return;
  phase = 'paused';
  clearInterval(beginCountdown.timer); $('count').hidden = true;
  $('pTitle').textContent = title; $('pText').textContent = text;
  show('pause');
}
function resume() {
  if (phase !== 'paused') return;
  show(null);
  analyzer.counter.interrupt(); // 回來後要先站好才開始算
  phase = 'train';
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause('暫停', '切到別的畫面時自動暫停。'); });

function endSet(reason) {
  if (!['train', 'count', 'paused'].includes(phase)) return;
  clearInterval(beginCountdown.timer); $('count').hidden = true;
  phase = 'summary';
  $('hud').hidden = true;
  const d = EXERCISES[settings.exercise];
  const n = setLog.length;
  const qs = setLog.map((e) => e.quality).filter((q) => q != null);
  const avg = qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null;
  const good = setLog.filter((e) => e.good).length;
  const secs = Math.round((performance.now() - setStart) / 1000);
  const tips = [...new Set(hintsGiven)].map((c) => d.checks.find((x) => x.code === c)?.hint || '每一下都要先回到起始姿勢').filter(Boolean);
  // 每一項檢查：這組的平均分數與可信度
  const rows = d.checks.map((c) => {
    const rs = setLog.map((e) => e.results.find((x) => x.code === c.code)).filter((x) => x && x.score != null && x.conf >= 0.5);
    const lv = setLog.map((e) => e.results.find((x) => x.code === c.code)?.level).filter(Boolean);
    const level = lv.includes('high') ? 'high' : lv.includes('mid') ? 'mid' : lv.includes('low') ? 'low' : 'none';
    return `<tr><td>${c.label}</td><td>${rs.length ? Math.round((rs.reduce((a, x) => a + x.score, 0) / rs.length) * 100) + ' 分' : '—'}</td><td class="lv-${level}">${CONF_TEXT[level]}</td></tr>`;
  }).join('');
  $('rTitle').textContent = reason === 'done' ? '這組完成！' : reason === 'time' ? '這組時間到，休息一下' : '這組結束';
  $('rBody').innerHTML = `
    <div class="bigstat"><div><b>${n}</b><span>算到的次數</span></div><div><b>${good}</b><span>標準的次數</span></div><div><b>${avg == null ? '—' : Math.round(avg * 100)}</b><span>平均品質</span></div><div><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b><span>時間</span></div></div>
    <table><tr><th>姿勢檢查</th><th>平均</th><th>可信度</th></tr>${rows}</table>
    ${tips.length ? `<p class="sub">下次可以注意：${tips.map((x) => `<br>・${x}`).join('')}</p>` : n ? '<p class="sub">姿勢都很好！</p>' : ''}
    <p class="note">「可信度：這個角度看不到」的項目沒有被檢查（不是做錯）。品質分數只是鏡頭看得到的部分，不代表動作一定完全正確。休息 1～2 分鐘、喝口水再做下一組。</p>`;
  show('summary');
  sfx.play('done');
  logLine(`一組結束：${n} 下（${reason}）`);
}

function toMenu() {
  clearInterval(beginCountdown.timer); $('count').hidden = true;
  phase = 'menu'; analyzer = null; calibrator = null;
  $('hud').hidden = true;
  show('menu'); syncMenu();
}

// ── 鍵盤模擬的畫面按鈕 ──
$('simKeys').innerHTML = SIM_KEYS.map((k) => `<button data-act="${k.act}" title="${k.text}"><kbd>${k.label}</kbd>${k.short}</button>`).join('');
$('simKeys').onclick = (e) => { const b = e.target.closest('button'); if (b && sim) sim.press(b.dataset.act); };
function syncSimLabels() {
  const n = variantNames(settings.exercise);
  for (const b of $('simKeys').querySelectorAll('button')) {
    const k = SIM_KEYS.find((x) => x.act === b.dataset.act);
    b.innerHTML = `<kbd>${k.label}</kbd>${n[k.act] || k.short}`;
    b.title = k.text + (n[k.act] ? `：${n[k.act]}` : '');
  }
}

// ── 骨架資料進來 ──
kit.on('pose', (pose) => {
  lastPose = pose;
  const aspect = aspectNow();
  if (phase === 'setup' && calibrator) calibrator.feed(pose, { aspect });
  else if ((phase === 'train' || phase === 'count') && analyzer) {
    frame = analyzer.feed(pose, { aspect });
    if (phase === 'train' && performance.now() - setStart > SET_LIMIT_MS) endSet('time');
  }
});

// ── 錄骨架／重播（除錯用） ──
let replayAspect = 0.75;
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-dbg="rec"]')) {
    kit.recorder.start();
    logLine('開始錄骨架 10 秒（只有座標數字）');
    setTimeout(() => {
      const clip = kit.recorder.stop(`fitness-${settings.exercise}`);
      clip.aspect = aspectNow(); clip.exercise = settings.exercise;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(clip)], { type: 'application/json' }));
      a.download = `fitness-${settings.exercise}-${Date.now()}.json`;
      a.click();
      logLine(`錄好了：${clip.frames.length} 格`);
    }, 10000);
  }
});
document.addEventListener('change', async (e) => {
  const inp = e.target.closest('[data-dbg="load"]');
  if (!inp || !inp.files[0]) return;
  const clip = JSON.parse(await inp.files[0].text());
  replayAspect = clip.aspect || 0.75;
  if (clip.exercise && EXERCISES[clip.exercise]) settings.exercise = clip.exercise;
  await kit.useReplay(clip, { loop: false });
  sim = null;
  $('video').classList.add('hide');
  logLine(`重播骨架檔：${clip.name}（${clip.frames.length} 格）`);
  if (phase === 'menu') { settings.input = 'replay'; startSetReplay(); }
});
async function startSetReplay() {
  const d = EXERCISES[settings.exercise];
  calibrator = new Calibrator({ exercise: d.id, rom: false, emit: onCalibEvent });
  phase = 'setup'; show('setup');
}

// ── 每一格畫面 ──
const cv = $('overlay'), ctx = cv.getContext('2d');
let lastDebug = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // 擺放／校正時，畫面放在說明面板以外的地方（看得到自己的全身）
  let rect;
  const sh = $('setup');
  if (!sh.hidden) {
    const box = sh.querySelector('.sheet-in').getBoundingClientRect();
    if (box.width > W * 0.6) { rect = fitRect(W, box.top - 6, aspectNow()); rect.y = Math.max(rect.y, 0); }
    else { rect = fitRect(W - box.right, H, aspectNow()); rect.x += box.right; }
  } else rect = fitRect(W, H, aspectNow());
  const v = $('video');
  if (kit.source === 'camera') Object.assign(v.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' });
  if (kit.source !== 'camera' || !settings.showVideo) {
    // 沒有影像時畫出「鏡頭畫面」的範圍，看得出人有沒有超出畫面
    ctx.strokeStyle = 'rgba(160,200,230,0.25)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2); ctx.setLineDash([]);
  }
  if (lastPose && phase !== 'menu' && phase !== 'safety') {
    let status = {};
    if (analyzer && (phase === 'train' || phase === 'count')) status = groupStatus(analyzer.checkList(), now - recentAt < 2500 ? recent : null);
    let kp = lastPose.kp;
    // 用分析器平滑過的關節畫（比較不抖），座標換回正規化
    const pts = frame?.pts;
    if (pts && analyzer && phase !== 'setup') { const a = aspectNow(); kp = {}; for (const [n, p] of Object.entries(pts)) kp[n] = { x: p.x / a, y: p.y, v: p.v }; }
    drawBody(ctx, kp, rect, { status, labels: DEBUG ? debugLabels(frame?.f) : null });
  }
  if (phase === 'menu') for (const d of demos) d.draw(now);
  if (phase === 'setup' && setupDemo) setupDemo.draw(now);
  if (phase === 'setup' && calibrator) {
    const st = calibrator.state();
    $('sRing').style.strokeDashoffset = 100 - st.progress * 100;
    if (st.msg !== $('sMsg').textContent) $('sMsg').textContent = st.msg;
  }
  if (phase === 'train' || phase === 'count') hudUpdate();
  if (DEBUG && now - lastDebug > 120) {
    lastDebug = now;
    renderDebug($('debug'), { analyzer, frame: analyzer ? frame : null, log, calib: phase === 'setup' ? calibrator?.state() : null, source: kit.source, kit });
  }
}

function debugLabels(f) {
  if (!f) return null;
  const n = f.near === 'L' ? 'left' : 'right';
  const deg = (x) => (x == null ? null : `${Math.round(x)}°`);
  return [
    { at: `${n}Knee`, text: f.knee != null ? `膝 ${deg(f.knee)}` : null },
    { at: `${n}Hip`, text: f.trunk != null ? `軀幹 ${deg(f.trunk)}` : null },
    { at: 'leftShoulder', text: f.armL != null ? `手 ${deg(f.armL)}` : null },
    { at: 'leftAnkle', text: f.legL != null ? `腿 ${deg(f.legL)}` : null },
  ];
}

let lastChecksHtml = '';
function hudUpdate() {
  if (!analyzer || !frame) return;
  const d = analyzer.def;
  $('hView').textContent = VIEW_NAMES[frame.view];
  const best = d.views[frame.view] >= 0.95 ? '（最適合）' : d.views[frame.view] === 0 ? '（看不到這個動作）' : '';
  $('hViewConf').innerHTML = `算次數可信度 <span class="lv-${frame.countLevel}">${CONF_TEXT[frame.countLevel]}</span><span class="best">${best}</span>`;
  const st = frame.status;
  const banner = $('hBanner');
  const text = st && st !== 'ok' && st !== 'tooFar' ? (analyzer.status === st ? statusText(st) : '') : st === 'tooFar' ? '離鏡頭有點遠，判斷會比較不準' : '';
  banner.hidden = !text; if (text) banner.textContent = text;
  const now = performance.now();
  const list = analyzer.checkList();
  const html = '<h4>姿勢檢查（可信度）</h4>' + list.map((c) => {
    const r = now - recentAt < 4000 && recent ? recent.find((x) => x.code === c.code) : null;
    const cls = c.level === 'none' ? 'na' : r && r.score != null && r.conf >= 0.5 ? (r.ok ? 'ok' : 'warn') : '';
    const icon = c.level === 'none' ? '—' : cls === 'ok' ? '✓' : cls === 'warn' ? '!' : '·';
    const sub = c.level === 'none' ? `這個角度看不到${c.viewOnly ? `（請改放${VIEW_NAMES[c.code === 'trunk' ? 'side' : 'front']}）` : ''}` : `可信度 ${CONF_TEXT[c.level]}${r && r.score != null ? `・${r.value}` : ''}`;
    return `<div class="ck ${cls}"><i>${icon}</i><b>${c.label}</b><small class="lv-${c.level}">${sub}</small></div>`;
  }).join('');
  if (html !== lastChecksHtml) { $('hChecks').innerHTML = html; lastChecksHtml = html; }
}
function statusText(code) {
  const map = { lost: '看不到你，請回到畫面中', crowd: '畫面裡有兩個人，請只留一位', cut: '身體超出畫面：請往後退，或把手機放遠、放低', noFeet: '看不到腳：請往後退一點，或把手機放低', noHands: '看不到雙手：請往後退一點', baseline: '請站直、雙手放下，不動 2 秒' };
  if (code === 'wrongView') { const d = analyzer.def; return `${d.name}要${VIEW_NAMES[d.bestView]}對著鏡頭才看得到，請${d.bestView === 'side' ? '轉成側身' : '轉向鏡頭'}`; }
  return map[code] || '';
}

// ── 啟動 ──
buildMenu();
syncSimLabels();
new MutationObserver(syncSimLabels).observe($('exGrid'), { attributes: true, subtree: true, attributeFilter: ['aria-pressed'] });
show('safety');
requestAnimationFrame(loop);
