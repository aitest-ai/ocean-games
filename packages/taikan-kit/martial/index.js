// taikan-kit 武術擴充：在原本的 kit 上加掛武術動作辨識，不改動原本的輸入層。
//
//   import { createMartial } from './packages/taikan-kit/martial/index.js';
//   const m = createMartial({ sensitivity: 'normal' });
//   m.kit.on('action', (e) => ...)     // 原本的事件：雙手舉高（開始／暫停）、舉單手
//   m.on('martial', (e) => ...)        // { type: 'punch', side: 'left', strength } / { type: 'knee', side }
//   m.kit.on('status', (e) => ...)     // 看不到人、兩人同框…（原本的提示）
//   await m.useKeyboard();             // 或 m.useCamera({ video })
//   m.state.stance.depth               // 每格讀馬步深度等連續值
import { createTaikan } from '../src/index.js';
import { Emitter } from '../src/emitter.js';
import { MartialRecognizer } from './recognizer.js';
import { MartialKeyboardSource } from './keyboard.js';

export { MartialRecognizer, MARTIAL_HINTS } from './recognizer.js';
export { MartialPuppet, scriptMartial, applyAction } from './puppet.js';
export { MartialKeyboardSource, MARTIAL_KEYMAP } from './keyboard.js';
export { stanceFeedback } from './feedback.js';

// 原本的 kit 只留「舉手」：開始／暫停、跳過；其他動作（划槳、揮臂、蹲低…）在武術裡會誤判，全部關掉
const BASE_DISABLED = ['paddle', 'lean', 'jump', 'swing', 'crouch'];

export function createMartial({ sensitivity = 'normal', disabled = ['knee'] } = {}) {
  const kit = createTaikan({ sensitivity, disabled: BASE_DISABLED });
  const bus = new Emitter();
  const rec = new MartialRecognizer({ sensitivity, disabled, emit: (e) => bus.emit('martial', { ...e, time: Math.round(e.time), source: kit.source }) });
  kit.on('pose', (pose) => rec.feed(pose, pose ? pose.t : performance.now()));
  let kb = null;
  return {
    kit, rec,
    on: (type, fn) => bus.on(type, fn),
    get state() { return rec.state; },
    setSensitivity(s) { kit.setSensitivity(s); rec.setSensitivity(s); },
    setDisabled(list) { rec.setDisabled(list); },
    calibrate() { rec.calibrate(); kit.calibrate(); },
    async useKeyboard(opts) { rec.reset(); kb = new MartialKeyboardSource(opts); return kit.use(kb); },
    async useCamera(opts = {}) { rec.reset(); kb = null; return kit.useCamera(opts); },
    get keyboard() { return kit.source === 'keyboard' ? kb : null; },
    get source() { return kit.source; },
  };
}
