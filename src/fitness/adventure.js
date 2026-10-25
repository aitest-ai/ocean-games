// 冒險模式（階段二）：關卡 → 校正 → 暖身 → 主訓練（技能攻擊怪獸）→ 收操封印 → 結果與本機進度。
// 訓練結構在 session.js、對戰規則在 battle.js、進度在 progress.js（都是純邏輯、有測試）；這裡只負責畫面。
import { ExerciseAnalyzer, Calibrator, EXERCISES, CONF_TEXT } from '../../packages/taikan-kit/src/exercise/index.js';
import { LEVELS, MONSTERS, SKILLS, DIFFS, levelExercises, repsFor } from './levels.js';
import { Session } from './session.js';
import { Battle } from './battle.js';
import { Progress } from './progress.js';
import { load, save, loadProfile, saveTarget } from './store.js';

// 暖身／收操時，鍵盤模擬的合成人體跟著示範做（模擬一個配合的玩家）
const SIM_ROUTINE = { march: ['march'], armCircle: ['armCircle'], halfSquat: ['squat', { depth: 45 }], sideReach: ['sideReach'], quadL: ['quad', { side: 'left' }, 20000], quadR: ['quad', { side: 'right' }, 20000], hamstring: ['hamstring', {}, 25000], shoulder: ['shoulder'], breathe: ['breathe'] };
const STOP_HTML = `<p class="sub">做得對：<b>不舒服就停</b>是最重要的安全規則。這次做到的部分都有記下來，不會扣任何東西。</p>
  <ul><li>先坐下休息、慢慢深呼吸、喝點水。</li>
  <li>如果有<b>胸痛、胸悶、呼吸困難、頭暈想吐</b>，或疼痛沒有很快消退，請立刻尋求醫療協助。</li>
  <li>關節或肌肉疼痛：先不要再練會痛的動作，之後仍會痛請諮詢醫師或物理治療師。</li></ul>`;

// ?speed=N：暖身、休息、收操的時間快 N 倍（只給雲端測試、截圖用）
const SPEED = Math.min(Math.max(Number(new URLSearchParams(location.search).get('speed')) || 1, 1), 20);

