// taikan-kit（體感工具組）入口
//
//   import { createTaikan } from './packages/taikan-kit/src/index.js';
//   const kit = createTaikan({ sensitivity: 'normal', disabled: ['jump'] });
//   kit.on('action', (e) => console.log(e));   // { type: 'paddle', side: 'left', strength: 0.7, time, source }
//   kit.on('status', (e) => console.log(e.hint));
//   await kit.useKeyboard();   // 或 kit.useCamera({ video }) / kit.useReplay(clip)
//   每一格遊戲畫面讀 kit.state.lean（-1 ~ 1）等連續值
import { Emitter } from './emitter.js';
import { Recognizer } from './recognizer.js';
import { KeyboardSource, KEYMAP } from './sources/keyboard.js';
import { ReplaySource } from './sources/replay.js';
import { CameraSource } from './sources/camera.js';
import { PoseRecorder } from './recorder.js';

export { KEYMAP, Recognizer, KeyboardSource, ReplaySource, CameraSource, PoseRecorder };
export { Puppet, scriptPoses } from './puppet.js';
export { KEYPOINTS, packPose, unpackPose, fromMediaPipe } from './pose.js';
export { describe, ACTION_NAMES } from './labels.js';
export { drawSkeleton } from './draw.js';

export const ACTIONS = ['paddle', 'lean', 'raise', 'jump', 'swing', 'crouch'];

export function createTaikan({ sensitivity = 'normal', disabled = [] } = {}) {
  const bus = new Emitter();
  let source = null;
  const kit = {
    source: null,
    lastPose: null,
    recorder: new PoseRecorder(),
    on: (type, fn) => bus.on(type, fn),
    off: (type, fn) => bus.off(type, fn),
    get state() { return { ...rec.state, source: kit.source }; },
    get debug() { return rec.debug; },
    get stats() { return source?.stats || null; },
    calibrate: () => rec.calibrate(),
    setSensitivity: (s) => rec.setSensitivity(s),
    setDisabled: (list) => rec.setDisabled(list),
    get disabled() { return [...rec.disabled]; },
    get sensitivity() { return rec.sensitivity; },
    async use(src, onStatus) {
      kit.stop();
      rec.reset();
      source = src;
      kit.source = src.name;
      await src.start((pose) => {
        kit.lastPose = pose;
        kit.recorder.add(pose);
        rec.feed(pose, pose ? pose.t : performance.now());
        bus.emit('pose', pose);
      }, onStatus);
      bus.emit('source', { type: 'source', source: src.name });
      return src;
    },
    useKeyboard: (opts) => kit.use(new KeyboardSource(opts)),
    useCamera: (opts = {}) => kit.use(new CameraSource(opts), opts.onStatus),
    useReplay: (clip, opts) => kit.use(new ReplaySource(clip, opts)),
    get keyboard() { return source instanceof KeyboardSource ? source : null; },
    stop() { source?.stop(); source = null; kit.source = null; },
  };
  const rec = new Recognizer({
    sensitivity, disabled,
    emit: (e) => {
      const ev = { ...e, time: Math.round(e.time), source: kit.source };
      if (e.type === 'status') bus.emit('status', ev);
      else bus.emit('action', ev);
    },
  });
  return kit;
}
