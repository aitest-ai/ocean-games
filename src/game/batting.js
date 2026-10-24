// 打擊練習（陸地系列第一款原型）：投手投球 → 學生做揮棒動作 → 判定安打／界外／揮空。
// 規則與數字在 batting-logic.js；這裡負責球場上的人偶、球、鏡頭、提示與聲音。
import * as THREE from '../land/three.js';
import { Figure, samplePose, mixPose } from '../land/figure.js';
import { FIELD } from '../land/dims.js';
import { TIMES } from '../land/ballpark.js';
import { DIFFICULTY, LABEL, SCORE, PLATE_Z, MITT_Z, makePitch, judgeSwing, flyBall, Session } from './batting-logic.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
// 各種輸入「動作開始 → 事件送出」的延遲（秒）。判定時把揮棒時間往前推這麼多。
//   鍵盤／畫面按鈕：按下去後模擬人偶要 0.36 秒才揮到一半；鏡頭：事件在雙手揮到身體前面時送出，再加拍攝運算約 0.1 秒
const LATENCY = { keyboard: 0.36, camera: 0.1, replay: 0.1 };
const BATTER_X = FIELD.plateWidth / 2 + FIELD.boxGap + FIELD.box[0] / 2 + 0.05;

// ── 人偶的關鍵姿勢（右打者；左打者整個鏡像） ──
const STANCE = { hipY: 0.66, bend: 0.22, torsoYaw: -0.1, headYaw: 1.25, lHand: [-0.09, 0.36, 0.16], rHand: [-0.13, 0.42, 0.13], batTip: [-0.3, 1.05, -0.25], lFoot: [0.3, 0.02, 0.15], rFoot: [-0.28, -0.04, 0.2] };
const LOAD = { ...STANCE, torsoYaw: -0.4, lHand: [-0.17, 0.4, 0.08], rHand: [-0.21, 0.46, 0.05], batTip: [-0.55, 0.95, -0.55], lFoot: [0.22, 0.04, 0.1, 0.03] };
const CONTACT = { hipY: 0.63, bend: 0.25, torsoYaw: 0.75, headYaw: 0.65, lHand: [-0.02, 0.2, 0.42], rHand: [-0.08, 0.22, 0.38], batTip: [-0.75, 0.3, 0.95], lFoot: [0.42, 0.04, 0.4], rFoot: [-0.28, -0.04, 0.6] };
const FINISH = { hipY: 0.66, bend: 0.12, torsoYaw: 1.45, headYaw: 0.2, lHand: [0.12, 0.5, 0.18], rHand: [0.06, 0.52, 0.2], batTip: [0.5, 0.9, -0.5], lFoot: [0.42, 0.04, 0.6], rFoot: [-0.22, -0.02, 1.2] };
const SWING = [[0, LOAD], [0.07, LOAD], [0.16, CONTACT], [0.32, FINISH], [0.9, FINISH], [1.5, STANCE]];
const SWING_CONTACT = 0.16; // 揮棒動畫開始後幾秒「碰到球」

const P_SET = { hipY: 0.74, bend: 0.05, lHand: [0.03, 0.3, 0.2], rHand: [-0.03, 0.3, 0.2], lFoot: [0.12, 0.05], rFoot: [-0.12, 0.05] };
const P_KICK = { ...P_SET, torsoYaw: -0.6, hipY: 0.72, lFoot: [0.08, 0.2, 0, 0.32] };
const P_STRIDE = { hipY: 0.6, hipZ: 0.35, bend: 0.1, torsoYaw: -0.7, lHand: [0.4, 0.28, 0.25], rHand: [-0.55, 0.5, -0.3], lFoot: [0.12, 0.85], rFoot: [-0.12, 0.05] };
const P_RELEASE = { hipY: 0.58, hipZ: 0.55, bend: 0.45, torsoYaw: 0.45, lHand: [0.25, 0.12, 0.12], rHand: [-0.12, 0.55, 0.45], lFoot: [0.12, 0.85], rFoot: [-0.12, 0.25] };
const P_FOLLOW = { hipY: 0.6, hipZ: 0.6, bend: 0.75, torsoYaw: 0.7, lHand: [0.25, 0.1, 0.0], rHand: [0.3, -0.05, 0.3], lFoot: [0.12, 0.85], rFoot: [-0.3, 0.75] };
const PITCH = [[0, P_SET], [0.45, P_KICK], [0.85, P_STRIDE], [1.0, P_RELEASE], [1.35, P_FOLLOW], [2.4, P_SET]];
const RELEASE_AT = 1.0;