export function createAdventure(app) {
  const { $ } = app;
  const progress = new Progress({ load, save });
  window.fitnessProgress = progress;
  let levelIdx = Math.min(load('advLevel', 0), progress.d.unlocked - 1);
  let diff = load('advDiff', 'normal');
  let level = null, session = null, battle = null, stage = null, base = null, analyzer = null;
  let calQueue = [], stepCount = 0;
  const pres = { hist: [], present: false, moving: false };

  // ── 選單 ──
  function buildMenu() {
    $('aWelcome').textContent = progress.welcome();
    const un = progress.d.unlocked;
    const best = {};
    for (const s of progress.d.sessions) if (s.completed) best[s.levelId] = Math.max(best[s.levelId] || 0, s.stars || 0);
    $('aLevels').innerHTML = LEVELS.map((lv, i) => {
      const M = MONSTERS[lv.monster];
      const locked = i >= un;
      const sets = lv.sets.map(([ex, n]) => `${SKILLS[ex].icon}${EXERCISES[ex].name}×${repsFor(n, diff)}${EXERCISES[ex].perSide ? '/邊' : ''}`).join('　');
      return `<button class="lv" data-i="${i}" ${locked ? 'disabled' : ''} aria-pressed="${i === levelIdx}">
        <span class="ic">${locked ? '🔒' : lv.boss ? '👑' : '👾'}</span>
        <span><b>${i + 1}. ${lv.name}</b>　<small style="display:inline">${M.name}</small><small>${locked ? '完成前一關就會解鎖' : sets}</small></span>
        <span class="st">${best[lv.id] ? '★'.repeat(best[lv.id]) + '☆'.repeat(3 - best[lv.id]) : ''}</span></button>`;
    }).join('');
    $('aLevels').onclick = (e) => {
      const b = e.target.closest('.lv');
      if (!b || b.disabled) return;
      levelIdx = Number(b.dataset.i); save('advLevel', levelIdx);
      for (const x of $('aLevels').querySelectorAll('.lv')) x.setAttribute('aria-pressed', x === b);
    };
    $('aDiff').innerHTML = Object.entries(DIFFS).map(([k, d]) => `<button data-v="${k}" aria-pressed="${k === diff}">${d.label}</button>`).join('');
    $('aDiff').onclick = (e) => { const v = e.target.closest('button')?.dataset.v; if (v) { diff = v; save('advDiff', v); buildMenu(); } };
    $('aDiffNote').textContent = DIFFS[diff].note + '。做不完的組可以按「結束這組」，不勉強。';
    $('aQuests').innerHTML = progress.quests().map((q) => `<li class="${q.done ? 'done' : ''}"><span>${q.done ? '✅' : '◻️'} ${q.text}</span><span>${q.progress}/${q.goal}</span></li>`).join('');
    const now = new Date(), dow = (now.getDay() + 6) % 7, days = new Set(progress.days());
    $('aWeek').innerHTML = ['一', '二', '三', '四', '五', '六', '日'].map((w, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return `<span class="${days.has(k) ? 'on' : ''} ${i === dow ? 'today' : ''}">${w}</span>`;
    }).join('');
    const st = progress.streak();
    $('aWeekNote').textContent = `本週 ${progress.weekDays()} / ${progress.d.weeklyGoal} 天${st >= 2 ? `・已連續 ${st} 天` : ''}・休息日也是訓練的一部分。累積徽章 ${progress.d.badges} 個。`;
    const b = progress.d.bests;
    const lines = Object.keys(EXERCISES).filter((ex) => b[ex]?.good || b[ex]?.combo).map((ex) => `${EXERCISES[ex].name}：標準 ${b[ex].good} 下・最高 ${b[ex].combo} 連擊`);
    if (b.quality) lines.push(`平均品質最高 ${Math.round(b.quality * 100)} 分`);
    $('aBests').innerHTML = lines.length ? lines.join('<br>') : '還沒有紀錄。';
  }

  // ── 開始一關 ──
  async function start() {
    level = LEVELS[levelIdx];
    const can = progress.canTrain();
    if (!can.ok) { $('mStatus').textContent = can.text; return; }
    if (can.warn && !confirm(can.text + '\n\n要繼續嗎？')) return;
    const exs = levelExercises(level);
    if (!(await app.ensureInput(exs[0]))) return;
    const prof = loadProfile();
    const need = exs.filter((ex) => EXERCISES[ex].calib && (prof.targets[EXERCISES[ex].calib.key] == null || $('mRecal').checked));
    calQueue = need.length ? need : [null];
    base = null;
    nextCalibration();
  }

  function nextCalibration() {
    const ex = calQueue.shift();
    const d = ex ? EXERCISES[ex] : null;
    const c = new Calibrator({ exercise: ex || levelExercises(level)[0], rom: !!ex, base, emit: onCalib });
    app.setCalibrator(c);
    app.setupScreen({
      title: base ? `量你的舒服幅度：${d.name}` : `${level.name}：擺好手機`,
      place: base ? d.calib.prompt + (d.bestView === 'side' ? '（建議轉成側身做）' : '') : '手機立在地上或桌上，放在你的<b>正前方</b>約 2.5～3 公尺，<b>從頭到腳都要入鏡</b>。深蹲時你只要<b>轉成側身</b>，手機不用移動。',
      step: base ? `${d.name}第一次玩，先量 ${d.calib.reps} 下${d.perSide ? '（每邊）' : ''}` : (ex ? `面向鏡頭站直不動 2 秒，接著量${d.name}的舒服幅度` : '面向鏡頭站直不動 2 秒，就開始暖身'),
      demo: ex || 'jack', skipRom: !!ex,
    });
    if (base && app.sim) app.sim.setView(d.bestView === 'side' ? 90 : 0);
  }

  function onCalib(e) {
    if (e.type === 'calib') $('sMsg').textContent = e.msg;
    if (e.type === 'baseline') { base = e.baseline; app.sfx.play('calib'); if (app.sim && app.calibrator?.phase === 'rom') { const d = app.calibrator.def; setTimeout(() => app.sim?.setView(d.bestView === 'side' ? 90 : 0), 1200); } }
    if (e.type === 'calibrated') {
      if (e.targetKey && e.used === 'measured') saveTarget(e.targetKey, e.target);
      base = e.baseline || base;
      app.logLine(`冒險校正：${e.targetKey || '站姿'}`);
      setTimeout(() => (calQueue.length ? nextCalibration() : beginSession()), 800);
    }
  }

  async function beginSession() {
    app.setCalibrator(null);
    if (!stage) {
      try { const { CoachStage } = await import('./coach3d.js'); stage = new CoachStage($('coachCv')); }
      catch (err) { console.warn('3D 示範無法啟動', err); $('coachCv').hidden = true; }
    }
    if (stage) { stage.setMonster(level.monster); stage.calm = !!app.settings.calm; }
    session = new Session(level, { diff, emit: onSession });
    battle = new Battle(session.plannedReps());
    $('aMon').textContent = `👾 ${MONSTERS[level.monster].name}`;
    document.body.classList.add('adv-on');
    app.show(null);
    $('adv').hidden = false;
    app.setPhase('adv');
    app.bubble(`「${MONSTERS[level.monster].line}」`, 'praise', `${MONSTERS[level.monster].name}出現了！先暖身集氣`);
    onSession({ type: 'stepStart', step: session.step, index: session.i });
    updateHp();
  }

  function renderSteps() {
    const s = session;
    const groups = [{ k: 'warmup', t: '暖身' }, ...s.steps.filter((x) => x.type === 'set').map((x, i) => ({ k: 'set' + i, t: `${SKILLS[x.exercise].icon}${i + 1}` })), { k: 'cooldown', t: '收操' }];
    const cur = s.step;
    const curKey = !cur ? 'end' : cur.type === 'warmup' ? 'warmup' : cur.type === 'cooldown' ? 'cooldown' : 'set' + (s.steps.slice(0, s.i + 1).filter((x) => x.type === 'set').length - 1);
    const order = groups.map((g) => g.k);
    const ci = order.indexOf(curKey);
    $('aSteps').innerHTML = groups.map((g, i) => `<span class="${i < ci || curKey === 'end' ? 'done' : i === ci ? 'cur' : ''}">${g.t}</span>`).join('');
  }

  function onSession(e) {
    if (!session) return; // Session 建構時送出的第一個 stepStart：等 session 建好後再手動處理
    if (e.type === 'stepStart') {
      const st = e.step;
      renderSteps();
      analyzer = null; app.setAnalyzer(null);
      $('aCombo').textContent = '';
      if (st.type === 'set') {
        const d = EXERCISES[st.exercise];
        analyzer = new ExerciseAnalyzer({ exercise: st.exercise, profile: loadProfile(), base, emit: onAnalyzer });
        app.setAnalyzer(analyzer);
        battle.newSet();
        $('aRoutine').hidden = true;
        $('hud').hidden = false;
        $('hEx').textContent = `${st.skill.icon} ${st.skill.name}・${d.name}`;
        $('aCharge').hidden = st.exercise !== 'squat';
        setCounter();
        stage?.setDemo(st.exercise);
        app.bubble(`${st.skill.icon} ${st.skill.name}：${st.skill.verb}`, 'praise', `第 ${st.set} / ${st.sets} 組・${d.name} ${st.reps} 下${st.perSide ? '（每邊）' : ''}・${d.bestView === 'side' ? '請轉成側身' : '請面向鏡頭'}`);
        if (app.sim) { app.sim.setExercise(st.exercise); app.sim.setView(d.bestView === 'side' ? 90 : 0); app.syncSim?.(); }
      } else {
        $('hud').hidden = true;
        $('aCharge').hidden = true;
        $('aRoutine').hidden = false;
        const isRest = st.type === 'rest';
        const list = session.steps.filter((x) => x.type === st.type);
        $('aRtKind').textContent = isRest ? '組間休息' : `${st.type === 'warmup' ? '暖身' : '收操'} ${list.indexOf(st) + 1} / ${list.length}（不能跳過）`;
        $('aRtTitle').textContent = isRest ? '休息一下、喝口水 💧' : st.name;
        $('aRtTip').textContent = isRest ? nextSetText() : st.tip;
        $('aRestBtns').hidden = !isRest;
        stage?.setDemo(isRest ? 'breathe' : st.coach);
        if (app.sim) app.sim.setView(0);
        if (isRest) app.sfx.play('rest');
        if (st.type === 'cooldown' && list.indexOf(st) === 0) app.bubble(battle.defeated ? '怪獸倒下了！做完收操把牠封印起來' : '主訓練結束！收操伸展把怪獸封印起來', 'praise');
      }
      if (app.sim) $('simKeys').hidden = st.type !== 'set';
      stepCount++;
    } else if (e.type === 'setComplete') {
      app.sfx.play('combo');
      floater('這組完成！', false, 50);
    } else if (e.type === 'timeCap') {
      app.bubble('今天練得夠久了，直接進入收操', 'praise', '一次訓練最多 25 分鐘');
    } else if (e.type === 'complete' || e.type === 'stopped') finish(e.type === 'complete');
  }

  function nextSetText() {
    const nx = session.steps.slice(session.i + 1).find((x) => x.type === 'set');
    return nx ? `下一組：${nx.skill.icon} ${nx.skill.name}（${EXERCISES[nx.exercise].name} ${nx.reps} 下${nx.perSide ? '／每邊' : ''}）。準備好就按「我準備好了」，或等倒數結束。` : '';
  }

  function setCounter() {
    const st = session?.step;
    if (!st || st.type !== 'set') return;
    const r = session.setReps;
    $('hCount').textContent = r.total;
    $('hTarget').textContent = `/ ${st.reps * (st.perSide ? 2 : 1)}`;
    $('hSides').textContent = st.perSide ? `左 ${r.left}・右 ${r.right}（每邊 ${st.reps} 下）` : `第 ${st.set} / ${st.sets} 組`;
  }

  function onAnalyzer(e) {
    if (app.phase !== 'adv') return;
    if (e.type === 'rep') {
      const ex = session.step?.exercise;
      const r = battle.hit(e);
      session.combo(e.exercise, r.combo);
      app.onRepVisual(e);
      app.sfx.play(e.exercise === 'squat' ? 'strike' : e.good ? 'good' : 'rep');
      if (r.combo >= 3) app.sfx.play('combo');
      stage?.attack(SKILLS[e.exercise].color, e.exercise === 'squat');
      floater(`${r.text} -${r.damage}`, r.crit);
      $('aCombo').textContent = r.combo >= 2 ? `${r.combo} 連擊 ×${(1 + Math.min(r.combo * 0.02, 0.3)).toFixed(2)}` : '';
      updateHp();
      const before = session.i;
      session.rep(e);
      if (session.i === before && ex) setCounter();
      if (battle.defeated && !battle.saidLow) { battle.saidLow = true; app.bubble('怪獸撐不住了！把這次訓練做完', 'praise'); }
    } else if (e.type === 'partial') { app.sfx.play('partial'); app.onRepVisual(e); }
    else if (e.type === 'hint') {
      app.sfx.play(e.kind === 'praise' ? 'combo' : 'hint');
      app.bubble(e.text, e.kind, e.kind === 'tip' ? `這項判斷的可信度：${CONF_TEXT[e.level]}` : '');
    }
  }

  function updateHp() {
    if (!battle) return;
    $('aHp').style.width = `${(battle.hp / battle.maxHp) * 100}%`;
    $('aHpTxt').textContent = `體力 ${battle.hp} / ${battle.maxHp}・分數 ${battle.score}`;
  }

  function floater(text, crit, x = 72) {
    if (app.settings.calm) return;
    const b = document.createElement('b');
    b.textContent = text; if (crit) b.className = 'crit';
    b.style.left = `${x + (Math.random() - 0.5) * 8}%`; b.style.top = `${28 + Math.random() * 6}%`;
    $('aFloat').appendChild(b);
    setTimeout(() => b.remove(), 1200);
  }

  // 看得到人嗎？在動嗎？（暖身與收操用；只看骨架，不分析影像）
  function presence(pose, t) {
    const kp = pose?.kp;
    const ok = kp && ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'].filter((n) => kp[n]?.v >= 0.5).length >= 3;
    pres.present = !!ok;
    if (!ok) { pres.hist = []; pres.moving = false; return; }
    const pts = ['leftWrist', 'rightWrist', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'].map((n) => kp[n]).filter((p) => p && p.v >= 0.4);
    const S = kp.leftShoulder, H = kp.leftHip;
    const T = S && H ? Math.hypot(S.x - H.x, S.y - H.y) : 0.15;
    pres.hist.push({ t, pts: pts.map((p) => [p.x, p.y]) });
    while (pres.hist.length > 2 && t - pres.hist[0].t > 800) pres.hist.shift();
    let m = 0;
    const a = pres.hist[0], b = pres.hist[pres.hist.length - 1];
    if (a && b && a.pts.length === b.pts.length) a.pts.forEach((p, i) => { m = Math.max(m, Math.hypot(p[0] - b.pts[i][0], p[1] - b.pts[i][1]) / Math.max(T, 0.02)); });
    pres.moving = m > 0.12;
  }

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.ceil(s)) % 60).padStart(2, '0')}`;
  function update(dt) {
    if (!session || session.done) { stage?.update(dt); stage?.render(); return; }
    const pose = app.lastPose;
    presence(pose, pose?.t ?? performance.now());
    const camera = app.kit.source === 'camera';
    session.tick(dt * (session.step?.type === 'set' ? 1 : SPEED), { present: camera ? pres.present : !!pose });
    const st = session.step;
    if (!st) return;
    if (st.type !== 'set') {
      $('aRtTime').textContent = fmt(st.sec - session.elapsed);
      const el = $('aRtState');
      if (st.type === 'rest') { el.textContent = session.canSkipRest() ? '' : `休息至少 15 秒（還有 ${Math.ceil(15 - session.elapsed)} 秒）`; el.className = 'presence'; }
      else if (!pres.present && camera) { el.textContent = '看不到你：回到畫面裡才會倒數'; el.className = 'presence'; }
      else if (st.detect === 'move') { el.textContent = pres.moving ? '✓ 有在動，很好' : '跟著示範動起來喔'; el.className = 'presence' + (pres.moving ? ' ok' : ''); }
      else { el.textContent = '✓ 看到你了，跟著示範做'; el.className = 'presence ok'; }
      $('aRestSkip').disabled = !session.canSkipRest();
      // 鍵盤模擬：合成人體跟著示範做
      if (app.sim && st.type !== 'rest' && !app.sim.person.busy()) { const [m, o, ms] = SIM_ROUTINE[st.coach] || ['march']; app.sim.person.play(m, o || {}, ms); }
    } else {
      const m = st.exercise === 'squat' && app.frame?.m != null ? Math.min(Math.max(app.frame.m, 0), 1.2) / 1.2 : 0;
      $('aChargeBar').style.width = `${m * 100}%`;
      stage?.setCharge(st.exercise === 'squat' ? m : 0);
    }
    stage?.update(dt); stage?.render();
  }

  function finish(completed) {
    const sum = session.summary();
    app.setAnalyzer(null);
    if (completed) stage?.defeat();
    const stars = completed ? battle.stars() : 0;
    const out = progress.record(sum, { stars, score: battle.score });
    $('hud').hidden = true; $('aRoutine').hidden = true;
    app.sfx.play(completed ? 'win' : 'rest');
    setTimeout(() => {
      $('adv').hidden = true;
      document.body.classList.remove('adv-on');
      app.setPhase('advResult');
      const M = MONSTERS[level.monster];
      $('arTitle').textContent = completed ? `${M.name}被封印了！` : '先休息一下';
      $('arStars').textContent = completed ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '';
      const reps = Object.entries(sum.reps).map(([ex, n]) => `${EXERCISES[ex].name} ${n} 下（標準 ${sum.good[ex] || 0}）`).join('、') || '—';
      const items = [`時間 ${fmt(sum.durationSec)}・${reps}`];
      if (sum.avgQuality != null) items.push(`平均品質 ${Math.round(sum.avgQuality * 100)} 分（只算鏡頭看得清楚的項目）`);
      for (const b of out.newBests) items.push(`🏅 新紀錄：${b}`);
      for (const q of out.questsDone) items.push(`✅ 完成任務：${q}`);
      if (out.unlocked) items.push(`🔓 解鎖新關卡：${out.unlocked.name}${out.unlocked.intro ? `（${out.unlocked.intro}）` : ''}`);
      if (sum.capped) items.push('今天練得比較久，剩下的組直接跳到收操了。');
      $('arBody').innerHTML = (completed ? '' : STOP_HTML) + `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>` +
        (completed ? `<p class="note">${progress.canTrain().warn ? progress.canTrain().text : '記得補充水分。肌肉是在休息時變強的，同一個部位建議隔一天再練。'}</p>` : '');
      const next = LEVELS[levelIdx + 1];
      $('arNext').hidden = !(completed && next && levelIdx + 1 < progress.d.unlocked);
      $('arNext').textContent = next ? `下一關：${next.name}` : '';
      app.show('advResult');
      session = null;
    }, completed ? 1400 : 200);
  }

  $('arNext').onclick = () => { levelIdx++; save('advLevel', levelIdx); app.show('menu'); app.setPhase('menu'); buildMenu(); };
  $('arMenu').onclick = () => { app.show('menu'); app.setPhase('menu'); buildMenu(); };
  $('aRestSkip').onclick = () => session?.skipRest();
  $('aRestMore').onclick = () => session?.extendRest(15);
  $('aStop').onclick = () => stop();
  function stop() { if (session && !session.done) session.stop(); }
  function quit() { if (session && !session.done) { session.stop(); } }

  return { buildMenu, start, update, stop, quit, endSet: () => session?.endSet(), get active() { return !!session; }, get session() { return session; }, get battle() { return battle; }, progress };
}
