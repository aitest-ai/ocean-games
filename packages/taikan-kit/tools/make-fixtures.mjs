// 產生預錄姿態檔（fixtures/*.json）。這些是「模擬人偶」產生的合成資料，不是真人錄製；
// 真人資料可在測試頁用「錄製骨架」下載後放進 fixtures/，並手動填上 expect。
import { writeFileSync } from 'node:fs';
import { scriptPoses } from '../src/puppet.js';
import { packPose, KEYPOINTS } from '../src/pose.js';
import { Recognizer } from '../src/recognizer.js';

const W = 1500;
const clips = {
  'paddle-alternate': { script: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [W + i * 750, i % 2 ? 'paddle-right' : 'paddle-left']), ms: W + 6600 },
  'lean-sway': { script: [[W, 'hold:leanL:on'], [W + 1200, 'hold:leanL:off'], [W + 2200, 'hold:leanR:on'], [W + 3400, 'hold:leanR:off']], ms: W + 4500 },
  'raise-start': { script: [[W, 'hold:raiseL:on'], [W, 'hold:raiseR:on'], [W + 1200, 'hold:raiseL:off'], [W + 1200, 'hold:raiseR:off']], ms: W + 2200 },
  'jump-crouch': { script: [[W, 'jump'], [W + 1500, 'hold:crouch:on'], [W + 2700, 'hold:crouch:off'], [W + 3800, 'jump']], ms: W + 5000 },
  'swing-bat': { script: [[W, 'swing-left'], [W + 1000, 'swing-right'], [W + 2000, 'swing-left']], ms: W + 3000 },
  'idle-fidget': { script: [0, 1, 2, 3, 4].map((i) => [W + i * 1100, 'wave']), ms: W + 6000, jitter: 0.007 },
};
for (const [name, c] of Object.entries(clips)) {
  const poses = scriptPoses(c.script, { durationMs: c.ms, fps: 30, seed: name.length, jitter: c.jitter ?? 0.003 });
  const frames = poses.map(packPose);
  // expect：用目前辨識器跑一次並記下來，之後改辨識器時測試會提醒「結果變了」
  const expect = {};
  const r = new Recognizer({ emit: (e) => { if (e.type === 'status') return; const k = e.type + (e.side ? ':' + e.side : '') + (e.dir ? ':' + e.dir : '') + (e.on !== undefined ? ':' + e.on : ''); expect[k] = (expect[k] || 0) + 1; } });
  for (const f of frames) { const [t] = f; r.feed({ t, kp: Object.fromEntries(KEYPOINTS.map((k, i) => [k, { x: f[1 + i * 3], y: f[2 + i * 3], v: f[3 + i * 3] }]).filter(([, v]) => v.v > 0)) }, t); }
  writeFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), JSON.stringify({ format: 'taikan-pose/1', name, synthetic: true, fps: 30, keypoints: KEYPOINTS, expect, frames }));
  console.log(name, frames.length, 'frames', JSON.stringify(expect));
}
