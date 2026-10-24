// 道場（dojo/index.html）的遊戲外殼：載入 → 怎麼玩 → 選單 →（鏡頭時）安全確認 → 倒數 → 各段落 ⇄ 暫停 → 結算。
//
// 流程、按鈕位置、「雙手舉高＝開始／暫停」、暫停後倒數 3 秒、看不到人自動暫停、畫質分級與自動降解析度，
// 都跟海洋系列（src/game/shell.js）一樣，學生不用重新學。海洋的外殼綁著海面渲染器，所以道場另外寫一份，
// 不去改動共用外殼（避免跟其他遊戲的開發互相衝突；之後可以再抽出共用部分，見 docs/dojo-plan.md）。
import { createDojo } from './scene.js';
import { Routine, DIFFICULTY } from './routine.js';
import { mountHowto, HOWTO_CSS, drawFigure, DEMO_YAW } from './howto.js';
import { createMartial, MartialPuppet, applyAction } from '../../packages/taikan-kit/martial/index.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TIERS = ['low', 'mid', 'rt'];
if (!TIERS.includes(params.get('q'))) {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  params.set('q', touch ? 'low' : 'mid');
  history.replaceState(null, '', '?' + params);
}
const TIER = params.get('q');

// ── 設定（存在這台裝置；操作方式、靈敏度、坐著玩、減少晃動沿用海洋系列上次的選擇） ──
const KEY = 'dojo.settings';
const defaults = { diff: 'easy', input: 'keyboard', sens: 'normal', sound: false, seated: false, reduceMotion: false, noStance: false, noPunch: false, knee: false, floor: 'tatami' };
const settings = (() => {
  try {
    const shared = JSON.parse(localStorage.getItem('ocean-games.shared') || '{}');
    const { input, sens, seated, reduceMotion } = shared;
    const base = { ...defaults, ...Object.fromEntries(Object.entries({ input, sens, seated, reduceMotion }).filter(([, v]) => v !== undefined)) };
    return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch { return { ...defaults }; }
})();
if (params.get('floor')) settings.floor = params.get('floor');
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch {} };

const style = document.createElement('style');
style.textContent = HOWTO_CSS;
document.head.appendChild(style);

// ── 場景 ──
let dojo;
try {
  dojo = await createDojo($('c'), { tier: TIER, floor: settings.floor, onProgress: (t) => ($('lText').textContent = t) });
} catch (e) {
  $('lText').textContent = '無法啟動 3D 畫面（這台裝置可能不支援 WebGL2）：' + e.message;
  throw e;
}
window.dojo = dojo;
dojo.scale = params.has('scale') ? Number(params.get('scale')) : TIER === 'low' ? 0.7 : TIER === 'mid' ? Math.min(devicePixelRatio || 1, 1) : Math.min(devicePixelRatio || 1, 1.5);
dojo.reduceMotion = settings.reduceMotion;
$('loading').hidden = true;

// ── 輸入：原本的 taikan-kit（舉手開始／暫停、看不到人、兩人同框）＋武術擴充（馬步、出拳、提膝） ──
const M = createMartial({ sensitivity: settings.sens, disabled: settings.knee ? [] : ['knee'] });
const kit = M.kit;
window.martial = M;

// ── 聲音（勾選才有；瀏覽器規定要先點一下） ──
const audio = {
  ctx: null,
  enable(on) { if (on && !this.ctx) this.ctx = new AudioContext(); if (this.ctx) on ? this.ctx.resume() : this.ctx.suspend(); },
  cue(kind) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    if (kind === 'thud') {
      // 打沙包：低頻悶聲＋短短的雜訊
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.15);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.25);
      const n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate * 0.06, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const ng = c.createGain(); ng.gain.value = 0.25; n.buffer = b; n.connect(ng).connect(c.destination); n.start(t);
      return;
    }
    if (kind === 'knock') {
      // 打木樁：清脆的木頭聲
      for (const f of [820, 1240]) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.15); }
      return;
    }
    const notes = { step: [523, 784], perfect: [659, 988], finish: [523, 659, 784, 1047], tick: [440], miss: [196] }[kind] || [440];
    notes.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.09); g.gain.linearRampToValueAtTime(0.1, t + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.4);
      o.connect(g).connect(c.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.5);
    });
  },
};

