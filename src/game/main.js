// 划舟浮標賽 (kayak buoy race): the open-water renderer plus a kayak, a buoy course, a chase camera,
// HUD and game loop. Gameplay input arrives only as taikan-kit action events (and its continuous
// lean value), whether they come from the camera, the keyboard simulator or a recording.
import { createTaikan, describe } from '../../packages/taikan-kit/src/index.js';
import { Kayak, Course, DIFFICULTY } from './logic.js';

const params = new URLSearchParams(location.search);
// pick the quality tier before the engine module reads ?q= (tablets and phones start on 'low')
const TIERS = ['low', 'mid', 'rt'];
if (!TIERS.includes(params.get('q'))) {
  const touch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  params.set('q', touch ? 'low' : 'mid');
  history.replaceState(null, '', '?' + params);
}
const TIER = params.get('q');
const [{ App }, { OceanProbe }, { Props, modelMatrix, COLORS }, { mul }, { AudioEngine }] = await Promise.all([
  import('../app.js'), import('../ocean/probe.js'), import('./props.js'), import('../math.js'), import('../audio/audio.js'),
]);

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const BUOYS_PROBED = 8;          // the next four gates float on the probed sea, farther ones on the mean level
const COURSE_HEADING = (110 * Math.PI) / 180; // across the presets' wind (from 20°): a cross wind
const SETTINGS_KEY = 'ocean-games.kayak.settings';

class KayakGame extends App {
  constructor(canvas) {
    super(canvas);
    this.props = new Props(this.gl);
    this.sea = new OceanProbe(this.gl, 1 + BUOYS_PROBED);
    this.cam.fov = (55 * Math.PI) / 180;
    this.vis = { y: 0, pitch: 0, roll: 0, dx: 0, dz: 0 };
    this.camYaw = COURSE_HEADING;
    this.lean = 0;
    this.orbit = 0;
    this.newRace('easy');
  }

  newRace(diffKey) {
    this.diffKey = diffKey;
    this.diff = DIFFICULTY[diffKey];
    this.boat = new Kayak({ heading: COURSE_HEADING });
    this.course = new Course(this.diff, { seed: 1 + Math.floor(Math.random() * 1000), heading: COURSE_HEADING });
    this.timeLeft = this.course.time;
    this.camYaw = COURSE_HEADING;
    const W = this.weather;
    W.setPreset(this.diff.weather);
    W.set('sunElev', 32); W.set('sunAz', 250); W.set('lightning', 0);
    W.snap();
  }

  // probe points: boat first, then the buoys of the next gates
  probePoints() {
    const pts = [[this.boat.x, this.boat.z]];
    this.probedBuoys = [];
    for (let i = this.course.next; i < this.course.gates.length && pts.length < 1 + BUOYS_PROBED; i++) {
      this.course.buoys(this.course.gates[i]).forEach((b, j) => { pts.push(b); this.probedBuoys.push(i + ':' + j); });
    }
    return pts;
  }

  // replaces the viewer's floating camera: the boat floats on the probed sea, the camera chases it
  updateCamera(dt) {
    this.sea.run(this.ocean.textures(), this.probePoints(), 3.5);
    const r = this.sea.results[0];
    this.seaAtBoat = r;
    const v = this.vis, k = 1 - Math.exp(-dt * 6);
    const f = [Math.cos(this.boat.h), Math.sin(this.boat.h)];
    const along = r.sx * f[0] + r.sz * f[1], across = -r.sx * f[1] + r.sz * f[0];
    v.y += (r.height - v.y) * k;
    v.dx += (r.dx * 0.8 - v.dx) * k; v.dz += (r.dz * 0.8 - v.dz) * k;
    v.pitch += (Math.atan(along) * 0.8 - v.pitch) * k;
    // the paddler edges the kayak into a lean, the sea rolls it
    v.roll += (-Math.atan(across) * 0.8 + this.lean * 0.16 - v.roll) * k;
    const bx = this.boat.x + v.dx, bz = this.boat.z + v.dz;
    this.boatPos = [bx, v.y - 0.04, bz];

    const c = this.cam;
    let yaw, back, height;
    if (this.state === 'play' || this.state === 'count' || this.state === 'paused') {
      // heading follows the boat with a lag, so turns are visible
      let d = this.boat.h - this.camYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.camYaw += d * (1 - Math.exp(-dt * 1.8));
      yaw = this.camYaw; back = 7.2; height = 2.5;
    } else {
      // menus and results: a slow orbit around the boat
      this.orbit += dt * 0.12;
      yaw = this.boat.h + 2.3 + Math.sin(this.orbit) * 0.9; back = 8.5; height = 2.2;
    }
    const cf = [Math.cos(yaw), Math.sin(yaw)];
    c.pos = [bx - cf[0] * back, height + v.y * 0.6, bz - cf[1] * back];
    const look = [bx + cf[0] * 3 - c.pos[0], v.y + 0.5 - c.pos[1], bz + cf[1] * 3 - c.pos[2]];
    c.yaw = Math.atan2(look[2], look[0]);
    c.pitch = Math.atan2(look[1], Math.hypot(look[0], look[2]));
    c.roll = v.roll * 0.2; c.tilt = 0;
    c.base = [bx, bz];
  }