const C_SQUAT = { hipY: 0.38, hipZ: -0.05, bend: 0.35, lHand: [0.12, 0.25, 0.42], rHand: [-0.18, 0.05, 0.05], lFoot: [0.28, 0.08, -0.3], rFoot: [-0.28, 0.08, 0.3] };
const UMP = { hipY: 0.6, bend: 0.55, lHand: [0.2, 0.0, 0.3], rHand: [-0.2, 0.0, 0.3], lFoot: [0.25, 0.0, -0.3], rFoot: [-0.25, 0.0, 0.3] };

export const batting = {
  id: 'batting', series: 'land', world: 'land', usesBat: true, noTimer: true, defaultTime: 'day',
  title: '打擊練習', icon: '⚾',
  diffTitle: '難度', goWord: 'Play Ball！', seatedLabel: '🪑 坐著玩（只轉上半身揮棒，動作都一樣）',
  intro: '投手投球過來時，<b>雙手像握著球棒一樣往前揮</b>，打出安打！<b>空手做動作，不要拿真的球棒。</b>',
  goal: '看著投手投出的球，<b>球快到本壘時揮棒</b>。太早會打成三壘側界外、太晚會打到一壘側或揮空。壞球（離好球框很遠）不要揮！<br>⚠️ <b>空手</b>做動作，不要拿真的球棒、掃把或雨傘；張開雙手轉一圈碰不到東西才開始。',
  difficulties: DIFFICULTY,
  soundLabel: '球場聲音（觀眾、擊球聲）',
  options: [
    { key: 'autoSwing', label: '自動揮棒（只看球，練習分辨好球、壞球）' },
    { key: 'autoCalib', label: '自動校正揮棒時機（依你前幾球的快慢調整，建議開著）', default: true },
  ],
  safety: [
    '🚫 <b>空手</b>做揮棒動作：<b>不要拿真的球棒</b>、掃把、雨傘、水壺或任何東西揮。',
    '揮棒時手會甩到<b>身體兩側</b>：玩家周圍至少 <b>1.5 公尺</b>淨空，左右兩邊不能站人；安全員站在玩家<b>正後方 2 公尺外</b>。',
    '平板放穩、離玩家 <b>2 公尺以上</b>，揮手時打不到平板。',
    '可以<b>坐在椅子上玩</b>（只轉上半身揮）；選沒有扶手的椅子，揮的時候手不會撞到。',
    '<b>不用很用力</b>：中等速度就會判定，太用力容易扭到肩膀或腰。每人連續玩不超過 5 分鐘。',
    '做不到雙手揮的同學，可以在上面改選「自動揮棒」。',
    '看不到人時遊戲會自動暫停。🔒 鏡頭畫面只在這台平板上分析，不錄影、不上傳。',
  ],
  keysHelp: '空白鍵（或 K）揮棒　Enter（按住）雙手舉高＝暫停',
  keyboard: { remap: { Space: 'bat-left' } },
  touchButtons: [{ label: '⚾ 揮棒', press: 'bat-left' }],
  hudChips: [{ id: 'pitch', label: '第幾球' }, { id: 'hits', label: '安打' }, { id: 'score', label: '分數' }],
  hudExtra: `<div class="widget" id="bTiming">揮棒時機 <b id="bTimingText">—</b>
    <div class="bar center" style="width:min(240px,40vw)"><span class="mark" id="bTimingMark" style="left:50%;display:none"></span></div>
    <small>← 太早　　剛好　　太晚 →</small></div>
    <div class="widget" id="bPitch" style="display:none"></div>`,

  howto(s) {
    const cards = [];
    if (!s.autoSwing) cards.push({ move: 'bat', title: '雙手一起揮棒', text: '兩隻手<b>靠在一起</b>像握著球棒放在肩膀旁邊，<b>球快到本壘時，雙手一起往前揮過身體</b>。雙手揮過身體的那一下就是擊球的瞬間', seated: '坐著也行：只轉上半身揮', skip: '做不到可以改選「自動揮棒」' });
    if (s.autoSwing) cards.push({ move: 'idle', title: '自動揮棒', text: '遊戲會自動揮棒。看球的位置，猜猜看是<b>好球</b>還是<b>壞球</b>！', seated: '坐著看就好' });
    cards.push({ move: 'raise-both', title: '雙手舉高 1 秒', text: '開始、暫停、繼續', seated: '坐著一樣做' });
    return cards;
  },

  disabledActions(s) {
    // 只收「雙手一起揮」（bat）：單手揮臂、身體傾斜都不算
    return ['paddle', 'jump', 'crouch', 'swing', 'lean', ...(s.autoSwing ? ['bat'] : [])];
  },

  // 選單多一區：時段、右打／左打
  menu({ grid, game, settings, save }) {
    const sec = document.createElement('section');
    sec.innerHTML = `<h2>球場時段與打者</h2>
      <div class="seg" id="bTime">${Object.entries(TIMES).map(([k, t]) => `<button data-v="${k}">${{ day: '☀️', dusk: '🌇', night: '🌙' }[k]} ${t.label}</button>`).join('')}</div>
      <div class="seg" id="bHand" style="margin-top:8px"><button data-v="right">右打（站本壘左邊）</button><button data-v="left">左打</button></div>
      <p class="note">左打、右打都可以往任何一邊揮，只是畫面上的打者站的位置不同。</p>`;
    grid.appendChild(sec);
    const seg = (id, val, pick) => {
      const el = sec.querySelector('#' + id);
      const sync = (v) => { for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.v === v); };
      sync(val);
      el.addEventListener('click', (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { sync(v); pick(v); save(); } });
    };
    seg('bTime', settings.time || 'day', (v) => { settings.time = v; game.setTime(v); });
    seg('bHand', settings.lefty ? 'left' : 'right', (v) => { settings.lefty = v === 'left'; placeBatter(game, settings); });
  },

  setup(game, s) {
    const park = game.park, scene = game.scene;
    park.setShadowFocus(0, 6, 16);
    const B = (game.bat = {});
    B.batter = new Figure({ jersey: '#f4f4f0', pants: '#e6e6e0', cap: '#1d4f91', helmet: 'right', bat: true });
    B.pitcher = new Figure({ jersey: '#bfc4c9', pants: '#bfc4c9', cap: '#b3202a' });
    B.catcher = new Figure({ jersey: '#1d4f91', pants: '#d9d9d9', cap: '#1d4f91', helmet: 'right', mitt: true });
    B.ump = new Figure({ jersey: '#1d2633', pants: '#4a4f57', cap: '#1d2633' });
    scene.add(B.batter.root, B.pitcher.root, B.catcher.root, B.ump.root);
    B.pitcher.root.position.set(0, FIELD.moundHeight, FIELD.pitch + 0.25); B.pitcher.root.rotation.y = Math.PI;
    B.catcher.root.position.set(0, 0, -1.15);
    B.ump.root.position.set(-0.3, 0, -1.95);
    B.catcher.set(C_SQUAT); B.ump.set(UMP); B.pitcher.set(P_SET);
    placeBatter(game, s);
    // 球（比真實大 30%，平板上比較看得到）、地上的影子、光暈
    const ballTex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#f6f3ea'; x.fillRect(0, 0, 64, 32); x.strokeStyle = '#c1272d'; x.lineWidth = 2; x.beginPath(); x.arc(16, 16, 11, -1, 1); x.stroke(); x.beginPath(); x.arc(48, 16, 11, 2.1, 4.2); x.stroke(); return c; })());
    ballTex.colorSpace = THREE.SRGBColorSpace;
    B.ball = new THREE.Mesh(new THREE.SphereGeometry(FIELD.ballDiameter / 2 * 1.3, 16, 12), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.15 }));
    B.ball.castShadow = true; B.ball.visible = false;
    B.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    B.shadow.visible = false;
    scene.add(B.ball, B.shadow);
    // 好球帶框與時機圈（簡單、普通才有）
    const [zl, zh] = FIELD.strikeZone, hw = FIELD.plateWidth / 2 + 0.04;
    const zoneG = new THREE.BufferGeometry().setFromPoints([[-hw, zl], [hw, zl], [hw, zh], [-hw, zh], [-hw, zl]].map(([x, y]) => new THREE.Vector3(x, y, PLATE_Z)));
    B.zone = new THREE.Line(zoneG, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthTest: false }));
    B.zone.renderOrder = 10;
    B.ring = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.105, 40), new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    B.ring.renderOrder = 11; B.ring.visible = false;
    scene.add(B.zone, B.ring);
    // 打擊視角：捕手後上方（像電視轉播與實況野球），視線越過捕手與主審的頭
    B.cam = { pos: new THREE.Vector3(0, 3.0, -5.6), look: new THREE.Vector3(0, 0.85, 10), mode: 'bat' };
    game.camera.fov = 40; game.camera.updateProjectionMatrix();
    game.onFrame = (dt) => cameraUpdate(game, dt);
    game.clock = 0;
    park.scoreboard.update({ title: '打擊練習', big: '⚾ PLAY BALL', cells: [['安打', '0'], ['球數', '0'], ['分數', '0']] });
  },

  newRace(game, diffKey, s) {
    const d = DIFFICULTY[diffKey] || DIFFICULTY.easy;
    const B = game.bat;
    game.diff = d;
    game.session = new Session(d);
    game.timeLeft = 999;
    game.calib = 0;
    B.phase = 'ready'; B.phaseT = 0; B.pitch = null; B.swing = null; B.hit = null; B.called = false; B.lastE = null;
    B.ball.visible = B.shadow.visible = B.ring.visible = false;
    B.zone.visible = d.assist;
    B.cam.mode = 'bat';
    placeBatter(game, s);
    game.park.scoreboard.update({ title: '打擊練習', right: d.label, big: '⚾ PLAY BALL', cells: [['安打', '0'], ['球數', `0 / ${d.pitches}`], ['分數', '0']] });
    timingWidget(null, d);
  },

  onAction(game, e, s) {
    const B = game.bat;
    if (s.autoSwing) return;
    // 只認雙手一起揮（bat）：事件送出的那一刻＝雙手揮過身體＝擊球瞬間
    if (e.type !== 'bat') return;
    if (B.swing && game.clock - B.swing.at < 0.6) return;
    const delay = Math.max(0, (performance.now() - e.time) / 1000);
    const lat = LATENCY[e.source] ?? 0.1;
    startSwing(game, s, game.clock - delay - lat + (s.autoCalib ? game.calib : 0), e.strength ?? 0.7);
  },

  update(game, dt0, st, s) {
    const B = game.bat, d = game.diff, out = [];
    // 用真實經過的時間（外殼給的 dt 在畫面很卡時會被截到 0.1 秒），揮棒事件的時間才對得上球的位置
    const now = performance.now();
    // （暫停回來後的第一格間隔很長，那一格改用外殼的 dt，球不會突然跳一段）
    const gap = B.lastNow ? (now - B.lastNow) / 1000 : Infinity;
    const dt = gap > 0.25 ? dt0 : gap;
    B.lastNow = now;
    game.clock += dt;
    B.phaseT += dt;
    const S = game.session;
    if (B.phase === 'ready') {
      if (S.done) { B.phase = 'end'; return out; }
      if (B.phaseT > d.gap - 0.9 && !B.readySaid) { B.readySaid = true; out.push({ text: S.n === 0 ? '準備好了嗎？' : `第 ${S.n + 1} 球`, kind: '' }); }
      if (B.phaseT > d.gap) { B.phase = 'windup'; B.phaseT = 0; B.readySaid = false; B.swing = null; B.hit = null; B.called = false; B.cam.mode = 'bat'; }
    } else if (B.phase === 'windup') {
      if (B.phaseT >= RELEASE_AT) {
        B.pitch = makePitch(d, Math.random);
        B.pitch.at = game.clock;
        B.phase = 'flight'; B.phaseT = 0;
        B.ball.visible = B.shadow.visible = true;
        if (s.autoSwing) B.autoAt = B.pitch.T + (Math.random() - 0.5) * d.window;
      }
    } else if (B.phase === 'flight') {
      const p = B.pitch, t = B.phaseT;
      if (s.autoSwing && B.autoAt !== null && t >= B.autoAt) {
        // 自動揮棒：只揮好球（壞球放掉，讓學生看）
        if (p.strike) startSwing(game, s, game.clock, 0.7, true);
        B.autoAt = null;
      }
      // 球一路飛到捕手手套（本壘後 1 公尺）。有擊中時，球飛到本壘板那一刻才換成擊出的球
      if (!B.hit || !B.hit.shown) {
        const tMitt = p.T + (MITT_Z - PLATE_Z) / p.vel(p.T)[2];
        const pos = p.pos(Math.min(t, B.hit ? p.T : tMitt));
        B.ball.position.set(...pos);
        if (pos[2] <= MITT_Z + 0.01 && !B.inMitt) { B.inMitt = true; game.cue('mitt'); }
      }
      // 好球帶與時機圈
      if (d.assist && !B.hit) {
        const u = clamp(1 - t / p.T, 0, 1);
        B.ring.visible = t < p.T + 0.05;
        B.ring.position.set(p.target[0], p.target[1], PLATE_Z);
        B.ring.scale.setScalar(1 + u * 3.5);
        B.ring.material.color.set(u < 0.12 ? 0x5fd39a : 0xffd25a);
        B.ring.lookAt(game.camera.position);
      }
      // 擊球的畫面在揮棒動畫「碰到球」那一刻才出現
      if (B.hit && !B.hit.shown && (game.clock >= B.hit.showAt || t >= p.T)) {
        B.hit.shown = true; B.phase = 'batted'; B.phaseT = 0; B.ring.visible = false;
        game.cue('crack');
        if (B.hit.fly.result !== 'foul' || B.hit.fly.dist > 15) B.cam.mode = 'follow';
      }
      // 沒揮棒：球進手套後判好壞球
      if (!B.swing && t > p.T + 0.75) {
        const kind = p.strike ? 'looking' : 'take';
        S.record(kind, { kmh: p.kmh });
        out.push({ text: LABEL[kind] + (SCORE[kind] ? ` +${SCORE[kind]}` : ''), kind: kind === 'take' ? 'good' : 'bad', cue: kind === 'take' ? 'pass' : null });
        endPitch(game, kind);
      } else if (B.swing?.missRecorded && game.clock - B.swing.at > 0.7 && t > p.T + 0.3) endPitch(game, 'miss');
    } else if (B.phase === 'batted') {
      const f = B.hit.fly, t = B.phaseT;
      const pos = f.path(t);
      B.ball.position.set(...pos);
      if (!B.hit.announced && (t >= Math.min(f.hang, 3.5) || t >= f.duration)) {
        B.hit.announced = true;
        const kind = f.result;
        out.push({ text: LABEL[kind] + (SCORE[kind] ? ` +${SCORE[kind]}` : ''), kind: ['homer', 'long', 'hit'].includes(kind) ? 'good' : kind === 'foul' ? '' : 'bad', cue: kind === 'homer' ? 'cheer-big' : ['long', 'hit'].includes(kind) ? 'cheer' : null });
        if (kind === 'homer') game.park.cheer(1); else if (kind === 'long' || kind === 'hit') game.park.cheer(0.6);
        scoreboard(game, LABEL[kind].replace(/[！!]/g, ''), kind);
      }
      if (B.hit.announced && (t > f.duration || t > Math.min(f.hang, 3.5) + 1.8)) endPitch(game, null);
    } else if (B.phase === 'result') {
      if (B.phaseT > 1.2) { B.phase = 'ready'; B.phaseT = 0; B.ball.visible = B.shadow.visible = false; B.inMitt = false; B.cam.mode = 'bat'; }
    }
    // 球的影子
    if (B.ball.visible) { B.shadow.position.set(B.ball.position.x, 0.02, B.ball.position.z); const h = B.ball.position.y; B.shadow.scale.setScalar(1 + h * 0.15); B.shadow.material.opacity = clamp(0.4 - h * 0.03, 0.08, 0.4); }
    animate(game, dt, s);
    if (B.missToast) { out.push(B.missToast); B.missToast = null; }
    return out;
  },

  idle(game, dt, st, s) {
    const B = game.bat;
    if (!B) return;
    // 選單畫面：投手、打者原地待命，鏡頭在本壘後方
    B.phase = B.phase === 'end' ? 'end' : B.phase;
    animate(game, dt, s);
  },

  done: (game) => game.bat.phase === 'end',

  hud(game) {
    const S = game.session;
    return { pitch: `${Math.min(S.n + (game.bat.phase === 'ready' || game.bat.phase === 'end' ? 0 : 1), S.d.pitches)} / ${S.d.pitches}`, hits: S.hits, score: S.score };
  },
  hudExtraUpdate(game) {
    const p = game.bat.pitch, el = document.getElementById('bPitch');
    if (p && game.bat.phase !== 'ready') { el.style.display = ''; el.innerHTML = `球速 <b>${p.kmh}</b> 公里/小時${p.change ? '（變速球）' : ''}`; }
    else el.style.display = 'none';
  },

  result(game) {
    const S = game.session, c = S.count;
    const parts = [['全壘打', c.homer], ['長打', c.long], ['安打', c.hit], ['出局', c.out], ['界外', c.foul], ['揮空', c.miss], ['壞球沒揮', c.take], ['好球沒揮', c.looking]].filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join('・');
    const es = S.log.filter((x) => typeof x.e === 'number').map((x) => x.e);
    const avg = es.length ? es.reduce((a, b) => a + b, 0) / es.length : 0;
    const tip = !es.length ? '' : avg < -0.06 ? '你常常<b>太早</b>揮，可以等球再近一點。' : avg > 0.06 ? '你常常<b>太晚</b>揮，看到投手出手就準備。' : '揮棒時機很準！';
    return {
      title: S.hits >= S.d.pitches * 0.5 ? '打得好！' : '練習完成！',
      stars: S.stars(),
      html: `${S.d.pitches} 球中打出 <b>${S.hits}</b> 支安打・分數 <b>${S.score}</b><br>${parts}<br>${tip}${game.calib ? `<br><small>自動校正：揮棒時間調整了 ${Math.round(game.calib * 1000)} 毫秒</small>` : ''}`,
    };
  },

  // ── 聲音（全部用 Web Audio 合成，沒有錄音檔） ──
  cue(c, kind) {
    const t = c.currentTime;
    const noise = (dur, f, q, gain, type = 'bandpass') => {
      const len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf;
      const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const g = c.createGain();
      src.connect(flt).connect(g).connect(c.destination);
      src.start(t); return { g, flt };
    };
    if (kind === 'crack') {
      const { g } = noise(0.12, 2600, 1.2, 0, 'bandpass');
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      const o = c.createOscillator(), og = c.createGain(); o.frequency.value = 1150; o.type = 'triangle';
      og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(og).connect(c.destination); o.start(t); o.stop(t + 0.2);
      return true;
    }
    if (kind === 'mitt') {
      const { g } = noise(0.1, 320, 2, 0);
      g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      return true;
    }
    if (kind === 'whoosh') {
      const { g, flt } = noise(0.3, 600, 1.5, 0);
      flt.frequency.setValueAtTime(400, t); flt.frequency.exponentialRampToValueAtTime(1800, t + 0.25);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.12); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      return true;
    }
    if (kind === 'cheer' || kind === 'cheer-big') {
      const big = kind === 'cheer-big';
      const { g } = noise(big ? 3.2 : 2, 900, 0.6, 0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(big ? 0.35 : 0.2, t + 0.4); g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 3.1 : 1.9));
      return true;
    }
    return false;
  },
  // 觀眾的背景人聲（低沉的嗡嗡聲）
  ambience(c) {
    const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 550; f.Q.value = 0.8;
    const g = c.createGain(); g.gain.value = 0.045;
    src.connect(f).connect(g).connect(c.destination); src.start();
  },
};

