// 打擊練習（陸地系列第一款原型）：投手投球 → 學生做揮棒動作 → 判定安打／界外／揮空。
// 規則與數字在 batting-logic.js；這裡負責球場上的人偶、球、鏡頭、提示與聲音。
import * as THREE from '../land/three.js';
import { Figure, samplePose, mixPose } from '../land/figure.js';
import { FIELD } from '../land/dims.js';
import { TIMES } from '../land/ballpark.js';
import { DIFFICULTY, LABEL, SCORE, PLATE_Z, MITT_Z, makePitch, judgeSwing, flyBall, Session, PITCH_TYPES, ZONE, cellOf, idealShift, makeTune, TUNE_DEFAULT, TUNE_RANGE } from './batting-logic.js';
import { sampleFromHands, swingFeatures, describeSwing, baselineFrom, patchBatPuppet, DEFAULT_BASE, PLANE_LABEL } from './batting-swing.js';

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
// 各種輸入「事件的時間 → 雙手真的揮到身體前面（擊球）」還差多少秒。判定時把揮棒時間往前推這麼多。
//   鍵盤／畫面按鈕：按下去後模擬人偶要 0.36 秒才揮到一半。
//   鏡頭：事件的時間是「那一格被拍到的時間」（輸入層用 requestVideoFrameCallback 取得），已經不含鏡頭與推論的延遲；
//   bat 事件大約在雙手揮到身體前面「之前」0.05 秒送出（人偶影像實測），所以是負的。
//   瀏覽器拿不到拍攝時間時（clock = present / raf），時間戳比真實晚一點，往回補。
const LATENCY = { keyboard: 0.36, replay: -0.05 };
const CAMERA_LATENCY = { capture: -0.05, present: -0.02, raf: 0.03 };
const latencyOf = (game, e) => (e.source === 'camera' ? CAMERA_LATENCY[game.kit?.stats?.clock] ?? 0.03 : LATENCY[e.source] ?? 0);
// 揮棒測試量到的時間偏差（秒），依輸入方式（鏡頭／鍵盤）分開存在這台裝置上
// （v2：鏡頭事件改用拍攝時間後，舊的校正值不再適用，換一個名字重新測）
const calibKey = (game) => `taikan-batting-calib-v2-${game.kit?.source || 'keyboard'}`;
function loadCalib(game) { try { const v = Number(localStorage.getItem(calibKey(game))); return Number.isFinite(v) ? clamp(v, -0.6, 0.6) : 0; } catch { return 0; } }
function saveCalib(game, v) { try { localStorage.setItem(calibKey(game), String(v)); } catch { /* 沒有儲存空間也沒關係 */ } }
const CALIB_PITCHES = 5, CALIB_MAX = 9;
// 揮棒高低的個人基準（擊球瞬間雙手高度、移動方向、速度），跟時間校正分開存。
// v1：第一版。時間校正（v2）的意義沒有改（揮棒測試仍是正中間的直球，判定的時間基準不變），所以沿用。
const baseKey = (game) => `taikan-batting-swingbase-v1-${game.kit?.source || 'keyboard'}`;
function loadBase(game) { try { const v = JSON.parse(localStorage.getItem(baseKey(game)) || 'null'); return v && ['h', 'slope', 'speed'].every((k) => Number.isFinite(v[k])) ? v : null; } catch { return null; } }
function saveBase(game, v) { try { localStorage.setItem(baseKey(game), JSON.stringify(v)); } catch { /* 沒有儲存空間也沒關係 */ } }
const isCam = (src) => src === 'camera' || src === 'replay';
// 可調設定：選單「進階調整」存在 settings.tune；網址參數 ?win= &spd= &htol= &inout= 優先（實測時方便）
const URL_TUNE = { win: 'windowScale', spd: 'speedScale', htol: 'heightTol', inout: 'inOut' };
function tuneFrom(s) {
  const q = new URLSearchParams(location.search), t = { ...(s.tune || {}) };
  for (const [k, v] of Object.entries(URL_TUNE)) if (q.has(k)) t[v] = q.get(k);
  return makeTune(t);
}
const BATTER_X = FIELD.plateWidth / 2 + FIELD.boxGap + FIELD.box[0] / 2 + 0.05;

// ── 人偶的關鍵姿勢（右打者；左打者整個鏡像） ──
const STANCE = { hipY: 0.66, bend: 0.22, torsoYaw: -0.1, headYaw: 1.25, lHand: [-0.09, 0.36, 0.16], rHand: [-0.13, 0.42, 0.13], batTip: [-0.3, 1.05, -0.25], lFoot: [0.3, 0.02, 0.15], rFoot: [-0.28, -0.04, 0.2] };
const LOAD = { ...STANCE, torsoYaw: -0.4, lHand: [-0.17, 0.4, 0.08], rHand: [-0.21, 0.46, 0.05], batTip: [-0.55, 0.95, -0.55], lFoot: [0.22, 0.04, 0.1, 0.03] };
const CONTACT = { hipY: 0.63, bend: 0.25, torsoYaw: 0.75, headYaw: 0.65, lHand: [-0.02, 0.2, 0.42], rHand: [-0.08, 0.22, 0.38], batTip: [-0.75, 0.3, 0.95], lFoot: [0.42, 0.04, 0.4], rFoot: [-0.28, -0.04, 0.6] };
const FINISH = { hipY: 0.66, bend: 0.12, torsoYaw: 1.45, headYaw: 0.2, lHand: [0.12, 0.5, 0.18], rHand: [0.06, 0.52, 0.2], batTip: [0.5, 0.9, -0.5], lFoot: [0.42, 0.04, 0.6], rFoot: [-0.22, -0.02, 1.2] };
const SWING = [[0, LOAD], [0.07, LOAD], [0.16, CONTACT], [0.32, FINISH], [0.9, FINISH], [1.5, STANCE]];
const SWING_CONTACT = 0.16; // 揮棒動畫開始後幾秒「碰到球」
const SWING_FWD = 0.07;     // 動畫裡「從預備姿勢開始往前揮」的那一格
const CHECK_AFTER = 0.45;   // 揮棒起動後這麼久都沒等到 bat（不是真的揮）→ 人物「止揮」收回

