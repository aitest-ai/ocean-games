// 體感飛行（模擬器系列）掛在共用遊戲外殼（src/game/shell.js）上的「遊戲說明物件」。
// 3D 世界自己帶（mode.createWorld）：駕駛艙＋機場。規則在 mission.js、飛行模型在 fdm.js、身體 → 操縱在 controls.js。
//
// 動作（全部可以坐著做）：
//   身體左右傾 → 地面上轉向、空中傾斜轉彎
//   雙手一起抬高／放低（在胸前，不用舉過頭）→ 機頭往上／往下轉；手回到胸前 = 保持
//   舉單手 → 確認（起飛前檢查、推油門）
//   雙手舉過頭 1 秒 → 暫停（外殼）
import * as THREE from '../land/three.js';
import { FlightWorld } from './world.js';
import { airportScenery } from './airport.js';
import { TRAINER } from './aircraft/trainer.js';
import { TakeoffMission, FLIGHT_DIFF, PHASE_LABEL } from './mission.js';
import { BodyControls, Calibrator, DEFAULT_CALIB, patchPuppetYoke } from './controls.js';
import { TIMES } from '../land/ballpark.js';

const $ = (id) => document.getElementById(id);
const D = Math.PI / 180;
const calibKey = (src) => `taikan-flight-calib-${src}`;
function loadCalib(src) { try { const v = JSON.parse(localStorage.getItem(calibKey(src)) || 'null'); return v && Number.isFinite(v.rollL) ? v : null; } catch { return null; } }
function saveCalib(src, c) { try { localStorage.setItem(calibKey(src), JSON.stringify(c)); } catch { /* 沒有儲存空間也沒關係 */ } }
// 鏡頭模式的預測時間：鏡頭從拍到畫面到算出骨架約 0.1 秒以上（棒球遇過更久），往前推 0.1 秒；鍵盤模擬幾乎沒有延遲
const LEAD = { camera: 0.1, keyboard: 0.02, replay: 0.1 };
const VIEW_PILOT = { yaw: 0, pitch: -11 * D, fov: 62 }, VIEW_PANEL = { yaw: -6 * D, pitch: -24 * D, fov: 46 };

const hudExtra = `
  <div class="fl-prompt" id="flPrompt"><b id="flTitle"></b><span id="flSub"></span></div>
  <div class="widget fl-body" id="flBody">
    <div>身體傾斜 <b id="flLeanT">—</b><div class="bar center"><i id="flLean"></i></div></div>
    <div id="flPitchW">雙手（機頭）<b id="flPitchT">—</b><div class="bar center"><i id="flPitch"></i></div></div>
  </div>
  <div class="fl-calib" id="flCalib" hidden>
    <h2>體感校正 <small id="flCalStep"></small></h2>
    <p id="flCalText"></p>
    <div class="bar"><i id="flCalBar"></i></div>
    <small>每個人的身體不一樣：先量你「平常的姿勢」和「最大的傾斜」，之後小動作也能控制。約 15 秒。</small>
  </div>
  <div class="fl-ring" id="flRing" hidden></div>
  <div class="fl-touch" id="flTouch" hidden>
    <button data-h="leanL">◀ 左傾</button><button data-h="pitchUp">▲ 抬頭</button><button data-h="leanR">右傾 ▶</button>
    <button data-h="raiseR" class="ok">✋ 確認</button><button data-h="pitchDown">▼ 低頭</button>
  </div>`;

