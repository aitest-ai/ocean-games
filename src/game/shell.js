// Shared game shell: the menu, how-to-play screen, HUD, pause / resume, results, sound and settings
// that every game shares, around a 3D world. Ocean games (kayak.js, surf.js, sail.js) run on the
// open-water renderer with a floating vessel and chase camera (VesselGame); land games set
// `mode.world = 'land'` and run on the three.js ballpark (src/land/world.js). Gameplay input reaches
// a mode only as taikan-kit action events and the kit's continuous values (lean, crouch).
import { createTaikan, describe, drawSkeleton } from '../../packages/taikan-kit/src/index.js';
import { mountHowto, HOWTO_CSS } from './howto.js';

const params = new URLSearchParams(location.search);
// pick the quality tier before the engine module reads ?q= (tablets and phones start on 'low')
const TIERS = ['low', 'mid', 'rt'];
if (!TIERS.includes(params.get('q'))) {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  params.set('q', touch ? 'low' : 'mid');
  history.replaceState(null, '', '?' + params);
}
const TIER = params.get('q');
// the ocean engine loads only for ocean games (land games never download it)
let App, OceanProbe, Props, modelMatrix, AudioEngine;
async function loadOcean() {
  [{ App }, { OceanProbe }, { Props, modelMatrix }, { AudioEngine }] = await Promise.all([
    import('../app.js'), import('../ocean/probe.js'), import('./props.js'), import('../audio/audio.js'),
  ]);
}

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const MAX_PROBES = 8;  // sea samples besides the vessel (buoys, obstacles near the player)
export const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const makeVesselGame = () => class VesselGame extends App {
  constructor(canvas, mode) {
    super(canvas);
    this.mode = mode;
    this.props = new Props(this.gl);
    mode.meshes?.(this.props);
    this.sea = new OceanProbe(this.gl, 1 + MAX_PROBES);
    this.cam.fov = ((mode.camera?.fov ?? 55) * Math.PI) / 180;
    this.vis = { y: 0, pitch: 0, roll: 0, dx: 0, dz: 0 };
    this.orbit = 0;
    this.seaAtVessel = { height: 0, dx: 0, dz: 0, sx: 0, sz: 0 };
  }

  // sea sample at a probed point (key from mode.probePoints), or null
  seaFor(key) { const keys = this.sea.resultTag || []; const i = keys.indexOf(key); return i < 0 ? null : this.sea.results[1 + i] || null; }

  // the vessel floats on the probed sea; the camera chases it (or orbits it in menus)
  updateCamera(dt) {
    const V = this.vessel;
    const pts = [[V.x, V.z]];
    const extra = (this.mode.probePoints?.(this) || []).slice(0, MAX_PROBES);
    for (const p of extra) pts.push(p.xz);
    // results arrive a frame or two later: the keys travel with the request (see seaFor)
    this.sea.run(this.ocean.textures(), pts, this.mode.footprint ?? 3.5, false, extra.map((p) => p.key));
    const r = this.sea.results[0];
    this.seaAtVessel = r;
    const v = this.vis, k = 1 - Math.exp(-dt * 6);
    const f = [Math.cos(V.h), Math.sin(V.h)];
    const along = r.sx * f[0] + r.sz * f[1], across = -r.sx * f[1] + r.sz * f[0];
    v.y += (r.height - v.y) * k;
    v.dx += (r.dx * 0.8 - v.dx) * k; v.dz += (r.dz * 0.8 - v.dz) * k;
    v.pitch += (Math.atan(along) * 0.8 - v.pitch) * k;
    v.roll += (-Math.atan(across) * 0.8 + (this.mode.rollExtra?.(this) ?? 0) - v.roll) * k;
    const bx = V.x + v.dx, bz = V.z + v.dz;
    this.vesselPos = [bx, v.y + (this.mode.waterline ?? -0.04), bz];

    const c = this.cam, cfg = this.mode.camera || {};
    const calm = this.settings.reduceMotion;
    let yaw, back, height;
    if (this.state === 'play' || this.state === 'count' || this.state === 'paused') {
      let d = V.h - (this.camYaw ?? V.h); d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw = (this.camYaw ?? V.h) + d * (1 - Math.exp(-dt * (cfg.follow ?? 1.8)));
      yaw = this.camYaw; back = cfg.back ?? 7.2; height = cfg.height ?? 2.5;
    } else {
      this.orbit += dt * 0.12;
      yaw = V.h + 2.3 + Math.sin(this.orbit) * 0.9; back = (cfg.back ?? 7.2) + 1.3; height = (cfg.height ?? 2.5) - 0.3;
    }
    const cf = [Math.cos(yaw), Math.sin(yaw)];
    // "reduce motion": the camera keeps a steady height and horizon instead of riding the swell
    const camY = calm ? height + 0.3 : height + v.y * 0.6;
    c.pos = [bx - cf[0] * back, camY, bz - cf[1] * back];
    const ahead = cfg.lookAhead ?? 3;
    const look = [bx + cf[0] * ahead - c.pos[0], (calm ? 0 : v.y) + (cfg.lookHeight ?? 0.5) - c.pos[1], bz + cf[1] * ahead - c.pos[2]];
    c.yaw = Math.atan2(look[2], look[0]);
    c.pitch = Math.atan2(look[1], Math.hypot(look[0], look[2]));
    c.roll = calm ? 0 : v.roll * 0.2; c.tilt = 0;
    c.base = [bx, bz];
  }

  vesselMatrix() { return modelMatrix(this.vesselPos, this.vessel.h, this.vis.pitch, this.vis.roll); }

  drawProps(ctx) {
    this.mode.draw(this, this.props);
    this.props.draw(ctx);
  }

  project(p) {
    const M = this.cameraMatrices().vp;
    const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12];
    const y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13];
    const w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
    return { x: (x / w * 0.5 + 0.5) * innerWidth, y: (0.5 - y / w * 0.5) * innerHeight, behind: w <= 0 };
  }
};

