// 釣魚 (shore fishing, NE Taiwan) as a mode of the shared ocean-game shell (src/game/shell.js).
//
// Movements (all from the existing input layer; reeling is read from the hands' continuous positions):
//   swing an arm (or an overhead "paddle" stroke) → cast: faster = farther, direction = left / right
//   lean left / right before casting → aim
//   raise one hand when the float goes under → set the hook (揚竿)
//   draw circles with one hand → reel in (捲線)
//   lower the body (crouch; seated: bend forward) → hold the fish back (抵抗)
//   both hands up for ~1 s → pause (shell)
import { FishingSession, FISH_DIFF, TENSION } from './logic.js';
import { FishingView } from './view.js';
import { ReelDetector, attachReelSim } from './reel.js';
import { cardHTML, junkCardHTML, fridgeHTML, loadFridge, recordCatch } from './cards.js';
import { MeshBuilder, modelMatrix, lin } from '../game/props.js';
import { val } from './stats.js';

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const lerp = (a, b, t) => a + (b - a) * t;
// ?speed=N runs the fishing clock N times faster (only for testing in slow cloud browsers)
const SPEED = Math.min(Math.max(Number(new URLSearchParams(location.search).get('speed')) || 1, 1), 8);
const MONTH_NAMES = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月'];

export function createFishingMode(db) {
  const region = db.region;
  const byId = Object.fromEntries(db.catchables.map((c) => [c.id, c]));
  const reel = new ReelDetector();
  let reelSim = null, view = null, fridge = loadFridge();
  let card = null; // the open catch card { rec, shownAt }
  let lastDisabled = '';
  const nowMonth = new Date().getMonth() + 1;

  const monthOf = (s) => (s.month && s.month !== 'auto' ? Number(s.month) : nowMonth);

  function meshes(P) {
    const rock = new MeshBuilder();
    rock.sphere(0, 0, 0, 1, lin(0x3b3f43), 10, 0.45);
    rock.sphere(0.45, 0.15, 0.25, 0.6, lin(0x34383b), 8, 0.6);
    rock.sphere(-0.35, 0.1, -0.3, 0.55, lin(0x45494d), 8, 0.5);
    P.define('rock', rock);
  }

  // ── catch card ──
  function openCatchCard(game, rec, S) {
    const c = byId[rec.id];
    let html, buttons;
    if (c.kind === 'fish') {
      html = cardHTML(c, { rec, sources: db.sources, region, imgURL: db.big[rec.id] });
      buttons = rec.release.required
        ? [{ k: 'release', t: '🔁 放流（舉單手）', primary: true }]
        : [{ k: 'keep', t: '🧊 放進冰箱（舉單手）', primary: true }, { k: 'release', t: '🔁 放流' }];
    } else if (c.kind === 'junk') {
      html = junkCardHTML(c, { imgURL: db.big[rec.id], sources: db.sources });
      buttons = [{ k: 'keep', t: '♻️ 丟進回收桶（舉單手）', primary: true }];
    } else {
      html = cardHTML(c, { sources: db.sources, region, imgURL: db.big[rec.id] });
      const how = rec.outcome === 'safe'
        ? '<p class="release ok">👍 做得好！你沒有硬拉，海龜比較不會受傷。接下來要交給救援人員。</p>'
        : '<p class="release">海龜被拉到岸邊了。下次發現是海龜時，<b>先停止捲線、放鬆釣線</b>，會更安全。</p>';
      html = `<div class="turtle-alert"><h2>🐢 誤釣到保育類海龜</h2>${how}<ol>${(val(c.handling) || []).map((x) => `<li>${x}</li>`).join('')}</ol></div>` + html;
      buttons = [{ k: 'keep', t: '好，我記住了（舉單手）', primary: true }];
    }
    $('catchBody').innerHTML = html;
    $('catchBtns').innerHTML = buttons.map((b) => `<button data-k="${b.k}" class="${b.primary ? 'primary' : ''}">${b.t}</button>`).join('');
    $('catch').hidden = false;
    $('catch').querySelector('.panel').scrollTop = 0;
    card = { rec, shownAt: performance.now(), game, S };
  }
  function closeCatchCard(choice) {
    if (!card) return;
    const { game, S } = card;
    card = null;
    $('catch').hidden = true;
    const done = S.finishReveal(choice);
    if (done) {
      done.diff = game.diffKey;
      recordCatch(fridge, done);
      game.toast(done.kind === 'junk' ? `淨海 +${done.points}` : done.outcome === 'released' ? `放流 +${done.points}` : done.kind === 'bycatch' ? `海龜平安 +${done.points}` : `+${done.points}`, 'good');
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#catchBtns button');
    if (b) closeCatchCard(b.dataset.k);
  });

  // ── fridge / field guide ──
  function openFridge() {
    fridge = loadFridge();
    $('fridgeBody').innerHTML = fridgeHTML(fridge, db, db.thumbs);
    $('fridge').hidden = false;
  }
  function showSpecies(id, rec) {
    const c = byId[id];
    $('fridgeBody').innerHTML = `<button class="back" id="frBack">← 回冰箱</button>` +
      (c.kind === 'junk' ? junkCardHTML(c, { imgURL: db.big[id], sources: db.sources }) : cardHTML(c, { rec, sources: db.sources, region, imgURL: db.big[id] }));
    $('fridge').querySelector('.panel').scrollTop = 0;
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-fridge]')) { openFridge(); return; }
    if (e.target.closest('#frClose')) { $('fridge').hidden = true; return; }
    if (e.target.closest('#frBack')) { openFridge(); return; }
    if (e.target.closest('#frClear')) {
      if (confirm('確定要清空冰箱、放流紀錄和圖鑑嗎？（只會清這台裝置）')) { localStorage.removeItem('ocean-games.fishing.fridge'); openFridge(); }
      return;
    }
    const t = e.target.closest('#fridgeBody .tile');
    if (!t) return;
    if (t.dataset.dex) { if (fridge.seen.includes(t.dataset.dex)) showSpecies(t.dataset.dex); return; }
    if (t.dataset.junk) { showSpecies(t.dataset.junk); return; }
    const list = t.dataset.rel === '1' ? fridge.released : fridge.items;
    const row = list[Number(t.dataset.i)];
    if (row) showSpecies(row.id, row);
  });

  // ── HUD ──
  const hudExtra = `
    <div class="fprompt" id="fPrompt"></div>
    <div class="fpanel" id="fPanel" hidden>
      <div class="ften">
        <div class="ften-labels"><span>太鬆 → 脫鉤</span><span>剛好</span><span>太緊 → 斷線</span></div>
        <div class="ften-bar"><i class="z slack"></i><i class="z good"></i><i class="z sweet"></i><i class="z danger"></i><b id="fTenMark"></b></div>
        <div class="ften-alarm" id="fTenAlarm"></div>
      </div>
      <div class="fmeters">
        <div>↻ 捲線<div class="bar"><i id="fReel"></i></div></div>
        <div>⬇ 抵抗<div class="bar"><i id="fBrace"></i></div></div>
        <div>距離 <b id="fDist">—</b> 公尺</div>
        <div>魚的體力<div class="bar"><i id="fStam"></i></div></div>
      </div>
    </div>`;

  function prompt(game, S, s) {
    const v = S.visitor, F = S.fight;
    switch (S.phase) {
      case 'ready': return s.autoCast ? ['自動甩竿中…', ''] : ['🎣 揮動手臂甩竿！', '空手做就好，不要真的拿東西揮。揮越快拋越遠；先把身體往左／右傾可以瞄準'];
      case 'flying': return ['', ''];
      case 'waiting':
        if (!v) return ['等魚來…', '看看水面下有沒有魚影'];
        if (v.phase === 'approach') return [v.kind === 'junk' ? '有東西漂過來了…' : '有魚影靠近了…', '先別動，等牠咬餌'];
        if (v.phase === 'test') return ['魚在試探…', '浮標輕輕抖動，再等一下，太早揚竿會把魚嚇跑'];
        return ['', ''];
      case 'bite': return s.autoHook ? ['咬餌了！', '自動揚竿'] : ['咬餌了！舉手揚竿！', '舉起一隻手'];
      case 'fight': {
        if (v?.kind === 'bycatch') return ['🐢 是海龜！保育類', '停止畫圈、站直放鬆，不要把牠硬拉上岸'];
        if (F.T >= TENSION.danger) return ['太緊了！', s.autoReel ? '站直放鬆' : '停止畫圈、站直放鬆'];
        if (F.surge > 0) return ['魚在衝刺！', '先放鬆一點，讓牠跑'];
        if (F.T < TENSION.slack + 0.04 && F.t > 1.2) return ['太鬆了！', s.autoReel ? '壓低身體拉住' : '快畫圈捲線，或壓低身體'];
        return [v?.kind === 'junk' ? '好重…慢慢捲' : '拉住了！', s.autoReel ? '張力條保持在綠色' : '手畫圈捲線，張力條保持在綠色'];
      }
      case 'landing': return ['釣上來了！', ''];
      case 'retrieve': return ['收線…', ''];
      default: return ['', ''];
    }
  }

  const mode = {
    id: 'fish', title: '釣魚', icon: '🎣',
    intro: `在<b>${region.name}</b>的岩岸釣魚。<b>揮手臂</b>甩竿、看水面下的<b>魚影</b>、浮標沉下去時<b>舉手揚竿</b>、<b>手畫圈</b>捲線、<b>壓低身體</b>抵抗。釣到的魚會放進<b>冰箱</b>，可以看圖鑑卡。
      <span class="fseason">季節：<select id="fSeason"></select></span>`,
    goal: '用身體動作釣魚！看水面下的<b>魚影</b>猜猜是什麼魚。拉的時候注意<b>張力條</b>：太緊會<b>斷線</b>、太鬆會<b>脫鉤</b>。有時會釣到<b>海洋垃圾</b>，撿起來也有分數；太小的魚和保育類要<b>放流</b>。<br>🖐️ 空手做動作就好，<b>不要真的拿釣竿、棍子或任何東西揮</b>。',
    difficulties: FISH_DIFF,
    options: [
      { key: 'autoCast', label: '自動甩竿（不用揮手臂）' },
      { key: 'autoHook', label: '自動揚竿（不用舉手）' },
      { key: 'autoReel', label: '自動捲線（不用手畫圈）' },
      { key: 'autoBrace', label: '不用壓低身體（張力自動控制一部分）' },
    ],
    keysHelp: 'J／L 揮臂甩竿　←→（按住）瞄準　Q／E 舉手揚竿　R（按住）手畫圈捲線　↓（按住）壓低抵抗　Enter（按住）暫停',
    hudChips: [{ id: 'score', label: '分數' }, { id: 'fish', label: '釣到' }, { id: 'junk', label: '撿到垃圾' }],
    hudExtra,
    camera: { back: 10, height: 16, fov: 55, lookAhead: 3, lookHeight: 0.4, follow: 3 },
    waterline: 0,
    footprint: 1.5,
    meshes,

    howto(s) {
      const cards = [];
      if (!s.autoCast) cards.push({ move: 'swing', title: '揮手臂＝甩竿', text: '手臂快速往左或往右揮 → 拋出浮標。<b>揮越快拋越遠</b>；往左揮落點偏左', seated: '坐著一樣做', skip: '可以勾「自動甩竿」' });
      cards.push({ move: 'lean', title: '身體傾斜＝瞄準', text: '甩竿前身體往左／右傾 → 虛線往那邊轉，可以瞄準礁石邊或外海', seated: '坐著一樣做', skip: '不傾斜就直直往前' });
      if (!s.autoHook) cards.push({ move: 'raise-one', title: '舉單手＝揚竿', text: '浮標<b>沉下去</b>時舉起一隻手 → 鉤住魚。浮標只是輕輕抖動時先別急', seated: '坐著一樣做', skip: '可以勾「自動揚竿」' });
      if (!s.autoReel) cards.push({ move: 'reel', title: '手畫圈＝捲線', text: '一隻手在肚子前面<b>一直畫圈</b>（像轉捲線器）→ 把魚拉近。張力條太紅時先停', seated: '坐著一樣做', skip: '可以勾「自動捲線」' });
      if (!s.autoBrace) cards.push({ move: 'crouch', title: '壓低身體＝抵抗', text: '膝蓋彎、重心往下 → 把魚拉住、讓魚累。張力太鬆時用；太緊時站直', seated: '坐著：身體往前彎', skip: '可以勾「不用壓低身體」' });
      cards.push({ move: 'raise-both', title: '雙手舉高 1 秒', text: '開始、暫停、繼續', seated: '坐著一樣做' });
      return cards;
    },

    disabledActions(s) {
      return ['jump', ...(s.autoCast ? ['swing', 'paddle'] : []), ...(s.autoBrace ? ['crouch'] : [])];
    },

    newRace(game, diffKey, s) {
      const d = FISH_DIFF[diffKey];
      game.diff = d; game.diffKey = diffKey;
      const W = game.weather;
      W.setPreset(d.weather);
      W.set('sunElev', 35); W.set('sunAz', 120); W.set('lightning', 0);
      W.snap();
      game.session = new FishingSession({
        catchables: db.catchables, region, diff: d, month: monthOf(s), seed: 1 + Math.floor(Math.random() * 1e6),
        opts: { autoCast: s.autoCast, autoHook: s.autoHook, autoReel: s.autoReel, autoBrace: s.autoBrace },
      });
      const A = region.angler;
      game.vessel = game.anchor = { x: A.x, z: A.z + 13, h: Math.PI / 2 };
      game.zoom = 0;
      game.timeLeft = d.time;
      game.lastOne = false;
      if (view) view.murk = diffKey === 'hard' ? 0.62 : diffKey === 'normal' ? 0.85 : 1;
      if (card) { $('catch').hidden = true; card = null; }
      reel.reset();
    },

    onAction(game, e, s) {
      const S = game.session;
      if (card) {
        // raising one hand chooses the main button on the catch card (after a moment to look at it)
        if (e.type === 'raise' && e.side !== 'both' && performance.now() - card.shownAt > 1500) closeCatchCard(card.rec.release?.required ? 'release' : 'keep');
        return;
      }
      if (S.phase === 'ready' && !s.autoCast && (e.type === 'swing' || e.type === 'paddle') && !(reel.side || reel.value > 0.15)) { // 正在畫圈（捲線）時不算甩竿
        // a sideways swing aims toward its direction; an overhead stroke goes straight
        const off = e.type === 'swing' ? (e.dir === 'left' ? -0.22 : 0.22) : e.side === 'left' ? -0.08 : e.side === 'right' ? 0.08 : 0;
        const c = S.cast(e.strength ?? 0.7, S.aim + off);
        if (c) { game.toast(`拋出 ${Math.round(c.dist)} 公尺`, 'good'); game.cue('tick'); }
      }
      if (e.type === 'raise' && e.side !== 'both' && !s.autoHook) {
        const r = S.hook();
        if (r?.type === 'hooked') { game.toast('中了！', 'good'); game.cue('pass'); }
        else if (r?.type === 'early') game.toast(r.scared ? '太早了，魚被嚇跑了' : '太早了，再等等', 'bad');
        else if (r?.type === 'tooSoon') game.toast('還沒咬餌喔', '');
      }
    },

    update(game, dt, st, s) {
      const S = game.session, out = [];
      reelSim?.ensure();
      // the shell counts the clock down during play: hold it while a card is open, and let the last
      // fish be finished when time runs out
      if (S.phase === 'reveal') game.timeLeft += dt;
      else if (S.busy && game.timeLeft - dt < 0.3) { game.timeLeft = 0.3 + dt; if (!game.lastOne) { game.lastOne = true; out.push({ text: '最後一條！', kind: 'good' }); } }
      // fewer actions during the fight → fewer false triggers while drawing circles
      // 辨識器是各遊戲共用的，這裡只留釣魚需要的手勢：划槳／揮臂只用來「甩竿」，
      // 所以只有「準備甩竿」時開著；等魚、咬餌、拉扯、看圖鑑時一律關掉，手畫圈就不會被誤認成划槳
      const dis = [...mode.disabledActions(s), ...(S.phase === 'ready' ? [] : ['paddle', 'swing'])].join();
      if (dis !== lastDisabled) { lastDisabled = dis; game.kit.setDisabled(dis.split(',').filter(Boolean)); }
      const r = reel.value; // updated on every pose (see attach), not every frame
      const input = { reel: s.autoReel ? 0 : r, brace: s.autoBrace ? null : st.crouch || 0, lean: st.lean || 0 };
      const evs = [];
      for (let i = 0; i < SPEED; i++) evs.push(...S.step(dt, input));
      for (const e of evs) {
        if (e.type === 'splash') { view?.splash(e.x, e.z, e.big ? 18 : 6, e.big ? 1 : 0.6); }
        if (e.type === 'cast' && e.auto) out.push({ text: `拋出 ${Math.round(e.dist)} 公尺`, kind: 'good', cue: 'tick' });
        if (e.type === 'landed') out.push({ text: `落在${e.zone}`, kind: '' });
        if (e.type === 'nibble') view?.ripple(S.bobber.x, S.bobber.z, { size: 0.5, life: 0.9 });
        if (e.type === 'bite') { view?.ripple(S.bobber.x, S.bobber.z, { size: 1.6, life: 1.6, strength: 1.3 }); view?.splash(S.bobber.x, S.bobber.z, 6, 0.5); out.push({ cue: 'trick' }); }
        if (e.type === 'hooked' && e.auto) out.push({ text: '中了！', kind: 'good', cue: 'pass' });
        if (e.type === 'missed') out.push({ text: e.junk ? '漂走了' : '魚把餌吃掉跑了', kind: 'bad' });
        if (e.type === 'surge') { const v = S.visitor; if (v) view?.splash(v.x, v.z, 10, 0.8); }
        if (e.type === 'break') out.push({ text: e.turtle ? '斷線了…海龜帶著鉤子游走了' : '拉太猛，斷線了！', kind: 'bad', cue: 'bump' });
        if (e.type === 'unhook') out.push({ text: '太鬆了，脫鉤了！', kind: 'bad', cue: 'bump' });
        if (e.type === 'turtleSafe') out.push({ text: '穩住了！請大人撥打 118', kind: 'good', cue: 'pick' });
        if (e.type === 'landing') { const L = S.landing; view?.splash(L.x, L.z, 22, 1.3); out.push({ text: e.c.kind === 'bycatch' ? '海龜被拉到岸邊了…' : '', cue: 'finish' }); }
        if (e.type === 'reveal') openCatchCard(game, e.rec, S);
      }
      if (card && performance.now() - card.shownAt > 25000) closeCatchCard(card.rec.release?.required ? 'release' : 'keep');
      mode.moveCamera(game, dt);
      return out;
    },

    // wide view while casting and waiting; closer while a fish is at the bait or on the line
    moveCamera(game, dt) {
      const S = game.session, A = region.angler, b = S.bobber, v = S.visitor;
      let target = { x: A.x, z: A.z + 13 }, zoom = 0;
      if ((S.phase === 'waiting' && v && v.phase !== 'approach') || S.phase === 'bite') { target = { x: b.x, z: b.z - 1.5 }; zoom = 0.85; }
      else if (S.phase === 'waiting' && b.visible) { target = { x: lerp(A.x, b.x, 0.8), z: b.z - 2 }; zoom = 0.6; }
      else if (S.phase === 'fight' || S.phase === 'landing') { target = { x: lerp(A.x, v ? v.x : b.x, 0.7), z: lerp(A.z + 6, (v ? v.z : b.z) - 2, 0.8) }; zoom = 0.5; }
      const k = 1 - Math.exp(-dt * 1.4);
      game.anchor.x = lerp(game.anchor.x, target.x, k); game.anchor.z = lerp(game.anchor.z, target.z, k);
      game.zoom = lerp(game.zoom ?? 0, zoom, k);
      const z = game.zoom, cam = mode.camera;
      cam.back = lerp(10, 4, z); cam.height = lerp(16, 7.5, z); cam.lookAhead = lerp(3, 2, z);
    },

    idle(game, dt) {
      const S = game.session;
      if (S.phase === 'ready') S.step(dt, {});
      mode.moveCamera(game, dt);
    },
    done: () => false,
    probePoints(game) { const b = game.session.bobber; return [{ key: 'bob', xz: [b.x, b.z] }]; },

    draw(game, P) {
      for (const r of region.rocks) P.add('rock', modelMatrix([r.x, r.y ?? -0.2, r.z], r.yaw || 0, 0, 0, r.s || 1));
      if (!view) return;
      const S = game.session, sea = game.seaFor('bob')?.height ?? 0;
      view.draw(game, S, game.dtLast || 1 / 60, { sea, showAim: game.state === 'play' && S.phase === 'ready' && !game.settings.autoCast });
    },

    hud(game) {
      const S = game.session;
      return { score: S.score, fish: S.tally.kept + S.tally.released, junk: S.tally.junk };
    },
    hudExtraUpdate(game, st, s) {
      const S = game.session, F = S.fight;
      const [big, small] = game.state === 'play' ? prompt(game, S, s) : ['', ''];
      const el = $('fPrompt');
      const html = big ? `<b>${big}</b>${small ? `<small>${small}</small>` : ''}` : '';
      if (el.innerHTML !== html) el.innerHTML = html;
      el.className = 'fprompt' + (S.phase === 'bite' ? ' alert' : F && (F.T >= TENSION.danger || F.T < TENSION.slack + 0.04) ? ' warn' : '');
      const showFight = S.phase === 'fight' && !!F;
      $('fPanel').hidden = !showFight;
      if (!showFight) return;
      $('fTenMark').style.left = clamp(F.T / 1.1, 0, 1) * 100 + '%';
      $('fTenAlarm').style.width = clamp(F.overT / game.diff.breakHold, 0, 1) * 100 + '%';
      $('fTenAlarm').className = 'ften-alarm' + (F.overT > 0 ? ' on' : F.underT > 0 ? ' slack' : '');
      if (F.underT > 0 && F.overT === 0) $('fTenAlarm').style.width = clamp(F.underT / game.diff.slackHold, 0, 1) * 100 + '%';
      $('fReel').style.width = F.reel * 100 + '%';
      $('fBrace').style.width = F.brace * 100 + '%';
      $('fDist').textContent = F.D.toFixed(1);
      $('fStam').style.width = (S.visitor?.kind === 'fish' ? F.s : 0) * 100 + '%';
    },

    result(game) {
      const S = game.session;
      if (card) closeCatchCard(card.rec.release?.required ? 'release' : 'keep');
      const t = S.tally;
      const list = S.catches.filter((c) => c.outcome).map((c) => {
        const sp = byId[c.id];
        const tag = c.kind === 'fish' ? `${c.lengthCm.toFixed(1)} 公分${c.outcome === 'released' ? '・放流' : ''}` : c.kind === 'junk' ? '垃圾' : '海龜';
        return `<span class="rchip"><img src="${db.thumbs[c.id]}" alt="">${val(sp.names.zh)}<small>${tag}</small></span>`;
      }).join('');
      return {
        title: '釣魚結束！',
        stars: S.stars(),
        html: `分數 <b>${S.score}</b>・釣到魚 <b>${t.kept + t.released}</b> 條（放流 ${t.released}）・撿到垃圾 <b>${t.junk}</b> 個${t.turtle ? `・海龜 ${t.turtle}` : ''}<br>` +
          `<small>甩竿 ${t.casts} 次・斷線 ${t.broke}・脫鉤 ${t.unhooked}・錯過 ${t.missed}${t.early ? `・太早揚竿 ${t.early}` : ''}</small>` +
          (list ? `<div class="rlist">${list}</div>` : '') +
          '<p><button data-open-fridge class="fbtn">🧊 打開冰箱看圖鑑卡</button></p>',
      };
    },

    // called once by main.js after the shell has built the page
    attach(game) {
      view = new FishingView($('c'), { dprMax: new URLSearchParams(location.search).get('q') === 'low' ? 1 : 1.5 });
      for (const c of db.catchables) view.setArt(c.id, db.art[c.id].image, db.shadows[c.id]);
      view.murk = game.diffKey === 'hard' ? 0.62 : game.diffKey === 'normal' ? 0.85 : 1;
      reelSim = attachReelSim(game.kit);
      // the reel detector follows the skeleton stream (~30 poses/s), so a slow screen does not slow it
      game.kit.on('pose', (pose) => { if (pose) reel.update(pose.t ?? performance.now(), game.kit.state.hands); });
      // the season picker inside the menu intro
      const sel = $('fSeason');
      sel.innerHTML = `<option value="auto">依今天日期（${nowMonth} 月）</option>` + MONTH_NAMES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
      sel.value = game.settings.month || 'auto';
      sel.onchange = () => { game.settings.month = sel.value; mode.newRace(game, game.settings.diff, game.settings); try { localStorage.setItem('ocean-games.fish.settings', JSON.stringify(game.settings)); } catch {} };
      // remember the frame time for the overlay
      let last = performance.now();
      const tick = (now) => { game.dtLast = Math.min((now - last) / 1000, 0.1); last = now; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    },
  };
  return mode;
}
