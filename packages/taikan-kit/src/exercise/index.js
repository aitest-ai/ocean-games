// 健身動作分析（taikan-kit 的附加模組，不改原本的辨識器）
//
//   import { ExerciseAnalyzer, Calibrator, EXERCISES } from './packages/taikan-kit/src/exercise/index.js';
//   const a = new ExerciseAnalyzer({ exercise: 'squat', profile, emit: (e) => console.log(e) });
//   kit.on('pose', (pose) => a.feed(pose, { aspect }));
//
// 說明：docs/fitness.md
export { ExerciseAnalyzer, standBaseline, viewFromYaw, confLevel, CONF_TEXT, STATUS_TEXT, HINT_MIN_CONF, GAP_MS } from './analyzer.js';
export { EXERCISES, VIEW_NAMES } from './exercises.js';
export { Calibrator } from './calibration.js';
export { RepCounter } from './counter.js';
export { PoseSmoother, measure, angle } from './features.js';
export { SynthPerson, synthSequence, MOTIONS, buildJoints, toPose, project, standSpec, BODY } from './synth.js';
