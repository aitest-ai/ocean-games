// 衝浪 (surf ride) as a shell mode: lean to carve, crouch (or bend forward when seated) to pump the
// board faster, raise one hand for a trick pose; dodge driftwood and rocks, pick up floating litter.
import { Board, SurfField, SURF_DIFF, autoLean } from './surf-logic.js';
import { MeshBuilder, modelMatrix, scaled, lin, COLORS } from './props.js';
import { mul } from '../math.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

function meshes(P) {
  // board: 2.3 m, nose along +x with a little rocker, deck at y ≈ 0.07
  const b = new MeshBuilder();
  const L = 2.3, W = 0.56, white = lin(0xf4f6f2), stripe = lin(0x18a5a8);
  const rows = [];
  for (let i = 0; i <= 20; i++) {
    const u = (i / 20) * 2 - 1;
    const w = (W / 2) * Math.pow(Math.max(1 - Math.pow(Math.abs(u + 0.1), 2.2), 0), 0.55) + 0.01;
    const rock = 0.09 * Math.pow(Math.max(u, 0), 3) + 0.02 * u * u;
    rows.push(Array.from({ length: 13 }, (_, j) => {
      const a = (j / 12) * Math.PI * 2;
      return [u * L / 2, rock + 0.035 + Math.sin(a) * 0.035, Math.cos(a) * w];
    }));
  }
  b.surface(rows, (i) => (i === 9 || i === 10 ? stripe : white));
  P.define('surfboard', b);

  // rider standing on the board (feet at y = 0.07), facing the nose, without arms
  const r = new MeshBuilder();
  const suit = lin(0x1d2f5a), shirt = lin(0xf2b31f), skin = lin(0xd9a074), hair = lin(0x2a1d14);
  for (const z of [-0.17, 0.17]) r.cylinder(0, 0.07, z, 0.075, 0.09, 0.85, suit, 10);   // legs
  r.cylinder(0, 0.9, 0, 0.2, 0.22, 0.55, shirt, 14);                                     // torso
  r.cylinder(0, 1.45, 0, 0.06, 0.06, 0.08, skin, 8);
  r.sphere(0, 1.64, 0, 0.13, skin, 10);
  r.sphere(-0.02, 1.7, 0, 0.135, hair, 10, 0.7);
  P.define('surfer', r);

  // one arm, hanging down -y from the shoulder joint at the origin
  const a = new MeshBuilder();
  a.cylinder(0, -0.55, 0, 0.05, 0.06, 0.55, shirt, 8);
  a.sphere(0, -0.6, 0, 0.06, skin, 6);
  P.define('arm', a);

  // driftwood log along y (drawn on its side), rock, litter
  const log = new MeshBuilder();
  log.cylinder(0, -1.6, 0, 0.28, 0.24, 3.2, lin(0x6b4a2b), 12);
  log.cylinder(0.2, -0.2, 0, 0.08, 0.04, 0.7, lin(0x5a3d22), 6);
  P.define('log', log);
  const rock = new MeshBuilder();
  rock.sphere(0, 0, 0, 1.3, lin(0x55595e), 10, 0.55);
  rock.sphere(0.5, 0.25, 0.3, 0.6, lin(0x494c50), 8, 0.7);
  P.define('rock', rock);
  const bottle = new MeshBuilder();
  bottle.cylinder(0, -0.25, 0, 0.13, 0.13, 0.36, lin(0x8fd3ff), 10);
  bottle.cylinder(0, 0.11, 0, 0.13, 0.05, 0.1, lin(0x8fd3ff), 10);
  bottle.cylinder(0, 0.21, 0, 0.05, 0.05, 0.06, lin(0x1f6fd1), 8);
  P.define('bottle', bottle);
  const float = new MeshBuilder();
  float.sphere(0, 0, 0, 0.38, lin(0xff7a1a), 10);
  float.cylinder(0, 0.3, 0, 0.03, 0.03, 0.4, lin(0x30343a), 6);
  P.define('float', float);
}