// ── 細節 ──

function placeBatter(game, s) {
  const b = game.bat?.batter;
  if (!b) return;
  const lefty = !!s.lefty;
  b.root.position.set(lefty ? -BATTER_X : BATTER_X, 0, FIELD.plateWidth / 2 + 0.05);
  b.root.rotation.y = lefty ? Math.PI / 2 : -Math.PI / 2;
  b.root.scale.set(lefty ? -1 : 1, 1, 1);
  b.set(STANCE);
}

function startSwing(game, s, contactClock, strength, auto = false) {
  const B = game.bat, d = game.diff;
  // 揮棒動畫：事件送出時人已經揮到「碰到球」那一格；打到球的畫面對準球到本壘板那一刻
  B.swing = { at: game.clock, anim: SWING_CONTACT };
  const p = B.pitch;
  if (!p || B.phase !== 'flight' || B.hit) { game.cue('whoosh'); return; } // 沒有球時揮棒：只是空揮練習
  const e = contactClock - (p.at + p.T);
  // 太早太多（球還沒出手就揮）不算這一球，讓學生再揮一次
  if (e < -0.6) { B.swing = null; game.bat.missToast = { text: '太早了，等球來再揮', kind: 'bad' }; return; }
  const tPlate = p.at + p.T;
  const wait = Math.max(0, tPlate - game.clock);   // 球還要多久才到本壘板
  const j = judgeSwing(e, d, { strength, lefty: !!s.lefty, pitch: p });
  B.lastE = e;
  timingWidget(e, d);
  if (s.autoCalib && !auto && Math.abs(e) < 0.45) game.calib = clamp(game.calib - e * 0.3, -0.12, 0.12);
  if (!j.contact) {
    game.session.record('miss', { e });
    B.swing.missRecorded = true;
    game.cue('whoosh');
    B.missToast = { text: `揮空！${e < 0 ? '太早了' : '太晚了'}`, kind: 'bad' };
    scoreboard(game, '揮空', 'miss');
    return;
  }
  const from = [p.target[0], p.target[1], PLATE_Z];
  const fly = flyBall(j, d, from);
  game.session.record(fly.result, { e, dist: Math.round(fly.dist) });
  // 打到球：動畫往後延，讓「碰到球」那一格剛好在球到本壘板時
  B.swing.anim = SWING_CONTACT - wait;
  B.hit = { j, fly, showAt: game.clock + wait, shown: false, announced: false };
  const word = Math.abs(e) < d.window * 0.35 ? '剛好！' : e < 0 ? '有點早' : '有點晚';
  B.missToast = { text: word, kind: Math.abs(e) < d.window * 0.35 ? 'good' : '' };
}