export function createFlightMode() {
  let W = null, controls = new BodyControls(), calib = null, patched = null;

  const mode = {
    id: 'flight', series: 'sim', title: '體感飛行：起飛', icon: '🛩️',
    noTimer: true, defaultTime: 'day',
    diffTitle: '難度', goWord: '開始！',
    seatedLabel: '🪑 坐著玩（只傾斜上半身、在胸前動雙手；這款本來就建議坐著）',
    soundLabel: '發動機與警告聲',
    intro: '坐在原創的<b>通用教練機</b>駕駛座上：先做起飛前檢查，<b>舉單手</b>推油門，<b>身體左右傾</b>讓飛機保持在跑道中間，到 55 節時<b>雙手抬高</b>抬頭，爬升到指定高度。<a class="link" href="./cockpit.html">（只想看駕駛艙？打開駕駛艙展示）</a>',
    goal: '把飛機開上天！<b>身體左右傾</b> = 方向（轉彎）、<b>雙手在胸前一起抬高／放低</b> = 機頭往上／往下，手回到胸前就保持。看<b>空速表</b>：到 <b>55 節</b>才抬頭，太早飛不起來；抬太多會<b>失速</b>。<br>🪑 坐著就能玩，雙手只要在胸前動，<b>不用一直舉著</b>。',
    difficulties: FLIGHT_DIFF,
    options: [
      { key: 'calibEvery', label: '開始前先做「體感校正」（約 15 秒；用鏡頭時建議開著）', default: true },
      { key: 'tiltOnly', label: '只靠身體傾斜（抬頭、低頭由電腦幫你；手不方便或手痠時用）' },
      { key: 'autoThrottle', label: '自動推油門（不用舉手）' },
      { key: 'skipChecks', label: '跳過起飛前檢查' },
    ],
    safety: [
      '玩家周圍 <b>1 公尺</b>內淨空（左右傾斜、雙手在胸前動，動作不大）；平板放穩、離玩家 1.5～2.5 公尺。',
      '<b>建議坐在椅子上玩</b>：選穩固、沒有輪子的椅子，只傾斜上半身，不要整個人離開椅子。',
      '每人連續玩<b>不超過 5 分鐘</b>（一次起飛約 1～2 分鐘）；頭暈、手痠就停下來休息。容易暈的同學可以勾「減少晃動」或改用「只靠身體傾斜」。',
      '<b>不要在行進中使用</b>（車上、走路時都不要玩）。',
      '一台平板前面只坐（站）一個人；看不到人時遊戲會自動暫停。',
      '🔒 鏡頭畫面只在這台平板上分析，不錄影、不上傳。',
    ],
    keysHelp: '←／→（按住）身體傾斜　↑／↓（按住）雙手抬高／放低　Q 或 E 舉單手＝確認　Enter（按住）暫停　拖曳畫面＝轉頭',
    keyboard: { remap: { ArrowUp: 'pitchUp', ArrowDown: 'pitchDown' } },
    hudChips: [{ id: 'phase', label: '任務' }, { id: 'kt', label: '空速', unit: '節' }, { id: 'ft', label: '離地高度', unit: '呎' }],
    hudExtra,

    howto(s) {
      const cards = [];
      if (s.calibEvery && s.input === 'camera') cards.push({ move: 'idle', title: '先做體感校正', text: '照畫面說明：坐好不動 → 往左傾 → 往右傾 → 雙手抬高 → 放低，約 15 秒', seated: '坐著做' });
      cards.push({ move: 'lean', title: '身體傾斜 = 方向', text: '上半身往左／右傾 → 地面上轉向、空中<b>傾斜轉彎</b>。身體回正，機翼就回到水平', seated: '坐著一樣做' });
      if (!s.tiltOnly) cards.push({ move: 'idle', title: '雙手抬高／放低 = 機頭', text: '雙手像握方向盤放在胸前，<b>一起往上抬 = 機頭抬起</b>、往下放 = 機頭往下。手回到胸前就保持（不用一直舉著）', seated: '坐著一樣做', skip: '可以勾「只靠身體傾斜」' });
      if (!s.autoThrottle || !s.skipChecks) cards.push({ move: 'raise-one', title: '舉單手 = 確認', text: '起飛前檢查看懂了、或推油門時，舉起一隻手', seated: '坐著一樣做', skip: '可以勾「自動推油門」「跳過檢查」' });
      cards.push({ move: 'raise-both', title: '雙手舉過頭 1 秒', text: '開始、暫停、繼續（開飛機時雙手只在胸前動，不會誤觸）', seated: '坐著一樣做' });
      return cards;
    },

    disabledActions: () => ['jump', 'paddle', 'swing', 'bat', 'crouch'],

    async createWorld(canvas, { tier, time }) {
      W = new FlightWorld(canvas, { tier, time, spec: TRAINER, scenery: airportScenery });
      W.look.springBack = true;
      W.look.home = { ...VIEW_PILOT }; W.look.set(VIEW_PILOT);
      return W;
    },

    menu({ grid, game, settings, save }) {
      const sec = document.createElement('section');
      sec.innerHTML = `<h2>時段與校正</h2>
        <div class="seg" id="flTime">${Object.entries(TIMES).map(([k, t]) => `<button data-v="${k}">${{ day: '☀️', dusk: '🌇', night: '🌙' }[k]} ${t.label}</button>`).join('')}</div>
        <div class="row"><button id="flRecal">🔄 清除這台裝置的體感校正</button></div>
        <p class="note" id="flCalNote"></p>`;
      grid.appendChild(sec);
      const el = sec.querySelector('#flTime');
      const sync = (v) => { for (const b of el.querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.v === v); };
      sync(settings.time || 'day');
      el.addEventListener('click', (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { sync(v); settings.time = v; game.setTime(v); save(); } });
      const note = () => { const c = loadCalib('camera'); sec.querySelector('#flCalNote').textContent = c ? `這台裝置已校正過（左傾最大 ${Math.round(c.rollL / D)}°、右傾 ${Math.round(c.rollR / D)}°）。` : '這台裝置還沒用鏡頭校正過。'; };
      sec.querySelector('#flRecal').onclick = () => { try { localStorage.removeItem(calibKey('camera')); } catch {} note(); };
      note();
    },

    setup(game) {
      // 觸控按鈕（平板沒有鏡頭時）：按住 = 傾斜／抬頭，放開 = 回正
      for (const b of $('flTouch').querySelectorAll('button')) {
        const h = b.dataset.h;
        const set = (on) => game.kit?.keyboard?.press(h, on);
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => set(false));
      }
    },

    newRace(game, diffKey, s) {
      const src = s.input === 'camera' ? 'camera' : 'keyboard';
      const saved = loadCalib(src);
      controls = new BodyControls({ calib: saved || DEFAULT_CALIB, lead: LEAD[src] ?? 0.1 });
      game.mission = new TakeoffMission({ diff: diffKey, opts: { tiltOnly: s.tiltOnly, autoThrottle: s.autoThrottle, skipChecks: s.skipChecks } });
      // 鏡頭：每次（或第一次）先校正；鍵盤模擬的人偶動作範圍固定，用預設值就好（網址加 ?calib=1 可以強制）
      const force = new URLSearchParams(location.search).has('calib');
      calib = (src === 'camera' && (s.calibEvery || !saved)) || force ? new Calibrator({ hands: !s.tiltOnly }) : null;
      game.timeLeft = 999;
      game.engineT = 0;
      placeFromFdm(game);
      W.look.set(VIEW_PILOT);
    },

    onAction(game, e) {
      if (calib) return;
      if (e.type === 'raise' && e.side !== 'both') { if (game.mission.confirm()) game.cue('tick'); }
    },

    idle(game, dt) { placeFromFdm(game); game.state0 = true; void dt; },

    update(game, dt, st, s) {
      const kit = game.kit, M = game.mission;
      if (kit?.keyboard && patched !== kit.keyboard.puppet) { patched = kit.keyboard.puppet; patchPuppetYoke(patched); }
      const pose = kit?.lastPose;
      const out = [];
      if (calib) {
        calib.update(dt, pose);
        if (calib.done) {
          const src = s.input === 'camera' ? 'camera' : 'keyboard';
          saveCalib(src, calib.result);
          controls = new BodyControls({ calib: calib.result, lead: LEAD[src] ?? 0.1 });
          calib = null;
          out.push({ text: '校正完成！', kind: 'good', cue: 'pass' });
        }
        placeFromFdm(game);
        return out;
      }
      if (pose) controls.feed(pose, pose.t);
      M.input({ lean: controls.lean, pitch: controls.handsSeen ? controls.pitch : 0 });
      for (const e of M.step(dt)) out.push(e);
      if (!controls.handsSeen && !s.tiltOnly && s.input === 'camera' && (M.phase === 'roll' || M.phase === 'climb')) {
        game.handsMissT = (game.handsMissT || 0) + dt;
        if (game.handsMissT > 2) { game.handsMissT = -6; out.push({ text: '看不到雙手：請把雙手放在胸前', kind: 'bad' }); }
      } else if (controls.handsSeen) game.handsMissT = 0;
      placeFromFdm(game);
      // 起飛前檢查時看儀表板，其他時候看前面
      const want = M.phase === 'check' || M.phase === 'power' ? VIEW_PANEL : VIEW_PILOT;
      if (game.lastView !== want) { game.lastView = want; W.look.home = { ...want }; W.look.set(want); }
      updateSound(game, s);
      return out;
    },

    done: (game) => game.mission.done && game.mission.phaseT > 2.5,

    hud(game) {
      const M = game.mission;
      return { phase: calib ? '體感校正' : PHASE_LABEL[M.phase] || '—', kt: Math.round(M.fdm.kt), ft: Math.round(Math.max(M.agl, 0)) };
    },

    hudExtraUpdate(game, st, s) {
      const M = game.mission;
      // 校正畫面
      $('flCalib').hidden = !calib;
      $('flBody').hidden = !!calib;
      if (calib) {
        const S = calib.step;
        $('flCalStep').textContent = S ? `${calib.i + 1} / ${calib.steps.length}：${S.short}` : '';
        $('flCalText').innerHTML = S ? S.text : '';
        $('flCalBar').style.width = `${Math.round(calib.progress * 100)}%`;
        $('flPrompt').hidden = true; $('flRing').hidden = true;
      } else {
        const p = M.prompt;
        $('flPrompt').hidden = !p;
        if (p) { $('flTitle').textContent = p.title; $('flSub').innerHTML = p.sub; }
        ring(game, p?.inst && (M.phase === 'check' || M.phase === 'power' || game.mission.d.hints > 1) ? p.inst : null);
      }
      // 身體指示條
      const bar = (el, v) => { const w = Math.abs(v) * 50; el.style.left = `${v < 0 ? 50 - w : 50}%`; el.style.width = `${w}%`; };
      bar($('flLean'), controls.lean); bar($('flPitch'), controls.pitch);
      $('flLeanT').textContent = Math.abs(controls.lean) < 0.05 ? '正' : controls.lean < 0 ? '左' : '右';
      $('flPitchT').textContent = !controls.handsSeen ? '看不到手' : controls.handsRest ? '放在腿上' : Math.abs(controls.pitch) < 0.05 ? '保持' : controls.pitch > 0 ? '抬頭' : '低頭';
      $('flPitchW').hidden = !!s.tiltOnly;
      $('flTouch').hidden = s.input !== 'keyboard' || game.state !== 'play';
    },

    result(game) {
      const r = game.mission.result(), d = game.mission.d;
      const tips = [];
      if (r.center < 70) tips.push('滑跑時身體早一點、小一點地修方向，飛機會比較直。');
      if (r.rotate < 70) tips.push(r.autoRot ? '下次到 55 節時試著自己雙手抬高。' : '看空速表：到 55 節再抬頭，太早抬不起來。');
      if (r.climb < 70) tips.push('爬升時看空速表保持 65～85 節：太慢就雙手放低一點。');
      if (r.stalls) tips.push('機頭抬太高會失速：姿態儀上小飛機在第一條線（10°）附近就好。');
      if (!tips.length) tips.push('完美！下一步可以試試更高的難度。');
      return {
        title: r.stars >= 3 ? '漂亮的起飛！' : '起飛成功！',
        stars: Math.max(r.stars, 1),
        html: `爬到 ${d.targetFt} 呎・分數 <b>${r.score}</b><br>
          <small>中心線 ${r.center}・抬頭時機 ${r.rotate}・爬升 ${r.climb}${r.retries ? `・重來 ${r.retries} 次` : ''}${r.stalls ? `・失速警告 ${r.stalls} 次` : ''}</small><br>${tips.join('<br>')}`,
      };
    },

    // 發動機聲（程式合成）＋失速警告聲
    ambience(ctx, game) {
      const out = ctx.createGain(); out.gain.value = 0.0; out.connect(ctx.destination);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.connect(out);
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; const o2 = ctx.createOscillator(); o2.type = 'square';
      const g2 = ctx.createGain(); g2.gain.value = 0.35; o1.connect(lp); o2.connect(g2).connect(lp);
      o1.start(); o2.start();
      const horn = ctx.createOscillator(); horn.type = 'square'; horn.frequency.value = 520;
      const hg = ctx.createGain(); hg.gain.value = 0; horn.connect(hg).connect(ctx.destination); horn.start();
      game.snd = { ctx, out, o1, o2, hg, lp };
    },
    cue(c, kind) {
      if (kind !== 'stall') return false;
      return true; // 失速聲由 updateSound 持續發出
    },
  };

  function placeFromFdm(game) {
    const f = game.mission.fdm, s = W.fs;
    f.toState(s, { fieldElev: 20 });
    s.fuelL = 21; s.fuelR = 21.5; s.mixture = 1; s.master = true;
    s.warn.door = false;
    const pos = new THREE.Vector3(f.x, f.y + f.p.gearHeight + (f.onGround ? Math.sin(f.theta) * 0.45 : 0), f.z);
    W.placeAircraft(pos, s);
    W.scenery?.updatePapi?.(pos);
  }

  function updateSound(game, s) {
    const S = game.snd; if (!S) return;
    const st = W.fs, t = S.ctx.currentTime;
    const f = st.rpm / 60 * 2; // 四缸發動機：每轉點火兩次
    S.o1.frequency.setTargetAtTime(f, t, 0.1); S.o2.frequency.setTargetAtTime(f * 0.5, t, 0.1);
    S.lp.frequency.setTargetAtTime(250 + st.throttle * 500, t, 0.2);
    S.out.gain.setTargetAtTime(s.sound ? 0.05 + st.throttle * 0.08 : 0, t, 0.2);
    S.hg.gain.setTargetAtTime(st.warn.stall && s.sound ? 0.06 : 0, t, 0.05);
  }

  // 起飛前檢查：在畫面上把要看的儀表圈起來
  function ring(game, id) {
    const el = $('flRing');
    const inst = id && W.cockpit.instruments.find((I) => I.id === id);
    if (!inst) { el.hidden = true; return; }
    const v = new THREE.Vector3(); inst.group.getWorldPosition(v);
    const p = W.project([v.x, v.y, v.z]);
    const v2 = new THREE.Vector3(0.06, 0, 0).applyMatrix4(inst.group.matrixWorld);
    const p2 = W.project([v2.x, v2.y, v2.z]);
    const r = Math.max(Math.hypot(p2.x - p.x, p2.y - p.y), 24);
    el.hidden = p.behind;
    el.style.transform = `translate(${p.x - r}px, ${p.y - r}px)`;
    el.style.width = el.style.height = `${2 * r}px`;
  }

  return mode;
}