// ── page markup ─────────────────────────────────────────────────────────────
function buildPage(mode, games) {
  document.title = mode.title;
  const style = document.createElement('style');
  style.textContent = HOWTO_CSS;
  document.head.appendChild(style);
  $('mTitle').textContent = `${mode.icon} ${mode.title}`;
  $('mIntro').innerHTML = mode.intro;
  $('hChips').innerHTML = mode.hudChips.map((c) => `<div class="chip"><span class="lbl">${c.label}</span><b id="h_${c.id}">—</b>${c.unit ? `<span class="unit">${c.unit}</span>` : ''}</div>`).join('');
  $('hExtra').innerHTML = mode.hudExtra || '';
  $('hKeys').textContent = mode.keysHelp;
  $('mDiff').innerHTML = Object.entries(mode.difficulties).map(([k, d]) => `<button data-v="${k}">${d.label}</button>`).join('');
  $('mOptions').innerHTML = (mode.options || []).map((o) => `<label class="chk"><input type="checkbox" data-opt="${o.key}"> ${o.label}</label>`).join('');
  $('hTitle').textContent = `怎麼玩：${mode.title}`;
  $('hGoal').innerHTML = mode.goal;
  // other games of the same series
  const sib = games.filter((g) => g.series === mode.series && g.id !== mode.id);
  $('mOther').innerHTML = sib.length ? '其他遊戲：' + sib.map((g) => `<a href="./?g=${g.id}">${g.icon} ${g.title}</a>`).join(' ') : '';
  if (mode.safety) $('mSafetyList').innerHTML = mode.safety.map((x) => `<li>${x}</li>`).join('');
  if (mode.soundLabel) $('mSoundLabel').textContent = mode.soundLabel;
  if (mode.diffTitle) $('mDiffTitle').textContent = mode.diffTitle;
  if (mode.seatedLabel) $('mSeatedLabel').textContent = mode.seatedLabel;
  if (mode.noTimer) $('hTime').parentElement.style.display = 'none';
  $('hTouch').innerHTML = (mode.touchButtons || []).map((b, i) => `<button class="chip btn big" data-i="${i}">${b.label}</button>`).join('');
}