function endPitch(game, kind) {
  const B = game.bat, S = game.session;
  B.phase = 'result'; B.phaseT = 0; B.ring.visible = false;
  if (kind === 'looking') scoreboard(game, '好球', kind);
  else if (kind === 'take') scoreboard(game, '壞球', kind);
  if (S.done) B.ring.visible = false;
}

function scoreboard(game, big, kind) {
  const S = game.session;
  const color = { homer: '#ffd25a', long: '#7dffb0', hit: '#7dffb0', foul: '#ffffff', out: '#ffb0a0', miss: '#ffb0a0', take: '#9fd8ff', looking: '#ffb0a0' }[kind] || '#ffffff';
  game.park.scoreboard.update({ title: '打擊練習', right: S.d.label, big, color, cells: [['安打', String(S.hits)], ['球數', `${S.n} / ${S.d.pitches}`], ['分數', String(S.score)]] });
}

function timingWidget(e, d) {
  const mark = document.getElementById('bTimingMark'), txt = document.getElementById('bTimingText');
  if (!mark) return;
  if (e === null || e === undefined) { mark.style.display = 'none'; txt.textContent = '—'; return; }
  mark.style.display = '';
  mark.style.left = `${50 + clamp(e / (d.window * 3), -1, 1) * 48}%`;
  mark.style.background = Math.abs(e) <= d.window ? '#5fd39a' : '#ff8a65';
  txt.textContent = Math.abs(e) < d.window * 0.35 ? '剛好！' : `${e < 0 ? '早' : '晚'} ${Math.round(Math.abs(e) * 100) / 100} 秒`;
}