// ── HUD 小工具 ──
let toastTimer;
function toast(text, kind = '') {
  if (!text) return;
  const el = $('hToast');
  el.textContent = text; el.className = 'toast show ' + kind;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.className = 'toast ' + kind), 900);
}
let actionTimer;
function showAction(text) { $('hAction').textContent = text; clearTimeout(actionTimer); actionTimer = setTimeout(() => ($('hAction').textContent = '—'), 1000); }
$('hKeys').textContent = 'F 左拳・J 右拳・W 張腳/併腳・↓ 蹲・↑ 起・I 前傾・K 膝內夾' + (settings.knee ? '・Z/X 提膝' : '') + '・E 按住＝舉手跳過・Enter 按住＝暫停';

// ── 怎麼玩卡片（依目前設定，關掉的動作不出現） ──
function howtoCards() {
  const s = settings, cards = [];
  if (!s.noStance) cards.push(s.seated
    ? { move: 'stance-seated', title: '坐姿馬步', text: '坐在椅子前半、兩腳張開、背挺直、雙拳收在腰間，保持住', skip: '做不到可以在選單關掉「馬步」' }
    : { move: 'stance', title: '馬步', text: '兩腳張開約兩倍肩寬，膝蓋往外推、慢慢蹲低，上身挺直，保持住', seated: '選單勾「坐著玩」改成坐姿馬步', skip: '蹲不下去可以選「輕鬆」或關掉馬步' });
  if (!s.noPunch) {
    cards.push({ move: 'punch-alt', title: '出拳：打沙包', text: '跟著拍子，拳頭從<b>腰間</b>往前打出去，<b>再收回腰間</b>。左右輪流', seated: '坐著一樣可以出拳', skip: '可以在選單關掉「出拳」' });
    if (!s.noStance && !s.seated) cards.push({ move: 'combo', title: '馬步沖拳：打木樁', text: '蹲著馬步，一邊出拳。沙包和木樁會晃，只是回饋，不用真的打到' });
  }
  if (s.knee && !s.seated) cards.push({ move: 'knee', title: '🧪 提膝（實驗）', text: '膝蓋抬到腰的高度，再慢慢放下。可以扶椅背', skip: '這是實驗功能，預設關閉' });
  cards.push({ move: 'raise-both', title: '雙手舉高 1 秒', text: '開始、暫停、繼續（不用碰平板）' });
  cards.push({ move: 'raise-one', title: '舉單手 1.5 秒', text: '跳過現在這一段（做不到、會痛就跳過）' });
  return cards;
}

// ── 畫面切換：howto → menu →（safety）→ count → play ⇄ paused → result ──
const overlays = ['howto', 'menu', 'safety', 'pause', 'result'];
let state = 'menu', stopHowto = null, howtoReturn = 'menu', safetyOk = false;
function show(id) {
  for (const o of overlays) $(o).hidden = o !== id;
  stopHowto?.(); stopHowto = null;
  if (id === 'howto') stopHowto = mountHowto($('hCards'), howtoCards());
}
function openHowto(from) { howtoReturn = from; state = 'howto'; show('howto'); }
function closeHowto() { if (howtoReturn === 'pause') { state = 'paused'; show('pause'); } else { state = 'menu'; show('menu'); } }

let inputBusy = null;
function ensureInput() {
  if (inputBusy) return inputBusy;
  inputBusy = (async () => {
    if (settings.input === 'camera' && M.source !== 'camera') {
      $('mStart').disabled = true;
      const status = (t) => { $('mStatus').textContent = t; $('hStatus').textContent = t; };
      try { await M.useCamera({ video: $('video'), onStatus: status }); }
      finally { $('mStart').disabled = false; }
    } else if (settings.input === 'keyboard' && M.source !== 'keyboard') {
      await M.useKeyboard();
      M.keyboard.puppet.seated = settings.seated;
    }
  })();
  return inputBusy.finally(() => { inputBusy = null; });
}
const camError = (err) => (err.name === 'NotAllowedError' ? '請在瀏覽器允許使用鏡頭' : err.name === 'NotFoundError' ? '找不到鏡頭' : err.message);

