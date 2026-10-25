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
//   motion：做一下的動作；alt：左右輪流；base：平常的姿勢（坐著、趴著、躺著）；floor：手機放地上（橫放）
//   hold：「維持」類動作，按一下就維持 holdMs 毫秒
export const VARIANTS = {
  squat: { motion: 'squat', good: {}, bad1: { depth: 40 }, bad2: { lean: 26 }, fast: { ms: 1000 }, names: { bad1: '蹲太淺', bad2: '上半身太往前倒' } },
  jack: { motion: 'jack', good: {}, bad1: { arms: 0.5 }, bad2: { legs: 0.25 }, fast: { ms: 650 }, names: { bad1: '手只舉到肩膀', bad2: '腳沒張開' } },
  stepJack: { motion: 'jack', good: { hop: 0 }, bad1: { hop: 0, arms: 0.5 }, bad2: { hop: 0, legs: 0.25 }, fast: { hop: 0, ms: 650 }, names: { bad1: '手只舉到肩膀', bad2: '腳沒踏開' } },
  legRaise: { motion: 'legRaise', alt: true, good: {}, bad1: { lean: 16 }, bad2: { angle: 10 }, fast: { ms: 800 }, names: { bad1: '上半身往旁邊倒', bad2: '只抬一點點' } },
  highKnees: { motion: 'highKnee', alt: true, good: {}, bad1: { lift: 0.3 }, bad2: { lean: 25 }, fast: { ms: 420 }, names: { bad1: '抬太低', bad2: '上半身往後仰' } },
  march: { motion: 'highKnee', alt: true, good: { lift: 0.75, ms: 900 }, bad1: { lift: 0.35, ms: 900 }, bad2: { lift: 0.75, lean: 25, ms: 900 }, fast: { lift: 0.75, ms: 500 }, names: { bad1: '抬太低', bad2: '上半身往後仰' } },
  lunge: { motion: 'lunge', alt: true, good: {}, bad1: { depth: 0.3 }, bad2: { lean: 30 }, fast: { ms: 1300 }, names: { bad1: '蹲太淺', bad2: '上半身前傾' } },
  calfRaise: { motion: 'calfRaise', good: {}, bad1: { rise: 0.025 }, bad2: { rise: 0.04 }, fast: { ms: 900 }, names: { bad1: '踮太低', bad2: '踮一半' } },
  wallSit: { motion: 'wallSit', hold: true, good: { ms: 20000 }, bad1: { lean: 30, ms: 20000 }, bad2: { depth: 50, ms: 20000 }, fast: { ms: 5000 }, names: { bad1: '背離開牆', bad2: '蹲太淺', fast: '只撐 5 秒' } },
  sitStand: { motion: 'sitStand', good: {}, bad1: {}, bad2: {}, fast: { ms: 1500 }, names: { bad1: '標準', bad2: '標準' } },
  seatedKnee: { motion: 'seated', base: ['seated', {}, 0], alt: 'knee', good: {}, bad1: { lift: 0.35 }, bad2: { lift: 0.35 }, fast: { ms: 700 }, names: { bad1: '抬太低', bad2: '抬太低' } },
  seatedArms: { motion: 'seated', base: ['seated', {}, 0], good: { arms: true }, bad1: { arms: true, armsLevel: 0.45 }, bad2: { arms: true, armsLevel: 0.6 }, fast: { arms: true, ms: 700 }, names: { bad1: '手舉不夠高', bad2: '手舉一半' } },
  plank: { motion: 'plank', floor: true, hold: true, base: ['plank', {}, 0.5], good: { ms: 20000 }, bad1: { sag: 0.14, ms: 20000 }, bad2: { pike: 0.16, ms: 20000 }, fast: { ms: 5000 }, names: { bad1: '腰塌', bad2: '屁股太高', fast: '只撐 5 秒' } },
  pushUp: { motion: 'pushUp', floor: true, base: ['pushUp', {}, 0], good: {}, bad1: { depth: 0.4 }, bad2: { sag: 0.14 }, fast: { ms: 1100 }, names: { bad1: '下去太淺', bad2: '腰塌' } },
  bridge: { motion: 'bridge', floor: true, base: ['bridge', {}, 0], good: {}, bad1: { lift: 0.4 }, bad2: { lift: 0.4 }, fast: { ms: 1100 }, names: { bad1: '推不夠高', bad2: '推不夠高' } },
};
export const variantNames = (ex) => VARIANTS[ex]?.names || {};
// 手機放在地上、橫放（地板動作）
export const FLOOR_CAMERA = { yaw: 90, height: 0.3, distance: 2.4, aim: [0, 0.3, -0.4], aspect: 16 / 9 };
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
    this.setExercise(exercise);
  }

  setExercise(ex) {
    this.exercise = ex;
    const V = VARIANTS[ex] || {};
    const P = this.person;
    P.hold = V.base ? { name: V.base[0], opts: V.base[1], u: V.base[2] } : null;
    P.queue.length = 0; P.cur = null;
    if (V.floor) { Object.assign(P.camera, FLOOR_CAMERA); this.aspect = FLOOR_CAMERA.aspect; }
    else { Object.assign(P.camera, { height: 0.8, distance: 2.6, aim: [0, 0.95, 0], aspect: 0.75 }); this.aspect = 0.75; }
  }
  // 依動作建議的位置擺「虛擬手機」（深蹲側面、其他正面）
  setView(yaw) { if (VARIANTS[this.exercise]?.floor) return; this.person.camera.yaw = yaw; this.viewIdx = VIEWS.findIndex((v) => v.yaw === yaw); }
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
    if (V.alt) { opts[V.alt === true ? 'side' : V.alt] = this.side; this.side = this.side === 'left' ? 'right' : 'left'; }
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
