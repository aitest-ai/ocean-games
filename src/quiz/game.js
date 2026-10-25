// 體感闖關問答 page (quiz/index.html): how-to → menu → levels → result, around the quiz stage.
// Same habits as the other games (src/game/shell.js): the how-to screen opens first, both hands up
// for ~1 s starts / resumes, the camera only analyses on the device, keyboard simulation moves the
// same puppet the recognizer watches. Unlike the shell, raising both hands during a level is an
// ANSWER (○ / buzz), so pausing is the on-screen button, Esc / P, or leaving the camera's view.
import { createTaikan, describe, drawSkeleton } from '../../packages/taikan-kit/src/index.js';
import { HOWTO_CSS } from '../game/howto.js';
import { Stage } from './stage.js';
import { QuizInput, attachSims } from './input.js';
import { QuizSession } from './session.js';
import { LEVELS, LEVEL_ORDER } from './levels/index.js';
import { DIFFS } from './levels/common.js';
import { VIEWS, LAYOUT, KEYS, cardHint } from './views/index.js';
import { POSES } from './levels/wall.js';
import { OBSTACLES } from './levels/dodge.js';
import { REVIVE_TASKS } from './levels/revive.js';
import { comboMult } from './session.js';
import { Sfx, Voice } from './sfx.js';
import { mountCards } from './howto.js';
import { allBanks, findBank, esc } from './library.js';
import { imageURL } from './art.js';
import { LETTER, itemLabel } from './bank.js';
import { addRecord, listRecords, clearRecords, loadSettings, saveSettings } from './store.js';
import { toCSV } from './csv.js';
import { Match, MODES } from './match.js';
import { classroomSVG } from './classroom.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const TIERS = ['low', 'mid', 'rt'];
const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
const TIER = TIERS.includes(params.get('q')) ? params.get('q') : touch ? 'low' : 'mid';
// ?speed=N runs the game clock faster (only for tests in slow cloud browsers)
const SPEED = Math.min(Math.max(Number(params.get('speed')) || 1, 1), 8);

const PRESETS = {
  quick: { label: '⚡ 快速（約 3 分鐘）', list: [['run', 3], ['tf', 3], ['buzz', 2]] },
  standard: { label: '⭐ 標準（約 5 分鐘）', list: [['run', 3], ['tf', 3], ['wall', 3], ['buzz', 3]] },
  active: { label: '🏃 動態（約 5 分鐘）', list: [['dodge', 3], ['bridge', 2], ['sprint', 3], ['boss', 3]] },
  boss: { label: '👾 挑戰 Boss（約 6 分鐘）', list: [['run', 3], ['wall', 3], ['tf', 3], ['boss', 4]] },
};
const DEFAULTS = {
  // the device's "reduce motion" accessibility setting turns calm mode on by default
  reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  bank: 'sample-english', diff: 'easy', input: 'keyboard', sens: 'normal', who: '',
  mode: 'solo', teams: 2, rounds: 2, players: 6, big: false, contrast: false,
  seated: false, simpleTF: false, simpleBuzz: false, combo: true, revive: true, sound: true, music: false, voice: false, reduceMotion: false,
  levels: PRESETS.standard.list.map(([level, count]) => ({ level, count, on: true })), tags: [],
};
const settings = loadSettings(DEFAULTS);
const SHAPES = ['●', '▲', '■', '★']; // with the colours, so colour-blind players can tell the options apart
// levels added in later versions appear (switched off) for teachers with saved settings
for (const id of LEVEL_ORDER) if (!settings.levels.some((l) => l.level === id)) settings.levels.push({ level: id, count: 3, on: false });
settings.levels = settings.levels.filter((l) => LEVELS[l.level]);
const save = () => saveSettings(settings);

