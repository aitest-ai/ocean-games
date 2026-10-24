// 帆船 (sailing race) as a shell mode: lean steers the rudder, a swing tacks across the wind, raising
// the left / right hand pulls the sheet in / lets it out, crouching hikes out in gusts. The sail turns
// green when it draws and grey when it flaps; a wind flag and dial show where the wind comes from.
import { Dinghy, SailCourse, WindTrack, SAIL_DIFF, bestTrim, wrap } from './sail-logic.js';
import { MeshBuilder, modelMatrix, lin, COLORS } from './props.js';
import { mul } from '../math.js';

const D = Math.PI / 180;
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

function meshes(P) {
  // dinghy hull, bow along +x: 3.8 m, beam 1.4 m, white with a blue sheer stripe
  const h = new MeshBuilder();
  const L = 3.8, B = 1.4, white = lin(0xf2f4f5), blue = lin(0x1f5fbf);
  const rows = [], deck = [];
  for (let i = 0; i <= 24; i++) {
    const u = (i / 24) * 2 - 1;
    const w = (B / 2) * Math.pow(Math.max(1 - Math.pow(Math.max(u, 0), 2) - 0.25 * Math.pow(Math.min(u, 0), 2), 0), 0.5) + 0.02;
    const keel = -0.28 * Math.pow(Math.max(1 - u * u, 0), 0.4);
    const sheer = 0.32 + 0.06 * u * u;
    rows.push(Array.from({ length: 13 }, (_, j) => { const a = Math.PI * (j / 12); return [u * L / 2, sheer + (keel - sheer) * Math.sin(a), Math.cos(a) * w]; }));
    deck.push(Array.from({ length: 7 }, (_, j) => { const s = (j / 6) * 2 - 1; return [u * L / 2, sheer + 0.02, -s * w]; }));
  }
  h.surface(rows, (i, j) => (j === 0 || j === 11 ? blue : white));
  h.surface(deck, (i, j) => (i > 4 && i < 15 && j > 0 && j < 5 ? lin(0xc9ced3) : white));
  h.box(-0.1, -0.9, -0.03, 0.25, 0, 0.03, lin(0x30343a)); // centreboard
  P.define('dinghy', h);

  // mast (with the boom pivot at y = 0.9), and the flag at its top
  const m = new MeshBuilder();
  m.cylinder(0, 0.3, 0, 0.05, 0.035, 5.6, lin(0xb8bec4), 8);
  P.define('mast', m);

  // sail + boom in the boom's frame: luff along the mast (x = 0), foot along -x to the boom end
  const s = new MeshBuilder();
  const top = [0, 5.7, 0], tack = [0, 0.95, 0], clew = [-2.4, 0.95, 0];
  const steps = 8;
  for (let k = 0; k < steps; k++) {
    // a gentle belly: the sail bulges to +z (its leeward side in the frame it is drawn in)
    const P0 = (t, sTop) => {
      const a = [tack[0] + (top[0] - tack[0]) * sTop, tack[1] + (top[1] - tack[1]) * sTop, 0];
      const b = [clew[0] + (top[0] - clew[0]) * sTop, clew[1] + (top[1] - clew[1]) * sTop, 0];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.35 * Math.sin(Math.PI * t) * (1 - sTop)];
    };
    const s0 = k / steps, s1 = (k + 1) / steps;
    for (let q = 0; q < 6; q++) {
      const t0 = q / 6, t1 = (q + 1) / 6;
      s.quad(P0(t0, s0), P0(t1, s0), P0(t1, s1), P0(t0, s1), [1, 1, 1]);
    }
  }
  s.cylinder(0, 0, 0, 0.04, 0.04, 0.01, [1, 1, 1], 4);
  P.define('sail', s);
  const boom = new MeshBuilder();
  boom.box(-2.45, 0.88, -0.035, 0, 0.95, 0.035, lin(0x8a9096));
  P.define('boom', boom);
  const flag = new MeshBuilder();
  flag.quad([0, 0, 0], [0, 0.18, 0], [-0.55, 0.09, 0], [-0.55, 0.09, 0], lin(0xe5332a));
  flag.quad([0, 0, 0.003], [-0.55, 0.09, 0.003], [-0.55, 0.09, 0.003], [0, 0.18, 0.003], lin(0xe5332a));
  P.define('flag', flag);
}