function countdown(then) {
  const el = $('count');
  let n = 3;
  el.hidden = false; el.textContent = n;
  clearInterval(countdown.timer);
  countdown.timer = setInterval(() => {
    n--;
    if (n > 0) { el.textContent = n; audio.cue('tick'); }
    else if (n === 0) { el.textContent = '開始！'; then(); }
    else { clearInterval(countdown.timer); el.hidden = true; }
  }, 900);
}

let routine = null, stepSeen = -1;
const demo = { pup: new MartialPuppet({ jitter: 0, seed: 3, yaw: DEMO_YAW }), next: 0, plan: null };

async function start() {
  save();
  $('mStatus').textContent = '';
  if (settings.sound) audio.enable(true);
  try { await ensureInput(); }
  catch (err) { $('mStatus').textContent = '⚠️ 無法使用鏡頭：' + camError(err) + '。可以先改用鍵盤模擬。'; return; }
  // 用鏡頭時：每次打開頁面，第一次開始前一定要做安全確認
  if (settings.input === 'camera' && !safetyOk) { state = 'safety'; show('safety'); return; }
  begin();
}
function begin() {
  routine = new Routine(settings.diff, settings);
  stepSeen = -1;
  M.calibrate();
  show(null);
  $('hud').hidden = false;
  $('hSource').textContent = settings.input === 'camera' ? '📷 鏡頭' : '⌨️ 鍵盤模擬';
  $('hYouLbl').textContent = settings.input === 'camera' ? '鏡頭看到的你（只有線條）' : '模擬人偶（鍵盤操作）';
  dojo.menuDrift = false;
  state = 'count';
  countdown(() => { state = 'play'; });
}
function pause(title = '暫停', text = '雙手舉高（約 1 秒），或按「繼續」。') {
  if (state !== 'play' && state !== 'count') return;
  clearInterval(countdown.timer); $('count').hidden = true;
  state = 'paused';
  $('pTitle').textContent = title; $('pText').textContent = text;
  show('pause');
}
function resume() {
  if (state !== 'paused') return;
  show(null);
  state = 'count';
  countdown(() => { state = 'play'; });
}
function finish() {
  state = 'result';
  const r = routine.result();
  $('rTitle').textContent = r.stars === 3 ? '太棒了！' : r.stars === 2 ? '完成！做得好' : '完成！';
  $('rStars').textContent = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
  $('rText').innerHTML = `跟上示範的分數：<b>${r.score}</b> 分`;
  $('rLines').innerHTML = r.lines.map((l) => `<tr><td>${l.title}</td><td class="s">${l.score ?? ''}</td><td class="d">${l.text}</td></tr>`).join('');
  show('result');
  $('hud').hidden = true;
  audio.cue('finish');
  dojo.focus('room'); dojo.menuDrift = true;
}
function toMenu() { state = 'menu'; $('hud').hidden = true; show('menu'); dojo.focus('room'); dojo.menuDrift = true; routine = null; }
function skipStep() {
  if (!routine || routine.done) return;
  for (const e of routine.skip()) handleRoutineEvent(e);
  if (state === 'paused') resume();
}

