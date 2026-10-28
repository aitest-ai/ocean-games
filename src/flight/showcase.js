// 駕駛艙展示頁（flight/cockpit.html）：不用鏡頭，看駕駛艙與儀表的精緻度。
// 儀表由「假資料」驅動：飛機在 1500 呎附近慢慢轉彎、爬升、下降；窗外的地平線跟姿態儀一致。
// 網址參數：?q=low|mid|rt 畫質、?t=day|dusk|night 時段、?view=panel 視角、?shot=1 隱藏介面（截圖用）、?seed= 假資料起點
import * as THREE from '../land/three.js';
import { FlightWorld } from './world.js';
import { TRAINER } from './aircraft/trainer.js';
import { KT, FPM, DEG } from './state.js';

const params = new URLSearchParams(location.search);
const TIERS = ['low', 'mid', 'rt'];
let tier = params.get('q');
if (!TIERS.includes(tier)) tier = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1 ? 'low' : 'mid';
const time = ['day', 'dusk', 'night'].includes(params.get('t')) ? params.get('t') : 'day';
if (params.has('shot')) document.body.classList.add('shot');
const $ = (id) => document.getElementById(id);
const D = Math.PI / 180;

await new Promise((r) => requestAnimationFrame(r));
const t0 = performance.now();
const W = new FlightWorld($('c'), { tier, time, spec: TRAINER });
const buildMs = Math.round(performance.now() - t0);
window.world = W;
W.scale = params.has('scale') ? Number(params.get('scale')) : tier === 'low' ? Math.min(devicePixelRatio || 1, 0.75) : tier === 'mid' ? Math.min(devicePixelRatio || 1, 1) : Math.min(devicePixelRatio || 1, 1.5);
W.resize();
addEventListener('resize', () => W.resize());
$('loading').hidden = true;

// ── 視角 ──
const VIEWS = {
  pilot: { yaw: 0, pitch: -13 * D, fov: 62 },
  panel: { yaw: -8 * D, pitch: -27 * D, fov: 38 },
  left: { yaw: 85 * D, pitch: -8 * D, fov: 66 },
  right: { yaw: -75 * D, pitch: -12 * D, fov: 66 },
  up: { yaw: -20 * D, pitch: 32 * D, fov: 66 },
  down: { yaw: -20 * D, pitch: -55 * D, fov: 70 },
};
function seg(id, val, pick) {
  const el = $(id);
  const sync = (v) => { for (const b of el.querySelectorAll('button[data-v]')) b.setAttribute('aria-pressed', b.dataset.v === v); };
  sync(val);
  el.addEventListener('click', (e) => { const v = e.target.closest('button[data-v]')?.dataset.v; if (v) { sync(v); pick(v); } });
}
const view0 = VIEWS[params.get('view')] ? params.get('view') : 'pilot';
W.look.set(VIEWS[view0]); W.look.yaw = W.look.target.yaw; W.look.pitch = W.look.target.pitch; W.look.fov = W.look.target.fov;
seg('gView', view0, (v) => W.look.set(VIEWS[v]));
seg('gTime', time, (v) => W.setTime(v));
seg('gQ', tier, (v) => { if (v !== tier) { params.set('q', v); location.search = params.toString(); } });
$('bTest').onclick = () => W.cockpit.annunciator.test(2);
const toggle = (id, on, fn) => { const b = $(id); b.setAttribute('aria-pressed', on); b.onclick = () => { on = !on; b.setAttribute('aria-pressed', on); fn(on); }; fn(on); };
toggle('bDome', false, (on) => W.applyCockpitLights({ dome: on ? 0.8 : 0 }));
let fake = true;
toggle('bFake', true, (on) => { fake = on; });
$('infoToggle').onclick = () => { $('info').classList.toggle('min'); $('infoToggle').textContent = $('info').classList.contains('min') ? '展開' : '收起'; };

// 體感轉頭（鍵盤模擬或鏡頭）：身體往左右傾 → 轉頭看左右
let kit = null;
toggle('bBody', false, async (on) => {
  if (!on) { kit?.stop(); kit = null; return; }
  const { createTaikan } = await import('../../packages/taikan-kit/src/index.js');
  kit = createTaikan({ disabled: ['jump', 'paddle', 'swing', 'bat'] });
  try { await kit.useCamera({ video: $('video') }); } catch { await kit.useKeyboard(); }
});