  drawProps(ctx) {
    const P = this.props, v = this.vis;
    const boatM = modelMatrix(this.boatPos, this.boat.h, v.pitch, v.roll);
    P.add('kayak', boatM);
    P.add('paddler', boatM);
    // paddle: idle across the cockpit, or sweeping a blade from bow to stern on the stroke side
    let pr = 0, py = 0, lift = 0;
    const s = this.boat.stroke;
    if (s) {
      const u = clamp(s.t / 0.7, 0, 1);
      const side = s.side === 'both' ? (u < 0.5 ? 'left' : 'right') : s.side;
      const uu = s.side === 'both' ? (u % 0.5) * 2 : u;
      const sg = side === 'left' ? -1 : 1;
      pr = sg * 0.6 * Math.sin(Math.PI * uu);
      py = -sg * (0.7 - 1.4 * uu);
      lift = -0.08 * Math.sin(Math.PI * uu);
    } else pr = Math.sin(this.time * 1.3) * 0.05;
    P.add('paddle', mul(boatM, modelMatrix([0.12, 0.47 + lift, 0], py, 0, pr)));
    // buoys: next gate glows and pulses, passed gates turn grey
    const near = new Map(this.probedBuoys?.map((key, i) => [key, this.sea.results[1 + i]]) || []);
    for (const g of this.course.gates) {
      const dist = Math.hypot(g.c[0] - this.boat.x, g.c[1] - this.boat.z);
      if (dist > 600) continue;
      const isNext = g.i === this.course.next;
      this.course.buoys(g).forEach((b, j) => {
        const r = near.get(g.i + ':' + j);
        const y = r ? r.height : 0;
        const bob = Math.sin(this.time * 1.7 + g.i * 1.3 + j) * 0.04;
        const tint = g.passed || g.missed ? COLORS.grey : j === 0 ? COLORS.red : COLORS.green;
        const glow = isNext ? 0.35 + 0.25 * Math.sin(this.time * 5) : 0;
        const pos = [b[0] + (r ? r.dx * 0.8 : 0), y + bob, b[1] + (r ? r.dz * 0.8 : 0)];
        P.add('buoy', modelMatrix(pos, Math.atan2(g.n[1], g.n[0]) + Math.PI / 2, r ? Math.atan(r.sx) * 0.5 : 0, r ? -Math.atan(r.sz) * 0.5 : 0), tint, glow);
      });
    }
    P.draw(ctx);
  }

  // screen position of a world point (pixels, CSS); null if behind the camera
  project(p) {
    const M = this.cameraMatrices().vp;
    const x = M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12];
    const y = M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13];
    const w = M[3] * p[0] + M[7] * p[1] + M[11] * p[2] + M[15];
    return { x: (x / w * 0.5 + 0.5) * innerWidth, y: (0.5 - y / w * 0.5) * innerHeight, behind: w <= 0 };
  }
}

// ── engine and input ────────────────────────────────────────────────────────
const canvas = $('c');
let game;
try {
  game = new KayakGame(canvas);
  window.game = game;
} catch (e) {
  document.body.insertAdjacentHTML('beforeend', `<pre class="err">無法啟動 3D 畫面（這台裝置可能不支援 WebGL2）：\n${e.message}</pre>`);
  throw e;
}
game.state = 'menu';
game.scale = params.has('scale') ? Number(params.get('scale')) : TIER === 'low' ? 0.7 : TIER === 'mid' ? Math.min(devicePixelRatio || 1, 1) : Math.min(devicePixelRatio || 1, 1.5);
game.resize();

