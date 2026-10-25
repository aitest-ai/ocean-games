// 產生健身動作的預錄骨架檔（fixtures/exercise/*.json）：用「合成人體」產生，不是真人錄製。
// 格式和真機「錄骨架」下載的檔案一樣（taikan-pose/1），另外多記 aspect（畫面寬高比）與 exercise。
// 真人錄的檔案可以放進同一個資料夾，並手動填上 expect（應該算幾下、應該出現哪些提示）。
//   node tools/make-exercise-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { synthSequence } from '../src/exercise/synth.js';
import { packPose, KEYPOINTS } from '../src/pose.js';

const W = 2500;
const rep = (n, motion, opts, every, ms) => Array.from({ length: n }, (_, i) => [W + i * every, motion, typeof opts === 'function' ? opts(i) : opts, ms]);
const clips = {
  'squat-side': { exercise: 'squat', camera: { yaw: 90 }, script: rep(6, 'squat', {}, 3000), expect: { reps: 6, tips: [] } },
  'squat-front-shallow': { exercise: 'squat', camera: { yaw: 0 }, script: rep(5, 'squat', { depth: 40 }, 3000), expect: { reps: 0, tips: ['depth'] } },
  'squat-side-lean': { exercise: 'squat', camera: { yaw: 90 }, script: rep(5, 'squat', { lean: 26 }, 3000), expect: { reps: 5, tips: ['trunk'] } },
  'jack-front': { exercise: 'jack', camera: { yaw: 0 }, script: rep(12, 'jack', {}, 1200), expect: { reps: 12, tips: [] } },
  'legraise-front-lean': { exercise: 'legRaise', camera: { yaw: 0 }, script: rep(6, 'legRaise', (i) => ({ side: i % 2 ? 'right' : 'left', lean: 16 }), 2600), expect: { reps: 6, tips: ['lean'] } },
  'idle-front': { exercise: 'squat', camera: { yaw: 0 }, script: ['fidget', 'pickup', 'stretch', 'sidestep', 'fidget'].map((m, i) => [W + i * 3200, m]), expect: { reps: 0, tips: [] } },
};
for (const [name, c] of Object.entries(clips)) {
  const end = Math.max(...c.script.map((s) => s[0])) + 3500;
  const poses = synthSequence(c.script, { durationMs: end, fps: 15, seed: name.length, camera: c.camera, jitter: 0.004 });
  const frames = poses.filter(Boolean).map(packPose);
  writeFileSync(new URL(`../fixtures/exercise/${name}.json`, import.meta.url), JSON.stringify({ format: 'taikan-pose/1', name, synthetic: true, fps: 15, aspect: 0.75, exercise: c.exercise, camera: c.camera, keypoints: KEYPOINTS, expect: c.expect, frames }));
  console.log(name, frames.length, 'frames');
}