function animate(game, dt, s) {
  const B = game.bat;
  // 打者
  if (B.swing && B.swing.anim < SWING[SWING.length - 1][0]) {
    B.swing.anim += dt;
    B.batter.set(samplePose(SWING, Math.max(B.swing.anim, 0)));
  } else {
    const breath = Math.sin(game.time * 2.2) * 0.02;
    B.batter.set(mixPose(STANCE, { ...STANCE, torsoYaw: STANCE.torsoYaw - 0.06 }, 0.5 + breath * 10));
  }
  // 投手
  const pt = B.phase === 'windup' ? B.phaseT : B.phase === 'flight' || B.phase === 'batted' || B.phase === 'result' ? RELEASE_AT + (B.pitchT = (B.phase === 'flight' ? B.phaseT : (B.pitchT ?? 0) + dt)) : 0;
  B.pitcher.set(samplePose(PITCH, pt));
  // 捕手的手套跟著球
  const tgt = B.pitch && (B.phase === 'flight' || B.phase === 'windup') ? B.pitch.target : [0, 0.75];
  const glove = [0.12 - tgt[0] * 0.8, 0.25 + (tgt[1] - 0.75) * 0.9, 0.42];
  B.catcher.set({ ...C_SQUAT, lHand: glove });
  // 球在投手手上（出手前）
  if (B.phase === 'windup') { B.ball.visible = true; B.pitcher.handWorld('r', B.ball.position); B.shadow.visible = false; }
  if (B.phase === 'ready') B.pitchT = 0;
}

