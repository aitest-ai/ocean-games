// 划舟浮標賽 (kayak buoy race) as a shell mode: paddle strokes push and turn the kayak, leaning
// steers it like a rudder, and the course is a slalom of red / green buoy gates.
import { fmtTime } from './shell.js';
import { Kayak, Course, DIFFICULTY } from './logic.js';
import { COLORS, modelMatrix } from './props.js';
import { mul } from '../math.js';

const COURSE_HEADING = (110 * Math.PI) / 180; // across the presets' wind (from 20°): a cross wind
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

export const kayak = {
  id: 'kayak', title: '划舟浮標賽', icon: '🛶',
  intro: '划槳前進，穿過紅綠浮標中間的門。<b>左邊划，船頭往右轉</b>；右邊划，船頭往左轉；身體傾斜也能轉向。',
  goal: '依照箭頭，讓小艇<b>穿過紅色和綠色浮標中間</b>。全部穿過就完成！',
  difficulties: Object.fromEntries(Object.entries(DIFFICULTY).map(([k, d]) => [k, { ...d, note: `${d.note}。${d.gates} 個浮標門。` }])),
  options: [
    { key: 'auto', label: '不划槳也會前進（跳過划槳，只用傾斜轉向）' },
    { key: 'noLean', label: '不用傾斜（只用划槳轉向）' },
  ],
  keysHelp: 'A 左划　D 右划　W 雙槳　←→ 傾斜轉向　Enter（按住）雙手舉高＝暫停',
  hudChips: [{ id: 'gates', label: '浮標門' }, { id: 'score', label: '分數' }, { id: 'speed', label: '速度', unit: '公尺/秒' }],
  hudExtra: '<div class="widget">身體傾斜<div class="bar center"><i id="kLean"></i></div></div>',
  camera: { back: 7.2, height: 2.5, fov: 55 },

  howto(s) {
    const cards = [
      { move: 'paddle-left', title: '左邊划槳', text: '雙手在身體<b>左邊</b>由上往下拉 → 船往前，<b>船頭往右轉</b>', seated: '坐著一樣做', skip: s.auto ? '已設定：不划也會前進' : '做不到可以勾「不划槳也會前進」' },
      { move: 'paddle-right', title: '右邊划槳', text: '雙手在身體<b>右邊</b>由上往下拉 → 船往前，<b>船頭往左轉</b>', seated: '坐著一樣做' },
      { move: 'lean', title: '身體傾斜', text: '上半身往左／右歪 → 船慢慢往那邊轉', seated: '坐著一樣做', skip: '可以關掉，只用划槳轉向' },
      { move: 'raise-both', title: '雙手舉高 1 秒', text: '開始、暫停、繼續', seated: '坐著一樣做' },
    ];
    return s.noLean ? cards.filter((c) => c.move !== 'lean') : cards;
  },

  disabledActions(s) { return ['jump', 'crouch', 'swing', ...(s.noLean ? ['lean'] : [])]; },

  newRace(game, diffKey) {
    const d = DIFFICULTY[diffKey];
    game.diff = d;
    game.vessel = game.boat = new Kayak({ heading: COURSE_HEADING });
    game.course = new Course(d, { seed: 1 + Math.floor(Math.random() * 1000), heading: COURSE_HEADING });
    game.timeLeft = game.course.time;
    const W = game.weather;
    W.setPreset(d.weather);
    W.set('sunElev', 32); W.set('sunAz', 250); W.set('lightning', 0);
    W.snap();
  },

  onAction(game, e) {
    if (e.type === 'paddle') game.boat.paddle(e.side, e.strength, game.diff.power);
  },

  lean: (game, st, s) => (s.noLean ? 0 : st.lean),

  update(game, dt, st, s) {
    const b = game.boat, p0 = [b.x, b.z];
    const S = game.weather.state, wd = (S.windDir * Math.PI) / 180;
    game.leanNow = this.lean(game, st, s);
    b.update(dt, { lean: game.leanNow, auto: s.auto ? game.diff.autoSpeed : 0, drift: game.diff.drift, wind: [Math.cos(wd) * S.wind, Math.sin(wd) * S.wind], sea: game.seaAtVessel });
    const out = [];
    for (const e of game.course.step(p0, [b.x, b.z])) {
      if (e.type === 'pass') out.push({ text: game.course.done ? '最後一門！' : `通過第 ${e.gate.i + 1} 門 +100`, kind: 'good', cue: 'pass' });
      if (e.type === 'miss') out.push({ text: `錯過第 ${e.gate.i + 1} 門`, kind: 'bad' });
      if (e.type === 'bump') { out.push({ text: '碰到浮標了', kind: 'bad', cue: 'bump' }); b.v *= 0.5; }
    }
    return out;
  },

  idle(game, dt, st, s) { game.leanNow = this.lean(game, st, s); game.boat.update(dt, { sea: game.seaAtVessel }); },
  done: (game) => game.course.done,
  rollExtra: (game) => (game.leanNow || 0) * 0.16,

  probePoints(game) {
    const out = [], c = game.course;
    for (let i = c.next; i < c.gates.length && out.length < 8; i++) c.buoys(c.gates[i]).forEach((b, j) => out.push({ key: i + ':' + j, xz: b }));
    return out;
  },

  draw(game, P) {
    const boatM = game.vesselMatrix();
    P.add('kayak', boatM);
    P.add('paddler', boatM);
    // paddle: idle across the cockpit, or sweeping a blade from bow to stern on the stroke side
    let pr = 0, py = 0, lift = 0;
    const s = game.boat.stroke;
    if (s) {
      const u = clamp(s.t / 0.7, 0, 1);
      const side = s.side === 'both' ? (u < 0.5 ? 'left' : 'right') : s.side;
      const uu = s.side === 'both' ? (u % 0.5) * 2 : u;
      const sg = side === 'left' ? -1 : 1;
      pr = sg * 0.6 * Math.sin(Math.PI * uu);
      py = -sg * (0.7 - 1.4 * uu);
      lift = -0.08 * Math.sin(Math.PI * uu);
    } else pr = Math.sin(game.time * 1.3) * 0.05;
    P.add('paddle', mul(boatM, modelMatrix([0.12, 0.47 + lift, 0], py, 0, pr)));
    drawGates(game, P, game.course);
  },

  target(game) {
    const c = game.course;
    if (c.done) return null;
    const g = c.gates[c.next];
    return { xz: g.c, label: `第 ${g.i + 1} 門・${Math.round(Math.hypot(g.c[0] - game.boat.x, g.c[1] - game.boat.z))} 公尺` };
  },

  hud(game) {
    const c = game.course;
    return { gates: `${c.passed} / ${c.gates.length}`, score: c.score, speed: Math.max(game.boat.v, 0).toFixed(1) };
  },
  hudExtraUpdate(game) {
    const l = game.leanNow || 0, el = document.getElementById('kLean');
    el.style.left = (l < 0 ? 50 + l * 50 : 50) + '%';
    el.style.width = Math.abs(l) * 50 + '%';
  },

  result(game, timeUp) {
    const c = game.course;
    const used = c.time - game.timeLeft;
    return {
      title: timeUp ? '時間到！' : '完成！',
      stars: c.stars(game.timeLeft),
      html: `穿過 <b>${c.passed}</b> / ${c.gates.length} 個浮標門・分數 <b>${c.score + (timeUp ? 0 : Math.round(game.timeLeft) * 5)}</b><br>` +
        `${timeUp ? '' : `用時 ${fmtTime(used)}（剩下 ${Math.round(game.timeLeft)} 秒，每秒加 5 分）・`}划槳 ${game.boat.strokes} 次${c.bumps ? `・碰到浮標 ${c.bumps} 次` : ''}`,
    };
  },
};

// buoy gates: next gate glows and pulses, passed ones turn grey (shared with the sailing marks)
export function drawGates(game, P, course) {
  for (const g of course.gates) {
    if (Math.hypot(g.c[0] - game.vessel.x, g.c[1] - game.vessel.z) > 600) continue;
    const isNext = g.i === course.next;
    course.buoys(g).forEach((b, j) => {
      const r = game.seaFor(g.i + ':' + j);
      const bob = Math.sin(game.time * 1.7 + g.i * 1.3 + j) * 0.04;
      const tint = g.passed || g.missed ? COLORS.grey : j === 0 ? COLORS.red : COLORS.green;
      const glow = isNext ? 0.35 + 0.25 * Math.sin(game.time * 5) : 0;
      const pos = [b[0] + (r ? r.dx * 0.8 : 0), (r ? r.height : 0) + bob, b[1] + (r ? r.dz * 0.8 : 0)];
      P.add('buoy', modelMatrix(pos, Math.atan2(g.n[1], g.n[0]) + Math.PI / 2, r ? Math.atan(r.sx) * 0.5 : 0, r ? -Math.atan(r.sz) * 0.5 : 0), tint, glow);
    });
  }
}