export const surf = {
  id: 'surf', title: '衝浪', icon: '🏄',
  intro: '站在衝浪板上順著浪前進！<b>身體傾斜</b>讓板子轉彎，<b>蹲低</b>（坐著就身體往前彎）會越衝越快，<b>舉單手</b>擺姿勢拿花式分。',
  goal: '閃開<b>漂流木和礁石</b>，撿起<b>海上的垃圾</b>（寶特瓶、浮球）讓海洋變乾淨！撞到會落水 2 秒，分數不會歸零。',
  difficulties: SURF_DIFF,
  options: [
    { key: 'noCrouch', label: '不用蹲低（板子自動保持中等速度）' },
    { key: 'autoSteer', label: '自動閃避（不用傾斜，板子自己轉）' },
    { key: 'noTrick', label: '不用舉手擺姿勢' },
    { key: 'jumpOn', label: '開啟跳躍（跳過漂流木；只在空間夠大、站著玩時開）' },
  ],
  keysHelp: '←→ 傾斜轉彎　↓（按住）蹲低加速　Q／E 舉單手擺姿勢　空白鍵 跳躍（需開啟）　Enter（按住）暫停',
  hudChips: [{ id: 'score', label: '分數' }, { id: 'litter', label: '撿到垃圾' }, { id: 'speed', label: '速度', unit: '公尺/秒' }],
  hudExtra: '<div class="widget">身體傾斜<div class="bar center"><i id="sLean"></i></div></div><div class="widget">蹲低加速<div class="bar"><i id="sPump"></i></div></div>',
  camera: { back: 6.2, height: 2.3, fov: 60, lookAhead: 7, lookHeight: 0.9, follow: 2.5 },
  waterline: 0.02,
  footprint: 2,
  meshes,

  howto(s) {
    const cards = [];
    if (!s.autoSteer) cards.push({ move: 'lean', title: '身體傾斜', text: '上半身往左／右歪 → 衝浪板往那邊轉，<b>閃開障礙、撿垃圾</b>', seated: '坐著一樣做', skip: '可以勾「自動閃避」' });
    if (!s.noCrouch) cards.push({ move: 'crouch', title: '蹲低', text: '蹲低（膝蓋彎）→ <b>越衝越快</b>；站直會慢慢變慢', seated: '坐著：身體往前彎', skip: '可以勾「不用蹲低」' });
    if (!s.noTrick) cards.push({ move: 'raise-one', title: '舉單手', text: '舉起左手或右手 → 衝浪手擺姿勢，<b>花式分 +30</b>', seated: '坐著一樣做', skip: '可以關掉' });
    if (s.jumpOn && !s.seated) cards.push({ move: 'jump', title: '跳躍', text: '原地輕跳 → 跳過漂流木', skip: '預設關閉，教室不建議' });
    cards.push({ move: 'raise-both', title: '雙手舉高 1 秒', text: '開始、暫停、繼續', seated: '坐著一樣做' });
    return cards;
  },

  disabledActions(s) {
    return ['paddle', 'swing', ...(s.jumpOn && !s.seated ? [] : ['jump']), ...(s.noCrouch ? ['crouch'] : []), ...(s.autoSteer ? ['lean'] : [])];
  },

  newRace(game, diffKey) {
    const d = SURF_DIFF[diffKey];
    game.diff = d;
    const W = game.weather;
    W.setPreset(d.weather);
    W.set('sunElev', 28); W.set('sunAz', 160); W.set('lightning', 0);
    // a long swell rolling in from behind the rider, the waves a surfer rides
    W.set('swellHs', d.swell); W.set('swellT', 11); W.set('swellDir', W.target.windDir); W.set('swellSpread', 10);
    W.snap();
    // ride down-swell, i.e. with the wind and the waves it raises
    const heading = (W.state.windDir * Math.PI) / 180;
    game.vessel = game.board = new Board({ heading });
    game.field = new SurfField(d, { seed: 1 + Math.floor(Math.random() * 1000), heading });
    game.timeLeft = d.time;
  },

  onAction(game, e, s) {
    if (e.type === 'raise' && e.side !== 'both' && !s.noTrick && game.field.trick(game.board, e.side)) {
      game.toast('花式動作！+30', 'good'); game.cue('trick');
    }
    if (e.type === 'jump' && game.board.fallen === 0 && game.board.air === 0) { game.board.air = 0.8; }
  },

  update(game, dt, st, s) {
    const b = game.board, f = game.field, d = game.diff;
    game.leanNow = s.autoSteer ? autoLean(b, f) : st.lean;
    // seated play uses the same crouch event (bending forward lowers the shoulders)
    b.update(dt, { lean: game.leanNow, crouch: s.noCrouch ? null : st.crouch, steer: d.steer, base: d.base, sea: game.seaAtVessel, cross: d.cross * Math.sin(game.time * 0.3) });
    const out = [];
    for (const e of f.step(b, dt)) {
      if (e.type === 'litter') out.push({ text: '撿到垃圾 +50', kind: 'good', cue: 'pick' });
      if (e.type === 'fall') out.push({ text: e.item.type === 'rock' ? '撞到礁石，落水了！' : '撞到漂流木，落水了！', kind: 'bad', cue: 'bump' });
    }
    if (b.fallen > 0 && b.fallen < 0.1 && !game.standing) { game.standing = true; out.push({ text: '重新站上板！', kind: 'good' }); }
    if (b.fallen > 0.5) game.standing = false;
    return out;
  },

  idle(game, dt) { game.leanNow = 0; game.board.update(dt, { base: 0.5, sea: game.seaAtVessel }); },
  done: () => false,   // a timed ride: it ends when the time is up
  rollExtra: (game) => (game.board.fallen > 0 ? 0 : (game.leanNow || 0) * 0.3),

  probePoints(game) {
    const b = game.board;
    return game.field.items.filter((it) => !it.hit)
      .map((it) => ({ it, d: Math.hypot(it.x - b.x, it.z - b.z) })).sort((p, q) => p.d - q.d).slice(0, 8)
      .map(({ it }) => ({ key: it.id, xz: [it.x, it.z] }));
  },

  draw(game, P) {
    const b = game.board;
    const air = b.air > 0 ? Math.sin((1 - b.air / 0.8) * Math.PI) * 0.6 : 0;
    const pos = [game.vesselPos[0], game.vesselPos[1] + air, game.vesselPos[2]];
    const boardM = modelMatrix(pos, b.h, game.vis.pitch, game.vis.roll);
    P.add('surfboard', boardM);
    if (b.fallen > 0) {
      // in the water beside the board, climbing back on
      P.add('surfer', modelMatrix([pos[0] - Math.sin(b.h) * 0.9, pos[1] - 0.25, pos[2] + Math.cos(b.h) * 0.9], b.h, -1.35, 0));
    } else {
      const c = clamp(b.crouch, 0, 1);
      const body = mul(boardM, scaled(modelMatrix([0, 0, 0], 0, 0, 0), [1, 1 - 0.3 * c, 1]));
      P.add('surfer', body);
      const shoulderY = 1.4 * (1 - 0.3 * c);
      for (const side of [-1, 1]) {
        // arms out for balance; a trick throws one arm up
        const up = b.trick > 0 && (b.trickSide === 'left') === (side < 0);
        const roll = side < 0 ? (up ? 2.9 : 1.15) : (up ? -2.9 : -1.15);
        P.add('arm', mul(boardM, modelMatrix([0, shoulderY, side * 0.24], 0, 0, roll)));
      }
    }
    for (const it of game.field.items) {
      if (it.hit && it.kind === 'litter') continue;
      if (Math.hypot(it.x - b.x, it.z - b.z) > 400) continue;
      const r = game.seaFor(it.id);
      const y = r ? r.height : 0;
      const p = [it.x + (r ? r.dx * 0.8 : 0), y, it.z + (r ? r.dz * 0.8 : 0)];
      const bob = Math.sin(game.time * 2 + it.id) * 0.05;
      if (it.type === 'log') P.add('log', modelMatrix([p[0], p[1] + 0.05 + bob, p[2]], it.yaw, 0, Math.PI / 2));
      else if (it.type === 'rock') P.add('rock', modelMatrix([p[0], -0.15, p[2]], it.yaw));
      else P.add(it.type, modelMatrix([p[0], p[1] + 0.12 + bob, p[2]], it.yaw, 0, it.type === 'bottle' ? 1.3 : 0, 1.6), [1, 1, 1], 0.35);
    }
  },

  hud(game) {
    const f = game.field;
    return { score: Math.round(f.score), litter: f.litter, speed: game.board.v.toFixed(1) };
  },
  hudExtraUpdate(game) {
    const l = game.leanNow || 0, el = document.getElementById('sLean');
    el.style.left = (l < 0 ? 50 + l * 50 : 50) + '%';
    el.style.width = Math.abs(l) * 50 + '%';
    document.getElementById('sPump').style.width = game.board.pump * 100 + '%';
  },

  result(game) {
    const f = game.field;
    return {
      title: '衝浪結束！',
      stars: f.stars(),
      html: `分數 <b>${Math.round(f.score)}</b>・撿到垃圾 <b>${f.litter}</b> 個・閃過障礙 ${f.dodged} 個<br>` +
        `乘浪 ${Math.round(f.rideTime)} 秒${f.tricks ? `・花式 ${f.tricks} 次` : ''}${f.falls ? `・落水 ${f.falls} 次` : ''}`,
    };
  },
};