const P_SET = { hipY: 0.74, bend: 0.05, lHand: [0.03, 0.3, 0.2], rHand: [-0.03, 0.3, 0.2], lFoot: [0.12, 0.05], rFoot: [-0.12, 0.05] };
const P_KICK = { ...P_SET, torsoYaw: -0.6, hipY: 0.72, lFoot: [0.08, 0.2, 0, 0.32] };
const P_STRIDE = { hipY: 0.6, hipZ: 0.35, bend: 0.1, torsoYaw: -0.7, lHand: [0.4, 0.28, 0.25], rHand: [-0.55, 0.5, -0.3], lFoot: [0.12, 0.85], rFoot: [-0.12, 0.05] };
const P_RELEASE = { hipY: 0.58, hipZ: 0.55, bend: 0.45, torsoYaw: 0.45, lHand: [0.25, 0.12, 0.12], rHand: [-0.12, 0.55, 0.45], lFoot: [0.12, 0.85], rFoot: [-0.12, 0.25] };
const P_FOLLOW = { hipY: 0.6, hipZ: 0.6, bend: 0.75, torsoYaw: 0.7, lHand: [0.25, 0.1, 0.0], rHand: [0.3, -0.05, 0.3], lFoot: [0.12, 0.85], rFoot: [-0.3, 0.75] };
const PITCH = [[0, P_SET], [0.45, P_KICK], [0.85, P_STRIDE], [1.0, P_RELEASE], [1.35, P_FOLLOW], [2.4, P_SET]];
// 球種的出手線索：高壓（曲球，手更高、身體更直）、側肩（滑球，手放低往外）
const ARM_POSES = {
  over: PITCH,
  high: PITCH.map(([t, p]) => [t, p === P_RELEASE ? { ...P_RELEASE, bend: 0.25, rHand: [-0.02, 0.72, 0.38] } : p === P_STRIDE ? { ...P_STRIDE, rHand: [-0.45, 0.65, -0.3] } : p]),
  side: PITCH.map(([t, p]) => [t, p === P_RELEASE ? { ...P_RELEASE, bend: 0.5, lean: 0.25, rHand: [-0.5, 0.3, 0.35] } : p === P_STRIDE ? { ...P_STRIDE, rHand: [-0.65, 0.3, -0.25] } : p]),
};
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
  // 打擊只需要追蹤一個人：MediaPipe 只找 1 人時每格推論快約一倍（代價：這款不會提醒「鏡頭前有兩個人」）
  // 診斷用網址參數（平常不用）：
  //   ?worker=1 推論放到背景執行緒（遊戲畫面比較順，但雲端實測推論本身變慢，所以預設不開，請用平板比較）
  //   ?delegate=cpu 強制用 CPU 推論（比較 GPU／CPU 哪個快）
  get cameraInput() {
    const q = new URLSearchParams(location.search), d = q.get('delegate');
    return { numPoses: 1, worker: q.get('worker') === '1', ...(d ? { delegate: d.toUpperCase() } : {}) };
  },
  options: [
    { key: 'calibTest', label: '開始前先做「揮棒測試」（5 球，量你的揮棒快慢並自動校正，建議開著）', default: true },
    { key: 'autoSwing', label: '自動揮棒（只看球，練習分辨好球、壞球）' },
    { key: 'autoCalib', label: '自動校正揮棒時機（依你前幾球的快慢調整，建議開著）', default: true },
    { key: 'diag', label: '顯示延遲診斷（給老師／資訊人員看：揮棒到人物動作差多少毫秒）' },
    { key: 'pitchHint', label: '顯示球種名稱（挑戰模式預設在球投完才顯示）', default: false },
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
  keysHelp: '空白鍵揮棒（平揮）　按住 ↑ 再揮＝撈（低球）　按住 ↓ 再揮＝壓（高球）　Enter（按住）＝暫停',
  // ↑↓ 只用來選揮法（不要讓模擬人偶蹲下）
  keyboard: { remap: { Space: 'bat-left', ArrowUp: 'noop', ArrowDown: 'noop' } },
  touchButtons: [{ label: '⬆ 撈（低球）', press: 'bat-up' }, { label: '⚾ 平揮', press: 'bat-flat' }, { label: '⬇ 壓（高球）', press: 'bat-down' }],
  hudChips: [{ id: 'pitch', label: '第幾球' }, { id: 'hits', label: '安打' }, { id: 'score', label: '分數' }],
  hudExtra: `<div class="widget" id="bTiming">揮棒時機 <b id="bTimingText">—</b>
    <div class="bar center" style="width:min(240px,40vw)"><span class="mark" id="bTimingMark" style="left:50%;display:none"></span></div>
    <small>← 太早　　剛好　　太晚 →</small></div>
    <div class="widget" id="bSwing" style="display:none"></div>
    <div class="widget" id="bPitch" style="display:none"></div>
    <div class="widget" id="bZoneW"><svg id="bZone" viewBox="0 0 120 130" width="120" height="130" aria-label="好球帶"></svg><small>捕手看出去的好球帶<br>（左＝三壘側）</small></div>
    <div class="widget diag" id="bDiag" style="display:none"></div>`,

  howto(s) {
    const cards = [];
    if (!s.autoSwing) cards.push({ move: 'bat', title: '看球的高低揮', text: '<b>低球</b>：手放低、由下往上<b>撈</b>；<b>高球</b>：手抬高、由上往下<b>壓</b>；<b>中間</b>：平平揮。揮的高度跟球差太多，會擦棒或打成滾地球。<b>內角</b>（靠近你身體）要早一點揮，<b>外角</b>晚一點', seated: '坐著也行：手抬高、放低一樣算', skip: '鍵盤：按住 ↑ 或 ↓ 再按空白鍵' });
    if (!s.autoSwing) cards.push({ move: 'bat', title: '雙手一起揮棒', text: '兩隻手<b>靠在一起</b>像握著球棒放在肩膀旁邊，<b>球快到本壘時，雙手一起往前揮過身體</b>。雙手揮過身體的那一下就是擊球的瞬間。<b>正面站、或像打者一樣側身站都可以</b>（鏡頭和畫面在你正前方：側身時臉轉向畫面看球，身體和雙手都要在鏡頭裡）', seated: '坐著也行：只轉上半身揮', skip: '做不到可以改選「自動揮棒」' });
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
    // 進階調整（老師用）：實測後依學生狀況調整
    const tune = makeTune(settings.tune);
    const adv = document.createElement('section');
    const row = (k, label, help) => `<label class="row" style="flex-wrap:wrap"><span style="min-width:9em">${label}</span><input type="range" data-k="${k}" min="${TUNE_RANGE[k][0]}" max="${TUNE_RANGE[k][1]}" step="0.05" value="${tune[k]}" style="flex:1"><b data-v="${k}">${tune[k].toFixed(2)}</b><small style="width:100%;color:var(--muted)">${help}</small></label>`;
    adv.innerHTML = `<details><summary><b>進階調整（老師用）</b></summary>
      ${row('windowScale', '時機寬容度 ×', '學生常「揮了卻被判太早／太晚」、或平板延遲不穩 → 調大')}
      ${row('speedScale', '球速 ×', '來不及反應 → 調小（所有球種一起變）')}
      ${row('heightTol', '高低寬容度 ×', '高低常判錯 → 調大；0＝不看高低，只看時機')}
      ${row('inOut', '內外角影響 ×', '0＝內外角都一樣時機')}
      <button type="button" data-reset>回到預設值</button></details>`;
    grid.appendChild(adv);
    const syncTune = () => { game.tune = tuneFrom(settings); for (const el of adv.querySelectorAll('[data-v]')) el.textContent = Number(game.tune[el.dataset.v]).toFixed(2); };
    adv.addEventListener('input', (e) => { const k = e.target.dataset?.k; if (!k) return; settings.tune = { ...(settings.tune || {}), [k]: Number(e.target.value) }; syncTune(); save(); });
    adv.querySelector('[data-reset]').onclick = () => { settings.tune = { ...TUNE_DEFAULT }; for (const el of adv.querySelectorAll('input[type=range]')) el.value = TUNE_DEFAULT[el.dataset.k]; syncTune(); save(); };
    syncTune();
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
    // 縫線畫粗一點，旋轉的方向才看得出來（直球往後轉、曲球往前轉、滑球像紅點在轉）
    const ballTex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#f6f3ea'; x.fillRect(0, 0, 128, 64); x.strokeStyle = '#c1272d'; x.lineWidth = 7; x.beginPath(); x.arc(32, 32, 22, -1.1, 1.1); x.stroke(); x.beginPath(); x.arc(96, 32, 22, 2.0, 4.3); x.stroke(); return c; })());
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
    // 九宮格的格線（一直都看得到，淡淡的）
    const gl = [];
    for (const i of [1, 2]) { const x = hw - (2 * hw * i) / 3; gl.push([x, zl], [x, zh]); const y = zh - ((zh - zl) * i) / 3; gl.push([-hw, y], [hw, y]); }
    B.grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(gl.map(([x, y]) => new THREE.Vector3(x, y, PLATE_Z))), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthTest: false }));
    B.grid.renderOrder = 10; scene.add(B.grid);
    // 球通過本壘板的位置標記（之後留一下，讓學生看到球進了哪一格）
    B.mark = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.045, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
    B.mark.renderOrder = 12; B.mark.visible = false; scene.add(B.mark);
    // 球的殘影（最近 0.4 秒走過的位置，一顆顆變小變淡）：看得出球往哪裡彎、什麼時候開始掉
    B.trail = new THREE.Group(); B.trail.visible = false; scene.add(B.trail);
    B.trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    const ghostG = new THREE.SphereGeometry(FIELD.ballDiameter / 2 * 1.3, 10, 8);
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(ghostG, B.trailMat); m.scale.setScalar(1 - i / 14); B.trail.add(m); }
    B.samples = []; B.zoneLog = [];
    // 鍵盤說明移到上面（下面會擋到好球帶最低那一排）
    const kh = document.getElementById('hKeys');
    if (kh) Object.assign(kh.style, { top: '64px', bottom: 'auto' });
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
    game.calibBase = loadCalib(game);           // 上次測試量到的值（沒做過＝0）
    game.calib = game.calibBase;
    B.cal = s.calibTest && !s.autoSwing ? { n: 0, tries: 0, es: [], done: false } : null; // 揮棒測試進行中
    if (B.cal) game.calib = 0;                   // 測試時不套用任何校正，量「原始」的偏差
    B.phase = 'ready'; B.phaseT = 0; B.pitch = null; B.next = null; B.swing = null; B.hit = null; B.called = false; B.lastE = null; B.anim = null;
    game.tune = tuneFrom(s);
    if (B.cal) B.cal.feats = [];
    B.zoneLog = []; B.mark.visible = false; B.trail.visible = false; drawZone(game);
    hookInput(game);
    B.ball.visible = B.shadow.visible = B.ring.visible = false;
    B.zone.visible = true;
    B.cam.mode = 'bat';
    placeBatter(game, s);
    game.park.scoreboard.update({ title: '打擊練習', right: d.label, big: '⚾ PLAY BALL', cells: [['安打', '0'], ['球數', `0 / ${d.pitches}`], ['分數', '0']] });
    timingWidget(null, d);
  },

  onAction(game, e, s) {
    const B = game.bat;
    if (s.autoSwing) return;
    // 揮棒起動（batStart）：雙手剛開始往前揮，人物馬上開始揮（不判定；等 bat 來才判定）
    if (e.type === 'batStart') { preSwing(game, e); return; }
    // 只認雙手一起揮（bat）：事件的時間＝雙手揮過身體＝擊球瞬間
    if (e.type !== 'bat') return;
    if (B.swing && game.clock - B.swing.at < 0.6) return;
    if (B.cal && B.swing?.missRecorded) return; // 測試球每球只收一次揮棒（再揮也不算）
    const delay = Math.max(0, (performance.now() - e.time) / 1000);
    const swing = readSwing(game, e);
    startSwing(game, s, game.clock - delay - latencyOf(game, e) + game.calib, e.strength ?? 0.7, false, e, swing);
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
    // 鍵盤模擬的人偶（換輸入方式時會重建）：包上「撈／平／壓」三種揮法
    if (game.kit?.keyboard) patchBatPuppet(game.kit.keyboard.puppet, () => B.kbPlane || 0);
    // 起動後一直沒等到真正的揮棒（bat）：可能只是手動了一下 → 人物止揮
    if (B.anim && !B.anim.confirmed && !B.anim.check && game.clock - B.anim.clock0 > CHECK_AFTER) { B.anim.check = true; B.anim.checkT = 0; B.anim.checkFrom = samplePose(SWING, B.anim.t); }
    if (B.phase === 'ready') {
      if (B.cal && (B.cal.n >= CALIB_PITCHES || B.cal.tries >= CALIB_MAX)) finishCalib(game, out);
      if (S.done) { B.phase = 'end'; return out; }
      const gap = B.cal ? 2.2 : d.gap;
      if (B.phaseT > gap - 0.9 && !B.readySaid) { B.readySaid = true; out.push({ text: B.cal ? (B.cal.tries === 0 ? '揮棒測試：球到圈圈、聽到「嗒」就雙手揮！' : `測試第 ${B.cal.n + 1} 球`) : S.n === 0 ? '準備好了嗎？' : `第 ${S.n + 1} 球`, kind: '' }); }
      if (B.phaseT > gap) {
        B.phase = 'windup'; B.phaseT = 0; B.readySaid = false; B.swing = null; B.hit = null; B.called = false; B.cam.mode = 'bat';
        // 先決定這一球（投手的出手動作要先看得出球種）。揮棒測試：一律正中間的直球
        B.next = B.cal ? makePitch(DIFFICULTY.easy, Math.random, { type: 'fastball', cell: 4, tune: game.tune }) : makePitch(d, Math.random, { tune: game.tune });
        B.mark.visible = false;
      }
    } else if (B.phase === 'windup') {
      if (B.phaseT >= RELEASE_AT) {
        B.pitch = B.next || makePitch(d, Math.random, { tune: game.tune });
        B.tickDone = false; B.crossed = false;
        B.pitch.at = game.clock;
        B.phase = 'flight'; B.phaseT = 0;
        B.ball.visible = B.shadow.visible = true;
        if (s.autoSwing) B.autoAt = B.pitch.T + idealShift(B.pitch, d, { lefty: !!s.lefty, tune: game.tune }) + (Math.random() - 0.5) * d.window;
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
        // 過了本壘板，球直直飛向捕手手套（不再繼續往下掉到地上）
        if (!B.hit && t > p.T) {
          const u = clamp((t - p.T) / (tMitt - p.T), 0, 1), py = p.pos(p.T)[1];
          pos[1] = py + (clamp(py - 0.08, 0.4, 1.1) - py) * u;
        }
        B.ball.position.set(...pos);
        spinBall(B, p, dt);
        updateTrail(game, p, Math.min(t, B.hit ? p.T : tMitt), d, s);
        if (!B.crossed && t >= p.T) crossPlate(game, p, d, s);
        if (B.cal && !B.tickDone && t >= p.T) { B.tickDone = true; game.cue('tick'); }
        if (pos[2] <= MITT_Z + 0.01 && !B.inMitt) { B.inMitt = true; game.cue('mitt'); }
      }
      // 好球帶與時機圈
      if ((d.assist || B.cal) && !B.hit) {
        const u = clamp(1 - t / p.T, 0, 1);
        B.ring.visible = t < p.T + 0.05;
        B.ring.position.set(p.target[0], p.target[1], PLATE_Z);
        B.ring.scale.setScalar(1 + u * 3.5);
        B.ring.material.color.set(u < 0.12 ? 0x5fd39a : 0xffd25a);
        B.ring.lookAt(game.camera.position);
      }
      // 擊球的畫面在揮棒動畫「碰到球」那一刻才出現
      if (B.hit && !B.hit.shown && (game.clock >= B.hit.showAt || t >= p.T)) {
        B.hit.shown = true; B.phase = 'batted'; B.phaseT = 0; B.ring.visible = false; B.trail.visible = false;
        game.cue('crack');
        if (B.hit.fly.result !== 'foul' || B.hit.fly.dist > 15) B.cam.mode = 'follow';
      }
      // 沒揮棒：球進手套後判好壞球
      if (!B.swing && t > p.T + 0.75 && B.cal) {
        B.cal.tries++; out.push({ text: '沒偵測到揮棒，再來一球', kind: 'bad' }); endPitch(game, 'calib');
      } else if (!B.swing && t > p.T + 0.75) {
        const kind = p.strike ? 'looking' : 'take';
        S.record(kind, { kmh: p.kmh, type: p.type, cell: p.cell });
        logZone(game, p, kind);
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
      if (B.phaseT > 1.2) { B.phase = 'ready'; B.phaseT = 0; B.ball.visible = B.shadow.visible = false; B.trail.visible = false; B.inMitt = false; B.cam.mode = 'bat'; }
    }
    // 球的影子
    if (B.ball.visible) { B.shadow.position.set(B.ball.position.x, 0.02, B.ball.position.z); const h = B.ball.position.y; B.shadow.scale.setScalar(1 + h * 0.15); B.shadow.material.opacity = clamp(0.4 - h * 0.03, 0.08, 0.4); }
    animate(game, dt, s);
    // 延遲診斷：人物開始揮的那一格（這一格接著就會畫出來）
    if (B.anim && !B.anim.shownAt) { B.anim.shownAt = performance.now(); diagRecord(game, B.anim); }
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
    if (game.bat.cal) return { pitch: `揮棒測試 ${Math.min(game.bat.cal.n + 1, CALIB_PITCHES)} / ${CALIB_PITCHES}`, hits: 0, score: 0 };
    return { pitch: `${Math.min(S.n + (game.bat.phase === 'ready' || game.bat.phase === 'end' ? 0 : 1), S.d.pitches)} / ${S.d.pitches}`, hits: S.hits, score: S.score };
  },
  hudExtraUpdate(game, st, s) {
    const p = game.bat.pitch, el = document.getElementById('bPitch');
    const B = game.bat;
    // 球種名稱：簡單、普通在出手時顯示；挑戰在球過本壘板後才顯示（要自己看出來）
    const showNow = s.pitchHint || game.diff.showType === 'release' || B.cal;
    if (p && B.phase !== 'ready' && B.phase !== 'windup') {
      el.style.display = '';
      const known = showNow || B.crossed;
      el.innerHTML = known ? `<b style="color:${PITCH_TYPES[p.type].color}">${p.label}</b>・<b>${p.kmh}</b> 公里/小時<small>${PITCH_TYPES[p.type].hint}</small>` : '球種：<b>？</b>（看球的速度和變化）';
    } else el.style.display = 'none';
    const sw = document.getElementById('bSwing');
    if (B.lastSwing && B.phase !== 'ready') { sw.style.display = ''; sw.innerHTML = B.lastSwing; } else if (B.phase === 'ready') sw.style.display = 'none';
    const dg = document.getElementById('bDiag');
    const on = s.diag || new URLSearchParams(location.search).has('diag');
    dg.style.display = on ? '' : 'none';
    if (on) dg.innerHTML = diagHtml(game);
  },

  result(game) {
    const S = game.session, c = S.count;
    const parts = [['全壘打', c.homer], ['長打', c.long], ['安打', c.hit], ['出局', c.out], ['界外', c.foul], ['揮空', c.miss], ['壞球沒揮', c.take], ['好球沒揮', c.looking]].filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join('・');
    const es = S.log.filter((x) => typeof x.e === 'number').map((x) => x.e);
    const avg = es.length ? es.reduce((a, b) => a + b, 0) / es.length : 0;
    const tip = !es.length ? '' : avg < -0.06 ? '你常常<b>太早</b>揮，可以等球再近一點。' : avg > 0.06 ? '你常常<b>太晚</b>揮，看到投手出手就準備。' : '揮棒時機很準！';
    const types = Object.entries(S.byType).map(([k, v]) => `${PITCH_TYPES[k]?.label || k}：${v.n} 球打中 ${v.hits}`).join('・');
    return {
      title: S.hits >= S.d.pitches * 0.5 ? '打得好！' : '練習完成！',
      stars: S.stars(),
      html: `${S.d.pitches} 球中打出 <b>${S.hits}</b> 支安打・分數 <b>${S.score}</b><br>${parts}<br>${types ? types + '<br>' : ''}${tip}${game.calib ? `<br><small>揮棒校正：把你的揮棒時間調整了 ${Math.round(game.calib * 1000)} 毫秒</small>` : ''}`,
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

function startSwing(game, s, contactClock, strength, auto = false, ev = null, swing = null) {
  const B = game.bat, d = game.diff;
  B.swing = { at: game.clock };
  const p = B.pitch;
  if (!p || B.phase !== 'flight' || B.hit) { swingAnim(game, 0, ev); game.cue('whoosh'); return; } // 沒有球時揮棒：只是空揮練習
  const e = contactClock - (p.at + p.T);
  // 太早太多（球還沒出手就揮）不算這一球，讓學生再揮一次
  if (e < -0.6) { B.swing = null; game.bat.missToast = { text: '太早了，等球來再揮', kind: 'bad' }; return; }
  if (B.cal) {
    B.cal.tries++;
    B.cal.es.push(e); B.cal.n++;
    if (swing?.f) B.cal.feats.push(swing.f);
    timingWidget(e, d);
    B.swing.missRecorded = true;          // 測試球不計分，揮完就換下一球
    swingAnim(game, 0, ev);
    game.cue('whoosh');
    B.missToast = { text: `測試 ${B.cal.n}/${CALIB_PITCHES}：你${Math.abs(e) < 0.04 ? '很準' : e < 0 ? '早了' : '晚了'}${Math.abs(e) < 0.04 ? '' : ` ${Math.abs(e).toFixed(2)} 秒`}`, kind: Math.abs(e) < 0.08 ? 'good' : '' };
    return;
  }
  const tPlate = p.at + p.T;
  const wait = Math.max(0, tPlate - game.clock);   // 球還要多久才到本壘板
  const j = judgeSwing(e, d, { strength, lefty: !!s.lefty, pitch: p, swing: swing?.d || null, tune: game.tune });
  B.lastE = e;
  timingWidget(j.eAdj ?? e, d, game.tune);
  B.lastSwing = swingText(swing, j, p);
  if (s.autoCalib && !auto && Math.abs(e) < 0.45) game.calib = clamp(game.calib - e * 0.3, game.calibBase - 0.12, game.calibBase + 0.12);
  if (!j.contact) {
    game.session.record('miss', { e, type: p.type, cell: p.cell, plane: swing?.d?.plane, why: j.why });
    logZone(game, p, 'miss');
    B.swing.missRecorded = true;
    swingAnim(game, 0, ev);
    game.cue('whoosh');
    B.missToast = { text: `揮空！${{ early: '太早了', late: '太晚了', under: '揮在球下面', over: '揮在球上面' }[j.why] || ''}`, kind: 'bad' };
    scoreboard(game, '揮空', 'miss');
    return;
  }
  const from = [p.target[0], p.target[1], PLATE_Z];
  const fly = flyBall(j, d, from);
  game.session.record(fly.result, { e, dist: Math.round(fly.dist), type: p.type, cell: p.cell, plane: swing?.d?.plane });
  logZone(game, p, fly.result);
  // 打到球：調整揮棒動畫的快慢（不停住），讓「碰到球」那一格剛好在球到本壘板時
  swingAnim(game, wait, ev);
  B.hit = { j, fly, showAt: game.clock + wait, shown: false, announced: false };
  const w = d.window * game.tune.windowScale, ea = j.eAdj;
  const word = j.foulTip && (j.why === 'under' || j.why === 'over') ? (j.why === 'under' ? '擦到球的下面' : '擦到球的上面') : Math.abs(ea) < w * 0.35 ? '剛好！' : ea < 0 ? '有點早' : '有點晚';
  B.missToast = { text: word, kind: word === '剛好！' ? 'good' : '' };
}

// 揮棒起動：人物從預備姿勢開始往前揮（還沒判定）。玩家已經揮了一段，所以從「往前揮」那一格開始，不播往後拉
function preSwing(game, e) {
  const B = game.bat;
  if (B.anim && !B.anim.check) return;
  B.anim = { t: SWING_FWD, rate: 1, clock0: game.clock, confirmed: false, ev: diagEvent(game, e), start: 'batStart' };
}

// 判定之後的揮棒動畫。wait＝球還要多久才到本壘板（打到球時，讓「碰到球」那一格對準它）
function swingAnim(game, wait, e) {
  const B = game.bat, A = B.anim;
  if (A && !A.check && A.t < SWING_CONTACT + 0.05) {
    // 已經因為 batStart 開始揮了：只調快慢
    A.confirmed = true;
    if (wait > 0 && A.t < SWING_CONTACT) A.rate = clamp((SWING_CONTACT - A.t) / wait, 0.25, 3);
    if (A.ev) A.ev.bat = diagEvent(game, e);
    return;
  }
  // 沒有起動事件（例如鍵盤、或起動沒被抓到）：玩家已經揮到擊球點了，動畫從「碰到球」開始；
  // 球還沒到時從往前揮開始、放慢到剛好在球到時碰到（不再停在原地等）
  const t = wait > 0 ? Math.max(SWING_FWD, SWING_CONTACT - wait) : SWING_CONTACT;
  B.anim = { t, rate: wait > 0 ? clamp((SWING_CONTACT - t) / wait, 0.25, 3) : 1, clock0: game.clock, confirmed: true, ev: diagEvent(game, e), start: 'bat' };
}

// ── 延遲診斷 ──
// 每次揮棒記下：玩家雙手開始往前揮的時間（onset，拍攝時間）、送出事件那一格的拍攝時間、
// 程式收到事件的時間、人物開始動的那一格。全部用 performance.now() 的時間軸（毫秒）。
function diagEvent(game, e) {
  if (!e) return null;
  return { type: e.type, source: e.source, onset: e.onset ?? e.time, frame: e.time, recv: performance.now(), clock: game.kit?.stats?.clock || (e.source === 'camera' ? '?' : 'puppet') };
}
function diagRecord(game, A) {
  const ev = A.ev;
  if (!ev || (ev.source !== 'camera' && ev.source !== 'replay')) return; // 鍵盤模擬沒有鏡頭延遲可量
  const r = {
    by: A.start, source: ev.source, clock: ev.clock,
    recognize: Math.round(ev.frame - ev.onset),   // 動作起動 → 辨識出來的那一格（辨識需要看多久）
    pipeline: Math.round(ev.recv - ev.frame),     // 那一格拍到 → 程式收到（鏡頭＋推論＋排隊）
    render: Math.round(A.shownAt - ev.recv),      // 收到 → 人物開始動的那一格
    total: Math.round(A.shownAt - ev.onset),      // 起動 → 人物開始動
    at: Math.round(A.shownAt), onset: Math.round(ev.onset),
  };
  const log = (game.diagLog ||= []);
  log.push(r); if (log.length > 10) log.shift();
  (window.batDiag ||= []).push(r);
}
function diagHtml(game) {
  const log = (game.diagLog || []).slice(-5), cs = game.kit?.stats;
  const avg = (k) => Math.round(log.reduce((a, r) => a + r[k], 0) / log.length);
  const cam = cs ? `鏡頭 ${cs.fps} 格/秒（間隔 ${Math.round(cs.frameMs)} ms）・推論 ${Math.round(cs.inferMs)} ms・拍到→算完 ${Math.round(cs.pipeMs)} ms・時間戳：${{ capture: '拍攝時間 ✅', present: '顯示時間（估計）', raf: '畫面更新時間（估計）' }[cs.clock] || '—'}・找 ${cs.numPoses ?? '?'} 人・${cs.delegate || ''}${cs.thread === 'worker' ? '・背景執行緒' : cs.thread === 'main' ? '・主執行緒' : ''}` : '鍵盤模擬（沒有鏡頭延遲）';
  if (!log.length) return `<b>延遲診斷</b><small>${cam}</small><small>揮一次棒就會顯示</small>`;
  const last = log[log.length - 1];
  return `<b>延遲診斷</b>：起動→人物揮棒 <b>${avg('total')}</b> ms（最近 ${log.length} 次平均）` +
    `<small>＝ 辨識 ${avg('recognize')} ＋ 鏡頭與推論 ${avg('pipeline')} ＋ 畫面 ${avg('render')} ms</small>` +
    `<small>最近一次：${last.total} ms，由 ${last.by === 'batStart' ? '揮棒起動（提早）' : '擊球事件（沒抓到起動）'} 觸發</small><small>${cam}</small>`;
}

function finishCalib(game, out) {
  const B = game.bat, cal = B.cal;
  const es = cal.es.filter((x) => Math.abs(x) < 0.55).sort((a, b) => a - b);
  B.cal = null;
  if (es.length < 3) {
    game.calibBase = loadCalib(game); game.calib = game.calibBase;
    out.push({ text: '測試沒偵測到足夠的揮棒，沿用上次的校正（沒做過就是預設值）。可以到選單重新測試', kind: 'bad' });
    return;
  }
  const med = es[Math.floor(es.length / 2)];
  const spread = Math.max(...es) - Math.min(...es);
  // 揮棒高低的個人基準（鍵盤也存，模擬人偶的平揮）
  const base = baselineFrom(cal.feats || []);
  if (base) { saveBase(game, base); (B.base ||= {})[isCam(game.kit?.source) ? 'camera' : 'keyboard'] = base; }
  game.calibBase = clamp(-med, -0.6, 0.6);
  game.calib = game.calibBase;
  saveCalib(game, game.calibBase);
  B.calibReport = { shift: game.calibBase, spread, n: es.length };
  out.push({ text: `測試完成：你平均${med < 0 ? '早' : '晚'}了 ${Math.abs(med).toFixed(2)} 秒，已自動校正${spread > 0.35 ? '（每次差很多，揮棒節奏再穩定一點會更準）' : ''}。開始正式打擊！`, kind: 'good' });
  game.park.scoreboard.update({ title: '打擊練習', right: game.diff.label, big: '⚾ PLAY BALL', cells: [['安打', '0'], ['球數', `0 / ${game.diff.pitches}`], ['分數', '0']] });
}

function endPitch(game, kind) {
  const B = game.bat, S = game.session;
  B.phase = 'result'; B.phaseT = 0; B.ring.visible = false;
  if (kind === 'calib') return;
  if (kind === 'looking') scoreboard(game, '好球', kind);
  else if (kind === 'take') scoreboard(game, '壞球', kind);
  if (S.done) B.ring.visible = false;
}

function scoreboard(game, big, kind) {
  const S = game.session;
  const color = { homer: '#ffd25a', long: '#7dffb0', hit: '#7dffb0', foul: '#ffffff', out: '#ffb0a0', miss: '#ffb0a0', take: '#9fd8ff', looking: '#ffb0a0' }[kind] || '#ffffff';
  game.park.scoreboard.update({ title: '打擊練習', right: S.d.label, big, color, cells: [['安打', String(S.hits)], ['球數', `${S.n} / ${S.d.pitches}`], ['分數', String(S.score)]] });
}

function timingWidget(e, d, tune = TUNE_DEFAULT) {
  const mark = document.getElementById('bTimingMark'), txt = document.getElementById('bTimingText');
  if (!mark) return;
  if (e === null || e === undefined) { mark.style.display = 'none'; txt.textContent = '—'; return; }
  mark.style.display = '';
  const w = d.window * (tune.windowScale ?? 1);
  mark.style.left = `${50 + clamp(e / (w * 3), -1, 1) * 48}%`;
  mark.style.background = Math.abs(e) <= w ? '#5fd39a' : '#ff8a65';
  txt.textContent = Math.abs(e) < w * 0.35 ? '剛好！' : `${e < 0 ? '早' : '晚'} ${Math.round(Math.abs(e) * 100) / 100} 秒`;
}

function animate(game, dt, s) {
  const B = game.bat;
  // 打者
  const A = B.anim;
  if (A && A.check) {
    // 止揮：從目前的姿勢收回預備姿勢
    A.checkT += dt;
    B.batter.set(mixPose(A.checkFrom, STANCE, clamp(A.checkT / 0.3, 0, 1)));
    if (A.checkT > 0.3) B.anim = null;
  } else if (A && A.t < SWING[SWING.length - 1][0]) {
    const before = A.t;
    A.t += dt * A.rate;
    if (before < SWING_CONTACT && A.t >= SWING_CONTACT) A.rate = 1; // 碰到球之後照正常速度收棒
    B.batter.set(samplePose(SWING, A.t));
  } else {
    if (A) B.anim = null;
    const breath = Math.sin(game.time * 2.2) * 0.02;
    B.batter.set(mixPose(STANCE, { ...STANCE, torsoYaw: STANCE.torsoYaw - 0.06 }, 0.5 + breath * 10));
  }
  // 投手
  const pt = B.phase === 'windup' ? B.phaseT : B.phase === 'flight' || B.phase === 'batted' || B.phase === 'result' ? RELEASE_AT + (B.pitchT = (B.phase === 'flight' ? B.phaseT : (B.pitchT ?? 0) + dt)) : 0;
  const arm = (B.phase === 'windup' ? B.next : B.pitch)?.arm || 'over';
  B.pitcher.set(samplePose(ARM_POSES[arm] || PITCH, pt));
  // 捕手的手套跟著球
  const tgt = B.pitch && B.phase === 'flight' ? B.pitch.target : [0, 0.75];
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

// ── 球種與九宮格：畫面 ──

// 球依球種旋轉（慢速版，看得出方向）
const _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
function spinBall(B, p, dt) {
  if (!p.spin) return;
  _ax.set(...p.spin.axis).normalize();
  _q.setFromAxisAngle(_ax, p.spin.rps * Math.PI * 2 * dt);
  B.ball.quaternion.premultiply(_q);
}

// 殘影：最近 0.4 秒的位置（用軌跡公式直接算，不受畫面格數影響）。提示模式用球種顏色，挑戰模式一律白色
function updateTrail(game, p, t, d, s) {
  const B = game.bat, kids = B.trail.children, n = kids.length;
  const showType = s.pitchHint || d.showType === 'release' || B.cal;
  B.trailMat.color.set(showType ? PITCH_TYPES[p.type].color : '#ffffff');
  for (let i = 0; i < n; i++) kids[i].position.set(...p.pos(Math.max(t - ((i + 1) / n) * 0.4, 0)));
  B.trail.visible = t > 0.05;
}

// 球通過本壘板：留一個圈圈標出位置
function crossPlate(game, p) {
  const B = game.bat;
  B.crossed = true;
  const [x, y] = p.pos(p.T);
  B.mark.position.set(x, y, PLATE_Z);
  B.mark.material.color.set(cellOf(x, y).strike ? 0x5fd39a : 0x8fcaff);
  B.mark.lookAt(game.camera.position);
  B.mark.visible = true;
}

// 右上角的小好球帶：最近 6 球的位置（點的顏色＝結果、字＝球種）
const RES_COLOR = { homer: '#ffd25a', long: '#7dffb0', hit: '#7dffb0', out: '#ffb0a0', foul: '#ffffff', miss: '#ff6b5a', take: '#8fcaff', looking: '#ff6b5a' };
function logZone(game, p, kind) {
  const B = game.bat;
  B.zoneLog.push({ x: p.target[0], y: p.target[1], kind, type: p.type });
  if (B.zoneLog.length > 6) B.zoneLog.shift();
  drawZone(game);
}
function drawZone(game) {
  const svg = document.getElementById('bZone');
  if (!svg) return;
  // 好球帶 60×72 畫在中間，外面一圈是壞球區
  const X0 = 30, Y0 = 26, W = 60, H = 72, hw = ZONE.halfWidth;
  const sx = (x) => X0 + ((hw - x) / (2 * hw)) * W, sy = (y) => Y0 + ((ZONE.high - y) / (ZONE.high - ZONE.low)) * H;
  let g = `<rect x="2" y="2" width="116" height="126" rx="10" fill="rgba(0,0,0,0.25)"/><rect x="${X0}" y="${Y0}" width="${W}" height="${H}" fill="rgba(255,255,255,0.06)" stroke="#fff" stroke-width="1.5"/>`;
  for (const i of [1, 2]) g += `<line x1="${X0 + (W * i) / 3}" y1="${Y0}" x2="${X0 + (W * i) / 3}" y2="${Y0 + H}" stroke="rgba(255,255,255,0.35)"/><line x1="${X0}" y1="${Y0 + (H * i) / 3}" x2="${X0 + W}" y2="${Y0 + (H * i) / 3}" stroke="rgba(255,255,255,0.35)"/>`;
  game.bat.zoneLog.forEach((z, i, a) => {
    const cx = clamp(sx(z.x), 8, 112), cy = clamp(sy(z.y), 8, 122), last = i === a.length - 1;
    g += `<circle cx="${cx}" cy="${cy}" r="${last ? 7 : 5}" fill="${RES_COLOR[z.kind] || '#fff'}" stroke="#000" stroke-width="1" opacity="${last ? 1 : 0.6}"/><text x="${cx}" y="${cy + 3}" font-size="7" text-anchor="middle" fill="#000">${(PITCH_TYPES[z.type]?.label || '')[0]}</text>`;
  });
  svg.innerHTML = g;
}

// ── 揮棒的高低（從每一格骨架累積） ──
function hookInput(game) {
  const B = game.bat, kit = game.kit;
  if (!kit || B.hooked) return;
  B.hooked = true;
  B.base = {};
  kit.on('pose', (pose) => {
    const smp = sampleFromHands(pose ? pose.t : performance.now(), kit.state.hands);
    if (!smp) return;
    B.samples.push(smp);
    while (B.samples.length && smp.t - B.samples[0].t > 1500) B.samples.shift();
  });
  // 鍵盤：按住 ↑／↓ 選揮法；模擬人偶用遊戲這邊的包裝揮出不同高低
  addEventListener('keydown', (e) => { if (e.code === 'ArrowUp') B.kbPlane = 1; else if (e.code === 'ArrowDown') B.kbPlane = -1; });
  addEventListener('keyup', (e) => { if (e.code === 'ArrowUp' || e.code === 'ArrowDown') B.kbPlane = 0; });
}
function readSwing(game, e) {
  const B = game.bat, kit = game.kit, src = e.source || kit?.source;
  // bat 事件在這一格的骨架送出 pose 事件之前就到了：把現在的手的位置也算進去
  const now = sampleFromHands(e.time, kit?.state?.hands);
  const samples = now ? [...B.samples.filter((x) => x.t < e.time), now] : B.samples;
  const f = swingFeatures(samples, { t: e.time, onset: e.onset });
  const key = isCam(src) ? 'camera' : 'keyboard';
  if (!(key in B.base)) B.base[key] = loadBase(game);
  const personal = B.base[key];
  const d = describeSwing(f, personal || DEFAULT_BASE[key], { personal: !!personal });
  // 鍵盤沒有真的力道可量（模擬人偶每次一樣快）：固定中等
  if (d && !isCam(src)) { d.power = 0.85; d.reliable = true; }
  return { f, d };
}
function swingText(swing, j, p) {
  const d = swing?.d;
  if (!d) return '揮棒高低：<b>沒量到</b><small>（只看時機）</small>';
  const cm = Math.round((d.heightM - p.target[1]) * 100);
  const where = Math.abs(cm) <= 8 ? '高度剛好' : cm > 0 ? `比球高 ${cm} 公分` : `比球低 ${-cm} 公分`;
  return `揮法 <b>${PLANE_LABEL[d.plane]}</b>・${where}<small>${p.target[1] > ZONE.rowY(1) + 0.1 ? '高球：手抬高往下壓' : p.target[1] < ZONE.rowY(1) - 0.1 ? '低球：手放低往上撈' : '中間的球：平揮'}${d.reliable ? '' : '・還沒做揮棒測試，高低判得比較鬆'}</small>`;
}