// 雙手舉高 0.8 秒＝開始／暫停／繼續／我懂了；舉單手 1.5 秒＝跳過這段
let raiseHold = null, oneHold = null;
function raiseConfirmed() {
  if (state === 'howto') closeHowto();
  else if (state === 'menu') start();
  else if (state === 'play') pause();
  else if (state === 'paused') resume();
  else if (state === 'result') start();
}
kit.on('action', (e) => {
  if (e.type !== 'raise') return;
  if (e.side === 'both') { raiseHold = performance.now(); oneHold = null; }
  else if (state === 'play') oneHold = performance.now();
});
kit.on('status', (e) => {
  $('hDot').classList.toggle('bad', e.tracking !== 'ok');
  if (M.source !== 'camera' || !e.tracking) return;
  // 道場比海洋嚴格：有第二個人進入畫面就立刻暫停（出拳時旁邊不能有人）
  if (e.tracking === 'crowd' && (state === 'play' || state === 'count')) pause('⚠️ 有人靠近', '鏡頭看到兩個人。請旁邊的同學退到 2 公尺外，確認安全後雙手舉高繼續。');
  else if (e.tracking === 'lost' && state === 'play') pause('看不到你', '請回到鏡頭前面（約 2.5～3 公尺）。回來後雙手舉高就會倒數繼續。');
  else if (e.tracking !== 'ok' && state === 'play') toast(e.hint, 'bad');
});
M.on('martial', (e) => {
  if (state !== 'play' && state !== 'count') return;
  showAction(e.type === 'punch' ? (e.side === 'left' ? '左拳' : '右拳') : e.side === 'left' ? '左提膝' : '右提膝');
  if (state !== 'play' || !routine) return;
  const s = routine.step;
  const g = routine.hit(e.type, e.side);
  if (e.type === 'punch' && s?.kind === 'punch') {
    // 沙包、木樁的反應只是回饋：只要是出拳段落，任何一拳都會讓它晃
    const good = g && g.grade !== 'free';
    if (s.prop === 'bag') { dojo.hitBag(e.side, e.strength, good); audio.cue('thud'); }
    else { dojo.hitDummy(e.side, e.strength, good); audio.cue('knock'); }
  }
  if (g?.text) { toast(g.text, g.kind); if (g.grade === 'perfect') audio.cue('perfect'); }
});

function handleRoutineEvent(e) {
  if (e.text) toast(e.text, e.kind);
  if (e.cue) audio.cue(e.cue === 'step' ? 'step' : e.cue);
}

// ── 選單 ──
function seg(id, value, onPick) {
  const el = $(id);
  const sync = (v) => { for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.v === v); };
  sync(value);
  el.addEventListener('click', (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { sync(v); onPick(v); } });
}
$('mDiff').innerHTML = Object.entries(DIFFICULTY).map(([k, d]) => `<button data-v="${k}">${d.label}</button>`).join('');
const diffNote = () => { $('mDiffNote').textContent = DIFFICULTY[settings.diff].note; };
const inputNote = () => {
  $('mInputNote').textContent = settings.input === 'camera'
    ? '平板橫放、鏡頭約腰到胸口高度；人站在 2.5～3 公尺外，從頭到腳都要入鏡（坐著玩：上半身和雙手入鏡）。'
    : '用鍵盤或滑鼠模擬動作，走的是跟鏡頭一樣的辨識流程。F 左拳、J 右拳、W 張腳、↓ 蹲、↑ 起。';
  $('mSafety').open = settings.input === 'camera';
};
seg('mDiff', settings.diff, (v) => { settings.diff = v; diffNote(); save(); });
seg('mInput', settings.input, (v) => { settings.input = v; inputNote(); save(); });
seg('mQuality', TIER, (v) => { if (v !== TIER) { params.set('q', v); location.search = params.toString(); } });
seg('mFloor', settings.floor, (v) => { if (v !== settings.floor) { settings.floor = v; save(); params.delete('floor'); location.search = params.toString(); } });
for (const box of document.querySelectorAll('#menu input[data-opt]')) {
  const k = box.dataset.opt;
  box.checked = !!settings[k];
  box.onchange = () => {
    settings[k] = box.checked;
    if (k === 'noStance' && box.checked) { settings.noPunch = false; document.querySelector('[data-opt="noPunch"]').checked = false; }
    if (k === 'noPunch' && box.checked) { settings.noStance = false; document.querySelector('[data-opt="noStance"]').checked = false; }
    if (k === 'sound') audio.enable(settings.sound);
    if (k === 'reduceMotion') dojo.reduceMotion = settings.reduceMotion;
    if (k === 'knee') M.setDisabled(settings.knee ? [] : ['knee']);
    if (k === 'seated' && M.keyboard) M.keyboard.puppet.seated = settings.seated;
    save();
  };
}
$('mSens').value = settings.sens;
$('mSens').onchange = (e) => { settings.sens = e.target.value; M.setSensitivity(settings.sens); save(); };
diffNote(); inputNote();
$('mStart').onclick = start;
$('mHowto').onclick = () => openHowto('menu');
$('hOk').onclick = closeHowto;
$('hPause').onclick = () => pause();
$('hSkip').onclick = skipStep;
$('pResume').onclick = resume;
$('pSkip').onclick = skipStep;
$('pHowto').onclick = () => openHowto('pause');
$('pQuit').onclick = toMenu;
$('rAgain').onclick = start;
$('rMenu').onclick = toMenu;
const boxes = [...document.querySelectorAll('#safety .sc')];
for (const b of boxes) b.onchange = () => { $('sGo').disabled = !boxes.every((x) => x.checked); };
$('sGo').onclick = () => { safetyOk = true; begin(); };
$('sBack').onclick = () => { state = 'menu'; show('menu'); };
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
ensureInput().catch((err) => { $('hStatus').textContent = '⚠️ 鏡頭沒有啟動（' + camError(err) + '），請按「我懂了」，再到選單改用鍵盤模擬。'; });
if (params.has('menu')) show('menu'); else openHowto('menu');