// ── 假資料：慢慢轉彎、爬升、下降，發動機正常運轉 ──
const S = W.fs;
const pos = new THREE.Vector3(1500, 460, 2000);
let ft = Number(params.get('seed')) || 0, alt = 1500, hdg = 300, fuelL = 21.5, fuelR = 22.3, prevRoll = 0;
Object.assign(S, { onGround: false, master: true, throttle: 0.72, mixture: 0.85, flaps: 0, rpm: 2350, oilT: 185, oilP: 68, vac: 5.0, amps: 3, fuelL, fuelR });
function fakeStep(dt) {
  ft += dt;
  const roll = 24 * Math.sin(ft * 0.16) + 7 * Math.sin(ft * 0.47 + 1.3);
  const pitch = 2.5 + 4 * Math.sin(ft * 0.12 + 0.7) + 1.2 * Math.sin(ft * 0.41);
  const ias = 96 + 14 * Math.sin(ft * 0.09 + 2) - (pitch - 2.5) * 1.5;
  const gamma = (pitch - 2.5) * 0.8;                                 // 飛行路徑角（度）
  const vsMs = (ias / KT) * Math.sin(gamma * D);
  alt += vsMs * 3.28084 * dt;
  const turnRate = (1091 * Math.tan(roll * D)) / Math.max(ias, 40);  // 協調轉彎：ω = g·tanφ / V
  hdg = (hdg + turnRate * dt + 360) % 360;
  const rollRate = (roll - prevRoll) / Math.max(dt, 1e-3); prevRoll = roll;
  fuelL -= dt * 0.0012; fuelR -= dt * 0.0011;
  Object.assign(S, {
    ias, alt, pitch, roll, heading: hdg, vs: vsMs * FPM, turnRate, slip: -rollRate * 0.012,
    rpm: 2350 + 120 * Math.sin(ft * 0.09 + 2.3), oilT: 185 + 3 * Math.sin(ft * 0.02), oilP: 68 + 2 * Math.sin(ft * 0.3), vac: 5.0 + 0.08 * Math.sin(ft * 0.7), amps: 3 + Math.sin(ft * 0.21),
    fuelL, fuelR, aileron: Math.max(-1, Math.min(1, rollRate / 25)), elevator: Math.max(-1, Math.min(1, (pitch - 2.5) / 8)),
    warn: { ...S.warn, stall: ias < 52, lowFuelL: fuelL < 4, lowFuelR: fuelR < 4 },
  });
  const v = ias / KT;
  pos.x += Math.sin(hdg * D) * Math.cos(gamma * D) * v * dt;
  pos.z -= Math.cos(hdg * D) * Math.cos(gamma * D) * v * dt;
  pos.y = alt / 3.28084;
}
fakeStep(0);
W.placeAircraft(pos, S);

// ── 迴圈 ──
let last = performance.now(), avg = 1 / 60, frames = 0;
const stat = $('stat'), perf = $('perf'), readout = $('readout');
W.onFrame = (dt) => {
  if (fake) fakeStep(dt);
  W.placeAircraft(pos, S);
  if (kit) W.look.head(kit.state.lean);
};
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  W.frame(dt);
  avg += (dt - avg) * 0.05;
  if (++frames % 15 === 0) {
    const i = W.info();
    perf.textContent = `畫質 ${{ low: '低', mid: '中', rt: '高' }[tier]}・${Math.round(1 / avg)} 格/秒・解析度 ${Math.round(W.scale * 100)}%・draw call ${i.calls}・三角形 ${(i.tris / 1000).toFixed(0)}k`;
    readout.textContent = `空速 ${S.ias.toFixed(0)} kt  高度 ${S.alt.toFixed(0)} ft\n爬升率 ${S.vs.toFixed(0)} fpm  航向 ${S.heading.toFixed(0)}°\n俯仰 ${S.pitch.toFixed(1)}°  滾轉 ${S.roll.toFixed(1)}°`;
    stat.textContent = `駕駛艙產生耗時 ${buildMs} ms；合併後的不動零件 ${W.cockpit.stats.merged} 個網格；錶面圖集 ${W.cockpit.stats.atlas}。`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__buildMs = buildMs;
window.__ready = true;
// 截圖工具用：window.view('panel')、window.world.setTime('night')
window.view = (v) => { W.look.set(VIEWS[v]); W.look.yaw = W.look.target.yaw; W.look.pitch = W.look.target.pitch; W.look.fov = W.look.target.fov; };
