// 鍵盤／畫面按鈕模擬：沒有鏡頭也能完整操作整個流程。
//
// 跟其他遊戲的鍵盤模擬一樣，按鍵不是直接送出「算一下」，而是讓「合成人體」做動作，再投影成假的
// 鏡頭骨架交給 kit → 動作分析器，走的是和真鏡頭一模一樣的辨識流程（包括視角、校正、可信度）。
// 用 kit.use(new FitnessSim()) 掛上去（taikan-kit 的來源只要有 name / start / stop）。
import { SynthPerson } from '../../packages/taikan-kit/src/exercise/synth.js';

export const SIM_KEYS = [
  { code: 'Space', label: '空白鍵', act: 'good', short: '標準', text: '做一下標準動作' },
  { code: 'KeyB', label: 'B', act: 'bad1', short: '錯誤 1', text: '做一下「常見錯誤 1」' },
  { code: 'KeyN', label: 'N', act: 'bad2', short: '錯誤 2', text: '做一下「常見錯誤 2」' },
  { code: 'KeyM', label: 'M', act: 'fast', short: '太快', text: '做太快' },
  { code: 'KeyV', label: 'V', act: 'view', short: '換視角', text: '切換手機位置：正面 → 斜角 → 側面' },
  { code: 'KeyI', label: 'I', act: 'idle', short: '亂動', text: '亂動（抓頭、撿東西、伸懶腰、走一步）' },
  { code: 'KeyO', label: 'O', act: 'away', short: '離開', text: '走出畫面／回來' },
  { code: 'KeyP', label: 'P', act: 'crowd', short: '兩人', text: '有第二個人入鏡／離開' },
];

// 每個動作的「標準」與「常見錯誤」參數（給 synth.js 的 MOTIONS）
const VARIANTS = {
  squat: { motion: 'squat', good: {}, bad1: { depth: 40 }, bad2: { lean: 26 }, fast: { ms: 1000 }, names: { bad1: '蹲太淺', bad2: '上半身太往前倒' } },
  jack: { motion: 'jack', good: {}, bad1: { arms: 0.5 }, bad2: { legs: 0.25 }, fast: { ms: 650 }, names: { bad1: '手只舉到肩膀', bad2: '腳沒張開' } },
  legRaise: { motion: 'legRaise', good: {}, bad1: { lean: 16 }, bad2: { angle: 10 }, fast: { ms: 800 }, names: { bad1: '上半身往旁邊倒', bad2: '只抬一點點' } },
};
export const variantNames = (ex) => VARIANTS[ex]?.names || {};
const VIEWS = [{ yaw: 0, name: '正面' }, { yaw: 45, name: '斜角' }, { yaw: 90, name: '側面' }];

export class FitnessSim {
  constructor({ exercise = 'squat', fps = 30, aspect = 0.75, onInfo = () => {} } = {}) {
    this.name = 'keyboard';
    this.fps = fps;
    this.aspect = aspect;
    this.onInfo = onInfo;
    this.person = new SynthPerson({ seed: 7, camera: { yaw: 0, aspect }, jitter: 0.0025 });
    this.exercise = exercise;
    this.side = 'left';
    this.viewIdx = 0;
    this.others = 0;
    this.onKey = this.onKey.bind(this);
  }

  setExercise(ex) { this.exercise = ex; }
  // 依動作建議的位置擺「虛擬手機」（深蹲側面、其他正面）
  setView(yaw) { this.person.camera.yaw = yaw; this.viewIdx = VIEWS.findIndex((v) => v.yaw === yaw); }
  get viewName() { return VIEWS.find((v) => v.yaw === this.person.camera.yaw)?.name || `${this.person.camera.yaw}°`; }

  press(act) {
    const P = this.person, V = VARIANTS[this.exercise];
    if (act === 'view') { this.viewIdx = (this.viewIdx + 1) % VIEWS.length; P.camera.yaw = VIEWS[this.viewIdx].yaw; this.onInfo(`模擬手機位置：${VIEWS[this.viewIdx].name}`); return; }
    if (act === 'away') { P.present = !P.present; this.onInfo(P.present ? '模擬：回到畫面' : '模擬：走出畫面'); return; }
    if (act === 'crowd') { this.others = this.others ? 0 : 1; this.onInfo(this.others ? '模擬：第二個人入鏡' : '模擬：第二個人離開'); return; }
    if (act === 'idle') { const m = ['fidget', 'pickup', 'stretch', 'sidestep'][Math.floor(Math.random() * 4)]; P.play(m); return; }
    if (act === 'turn') { P.camera.yaw = P.camera.yaw === 0 ? 90 : 0; return; }
    if (!V || P.queue.length > 1) return; // 最多排一個在等
    const { ms, ...opts } = V[act] || {};
    if (this.exercise === 'legRaise') { opts.side = this.side; this.side = this.side === 'left' ? 'right' : 'left'; }
    P.play(V.motion, opts, ms);
  }

  onKey(e) {
    if (e.type !== 'keydown' || e.repeat) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = SIM_KEYS.find((x) => x.code === e.code);
    if (!k) return;
    e.preventDefault();
    this.press(k.act);
  }

  async start(onPose) {
    addEventListener('keydown', this.onKey);
    this.timer = setInterval(() => {
      const p = this.person.step(performance.now());
      if (p) p.others = this.others;
      onPose(p);
    }, 1000 / this.fps);
  }

  stop() { clearInterval(this.timer); removeEventListener('keydown', this.onKey); }
}