// ── 每一格 ──
const demoCtx = document.querySelector('.dj-demo canvas').getContext('2d');
const youCtx = document.querySelector('.dj-you canvas').getContext('2d');
let last = performance.now(), avg = 1 / 60, settle = 0, fbKey = '';
const maxScale = TIER === 'low' ? 1 : TIER === 'mid' ? Math.min(devicePixelRatio || 1, 1.25) : Math.min(devicePixelRatio || 1, 1.5);
const minScale = TIER === 'rt' ? 0.5 : 0.4;

function syncDemo() {
  const p = demo.pup, plan = routine.demoPlan();
  demo.plan = plan; demo.next = 0;
  p.seated = plan.seated;
  applyAction(p, plan.wide ? 'hold:wide:on' : 'hold:wide:off', 0);
  p.targetDepth = plan.depth;
}

function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const st = kit.state;
  if (raiseHold !== null) {
    if (st.armsUp < 1) raiseHold = null;
    else if (now - raiseHold > 800) { raiseHold = null; raiseConfirmed(); }
  }
  if (oneHold !== null) {
    if (st.armsUp !== 0.5 || state !== 'play') oneHold = null;
    else if (now - oneHold > 1500) { oneHold = null; skipStep(); }
  }

  if (state === 'play' && routine) {
    const ms = M.state;
    const evs = routine.update(dt, { seen: ms.seen, fullBody: ms.fullBody, stance: ms.stance, hint: ms.hint, tooClose: ms.hint && ms.hint.startsWith('太近'), calibrate: () => M.calibrate() });
    for (const e of evs) handleRoutineEvent(e);
    if (routine.done) finish();
  }
  // 段落換了：鏡頭轉向、示範人偶換動作
  if (routine && !routine.done && routine.i !== stepSeen) {
    stepSeen = routine.i;
    syncDemo();
    const s = routine.step;
    dojo.focus(s.prop === 'bag' ? 'bag' : s.prop === 'dummy' ? 'dummy' : 'both');
  }
  if (routine && !routine.done && demo.plan && (state === 'play' || state === 'count')) {
    while (demo.next < demo.plan.actions.length && demo.plan.actions[demo.next][0] <= routine.t) applyAction(demo.pup, demo.plan.actions[demo.next++][1], now);
  }

  dojo.frame(dt);

  if (!$('hud').hidden && routine && !routine.done) {
    const s = routine.step;
    $('hStepNo').textContent = `第 ${routine.i + 1} 段／共 ${routine.steps.length} 段`;
    $('hStep').textContent = s.title;
    $('hSkip').hidden = s.kind === 'cooldown';
    let info = '—';
    if (s.cues) info = `${s.cues.filter((c) => c.grade).length} / ${s.cues.length} 拳`;
    else if (s.kind === 'stance') info = `${Math.floor(s.good)} / ${s.hold} 秒`;
    else if (s.kind === 'cooldown') info = `${Math.max(Math.ceil(s.hold - routine.t), 0)} 秒`;
    else if (s.kind === 'ready') info = '站好';
    if (s.kind === 'knee') info = info.replace('拳', '下');
    $('hStepInfo').textContent = info;
    // 口語回饋
    const fb = s.fb, fbEl = $('hFb');
    const text = s.kind === 'cooldown' ? s.text : s.cues && !s.stance ? (oneHold ? '保持舉手…跳過這段' : '') : fb ? fb.text : s.text;
    const key = (oneHold ? 'skip' : '') + text;
    if (key !== fbKey) { fbKey = key; fbEl.textContent = oneHold ? '保持舉手…跳過這段' : text; fbEl.className = 'dj-feedback ' + (fb && (s.kind === 'stance' || s.stance || s.kind === 'ready') ? (fb.good ? 'good' : 'bad') : ''); }
    // 馬步量表
    const stanceUi = s.kind === 'stance' || s.stance;
    $('hMeter').hidden = !stanceUi || !!settings.seated;
    if (stanceUi && !settings.seated) {
      const d = M.state.stance?.depth ?? 0;
      $('hDepth').style.height = `${Math.min(d / 1.1, 1) * 100}%`;
      $('hTarget').style.top = `${(s.target / 1.1) * 100}%`;
      const frac = s.kind === 'stance' ? Math.min(s.good / s.hold, 1) : 0;
      $('hHold').style.strokeDashoffset = 97.4 * (1 - frac);
      $('hHoldTxt').textContent = s.kind === 'stance' ? Math.floor(s.good) : '✓';
    }
    // 節拍圈
    const c = routine.upcoming();
    const beat = $('hBeat');
    if (c && state === 'play' && c.at - routine.t < 1.6) {
      beat.hidden = false;
      const u = Math.max((c.at - routine.t) / 1.4, 0);
      $('hBeatRing').style.transform = `scale(${1 + u * 1.2})`;
      $('hBeatRing').style.opacity = c.at - routine.t > 0 ? 0.9 : 0.3;
      const core = $('hBeatTxt');
      core.textContent = (c.side === 'left' ? '左' : '右') + (s.kind === 'knee' ? '膝' : '拳');
      core.className = 'core ' + c.side;
    } else beat.hidden = true;
  }

  if (!$('hud').hidden) {
    // 示範人偶與「你」
    const dp = demo.pup.step(now);
    demoCtx.clearRect(0, 0, demoCtx.canvas.width, demoCtx.canvas.height);
    drawFigure(demoCtx, dp, { color: '#e9a948', hand: '#fff3d6', width: 6 });
    youCtx.clearRect(0, 0, youCtx.canvas.width, youCtx.canvas.height);
    const good = routine?.step?.fb?.good;
    drawFigure(youCtx, kit.lastPose, { color: st.tracking !== 'ok' && M.source === 'camera' ? '#ff8a65' : good ? '#5fd39a' : '#63b8ff', width: 6 });
    $('hKeys').hidden = settings.input !== 'keyboard' || state !== 'play';
    const cs = kit.stats;
    $('hPerf').textContent = `畫質 ${{ low: '低', mid: '中', rt: '高' }[TIER]}・${Math.round(1 / avg)} 格/秒・解析度 ${Math.round(dojo.scale * 100)}%${cs ? `・鏡頭 ${cs.fps} 格/秒` : ''}`;
    if (raiseHold !== null) $('hAction').textContent = '保持雙手舉高…';
  }

  avg += (dt - avg) * 0.05;
  if (!params.has('scale') && (settle += dt) > 2.5 && !document.hidden) {
    const next = avg > 1 / 27 ? Math.max(dojo.scale * 0.88, minScale) : avg < 1 / 50 ? Math.min(dojo.scale * 1.06, maxScale) : dojo.scale;
    if (Math.abs(next - dojo.scale) > 0.02) { dojo.scale = next; settle = 0; }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