export const sail = {
  id: 'sail', title: '帆船', icon: '⛵',
  intro: '利用風力航行，依序繞過黃色標誌再穿過終點。<b>船不能直接朝風吹來的方向開</b>（逆風時要走「之字形」），帆是<b>綠色</b>表示吃到風、<b>灰色</b>表示沒吃到風。',
  goal: '看<b>風向旗</b>和左上角的風向圖，靠近每個<b>黃色標誌</b>（箭頭會指路），最後穿過<b>紅綠終點門</b>。',
  difficulties: SAIL_DIFF,
  options: [
    { key: 'autoTrim', label: '自動調帆（不用舉手）' },
    { key: 'noSwing', label: '不用揮手換舷（只用傾斜轉向）' },
    { key: 'noHike', label: '不用蹲低壓船（船會自己回正）' },
  ],
  keysHelp: '←→ 傾斜轉舵　J／L 揮手換舷　Q 收帆（拉緊）　E 放帆（放鬆）　↓ 蹲低壓船　Enter（按住）暫停',
  hudChips: [{ id: 'marks', label: '標誌' }, { id: 'speed', label: '速度', unit: '公尺/秒' }, { id: 'sail', label: '帆' }],
  hudExtra: `
    <div class="widget windw"><div class="dial"><svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="46" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/>
      <path id="wNoGo" d="M0 0 L-29.6 -35.2 A46 46 0 0 1 29.6 -35.2 Z" fill="rgba(255,90,79,.25)"/>
      <g id="wArrow"><path d="M0 -44 L0 30" stroke="#8fcaff" stroke-width="5"/><path d="M-11 18 L0 34 L11 18" fill="none" stroke="#8fcaff" stroke-width="5"/></g>
      <path d="M0 -14 L7 10 L0 6 L-7 10 Z" fill="#fff"/></svg></div>
      <div class="wtext"><b id="wText">風</b><br><span id="wHint"></span></div></div>
    <div class="widget" id="trimW">帆繩<span id="trimHint"></span><div class="bar"><i id="trimBar"></i><span class="mark" id="trimMark"></span></div><small>左：拉緊　右：放鬆</small></div>
    <div class="widget" id="heelW">船身傾斜<div class="bar"><i id="heelBar"></i></div></div>`,
  camera: { back: 9.5, height: 3.6, fov: 55, lookAhead: 2, lookHeight: 1.6, follow: 1.4 },
  waterline: -0.02,
  footprint: 4,
  meshes,

  howto(s) {
    const cards = [{ move: 'lean', title: '身體傾斜', text: '上半身往左／右歪 → 轉舵，船往那邊轉', seated: '坐著一樣做' }];
    if (!s.noSwing) cards.push({ move: 'swing', title: '揮手', text: '一隻手快速橫揮 → <b>換舷</b>：船頭自動轉過風的另一邊（逆風之字形用）', seated: '坐著一樣做', skip: '可以關掉，用傾斜慢慢轉' });
    if (!s.autoTrim) cards.push({ move: 'raise-one', title: '舉左手／舉右手', text: '<b>左手＝拉緊帆</b>（逆風時）、<b>右手＝放鬆帆</b>（順風時）；帆變綠就對了', seated: '坐著一樣做', skip: '可以勾「自動調帆」' });
    if (!s.noHike) cards.push({ move: 'crouch', title: '蹲低壓船', text: '陣風來時蹲低 → 壓住船，船不會歪太多變慢', seated: '坐著：身體往前彎', skip: '可以關掉' });
    cards.push({ move: 'raise-both', title: '雙手舉高 1 秒', text: '開始、暫停、繼續', seated: '坐著一樣做' });
    return cards;
  },

  disabledActions(s) {
    return ['paddle', 'jump', ...(s.noSwing ? ['swing'] : []), ...(s.noHike ? ['crouch'] : [])];
  },

  newRace(game, diffKey) {
    const d = SAIL_DIFF[diffKey];
    game.diff = d;
    const W = game.weather;
    W.setPreset(d.weather);
    W.set('sunElev', 34); W.set('sunAz', 230); W.set('lightning', 0);
    W.snap();
    const dir = (W.state.windDir * Math.PI) / 180;
    game.windBase = W.state.windDir;
    game.wind = new WindTrack(d, dir, 1 + Math.floor(Math.random() * 1000));
    game.course = new SailCourse(d, { seed: 1 + Math.floor(Math.random() * 1000), windDir: dir });
    // start on a reach toward the first mark
    const m = game.course.marks[0].c;
    game.vessel = game.boat = new Dinghy({ heading: Math.atan2(m[1], m[0]) });
    game.boat.v = 1;
    game.timeLeft = d.time;
    game.wasNoGo = false;
  },

  trimMode: (game, s) => (s.autoTrim ? 'auto' : game.diff.trim),

  onAction(game, e, s) {
    const b = game.boat;
    if (e.type === 'swing' && !s.noSwing && b.startTack(game.wind.dir)) { game.toast('換舷！', 'good'); game.cue('tick'); }
    if (e.type === 'raise' && e.side !== 'both' && this.trimMode(game, s) !== 'auto') {
      b.sheet(e.side === 'left' ? -0.25 : 0.25);
      game.toast(e.side === 'left' ? '拉緊帆' : '放鬆帆');
    }
  },

  update(game, dt, st, s) {
    const b = game.boat, out = [];
    for (const e of game.wind.step(dt)) {
      if (e.type === 'shift') {
        // the sea follows: the weather's wind direction turns too (waves and whitecaps change slowly)
        game.weather.set('windDir', (game.wind.dir * 180) / Math.PI);
        out.push({ text: '風向轉了！看看風向圖', kind: 'bad', cue: 'tick' });
      }
      if (e.type === 'gust-warn') out.push({ text: s.noHike ? '陣風要來了！' : '陣風要來了，蹲低壓船！', kind: 'bad' });
    }
    b.update(dt, { lean: st.lean, wind: { dir: game.wind.dir, k: game.wind.k }, trimMode: this.trimMode(game, s), hike: s.noHike ? null : st.crouch });
    // the no-go zone: say it once each time the bow points too close to the wind
    const noGo = Math.abs(b.twa) < 40 * D && !b.tack;
    if (noGo && !game.wasNoGo) out.push({ text: '船頭太對著風了，往旁邊轉一點！', kind: 'bad' });
    game.wasNoGo = noGo;
    for (const e of game.course.step(b)) {
      if (e.type === 'mark') out.push({ text: game.course.next < game.course.marks.length ? `繞過第 ${e.i + 1} 個標誌！` : '最後衝向終點門！', kind: 'good', cue: 'pass' });
    }
    return out;
  },

  idle(game, dt) { game.boat.update(dt, { wind: { dir: game.wind.dir, k: 0.4 } }); },
  done: (game) => game.course.done,
  // the boat heels to leeward (away from the wind)
  rollExtra: (game) => Math.sign(game.boat.twa || 1) * game.boat.heel * 0.45,

  probePoints(game) {
    const c = game.course, out = [];
    for (let i = c.next; i < c.marks.length && out.length < 6; i++) out.push({ key: 'm' + i, xz: c.marks[i].c });
    const f = c.finish, n = finishNormal(c);
    out.push({ key: 'f0', xz: [f.c[0] + n[1] * f.w / 2, f.c[1] - n[0] * f.w / 2] }, { key: 'f1', xz: [f.c[0] - n[1] * f.w / 2, f.c[1] + n[0] * f.w / 2] });
    return out;
  },

  draw(game, P) {
    const b = game.boat;
    const hullM = game.vesselMatrix();
    P.add('dinghy', hullM);
    P.add('mast', mul(hullM, modelMatrix([0.55, 0, 0], 0)));
    // the boom swings to leeward: out with the sheet, flapping when the sail does not draw
    const lee = -Math.sign(b.twa || 1);
    const flap = b.eff < 0.5 || Math.abs(b.twa) < 40 * D ? Math.sin(game.time * 14) * 0.08 : 0;
    const boomAng = lee * (0.12 + b.trim * 1.25) + flap;
    const sailM = mul(hullM, modelMatrix([0.55, 0, 0], boomAng, 0, 0));
    const drawing = b.eff > 0.75 && Math.abs(b.twa) >= 40 * D;
    const tint = drawing ? [0.75, 1, 0.8] : b.eff > 0.45 ? [1, 1, 0.85] : [0.6, 0.62, 0.65];
    // the sail's belly (+z in its frame) must face leeward: mirror it when the boom is out to port
    P.add('sail', lee > 0 ? mul(sailM, mirrorZ) : sailM, tint, drawing ? 0.15 : 0);
    P.add('boom', sailM);
    // sailor at the tiller on the windward side (+z when the boom is out to port), leaning out when hiking
    const out = clamp(b.hike * b.heel * 1.5, 0, 0.6);
    P.add('paddler', mul(hullM, modelMatrix([-0.55, 0.12, lee * (0.35 + out)], 0, 0, lee * out * 0.8)));
    // wind flag at the masthead points downwind (relative to the boat)
    P.add('flag', mul(hullM, modelMatrix([0.55, 5.85, 0], wrap(game.wind.dir - b.h) + Math.PI + Math.sin(game.time * 9) * 0.1)));
    // marks (next one glows) and the finish gate
    const c = game.course;
    c.marks.forEach((m, i) => {
      if (Math.hypot(m.c[0] - b.x, m.c[1] - b.z) > 700) return;
      const r = game.seaFor('m' + i);
      const tint2 = m.rounded ? COLORS.grey : COLORS.yellow;
      const glow = i === c.next ? 0.4 + 0.3 * Math.sin(game.time * 5) : 0;
      P.add('buoy', modelMatrix([m.c[0], (r ? r.height : 0) + Math.sin(game.time * 1.6 + i) * 0.05, m.c[1]], 0, 0, 0, 1.6), tint2, glow);
    });
    const f = c.finish, n = finishNormal(c);
    [[1, COLORS.red, 'f0'], [-1, COLORS.green, 'f1']].forEach(([sg, col, key]) => {
      const p = [f.c[0] + sg * n[1] * f.w / 2, f.c[1] - sg * n[0] * f.w / 2];
      const r = game.seaFor(key);
      P.add('buoy', modelMatrix([p[0], r ? r.height : 0, p[1]], 0, 0, 0, 1.3), col, c.next >= c.marks.length ? 0.35 : 0);
    });
  },

  target(game) {
    const c = game.course;
    const t = c.target();
    const d = Math.round(Math.hypot(t[0] - game.boat.x, t[1] - game.boat.z));
    return { xz: t, y: 2, label: c.next < c.marks.length ? `第 ${c.next + 1} 個標誌・${d} 公尺` : `終點・${d} 公尺` };
  },

  hud(game) {
    const b = game.boat, c = game.course;
    const drawing = b.eff > 0.75 && Math.abs(b.twa) >= 40 * D;
    return { marks: `${c.rounded} / ${c.marks.length}`, speed: b.v.toFixed(1), sail: Math.abs(b.twa) < 40 * D ? '⚪ 逆風' : drawing ? '🟢 吃到風' : '⚪ 沒吃到風' };
  },
  hudExtraUpdate(game, st, s) {
    const b = game.boat;
    // dial: the boat points up; the arrow shows where the wind blows (from the top = headwind)
    const rel = wrap(game.wind.dir - b.h);
    document.getElementById('wArrow').setAttribute('transform', `rotate(${(rel * 180) / Math.PI + 180})`);
    const a = Math.abs(b.twa) / D;
    document.getElementById('wText').textContent = a < 40 ? '逆風（開不動）' : a < 70 ? '迎風' : a < 115 ? '橫風（最快）' : a < 150 ? '斜順風' : '順風';
    document.getElementById('wHint').textContent = game.wind.gust > 0 ? '💨 陣風中' : '';
    const mode = this.trimMode(game, s);
    document.getElementById('trimW').style.display = mode === 'auto' ? 'none' : '';
    document.getElementById('trimBar').style.width = b.trim * 100 + '%';
    const mark = document.getElementById('trimMark');
    mark.style.display = mode === 'assist' ? '' : 'none';
    mark.style.left = bestTrim(b.twa) * 100 + '%';
    document.getElementById('trimHint').textContent = mode === 'assist' ? '（白線＝最佳位置）' : '';
    document.getElementById('heelW').style.display = game.diff.gusts ? '' : 'none';
    const hb = document.getElementById('heelBar');
    hb.style.width = clamp(b.heel / 0.9, 0, 1) * 100 + '%';
    hb.style.background = b.heel > 0.45 ? '#ff5a4f' : '';
  },

  result(game, timeUp) {
    const c = game.course, d = game.diff;
    const used = d.time - game.timeLeft;
    return {
      title: timeUp ? '時間到！' : '抵達終點！',
      stars: c.stars(game.timeLeft),
      html: `繞過 <b>${c.rounded}</b> / ${c.marks.length} 個標誌${timeUp ? '' : `・用時 <b>${Math.floor(used / 60)} 分 ${Math.round(used % 60)} 秒</b>`}<br>` +
        '想一想：為什麼船不能直接朝著風吹來的方向開？',
    };
  },
};

const mirrorZ = (() => { const m = new Float32Array(16); m[0] = 1; m[5] = 1; m[10] = -1; m[15] = 1; return m; })();
function finishNormal(c) {
  const last = c.marks[c.marks.length - 1].c, f = c.finish.c;
  const dx = f[0] - last[0], dz = f[1] - last[1], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}