const settings = (() => { try { return { diff: 'easy', input: 'keyboard', auto: false, noLean: false, sens: 'normal', sound: false, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { return { diff: 'easy', input: 'keyboard', auto: false, noLean: false, sens: 'normal', sound: false }; } })();
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {} };

const kit = createTaikan({ sensitivity: settings.sens });
window.kit = kit;
const kitDisabled = () => ['jump', 'crouch', 'swing', ...(settings.noLean ? ['lean'] : [])];
kit.setDisabled(kitDisabled());

// ── sound: the viewer's sea / wind / rain engine, plus two synthesized cues ─
const audio = {
  engine: new AudioEngine(), ctx: null,
  async enable(on) {
    if (on && !this.ctx) { this.ctx = new AudioContext({ latencyHint: 'playback' }); await this.engine.init(this.ctx); }
    if (!this.ctx) return;
    if (on) await this.ctx.resume(); else await this.ctx.suspend();
  },
  update() {
    if (!this.ctx) return;
    const S = game.weather.state;
    this.engine.set({ wind: S.wind, rain: S.rain, hs: game.stats ? game.stats.hs : 1, tp: (2 * Math.PI * Math.max(S.wind, 1)) / (0.855 * 9.81), foam: Math.min(2 * 3.84e-6 * Math.pow(S.wind, 3.41), 0.4) });
    this.engine.tick();
  },
  cue(kind) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime;
    const notes = kind === 'pass' ? [659, 880] : kind === 'finish' ? [523, 659, 784, 1047] : [140];
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

// ── HUD ─────────────────────────────────────────────────────────────────────
let toastTimer;
function toast(text, kind = '') {
  const el = $('hToast');
  el.textContent = text; el.className = 'toast show ' + kind;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.className = 'toast ' + kind), 1100);
}
let actionTimer;
function showAction(text) {
  $('hAction').textContent = text;
  clearTimeout(actionTimer); actionTimer = setTimeout(() => ($('hAction').textContent = '—'), 1200);
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ── state machine: menu → count → play ⇄ paused → result ───────────────────
function show(id) { for (const o of ['menu', 'pause', 'result']) $(o).hidden = o !== id; }

async function startRace() {
  saveSettings();
  $('mStatus').textContent = '';
  if (settings.sound) audio.enable(true);
  if (settings.input === 'camera' && kit.source !== 'camera') {
    try {
      $('mStart').disabled = true;
      await kit.useCamera({ video: $('video'), onStatus: (s) => ($('mStatus').textContent = s) });
    } catch (err) {
      $('mStart').disabled = false;
      $('mStatus').textContent = '⚠️ 無法使用鏡頭：' + (err.name === 'NotAllowedError' ? '請在瀏覽器允許使用鏡頭' : err.name === 'NotFoundError' ? '找不到鏡頭' : err.message) + '。可以先改用鍵盤模擬。';
      return;
    }
    $('mStart').disabled = false;
  } else if (settings.input === 'keyboard' && kit.source !== 'keyboard') await kit.useKeyboard();
  game.newRace(settings.diff);
  show(null);
  $('hud').hidden = false;
  $('hKeys').hidden = settings.input !== 'keyboard';
  $('hSource').textContent = settings.input === 'camera' ? '📷 鏡頭' : '⌨️ 鍵盤模擬';
  game.state = 'count';
  let n = 3;
  const el = $('count');
  el.hidden = false; el.textContent = n;
  const tick = setInterval(() => {
    n--;
    if (n > 0) el.textContent = n;
    else if (n === 0) { el.textContent = '出發！'; game.state = 'play'; }
    else { clearInterval(tick); el.hidden = true; }
  }, 900);
}

function pause(title = '暫停', text = '雙手舉高（約 1 秒），或按「繼續」。') {
  if (game.state !== 'play') return;
  game.state = 'paused';
  $('pTitle').textContent = title; $('pText').textContent = text;
  show('pause');
}
function resume() { if (game.state !== 'paused') return; show(null); game.state = 'play'; }

function finish(timeUp) {
  game.state = 'result';
  const c = game.course;
  const stars = c.stars(game.timeLeft);
  $('rTitle').textContent = timeUp ? '時間到！' : '完成！';
  $('rStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  const used = c.time - game.timeLeft;
  $('rText').innerHTML = `穿過 <b>${c.passed}</b> / ${c.gates.length} 個浮標門・分數 <b>${c.score + (timeUp ? 0 : Math.round(game.timeLeft) * 5)}</b><br>` +
    `${timeUp ? '' : `用時 ${fmtTime(used)}（剩下 ${Math.round(game.timeLeft)} 秒，每秒加 5 分）・`}划槳 ${game.boat.strokes} 次${c.bumps ? `・碰到浮標 ${c.bumps} 次` : ''}`;
  show('result');
  audio.cue('finish');
}

function toMenu() { game.state = 'menu'; $('hud').hidden = true; show('menu'); game.newRace(settings.diff); }

// raising both hands has to be held for ~0.8 s to count as start / pause / resume (no accidental pauses)
let raiseHold = null;
function raiseConfirmed() {
  if (game.state === 'menu') startRace();
  else if (game.state === 'play') pause();
  else if (game.state === 'paused') resume();
  else if (game.state === 'result') startRace();
}

kit.on('action', (e) => {
  if (e.type === 'paddle') {
    if (game.state === 'play') game.boat.paddle(e.side, e.strength, game.diff.power);
  }
  if (e.type === 'raise' && e.side === 'both') raiseHold = performance.now();
  if (game.state === 'play' || game.state === 'count') showAction(describe(e));
});
kit.on('status', (e) => {
  $('hDot').classList.toggle('bad', e.tracking !== 'ok');
  if (kit.source !== 'camera') return;
  if (e.tracking === 'lost' && game.state === 'play') pause('看不到你', '請回到鏡頭前面。回來後雙手舉高（約 1 秒）就會繼續。');
  else if (e.tracking !== 'ok' && game.state === 'play') toast(e.hint, 'bad');
});

// ── menu wiring ─────────────────────────────────────────────────────────────
function seg(id, value, onPick) {
  const el = $(id);
  const sync = (v) => { for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.v === v); };
  sync(value);
  el.addEventListener('click', (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { sync(v); onPick(v); } });
}
$('mDiff').innerHTML = Object.entries(DIFFICULTY).map(([k, d]) => `<button data-v="${k}">${d.label}</button>`).join('');
const diffNote = () => { const d = DIFFICULTY[settings.diff]; $('mDiffNote').textContent = `${d.note}。${d.gates} 個浮標門。`; };
const inputNote = () => {
  $('mInputNote').textContent = settings.input === 'camera'
    ? '平板橫放，人站或坐在 1.5～2.5 公尺外，上半身和雙手都要入鏡。雙手在身體左（右）側由上往下拉 = 左（右）邊划槳。'
    : 'A 左划、D 右划、W 雙槳、←→ 傾斜轉向、Enter 按住 = 雙手舉高。走的是跟鏡頭一樣的辨識流程。';
  $('mSafety').open = settings.input === 'camera';
};
seg('mDiff', settings.diff, (v) => { settings.diff = v; diffNote(); game.newRace(v); saveSettings(); });
seg('mInput', settings.input, (v) => { settings.input = v; inputNote(); saveSettings(); });
seg('mQuality', TIER, (v) => { if (v !== TIER) { params.set('q', v); location.search = params.toString(); } });
$('mAuto').checked = settings.auto;
$('mNoLean').checked = settings.noLean;
$('mSens').value = settings.sens;
$('mSound').checked = settings.sound;
$('mAuto').onchange = (e) => { settings.auto = e.target.checked; saveSettings(); };
$('mNoLean').onchange = (e) => { settings.noLean = e.target.checked; kit.setDisabled(kitDisabled()); saveSettings(); };
$('mSens').onchange = (e) => { settings.sens = e.target.value; kit.setSensitivity(settings.sens); saveSettings(); };
$('mSound').onchange = (e) => { settings.sound = e.target.checked; audio.enable(settings.sound); saveSettings(); };
diffNote(); inputNote();
$('mStart').onclick = startRace;
$('hPause').onclick = () => pause();
$('pResume').onclick = resume;
$('pQuit').onclick = toMenu;
$('rAgain').onclick = startRace;
$('rMenu').onclick = toMenu;
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
// keyboard simulation is live from the start, so "Enter (hold)" works on the menu too
if (settings.input === 'keyboard') kit.useKeyboard();

// ── loop ────────────────────────────────────────────────────────────────────
let last = performance.now(), avg = 1 / 60, settle = 0;
const maxScale = TIER === 'low' ? 1 : TIER === 'mid' ? Math.min(devicePixelRatio || 1, 1.25) : Math.min(devicePixelRatio || 1, 1.5);
const minScale = TIER === 'rt' ? 0.5 : 0.4;
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  const st = kit.state;
  game.lean = settings.noLean ? 0 : st.lean;

  if (raiseHold !== null) {
    if (st.armsUp < 1) raiseHold = null;
    else if (now - raiseHold > 800) { raiseHold = null; raiseConfirmed(); }
  }

  if (game.state === 'play') {
    const b = game.boat, p0 = [b.x, b.z];
    const S = game.weather.state, wd = (S.windDir * Math.PI) / 180;
    b.update(dt, { lean: game.lean, auto: settings.auto ? game.diff.autoSpeed : 0, drift: game.diff.drift, wind: [Math.cos(wd) * S.wind, Math.sin(wd) * S.wind], sea: game.seaAtBoat });
    for (const e of game.course.step(p0, [b.x, b.z])) {
      if (e.type === 'pass') { toast(game.course.done ? '最後一門！' : `通過第 ${e.gate.i + 1} 門 +100`, 'good'); audio.cue('pass'); }
      if (e.type === 'miss') toast(`錯過第 ${e.gate.i + 1} 門`, 'bad');
      if (e.type === 'bump') { toast('碰到浮標了', 'bad'); audio.cue('bump'); b.v *= 0.5; }
    }
    game.timeLeft = Math.max(game.timeLeft - dt, 0);
    if (game.course.done) finish(false);
    else if (game.timeLeft <= 0) finish(true);
  } else if (game.state !== 'paused') {
    // drifting idly in menus
    game.boat.update(dt, { sea: game.seaAtBoat });
  }

  game.frame(dt);
  audio.update();

  // HUD
  if (!$('hud').hidden) {
    const c = game.course;
    $('hGates').textContent = `${c.passed} / ${c.gates.length}`;
    $('hScore').textContent = c.score;
    $('hTime').textContent = fmtTime(game.timeLeft);
    $('hTime').parentElement.classList.toggle('low', game.timeLeft < 15);
    $('hSpeed').textContent = Math.max(game.boat.v, 0).toFixed(1);
    $('hLean').style.left = (game.lean < 0 ? 50 + game.lean * 50 : 50) + '%';
    $('hLean').style.width = Math.abs(game.lean) * 50 + '%';
    const arrow = $('hArrow');
    $('hKeys').hidden = settings.input !== 'keyboard' || game.state !== 'play';
    if (!c.done && (game.state === 'play' || game.state === 'count')) {
      const g = c.gates[c.next];
      const p = game.project([g.c[0], 1.2, g.c[1]]);
      const m = 48;
      const onScreen = !p.behind && p.x > m && p.x < innerWidth - m && p.y > 90 && p.y < innerHeight - 90;
      let x = p.x, y = p.y, rot = 180;
      if (!onScreen) {
        // clamp to the screen edge, pointing toward the gate
        let dx = p.x - innerWidth / 2, dy = p.y - innerHeight / 2;
        if (p.behind) { dx = -dx; dy = Math.abs(dy) + innerHeight; }
        const s = Math.min((innerWidth / 2 - m) / Math.abs(dx || 1e-6), (innerHeight / 2 - 90) / Math.abs(dy || 1e-6));
        x = innerWidth / 2 + dx * s; y = innerHeight / 2 + dy * s;
        rot = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      } else y -= 70;
      arrow.style.transform = `translate(${x}px, ${y}px)`;
      arrow.querySelector('.tri').style.transform = `rotate(${rot}deg)`;
      $('hDist').textContent = `第 ${g.i + 1} 門・${Math.round(Math.hypot(g.c[0] - game.boat.x, g.c[1] - game.boat.z))} 公尺`;
      arrow.hidden = false;
    } else arrow.hidden = true;
    const cs = kit.stats;
    $('hPerf').textContent = `畫質 ${{ low: '低', mid: '中', rt: '高' }[TIER]}・${Math.round(1 / avg)} 格/秒・解析度 ${Math.round(game.scale * 100)}%${cs ? `・鏡頭 ${cs.fps} 格/秒 ${cs.inferMs.toFixed(0)} 毫秒` : ''}`;
    if (raiseHold !== null) $('hAction').textContent = '保持雙手舉高…';
  }

  // dynamic resolution: hold ~30 fps on slow GPUs, sharpen on fast ones
  avg += (dt - avg) * 0.05;
  if (!params.has('scale') && (settle += dt) > 2.5 && !document.hidden) {
    const next = avg > 1 / 27 ? Math.max(game.scale * 0.88, minScale) : avg < 1 / 50 ? Math.min(game.scale * 1.06, maxScale) : game.scale;
    if (Math.abs(next - game.scale) > 0.02) { game.scale = next; game.resize(); settle = 0; }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