const HOST = {
  right: ['答對了！太厲害了！', '完全正確！', '漂亮！你是答題高手！', '答對！觀眾在歡呼！'],
  wrong: ['哎呀，掉進泡泡池了！沒關係！', '差一點點！下一題加油！', '泡泡池很舒服吧？再來！', '沒關係，看看正確答案，下次就會了！'],
  none: ['時間到！下一題再來！', '來不及了，沒關係！'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ── boot ────────────────────────────────────────────────────────────────────
const st = document.createElement('style'); st.textContent = HOWTO_CSS; document.head.appendChild(st);
if (settings.reduceMotion) document.body.classList.add('calm');
const bodyClasses = () => { document.body.classList.toggle('big', !!settings.big); document.body.classList.toggle('hc', !!settings.contrast); };
bodyClasses();
const stage = new Stage($('c'), { tier: TIER, reduceMotion: settings.reduceMotion });
stage.scale = TIER === 'low' ? 0.75 : Math.min(devicePixelRatio || 1, TIER === 'rt' ? 1.5 : 1);
stage.resize();
addEventListener('resize', () => stage.resize());
const views = Object.fromEntries(Object.entries(VIEWS).map(([k, f]) => [k, f()]));
stage.setView(views.idle);

const kit = createTaikan({ sensitivity: settings.sens });
const qin = new QuizInput(kit);
const sims = attachSims(kit);
const sfx = new Sfx(), voice = new Voice();
voice.on = settings.voice;
if (!voice.available) { $('mVoiceNote').textContent = '這台裝置沒有內建語音，題目一樣會顯示在畫面上'; }
const syncDisabled = () => kit.setDisabled(['paddle', 'swing', 'bat', ...(settings.seated ? ['jump', 'crouch'] : [])]);
syncDisabled();

let banks = [], bank = null;
let state = 'howto', session = null, match = null, stopCards = null, stopIntro = null;
window.quiz = { stage, kit, get session() { return session; }, get match() { return match; }, get state() { return state; }, settings };

const overlays = ['howto', 'menu', 'pause', 'result', 'records', 'handover'];
function show(id) { for (const o of overlays) $(o).hidden = o !== id; }

// ── how-to ──
function openHowto() {
  state = 'howto'; show('howto');
  stopCards?.();
  stopCards = mountCards($('hCards'), [
    { move: 'lean', title: '身體傾斜＝選左右', text: '往左歪選左邊、往右歪選右邊', seated: '坐著：上半身左右歪', key: '← →（按住）' },
    { move: 'raise-both', title: '雙手舉高＝○／搶答', text: '兩隻手舉到頭上：是非題的「對」，也是搶答', seated: '坐著一樣做', key: 'Enter（按住）' },
    { move: 'cross', title: '雙臂交叉＝×', text: '兩隻手在胸前交叉：是非題的「錯」', seated: '坐著一樣做', key: 'X（按住）' },
    { move: 'raise-one', title: '舉一隻手＝確認', text: '搶答時選好答案，舉一隻手', seated: '坐著一樣做', key: 'Q／E' },
  ]);
}
function closeHowto() { stopCards?.(); stopCards = null; toMenu(); }

// ── menu ──
async function refreshBanks() {
  banks = await allBanks('../data/quiz/');
  const want = params.get('bank') || settings.bank;
  bank = banks.find((b) => b.id === want) || banks.find((b) => b.builtin) || banks[0];
  const mine = banks.filter((b) => !b.builtin), built = banks.filter((b) => b.builtin);
  $('mBank').innerHTML = (mine.length ? `<optgroup label="我的題庫（這台裝置）">${mine.map(opt).join('')}</optgroup>` : '') + `<optgroup label="內建範例（原創）">${built.map(opt).join('')}</optgroup>`;
  $('mBank').value = bank.id;
  bankInfo();
}
const opt = (b) => `<option value="${esc(b.id)}">${esc(b.title)}（${b.questions.length} 題）</option>`;
function bankInfo() {
  const tags = [...new Set(bank.questions.flatMap((q) => q.tags))];
  $('mBankInfo').innerHTML = `${esc(bank.subject || '')} ${esc(bank.grade || '')}・${bank.questions.length} 題${bank.author ? `・${esc(bank.author)}` : ''}`;
  settings.tags = (settings.tags || []).filter((t) => tags.includes(t));
  $('mTags').innerHTML = tags.length ? '<span class="note" style="margin:0">只出這些主題（都不勾＝全部）：</span>' + tags.map((t) => `<label><input type="checkbox" value="${esc(t)}" ${settings.tags.includes(t) ? 'checked' : ''}>${esc(t)}</label>`).join('') : '';
}
$('mBank').onchange = () => { bank = banks.find((b) => b.id === $('mBank').value); settings.bank = bank.id; settings.tags = []; bankInfo(); save(); };
$('mTags').onchange = () => { settings.tags = [...$('mTags').querySelectorAll('input:checked')].map((x) => x.value); save(); };

function renderLevels() {
  $('mLevels').innerHTML = settings.levels.map((l, i) => {
    const d = LEVELS[l.level];
    return `<li class="${l.on ? '' : 'off'}" data-i="${i}"><input type="checkbox" ${l.on ? 'checked' : ''} aria-label="使用這一關">
      <span class="nm">${d.icon} ${d.title}<small>${d.id === 'tf' ? '是非（選擇題會變成「答案是…嗎？」）' : d.maxOptions === 2 ? '2 選 1（多的選項只留 1 個錯的）' : `最多 ${d.maxOptions} 個選項`}</small></span>
      <select aria-label="題數">${[2, 3, 4, 5, 6].map((n) => `<option ${n === l.count ? 'selected' : ''}>${n}</option>`).join('')}</select>題
      <button data-mv="-1" aria-label="往前">▲</button><button data-mv="1" aria-label="往後">▼</button></li>`;
  }).join('');
  const on = settings.levels.filter((l) => l.on);
  const est = on.reduce((s, l) => s + l.count * (l.level === 'buzz' ? 14 : 12) + 6, 0) * DIFFS[settings.diff].time;
  $('mLen').textContent = on.length ? `共 ${on.length} 關、${on.reduce((s, l) => s + l.count, 0)} 題，大約 ${Math.max(1, Math.round(est / 60))} 分鐘。` : '⚠️ 至少要勾一關。';
  $('mStart').disabled = !on.length;
  if ($('mModeOpts')) modeOpts();
}
$('mLevels').addEventListener('change', (e) => {
  const li = e.target.closest('li'); const l = settings.levels[li.dataset.i];
  if (e.target.type === 'checkbox') l.on = e.target.checked; else l.count = Number(e.target.value);
  renderLevels(); save();
});
$('mLevels').addEventListener('click', (e) => {
  const mv = e.target.dataset.mv; if (!mv) return;
  const i = Number(e.target.closest('li').dataset.i), j = i + Number(mv);
  if (j < 0 || j >= settings.levels.length) return;
  [settings.levels[i], settings.levels[j]] = [settings.levels[j], settings.levels[i]];
  renderLevels(); save();
});
$('mPreset').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<button data-v="${k}">${p.label}</button>`).join('');
$('mPreset').onclick = (e) => {
  const p = PRESETS[e.target.dataset.v]; if (!p) return;
  const rest = settings.levels.filter((l) => !p.list.some(([id]) => id === l.level)).map((l) => ({ ...l, on: false }));
  settings.levels = [...p.list.map(([level, count]) => ({ level, count, on: true })), ...rest];
  renderLevels(); save();
};
function seg(id, value, onPick) {
  const el = $(id);
  const sync = (v) => { for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.v === v); };
  sync(value);
  el.addEventListener('click', (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { sync(v); onPick(v); } });
}
$('mDiff').innerHTML = Object.entries(DIFFS).map(([k, d]) => `<button data-v="${k}">${d.label}</button>`).join('');
const diffNote = () => { $('mDiffNote').textContent = DIFFS[settings.diff].note; };
seg('mDiff', settings.diff, (v) => { settings.diff = v; diffNote(); renderLevels(); save(); });
const inputNote = () => {
  $('mInputNote').textContent = settings.input === 'camera' ? '鏡頭放在胸口高度，人站或坐在 1.5～2.5 公尺外，上半身和雙手都要入鏡。' : '用鍵盤操作模擬人偶，走的是跟鏡頭一樣的辨識流程。沒有鏡頭也能完整玩。';
  $('mSafety').open = settings.input === 'camera';
};
seg('mInput', settings.input, (v) => { settings.input = v; inputNote(); save(); ensureInput().catch(() => {}); });
seg('mQuality', TIER, (v) => { if (v !== TIER) { params.set('q', v); location.search = params.toString(); } });
for (const box of document.querySelectorAll('#menu input[data-opt]')) {
  const k = box.dataset.opt;
  box.checked = !!settings[k];
  if (k === 'voice' && !voice.available) box.disabled = true;
  box.onchange = () => {
    settings[k] = box.checked; save(); syncDisabled();
    if (k === 'sound' || k === 'music') sfx.enable(settings.sound, settings.music);
    if (k === 'voice') voice.on = box.checked;
    if (k === 'reduceMotion') { document.body.classList.toggle('calm', box.checked); stage.reduceMotion = box.checked; }
    if (k === 'big' || k === 'contrast') bodyClasses();
  };
}
$('mWho').value = settings.who || '';
$('mWho').oninput = () => { settings.who = $('mWho').value.trim(); save(); };
$('mSens').value = settings.sens;
$('mSens').onchange = (e) => { settings.sens = e.target.value; kit.setSensitivity(settings.sens); save(); };

// ⑥ 玩法: single player or group play in the classroom
function modeOpts() {
  const m = settings.mode;
  const num = (k, lo, hi, label) => `<label>${label} <select data-k="${k}">${Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((n) => `<option ${n === settings[k] ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`;
  $('mModeOpts').innerHTML = m === 'teams' ? num('teams', 2, 4, '隊數') + '　' + num('rounds', 1, 5, '每隊上場幾次') : m === 'coop' || m === 'relay' ? num('players', 2, 40, '上場人數') : '';
  const on = settings.levels.filter((l) => l.on);
  const turns = m === 'teams' ? settings.teams * settings.rounds : m === 'solo' ? 0 : settings.players;
  $('mModeNote').textContent = m === 'solo' ? '一位玩家玩完全部打勾的關卡。'
    : `${MODES[m].desc}。每人玩「一關」（輪流用上面打勾的關卡），共 ${turns} 棒，大約 ${Math.round(turns * (on.length ? on.reduce((n, l) => n + l.count, 0) / on.length : 3) * 13 / 60 + turns * 0.3)} 分鐘。成績只記隊名與棒次。`;
}
$('mModeOpts').onchange = (e) => { const k = e.target.dataset.k; if (k) { settings[k] = Number(e.target.value); save(); modeOpts(); } };
seg('mMode', settings.mode, (v) => { settings.mode = v; save(); modeOpts(); });
$('mRoom').innerHTML = classroomSVG();

function toMenu() {
  state = 'menu'; show('menu');
  $('play').hidden = true; $('camview').hidden = true;
  sfx.setMusic(false); voice.stop();
  stage.setView(views.idle); modeOpts();
}

// ── input source (live from the start, so raising both hands works on the how-to screen too) ──
let inputBusy = null;
function ensureInput() {
  if (inputBusy) return inputBusy;
  inputBusy = (async () => {
    if (settings.input === 'camera' && kit.source !== 'camera') {
      const status = (t) => { $('mStatus').textContent = t; $('hStatus').textContent = t; };
      await kit.useCamera({ video: $('video'), onStatus: status });
    } else if (settings.input === 'keyboard' && kit.source !== 'keyboard') { await kit.useKeyboard(); sims.ensure(); }
  })();
  return inputBusy.finally(() => { inputBusy = null; });
}
const camError = (err) => (err.name === 'NotAllowedError' ? '請在瀏覽器允許使用鏡頭' : err.name === 'NotFoundError' ? '找不到鏡頭' : err.message);

// ── play ──
async function start() {
  if (state === 'count' || state === 'play') return;
  $('mStatus').textContent = '';
  if (settings.sound || settings.music) sfx.enable(settings.sound, false);
  try { await ensureInput(); }
  catch (err) { $('mStatus').textContent = '⚠️ 無法使用鏡頭：' + camError(err) + '。可以先改用鍵盤模擬。'; show('menu'); state = 'menu'; return; }
  const playlist = settings.levels.filter((l) => l.on).map(({ level, count }) => ({ level, count }));
  if (!playlist.length || !bank) return;
  const opts = { seated: settings.seated, simpleTF: settings.simpleTF, simpleBuzz: settings.simpleBuzz, combo: settings.combo, revive: settings.revive };
  if (settings.mode !== 'solo') {
    match = new Match({ mode: settings.mode, bank, levels: playlist, teams: settings.teams, rounds: settings.rounds, players: settings.players, diff: settings.diff, opts, seed: Number(params.get('seed')) || Math.floor(Math.random() * 1e9), tags: settings.tags });
    session = null;
    sfx.play('fanfare');
    showHandover(null);
    return;
  }
  match = null;
  session = new QuizSession({ bank, playlist, diff: settings.diff, seed: Number(params.get('seed')) || Math.floor(Math.random() * 1e9), tags: settings.tags, opts: { seated: settings.seated, simpleTF: settings.simpleTF, simpleBuzz: settings.simpleBuzz, combo: settings.combo, revive: settings.revive } });
  show(null);
  $('play').hidden = false; $('qPanel').hidden = true; $('qOpts').innerHTML = ''; $('qBanner').hidden = true;
  $('hWhoChip').hidden = !settings.who; $('hWho').textContent = settings.who;
  $('hTeamChip').hidden = true; $('qBoard').hidden = true;
  $('hSource').textContent = settings.input === 'camera' ? '📷 鏡頭' : '⌨️ 鍵盤模擬';
  $('camview').hidden = settings.input !== 'camera';
  $('hScore').textContent = '0'; hearts(3); $('hCombo').textContent = '—'; $('qRevive').hidden = true;
  sfx.play('fanfare');
  countdown(() => { state = 'play'; qin.queue = []; sfx.setMusic(settings.sound && settings.music); });
}
function countdown(then) {
  state = 'count';
  const el = $('count'); let n = 3;
  el.hidden = false; el.textContent = n; sfx.play('count');
  clearInterval(countdown.timer);
  countdown.timer = setInterval(() => {
    n--;
    if (n > 0) { el.textContent = n; sfx.play('count'); }
    else if (n === 0) { el.textContent = '開始！'; sfx.play('go'); then(); }
    else { clearInterval(countdown.timer); el.hidden = true; }
  }, 800);
}
function pause(title = '暫停', text = '按「繼續」或雙手舉高 1 秒。') {
  if (state !== 'play') return;
  state = 'paused'; $('pTitle').textContent = title; $('pText').textContent = text; show('pause'); voice.stop();
}
function resume() { if (state !== 'paused') return; show(null); countdown(() => { state = 'play'; qin.queue = []; }); }
$('hPause').onclick = () => pause();
$('pResume').onclick = resume;
$('pQuit').onclick = () => { if (match) { finishMatch(); return; } session = null; toMenu(); };
$('pSkip').onclick = () => { if (session?.level) { session.level.done = true; session.level.phase = 'done'; session.levelScores.push({ level: session.def.id, score: 0, correct: 0, total: 0, skipped: true }); session.phase = 'between'; session.t = 99; } resume(); };
addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') pause(); else if (state === 'paused') resume(); }
  // teacher keys in group play: Space = next player ready, Y = the whole team did the revive task
  if (e.code === 'Space' && state === 'handover') { e.preventDefault(); beginTurn(); }
  if (e.code === 'KeyY' && match && session?.phase === 'revive') match.teamRevive();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ── level / step rendering ──
const imgTag = (ref, cls = '') => { const u = imageURL(ref, bank); return u ? `<img class="${cls}" src="${esc(u)}" alt="">` : ''; };
function onLevel(e) {
  const v = views[e.def.id] || views.idle;
  stage.setView(v);
  $('hLevel').textContent = `${e.index + 1}/${e.count} ${e.def.icon}`;
  $('qPanel').hidden = true; $('qOpts').innerHTML = ''; $('qBanner').hidden = true; $('qFuse').hidden = true; $('qHold').hidden = true;
  $('qiNum').textContent = `第 ${e.index + 1} 關／共 ${e.count} 關`;
  $('qiTitle').textContent = `${e.def.icon} ${e.def.title}`;
  $('qiRule').innerHTML = e.def.rule;
  const cards = e.def.howto.map((c) => (settings.simpleTF && e.def.id === 'tf' ? { ...c, move: 'lean', text: c.title.includes('○') ? '往左傾＝○ 對' : '往右傾＝× 錯' } : c));
  stopIntro?.(); stopIntro = mountCards($('qiCards'), cards);
  $('qIntro').hidden = false;
  $('hKeys').textContent = (e.def.id === 'tf' && settings.simpleTF ? KEYS.tfSimple : KEYS[e.def.id] || '') + '　Esc 暫停';
  say(e.def.id === 'boss' ? '大魔王咕嚕嚕出現了！大家準備好了嗎？' : `第 ${e.index + 1} 關：${e.def.title}！準備好了嗎？`);
  sfx.play(e.def.id === 'boss' ? 'boss' : 'level');
  sfx.setMusic(settings.sound && settings.music, e.def.id === 'boss' ? 'boss' : e.def.id === 'sprint' || e.def.id === 'dodge' ? 'fast' : 'happy');
  $('qExtra').innerHTML = ''; $('qExtra').hidden = !['bridge', 'dodge', 'sprint', 'boss', 'wall'].includes(e.def.id);
}
function onStep(e) {
  $('qIntro').hidden = true; stopIntro?.(); stopIntro = null;
  const s = e.step, lv = session.level;
  $('hStep').textContent = `${e.i + 1}/${lv.steps.length}`;
  $('qPanel').hidden = false; $('qBanner').hidden = true;
  $('qText').textContent = s.prompt;
  const sub = s.sub || '';
  $('qSub').innerHTML = (s.subImage ? imgTag(s.subImage) : '') + (s.claim?.image ? imgTag(s.claim.image) : '') + esc(sub) + (s.hint ? `<div class="note">💡 提示：${esc(s.hint)}</div>` : '');
  const u = imageURL(s.image, bank);
  $('qImg').hidden = !u; if (u) $('qImg').src = u;
  stage.view.onStep(stage, lv);
  stage.studio.setMood('focus');
  // option cards
  const box = $('qOpts');
  const layout = LAYOUT[session.def.id];
  box.className = 'qopts' + (layout === 'row' ? ' row' : '');
  if (s.kind === 'tf') box.innerHTML = `<div class="qopt tfo" data-i="true"><span class="lt">${settings.simpleTF ? '往左傾' : '雙手舉高'}</span>○ 對</div><div class="qopt tfx" data-i="false"><span class="lt">${settings.simpleTF ? '往右傾' : '雙臂交叉'}</span>× 錯</div>`;
  else box.innerHTML = s.options.map((o, i) => `<div class="qopt c${i}" data-i="${i}"><span class="lt">${SHAPES[i]} ${LETTER(i)}${cardHint(session.def.id, lv, i, s.options.length)}</span>${session.def.id === 'wall' ? `<span class="pose">${POSES[lv.poses[i]].icon} ${POSES[lv.poses[i]].name}</span>` : ''}${imgTag(o.image)}${esc(o.text)}</div>`).join('');
  $('qFuse').hidden = session.def.id !== 'buzz';
  $('qHold').hidden = session.def.id !== 'tf';
  voice.say(s.prompt + (sub ? '。' + sub : '') + (s.kind === 'choice' ? '。' + s.options.map((o, i) => `${LETTER(i)}，${o.text || '圖片'}`).join('。') : ''));
}
function onAnswer(e) {
  const s = e.step;
  $('hScore').textContent = session.scorer.score;
  for (const el of $('qOpts').children) {
    const v = el.dataset.i, val = s.kind === 'tf' ? v === 'true' : Number(v);
    el.classList.toggle('right', val === s.correct);
    el.classList.toggle('wrong', val !== s.correct);
    el.classList.toggle('mine', e.choice !== null && val === e.choice);
    el.classList.remove('sel');
  }
  const b = $('qBanner');
  b.className = 'qbanner' + (e.correct ? '' : ' bad');
  b.innerHTML = e.correct
    ? `<h2>⭕ 答對了！</h2><div class="pts">+${e.points}${e.mult > 1 ? `<span class="combo">🔥 ${e.combo} 連對 ×${e.mult}</span>` : ''}</div>${s.explain ? `<p>${esc(s.explain)}</p>` : ''}`
    : `<h2>${e.none ? '⏰ 時間到' : '🫧 可惜！'}</h2><p>正確答案：<b>${esc(s.answerText)}</b></p>${s.explain ? `<p>${esc(s.explain)}</p>` : ''}`;
  b.hidden = false;
  sfx.play(e.correct ? 'right' : 'wrong');
  boardUpdate();
  hearts(e.hearts); $('hCombo').textContent = e.combo >= 2 ? `🔥${e.combo}` : '—';
  if (e.correct && comboMult(e.combo) > comboMult(e.combo - 1)) { setTimeout(() => sfx.play('combo'), 300); flash(`🔥 ${e.combo} 連對！之後每題 ×${comboMult(e.combo)}`); }
  if (e.correct) { sfx.play('cheer'); stage.studio.setMood('good'); stage.host.say('cheer'); }
  else { setTimeout(() => sfx.play('splash'), 350); stage.studio.setMood('bad'); stage.host.say('oops'); }
  if (e.correct && ['tf', 'buzz'].includes(session.def.id)) stage.fx.confetti([0, 3.5, 1.2], 120, 2.5);
  if (!e.correct && ['tf', 'buzz'].includes(session.def.id)) stage.fx.bubbles([0, 0.6, 1.6], 50, 4);
  say(pick(e.correct ? HOST.right : e.none ? HOST.none : HOST.wrong));
  voice.say(e.correct ? '答對了' : '正確答案是' + s.answerText);
}
function hearts(n) { $('hHearts').textContent = settings.revive ? '❤️'.repeat(n) + '🤍'.repeat(Math.max(3 - n, 0)) : '—'; }
let flashTimer;
function flash(text) { const el = $('qFlash'); el.textContent = text; el.hidden = false; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go'); clearTimeout(flashTimer); flashTimer = setTimeout(() => (el.hidden = true), 1600); }
let sayTimer;
function say(text) { const el = $('qSay'); el.textContent = text; el.hidden = false; clearTimeout(sayTimer); sayTimer = setTimeout(() => (el.hidden = true), 2600); }
function onLevelDone(e) {
  $('qPanel').hidden = true; $('qOpts').innerHTML = ''; $('qFuse').hidden = true; $('qHold').hidden = true;
  const s = e.summary;
  const b = $('qBanner'); b.className = 'qbanner';
  b.innerHTML = `<h2>${LEVELS[s.level].icon} 過關！</h2><p>答對 ${s.correct}／${s.total} 題，得到 <b>${s.score}</b> 分</p>`;
  b.hidden = false;
  stage.setView(views.idle);
  sfx.play('fanfare');
}
async function finish() {
  state = 'result';
  sfx.setMusic(false);
  $('play').hidden = true; $('camview').hidden = true;
  const r = session.summary();
  $('rTitle').textContent = r.stars === 3 ? '🏆 闖關大成功！' : r.stars === 2 ? '🎉 闖關完成！' : '👏 完成全部關卡！';
  $('rStars').textContent = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
  $('rText').innerHTML = `${settings.who ? esc(settings.who) + '：' : ''}答對 <b>${r.correct}</b>／${r.total} 題，總分 <b>${r.score}</b> 分${r.maxCombo >= 3 ? `・最多 <b>${r.maxCombo}</b> 連對 🔥` : ''}${r.revives ? `・復活 ${r.revives} 次 ❤️` : ''}`;
  $('rLevels').innerHTML = r.levels.map((l) => `<div>${LEVELS[l.level].icon} ${LEVELS[l.level].title}：${l.skipped ? '跳過' : `${l.correct}/${l.total}・${l.score} 分`}</div>`).join('');
  $('rReview').innerHTML = r.log.map((x) => `<li class="${x.correct ? 'ok' : 'no'}">${x.correct ? '⭕' : '🫧'} ${esc(x.prompt)}${x.sub ? ' ' + esc(x.sub) : ''}<br><b>答案：${esc(x.answer)}</b>${x.explain ? `<div class="ex">${esc(x.explain)}</div>` : ''}</li>`).join('');
  show('result');
  sfx.play('fanfare');
  try { await addRecord({ who: settings.who || '（未填）', bank: bank.title, levels: session.playlist.map((p) => LEVELS[p.level].title).join('、'), diff: DIFFS[settings.diff].label, score: r.score, correct: r.correct, total: r.total, stars: r.stars, mode: '單人' }); } catch {}
}
$('rAgain').onclick = start;
$('rMenu').onclick = toMenu;
$('mStart').onclick = start;
$('mHowto').onclick = openHowto;
$('hOk').onclick = closeHowto;

// ── group play: hand-over screen, scoreboard, results ──
const sideTag = (s) => `<span style="color:${s.color}">${s.icon} ${esc(s.name)}</span>`;
function boardHTML() {
  if (!match) return '';
  const M = match;
  if (M.mode === 'teams') return M.sides.map((s, i) => `<div class="${M.turn?.side === i && state !== 'handover' ? 'on' : ''}">${sideTag(s)} <b>${s.score + (M.turn?.side === i && session && !session.done ? session.scorer.score : 0)}</b> 分</div>`).join('');
  const live = session && !session.done ? session.scorer.correct : 0;
  if (M.mode === 'coop') return `<div>👾 大魔王 <span class="bossbar"><i style="width:${(M.bossHP / M.bossMax) * 100}%"></i></span> ${M.bossHP}/${M.bossMax}</div><div>⭐ 全班答對 <b>${M.sides[0].correct + live}</b> 題</div>`;
  return `<div>🏃‍♀️ 第 ${M.turn ? M.turn.player : M.turns.length}／${M.turns.length} 棒</div><div>⭐ 全隊答對 <b>${M.sides[0].correct + live}</b> 題</div>`;
}
function boardUpdate() { if (match) $('qBoard').innerHTML = boardHTML(); }
function showHandover(last) {
  state = 'handover';
  $('play').hidden = true; $('camview').hidden = true; sfx.setMusic(false); voice.stop();
  stage.setView(views.idle);
  const T = match.turn, side = match.side, L = LEVELS[T.level.level];
  $('hoLast').textContent = last ? `剛才：${last.sideName} 第 ${last.player} 棒 答對 ${last.correct}／${last.total} 題、${last.score} 分` : `${MODES[match.mode].icon} ${MODES[match.mode].title}・共 ${match.turns.length} 棒`;
  $('hoTitle').innerHTML = match.mode === 'teams' ? `下一位：${sideTag(side)} 第 ${T.player} 位` : `下一位：第 ${T.player} 棒`;
  $('hoLevel').innerHTML = `這一棒玩 <b>${L.icon} ${L.title}</b>（${T.level.count} 題）。${L.rule}`;
  $('hoBoard').innerHTML = boardHTML();
  show('handover');
  say(`${match.mode === 'teams' ? side.name + '，' : ''}第 ${T.player} 棒準備！`);
}
function beginTurn() {
  if (state !== 'handover' || !match) return;
  match.begin(); session = match.session;
  show(null);
  $('play').hidden = false; $('qPanel').hidden = true; $('qOpts').innerHTML = ''; $('qBanner').hidden = true; $('qRevive').hidden = true;
  $('hWhoChip').hidden = true; $('hTeamChip').hidden = false;
  $('hTeam').innerHTML = match.mode === 'teams' ? `${sideTag(match.side)} 第 ${match.turn.player} 位` : `第 ${match.turn.player} 棒`;
  $('hSource').textContent = settings.input === 'camera' ? '📷 鏡頭' : '⌨️ 鍵盤模擬';
  $('camview').hidden = settings.input !== 'camera';
  $('hScore').textContent = '0'; hearts(match.side.hearts); $('hCombo').textContent = '—';
  $('qBoard').hidden = false; boardUpdate();
  countdown(() => { state = 'play'; qin.queue = []; });
}
function onTurnDone(e) {
  state = 'turnEnd';
  boardUpdate();
  setTimeout(() => { if (state !== 'turnEnd') return; if (match.done) finishMatch(); else showHandover(e.result); }, 2400);
}
$('hoGo').onclick = beginTurn;
$('hoQuit').onclick = () => finishMatch();
async function finishMatch() {
  if (!match) return;
  const R = match.summary(), M = match;
  state = 'result'; sfx.setMusic(false);
  $('play').hidden = true; $('camview').hidden = true;
  let title = '', text = '', stars = 3;
  if (M.mode === 'teams') {
    title = `🏆 ${R.ranked[0].icon} ${R.ranked[0].name} 總分最高！`;
    text = R.ranked.map((s, k) => `${k + 1}. ${sideTag(s)}：${s.score} 分（答對 ${s.correct}／${s.total}）`).join('<br>') + '<br><br>' + R.awards.map((a) => `${a.title}：${sideTag(R.sides[a.side])}`).join('　');
  } else if (M.mode === 'coop') {
    stars = R.bossDown ? 3 : R.bossHP <= R.bossMax / 2 ? 2 : 1;
    title = R.bossDown ? '🎉 全班一起打倒大魔王！' : '👾 大魔王逃走了，下次一定打得倒！';
    text = `全班答對 <b>${R.correct}</b>／${R.total} 題，大魔王剩 ${R.bossHP}／${R.bossMax}。`;
  } else {
    const key = `taikan.quiz.relay.${bank.id}`;
    let rec = null; try { rec = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    const better = !rec || R.correct > rec.correct || (R.correct === rec.correct && R.time < rec.time);
    if (better) try { localStorage.setItem(key, JSON.stringify({ correct: R.correct, total: R.total, time: R.time, at: Date.now() })); } catch {}
    stars = R.total ? (R.correct / R.total >= 0.8 ? 3 : R.correct / R.total >= 0.5 ? 2 : 1) : 1;
    title = better && rec ? '🎉 破紀錄了！' : '🏃‍♀️ 接力完成！';
    text = `${R.results.length} 棒共答對 <b>${R.correct}</b>／${R.total} 題，用了 ${Math.round(R.time)} 秒。${rec ? `（之前的紀錄：答對 ${rec.correct} 題、${Math.round(rec.time)} 秒）` : '（這是第一次的紀錄）'}`;
  }
  $('rTitle').textContent = title;
  $('rStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('rText').innerHTML = text;
  $('rLevels').innerHTML = R.results.map((r) => `<div>${M.mode === 'teams' ? esc(r.sideName) + ' ' : ''}第 ${r.player} 棒 ${LEVELS[r.level.level].icon} ${r.correct}/${r.total}・${r.score} 分</div>`).join('');
  $('rReview').innerHTML = R.results.flatMap((r) => r.log).map((x) => `<li class="${x.correct ? 'ok' : 'no'}">${x.correct ? '⭕' : '🫧'} ${esc(x.prompt)}${x.sub ? ' ' + esc(x.sub) : ''}<br><b>答案：${esc(x.answer)}</b>${x.explain ? `<div class="ex">${esc(x.explain)}</div>` : ''}</li>`).join('');
  show('result'); sfx.play('fanfare'); stage.fx.confetti([0, 4, 0], 200, 4);
  try { for (const s of R.sides) await addRecord({ who: s.name, bank: bank.title, levels: MODES[M.mode].title, diff: DIFFS[settings.diff].label, score: s.score, correct: s.correct, total: s.total, stars, mode: MODES[M.mode].title }); } catch {}
  match = null; session = null;
}

// ── records ──
async function openRecords() {
  state = 'records'; show('records');
  const rows = await listRecords().catch(() => []);
  $('recBody').innerHTML = rows.length ? `<table class="rec"><tr><th>時間</th><th>座號／暱稱</th><th>題庫</th><th>關卡</th><th>難度</th><th>答對</th><th>分數</th></tr>${rows.map((r) => `<tr><td>${new Date(r.at).toLocaleString('zh-TW', { hour12: false })}</td><td>${esc(r.who)}</td><td>${esc(r.bank)}</td><td>${esc(r.levels)}</td><td>${esc(r.diff)}</td><td>${r.correct}/${r.total}</td><td>${r.score}</td></tr>`).join('')}</table>` : '<p class="note">還沒有紀錄。</p>';
  openRecords.rows = rows;
}
$('mRecords').onclick = openRecords;
$('recClose').onclick = toMenu;
$('recClear').onclick = async () => { if (confirm('確定要清除這台裝置上的全部成績紀錄嗎？')) { await clearRecords(); openRecords(); } };
$('recCSV').onclick = () => {
  const rows = openRecords.rows || [];
  const csv = toCSV([['時間', '座號或暱稱', '題庫', '關卡', '難度', '答對', '題數', '分數', '模式'], ...rows.map((r) => [new Date(r.at).toLocaleString('zh-TW', { hour12: false }), r.who, r.bank, r.levels, r.diff, r.correct, r.total, r.score, r.mode])]);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '闖關問答成績.csv'; a.click();
};

// ── input events and status ──
let raiseHold = null;
kit.on('action', (e) => {
  if (e.type === 'raise' && e.side === 'both') raiseHold = performance.now();
  if (state === 'play') { $('hAction').textContent = describe(e); clearTimeout(kit._t); kit._t = setTimeout(() => ($('hAction').textContent = '—'), 1200); }
});
kit.on('status', (e) => {
  $('hDot').classList.toggle('bad', e.tracking !== 'ok');
  if (kit.source !== 'camera' || !e.tracking) return;
  if (e.tracking === 'lost' && state === 'play') pause('看不到你', '請回到鏡頭前面。回來後按「繼續」或雙手舉高 1 秒。');
  else if (e.tracking !== 'ok' && state === 'play') say(e.hint);
});
// both hands held up ~0.8 s outside a level = the main button of the screen
function raiseConfirmed() {
  if (state === 'howto') closeHowto();
  else if (state === 'menu') start();
  else if (state === 'paused') resume();
  else if (state === 'result') start();
  else if (state === 'handover') beginTurn();
}

// ── loop ──
const camCtx = $('camview').querySelector('canvas').getContext('2d');
let last = performance.now(), avg = 1 / 60, settle = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  const kst = kit.state;
  if (raiseHold !== null) { if (kst.armsUp < 1) raiseHold = null; else if (now - raiseHold > 800) { raiseHold = null; if (state !== 'play') raiseConfirmed(); } }
  sims.ensure();
  const inp = qin.frame(now);
  if (state === 'play' && (match || session)) {
    for (const e of match ? match.update(dt * SPEED, inp) : session.update(dt * SPEED, inp)) {
      if (e.type === 'level') onLevel(e);
      else if (e.type === 'step') onStep(e);
      else if (e.type === 'answer') onAnswer(e);
      else if (e.type === 'levelDone') onLevelDone(e);
      else if (e.type === 'sfx') sfx.play(e.name);
      else if (e.type === 'bonus') { flash(e.text || `+${e.points}`); sfx.play('coin'); $('hScore').textContent = session.scorer.score; }
      else if (e.type === 'penalty') { flash(`🫧 掉下去了 −${e.points}`); $('hScore').textContent = session.scorer.score; stage.host.say('oops'); }
      else if (e.type === 'hit' || e.type === 'bossAttack') { views.boss.fire(e.type); sfx.play(e.type === 'hit' ? 'hit' : 'splash'); }
      else if (e.type === 'revive') onRevive(e);
      else if (e.type === 'revived') onRevived(e);
      else if (e.type === 'say') say(e.text);
      else if (e.type === 'done') { if (!match) { finish(); break; } }
      else if (e.type === 'classHit') { boardUpdate(); flash(e.hp ? `全班打中大魔王！剩 ${e.hp}` : '大魔王倒下了！'); }
      else if (e.type === 'classBossDown') { stage.fx.confetti([0, 4, 0], 300, 4); sfx.play('cheer'); }
      else if (e.type === 'turnDone') { onTurnDone(e); break; }
    }
    if (state === 'play' && session && !session.done) updatePlay(dt, inp);
  } else if (stage.view === views.idle) stage.view.update(dt, stage);
  stage.frame(dt);
  if (!$('camview').hidden) { const cv = camCtx.canvas; camCtx.clearRect(0, 0, cv.width, cv.height); drawSkeleton(camCtx, kit.lastPose, { width: 4, color: kst.tracking === 'ok' ? '#63b8ff' : '#ff8a65' }); }
  avg += (dt - avg) * 0.05;
  $('hPerf').textContent = `畫質 ${{ low: '低', mid: '中', rt: '高' }[TIER]}・${Math.round(1 / avg)} 格/秒${kit.stats ? `・鏡頭 ${kit.stats.fps} 格/秒` : ''}`;
  // adaptive resolution like the other games
  if (!params.has('scale') && (settle += dt) > 2.5 && !document.hidden) {
    const maxS = TIER === 'low' ? 1 : Math.min(devicePixelRatio || 1, 1.5);
    const next = avg > 1 / 27 ? Math.max(stage.scale * 0.88, 0.45) : avg < 1 / 50 ? Math.min(stage.scale * 1.06, maxS) : stage.scale;
    if (Math.abs(next - stage.scale) > 0.02) { stage.scale = next; stage.resize(); settle = 0; }
  }
}

function updatePlay(dt, inp) {
  const lv = session.level;
  if (inp.events.some((e) => e.type === 'jump')) views.dodge.jump();
  if (session.phase === 'revive') { updateRevive(); stage.view.update(dt, stage, lv, inp); return; }
  if (session.phase === 'between' || !lv) { stage.view.update?.(dt, stage, lv, inp); return; }
  if (lv.phase === 'intro') { $('qiBar').style.width = Math.min(lv.t / lv.introTime, 1) * 100 + '%'; stage.view.update(dt, stage, lv, inp); return; }
  stage.view.update(dt, stage, lv, inp);
  const id = session.def.id;
  // timer bar
  const T = $('qTimer');
  if (lv.phase === 'answer') {
    const frac = id === 'buzz' ? (lv.stage === 'fuse' ? lv.fuseLeft : lv.chooseLeft / lv.chooseWindow) : lv.timeLeft / lv.window;
    T.style.width = frac * 100 + '%'; T.classList.toggle('low', frac < 0.25);
  } else T.style.width = '0%';
  // option cards on their anchors and the highlight
  const cards = $('qOpts').children;
  const anchors = LAYOUT[id] === 'anchor' && lv.step ? stage.view.anchors(stage, lv) : null;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    if (anchors?.[i]) { c.style.left = anchors[i].x + 'px'; c.style.top = Math.max(anchors[i].y, 240) + 'px'; }
    if (lv.phase !== 'answer') continue;
    let sel = false;
    if (id === 'run') sel = lv.lane === i;
    else if (id === 'tf') sel = String(lv.locked ?? lv.pose) === c.dataset.i;
    else if (id === 'buzz') sel = lv.stage === 'choose' && lv.cursor === i;
    c.classList.toggle('sel', sel);
  }
  if (id === 'tf' && lv.phase === 'answer') {
    const p = lv.locked !== null ? 1 : lv.progress();
    $('qHoldArc').style.strokeDashoffset = String(276.5 * (1 - p));
    $('qHoldTxt').textContent = lv.locked !== null ? `鎖定 ${lv.locked ? '○' : '×'}` : p > 0 ? '保持…' : '';
  }
  if (id === 'buzz') {
    $('qFuseBar').style.width = (lv.phase === 'answer' ? lv.fuseLeft : 0) * 100 + '%';
    $('qFuseTxt').textContent = lv.phase !== 'answer' ? '' : lv.stage === 'fuse' ? '🙌 雙手舉高搶答！' : `選好了就舉一隻手（${Math.ceil(lv.chooseLeft)} 秒）`;
  }
  if (id === 'boss' && lv.phase === 'answer') for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('sel', lv.cursor === i);
  if (id === 'wall' && lv.phase === 'answer') for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('sel', lv.poses[i] === lv.pose);
  if ((id === 'dodge' || id === 'sprint') && lv.phase === 'answer') for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('sel', inp.side === (i ? 'right' : 'left'));
  if (id === 'bridge' && lv.phase === 'answer') for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('sel', lv.answer === i);
  extraMeters(id, lv, inp);
}

// level-specific meters (balance needle, obstacle warning, race, Boss health, current pose)
function extraMeters(id, lv, inp) {
  const el = $('qExtra');
  if (el.hidden) return;
  let html = '';
  if (id === 'bridge') {
    const th = Math.max(-1, Math.min(1, lv.theta || 0)), wind = lv.g || 0;
    html = `<div class="meter"><b>平衡</b><div class="bal"><span class="zone"></span><i style="left:${50 + th * 50}%"></i></div><small>${Math.abs(th) > 0.55 ? (th > 0 ? '⚠️ 快往左傾！' : '⚠️ 快往右傾！') : '穩穩的 👍'}　風：${wind > 0.05 ? '→' : wind < -0.05 ? '←' : '·'}</small></div>`;
  } else if (id === 'dodge') {
    const o = lv.phase === 'answer' && lv.coming;
    html = o ? `<div class="warn">${OBSTACLES[o.kind].icon} ${o.kind === 'swing' ? `軟墊從${o.side === 'left' ? '左' : '右'}邊來：往${o.side === 'left' ? '右' : '左'}歪！` : OBSTACLES[o.kind].name}</div>` : (lv.phase === 'answer' && lv.t > lv.window - 3.5 ? '<div class="warn">🚪 答案門快到了：往左或往右傾！</div>' : '');
  } else if (id === 'sprint') {
    const max = Math.max(lv.dist || 0, lv.rival || 0, 1);
    html = `<div class="meter race"><div>🏃 你 <i style="width:${Math.round(((lv.dist || 0) / max) * 150)}px"></i> <b>${Math.round(lv.dist || 0)} m</b>${lv.turbo > 0 ? ' 🚀' : ''}</div><div>🤖 喀喀 <i class="rv" style="width:${Math.round(((lv.rival || 0) / max) * 150)}px"></i> <b>${Math.round(lv.rival || 0)} m</b></div><small>雙手擺動越快跑越快（擺手力道 ${Math.round((inp.pump || 0) * 100)}%）</small></div>`;
  } else if (id === 'boss') {
    html = `<div class="meter"><b>👾 咕嚕嚕</b><div class="hp">${'<span class="on"></span>'.repeat(Math.max(lv.hp, 0))}${'<span></span>'.repeat(lv.maxHP - Math.max(lv.hp, 0))}</div><small>${lv.phase === 'answer' ? `Boss 蓄力中… ${Math.ceil(lv.timeLeft)} 秒` : ''}</small></div>`;
  } else if (id === 'wall' && lv.phase === 'answer') {
    const p = lv.pose;
    html = `<div class="meter"><b>你現在的姿勢</b><div class="pose-now">${p ? POSES[p].icon + ' ' + POSES[p].name : '（還沒擺）'}</div></div>`;
  }
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
}

// 復活挑戰 overlay
let stopRevive = null;
function onRevive(e) {
  const T = e.task.def;
  $('qrTitle').textContent = `❤️ 復活挑戰：${T.title}`;
  $('qrText').textContent = `${match && match.mode !== 'relay' ? '全隊一起做！' : ''}${T.text}（⌨️ ${T.key}）${match && match.mode !== 'relay' ? '。老師看到大家都做完，可以按 Y。' : ''}`;
  $('qRevive').hidden = false;
  stopRevive?.(); stopRevive = mountCards($('qrCard'), [{ move: { lean: 'lean', raise: 'raise-both', pump: 'pump' }[e.task.kind], title: T.title, text: T.text }]);
  say('生命用完了，沒關係！做完這個小任務就復活！'); sfx.play('level');
}
function updateRevive() {
  const r = session.revive;
  $('qrBar').style.width = r.progress * 100 + '%';
  $('qrTime').textContent = `${Math.max(0, Math.ceil(r.limit - r.t))} 秒`;
}
function onRevived(e) {
  stopRevive?.(); stopRevive = null;
  $('qRevive').hidden = true; hearts(e.hearts);
  flash(e.success ? `復活成功！❤️❤️❤️ +${e.points}` : '答答幫你加油！❤️❤️');
  say(e.success ? '復活成功！繼續闖關！' : '沒關係，答答送你兩顆愛心！');
  if (e.success) stage.fx.confetti([0, 3, 1], 120, 2.5);
}

requestAnimationFrame(loop);
await refreshBanks();
renderLevels(); diffNote(); inputNote(); modeOpts();
$('qLoading').remove();
ensureInput().catch((err) => { $('hStatus').textContent = '⚠️ 鏡頭沒有啟動（' + camError(err) + '），請按「我懂了」，再到選單改用鍵盤模擬。'; });
if (params.has('menu')) toMenu(); else openHowto();
if (params.has('autostart')) start();