// ── run a game ──────────────────────────────────────────────────────────────
export async function runGame(mode, games = []) {
  mode.series ??= 'ocean';
  buildPage(mode, games);
  const KEY = `ocean-games.${mode.id}.settings`;
  const defaults = { diff: 'easy', input: 'keyboard', sens: 'normal', sound: false, seated: false, reduceMotion: false, ...Object.fromEntries((mode.options || []).map((o) => [o.key, !!o.default])) };
  const settings = (() => {
    try {
      const shared = JSON.parse(localStorage.getItem('ocean-games.shared') || '{}');
      return { ...defaults, ...shared, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    } catch { return { ...defaults }; }
  })();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
      // input, sensitivity, sound, seated and motion carry over between games
      const { input, sens, sound, seated, reduceMotion } = settings;
      localStorage.setItem('ocean-games.shared', JSON.stringify({ input, sens, sound, seated, reduceMotion }));
    } catch {}
  };

  const canvas = $('c');
  let game;
  try {
    if (mode.createWorld) {
      // 遊戲自己帶 3D 世界（例如模擬器系列的駕駛艙＋機場）；介面跟 LandWorld 一樣
      if (params.get('t')) settings.time = params.get('t');
      game = await mode.createWorld(canvas, { tier: TIER, time: settings.time || mode.defaultTime || 'day' });
      mode.setup?.(game, settings);
    } else if (mode.world === 'land') {
      const { LandWorld } = await import('../land/world.js');
      if (params.get('t')) settings.time = params.get('t'); // ?t=day|dusk|night（測試、截圖用）
      game = new LandWorld(canvas, { tier: TIER, time: settings.time || mode.defaultTime || 'day' });
      mode.setup?.(game, settings);
    } else {
      await loadOcean();
      const VesselGame = makeVesselGame();
      game = new VesselGame(canvas, mode);
    }
    window.game = game;
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend', `<pre class="err">無法啟動 3D 畫面（這台裝置可能不支援 WebGL2）：\n${e.message}</pre>`);
    throw e;
  }
  game.settings = settings;
  game.state = 'menu';
  game.scale = params.has('scale') ? Number(params.get('scale')) : TIER === 'low' ? 0.7 : TIER === 'mid' ? Math.min(devicePixelRatio || 1, 1) : Math.min(devicePixelRatio || 1, 1.5);
  game.resize();

  const kit = createTaikan({ sensitivity: settings.sens, sideOk: !!mode.usesBat }); // 打擊：側身站也能辨識
  window.kit = kit;
  // the two-handed bat swing (and its early "swing started" signal) only reaches games that ask for it,
  // otherwise it would swallow `swing`; enforced here so a mode calling kit.setDisabled itself keeps it too
  if (!mode.usesBat) { const set = kit.setDisabled; kit.setDisabled = (list) => set([...list, 'bat', 'batStart']); }
  const syncDisabled = () => kit.setDisabled(mode.disabledActions(settings));
  syncDisabled();
  game.kit = kit;

  // ── sound ──
  const audio = {
    engine: game.weather ? new AudioEngine() : null, ctx: null,
    async enable(on) {
      if (on && !this.ctx) {
        this.ctx = new AudioContext({ latencyHint: 'playback' });
        if (this.engine) await this.engine.init(this.ctx); else mode.ambience?.(this.ctx, game);
      }
      if (!this.ctx) return;
      if (on) await this.ctx.resume(); else await this.ctx.suspend();
    },
    update() {
      if (!this.ctx || !this.engine) return;
      const S = game.weather.state;
      this.engine.set({ wind: S.wind, rain: S.rain, hs: game.stats ? game.stats.hs : 1, tp: (2 * Math.PI * Math.max(S.wind, 1)) / (0.855 * 9.81), foam: Math.min(2 * 3.84e-6 * Math.pow(S.wind, 3.41), 0.4) });
      this.engine.tick();
    },
    cue(kind) {
      const c = this.ctx;
      if (!c || c.state !== 'running') return;
      if (mode.cue?.(c, kind)) return; // mode-specific sounds (bat crack, crowd)
      const t = c.currentTime;
      const notes = { pass: [659, 880], finish: [523, 659, 784, 1047], bump: [140], pick: [880, 1175], trick: [523, 784, 1047], tick: [440] }[kind] || [440];
      notes.forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = kind === 'bump' ? 'triangle' : 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t + i * 0.09);
        g.gain.linearRampToValueAtTime(kind === 'bump' ? 0.25 : 0.12, t + i * 0.09 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + (kind === 'bump' ? 0.25 : 0.5));
        o.connect(g).connect(c.destination);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.6);
      });
    },
  };
  game.cue = (k) => audio.cue(k);

  // ── HUD helpers ──
  let toastTimer, actionTimer;
  const toast = (text, kind = '') => {
    const el = $('hToast');
    el.textContent = text; el.className = 'toast show ' + kind;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.className = 'toast ' + kind), 1200);
  };
  game.toast = toast;
  const showAction = (text) => {
    $('hAction').textContent = text;
    clearTimeout(actionTimer); actionTimer = setTimeout(() => ($('hAction').textContent = '—'), 1200);
  };

  // ── screens: howto → menu → count → play ⇄ paused → result ──
  const overlays = ['howto', 'menu', 'pause', 'result'];
  let stopHowto = null, howtoReturn = 'menu';
  function show(id) {
    for (const o of overlays) $(o).hidden = o !== id;
    if (id === 'howto') {
      stopHowto?.();
      stopHowto = mountHowto($('hCards'), mode.howto(settings));
    } else { stopHowto?.(); stopHowto = null; }
  }
  function openHowto(from) { howtoReturn = from; game.stateBeforeHowto = game.state; game.state = 'howto'; show('howto'); }
  function closeHowto() {
    if (howtoReturn === 'pause') { game.state = 'paused'; show('pause'); }
    else { game.state = 'menu'; show('menu'); }
  }

  // start the chosen input source (once: a second call while the camera is starting waits for it)
  let inputBusy = null;
  function ensureInput() {
    if (inputBusy) return inputBusy;
    inputBusy = (async () => {
      if (settings.input === 'camera' && kit.source !== 'camera') {
        $('mStart').disabled = true;
        const status = (t) => { $('mStatus').textContent = t; $('hStatus').textContent = t; };
        try { await kit.useCamera({ video: $('video'), onStatus: status, ...mode.cameraInput }); } // 例：打擊只追蹤 1 人
        finally { $('mStart').disabled = false; }
      } else if (settings.input === 'keyboard' && kit.source !== 'keyboard') await kit.useKeyboard(mode.keyboard);
    })();
    return inputBusy.finally(() => { inputBusy = null; });
  }

  function countdown(then) {
    const el = $('count');
    let n = 3;
    el.hidden = false; el.textContent = n;
    clearInterval(countdown.timer);
    countdown.timer = setInterval(() => {
      n--;
      if (n > 0) { el.textContent = n; audio.cue('tick'); }
      else if (n === 0) { el.textContent = mode.goWord || '出發！'; then(); }
      else { clearInterval(countdown.timer); el.hidden = true; }
    }, 900);
  }

  async function startRace() {
    save();
    $('mStatus').textContent = '';
    if (settings.sound) audio.enable(true);
    try { await ensureInput(); }
    catch (err) {
      $('mStatus').textContent = '⚠️ 無法使用鏡頭：' + (err.name === 'NotAllowedError' ? '請在瀏覽器允許使用鏡頭' : err.name === 'NotFoundError' ? '找不到鏡頭' : err.message) + '。可以先改用鍵盤模擬。';
      return;
    }
    mode.newRace(game, settings.diff, settings);
    game.camYaw = undefined;
    show(null);
    $('hud').hidden = false;
    $('hSource').textContent = settings.input === 'camera' ? '📷 鏡頭' : '⌨️ 鍵盤模擬';
    $('camview').hidden = settings.input !== 'camera';
    game.state = 'count';
    countdown(() => { game.state = 'play'; });
  }

  function pause(title = '暫停', text = '雙手舉高（約 1 秒），或按「繼續」。') {
    if (game.state !== 'play') return;
    game.state = 'paused';
    $('pTitle').textContent = title; $('pText').textContent = text;
    show('pause');
  }
  // resuming counts down 3-2-1 so nobody is caught mid-move
  function resume() {
    if (game.state !== 'paused') return;
    show(null);
    game.state = 'count';
    countdown(() => { game.state = 'play'; });
  }

  function finish(timeUp) {
    game.state = 'result';
    const r = mode.result(game, timeUp);
    $('rTitle').textContent = r.title;
    $('rStars').textContent = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    $('rText').innerHTML = r.html;
    show('result');
    audio.cue('finish');
  }
  game.finish = finish;

  function toMenu() { game.state = 'menu'; $('hud').hidden = true; $('camview').hidden = true; show('menu'); mode.newRace(game, settings.diff, settings); }

  // raising both hands must be held ~0.8 s to count (start / pause / resume / "got it")
  let raiseHold = null;
  function raiseConfirmed() {
    if (game.state === 'howto') closeHowto();
    else if (game.state === 'menu') startRace();
    else if (game.state === 'play') pause();
    else if (game.state === 'paused') resume();
    else if (game.state === 'result') startRace();
  }

  kit.on('action', (e) => {
    if (e.type === 'raise' && e.side === 'both') raiseHold = performance.now();
    if (game.state === 'play') mode.onAction(game, e, settings);
    if (game.state === 'play' || game.state === 'count') showAction(describe(e));
  });
  kit.on('status', (e) => {
    $('hDot').classList.toggle('bad', e.tracking !== 'ok');
    if (kit.source !== 'camera' || !e.tracking) return;
    if (e.tracking === 'lost' && game.state === 'play') pause('看不到你', '請回到鏡頭前面。回來後雙手舉高（約 1 秒）就會倒數繼續。');
    else if (e.tracking !== 'ok' && game.state === 'play') toast(e.hint, 'bad');
  });

  // ── menu wiring ──
  function seg(id, value, onPick) {
    const el = $(id);
    const sync = (v) => { for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.v === v); };
    sync(value);
    el.addEventListener('click', (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { sync(v); onPick(v); } });
  }
  const diffNote = () => { $('mDiffNote').textContent = mode.difficulties[settings.diff].note; };
  const inputNote = () => {
    $('mInputNote').textContent = settings.input === 'camera'
      ? '平板橫放，人站或坐在 1.5～2.5 公尺外，上半身和雙手都要入鏡。'
      : '用鍵盤或畫面按鈕模擬動作，走的是跟鏡頭一樣的辨識流程。';
    $('mSafety').open = settings.input === 'camera';
  };
  seg('mDiff', settings.diff, (v) => { settings.diff = v; diffNote(); mode.newRace(game, v, settings); save(); });
  seg('mInput', settings.input, (v) => { settings.input = v; inputNote(); save(); });
  seg('mQuality', TIER, (v) => { if (v !== TIER) { params.set('q', v); location.search = params.toString(); } });
  for (const box of document.querySelectorAll('#mOptions input, #mCommon input, #mCommon2 input')) {
    const k = box.dataset.opt;
    box.checked = !!settings[k];
    box.onchange = () => {
      settings[k] = box.checked; syncDisabled(); save();
      if (k === 'sound') audio.enable(settings.sound);
    };
  }
  $('mSens').value = settings.sens;
  $('mSens').onchange = (e) => { settings.sens = e.target.value; kit.setSensitivity(settings.sens); save(); };
  diffNote(); inputNote();
  mode.menu?.({ grid: document.querySelector('#menu .grid'), game, settings, save });
  $('mStart').onclick = startRace;
  $('mHowto').onclick = () => openHowto('menu');
  $('hOk').onclick = closeHowto;
  $('hPause').onclick = () => pause();
  $('pResume').onclick = resume;
  $('pHowto').onclick = () => openHowto('pause');
  $('pQuit').onclick = toMenu;
  $('rAgain').onclick = startRace;
  $('rMenu').onclick = toMenu;
  // big on-screen buttons (tablet without camera): they drive the simulated puppet like a key would
  for (const b of $('hTouch').querySelectorAll('button')) {
    const def = mode.touchButtons[b.dataset.i];
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); kit.keyboard?.press(def.press, true); });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  // the chosen input is live from the start, so raising both hands (or holding Enter) works on the
  // how-to screen and the menu too; with the camera this asks for permission right away
  ensureInput().catch((err) => {
    $('hStatus').textContent = '⚠️ 鏡頭沒有啟動（' + (err.name === 'NotAllowedError' ? '沒有允許使用鏡頭' : err.name === 'NotFoundError' ? '找不到鏡頭' : err.message) + '），請按「我懂了」，再到選單改用鍵盤模擬或重新開始。';
  });

  mode.newRace(game, settings.diff, settings);
  // the how-to screen opens first: nobody is there to explain the game
  if (params.has('menu')) show('menu'); else openHowto('menu');

  // ── loop ──
  const camCtx = $('camview').querySelector('canvas').getContext('2d');
  let last = performance.now(), avg = 1 / 60, settle = 0;
  const maxScale = TIER === 'low' ? 1 : TIER === 'mid' ? Math.min(devicePixelRatio || 1, 1.25) : Math.min(devicePixelRatio || 1, 1.5);
  const minScale = TIER === 'rt' ? 0.5 : 0.4;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const st = kit.state;
    if (raiseHold !== null) {
      if (st.armsUp < 1) raiseHold = null;
      else if (now - raiseHold > 800) { raiseHold = null; raiseConfirmed(); }
    }
    if (game.state === 'play') {
      for (const ev of mode.update(game, dt, st, settings) || []) {
        if (ev.text) toast(ev.text, ev.kind);
        if (ev.cue) audio.cue(ev.cue);
      }
      game.timeLeft = Math.max(game.timeLeft - dt, 0);
      if (game.state === 'play') {
        if (mode.done(game)) finish(false);
        else if (game.timeLeft <= 0) finish(true);
      }
    } else if (game.state === 'menu' || game.state === 'result' || (game.state === 'howto' && howtoReturn === 'menu')) {
      // drifting idly behind the menus; a race that is paused, counting down or showing the
      // how-to screen from the pause menu stays exactly where it was
      mode.idle?.(game, dt, st, settings);
    }

    game.frame(dt);
    audio.update();

    if (!$('hud').hidden) {
      const h = mode.hud(game, st, settings);
      for (const c of mode.hudChips) $('h_' + c.id).textContent = h[c.id];
      $('hTime').textContent = fmtTime(game.timeLeft);
      $('hTime').parentElement.classList.toggle('low', game.timeLeft < 15);
      mode.hudExtraUpdate?.(game, st, settings);
      $('hKeys').hidden = settings.input !== 'keyboard' || game.state !== 'play';
      $('hTouch').hidden = settings.input !== 'keyboard' || game.state !== 'play';
      const arrow = $('hArrow');
      const tg = (game.state === 'play' || game.state === 'count') && mode.target?.(game);
      if (tg) {
        const p = game.project([tg.xz[0], tg.y ?? 1.2, tg.xz[1]]);
        const m = 48;
        const onScreen = !p.behind && p.x > m && p.x < innerWidth - m && p.y > 90 && p.y < innerHeight - 90;
        let x = p.x, y = p.y, rot = 180;
        if (!onScreen) {
          let dx = p.x - innerWidth / 2, dy = p.y - innerHeight / 2;
          if (p.behind) { dx = -dx; dy = Math.abs(dy) + innerHeight; }
          const s = Math.min((innerWidth / 2 - m) / Math.abs(dx || 1e-6), (innerHeight / 2 - 90) / Math.abs(dy || 1e-6));
          x = innerWidth / 2 + dx * s; y = innerHeight / 2 + dy * s;
          rot = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        } else y -= 70;
        arrow.style.transform = `translate(${x}px, ${y}px)`;
        arrow.querySelector('.tri').style.transform = `rotate(${rot}deg)`;
        $('hDist').textContent = tg.label;
        arrow.hidden = false;
      } else arrow.hidden = true;
      const cs = kit.stats;
      $('hPerf').textContent = `畫質 ${{ low: '低', mid: '中', rt: '高' }[TIER]}・${Math.round(1 / avg)} 格/秒・解析度 ${Math.round(game.scale * 100)}%${cs ? `・鏡頭 ${cs.fps} 格/秒` : ''}`;
      if (raiseHold !== null) $('hAction').textContent = '保持雙手舉高…';
      if (!$('camview').hidden) {
        const cv = camCtx.canvas;
        camCtx.clearRect(0, 0, cv.width, cv.height);
        drawSkeleton(camCtx, kit.lastPose, { width: 4, color: st.tracking === 'ok' ? '#63b8ff' : '#ff8a65' });
      }
    }

    avg += (dt - avg) * 0.05;
    if (!params.has('scale') && (settle += dt) > 2.5 && !document.hidden) {
      const next = avg > 1 / 27 ? Math.max(game.scale * 0.88, minScale) : avg < 1 / 50 ? Math.min(game.scale * 1.06, maxScale) : game.scale;
      if (Math.abs(next - game.scale) > 0.02) { game.scale = next; game.resize(); settle = 0; }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  return game;
}

// shared helpers for modes
export const util = {
  clamp,
  wrap: (a) => Math.atan2(Math.sin(a), Math.cos(a)),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]),
};