function cameraUpdate(game, dt) {
  const B = game.bat, c = game.camera;
  if (!B) return;
  const st = game.state;
  let pos, look;
  if (st === 'menu' || st === 'howto' || st === 'result') {
    // 選單：從一壘看台方向慢慢看整個內野
    const a = Math.PI + 0.9 + Math.sin(game.time * 0.08) * 0.35;
    pos = new THREE.Vector3(Math.sin(a) * 15, 4.2, Math.cos(a) * 15 + 6);
    look = new THREE.Vector3(0, 0.9, 7);
  } else if (B.cam.mode === 'follow' && B.ball.visible) {
    const bp = B.ball.position;
    // 轉播視角：本壘後上方（在後擋網裡面），跟著球轉
    pos = new THREE.Vector3(bp.x * 0.15, 8 + bp.y * 0.25, -4.8);
    look = bp.clone();
  } else {
    pos = B.cam.pos.clone(); look = B.cam.look.clone();
    if (game.settings?.lefty) { pos.x = -pos.x; }
  }
  const k = 1 - Math.exp(-dt * (B.cam.mode === 'follow' ? 5 : 3));
  B.camPos = (B.camPos || pos.clone()).lerp(pos, k);
  B.camLook = (B.camLook || look.clone()).lerp(look, k);
  c.position.copy(B.camPos);
  c.lookAt(B.camLook);
}
