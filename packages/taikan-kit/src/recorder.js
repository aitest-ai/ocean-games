// 姿態錄製：只記錄骨架座標數字（不含任何影像），存成 taikan-pose/1 預錄檔，可下載給 ReplaySource 用。
import { KEYPOINTS, packPose } from './pose.js';

export class PoseRecorder {
  constructor() { this.frames = []; this.recording = false; }
  start() { this.frames = []; this.recording = true; this.t0 = null; }
  add(pose) {
    if (!this.recording || !pose) return;
    this.t0 ??= pose.t;
    this.frames.push(packPose({ t: pose.t - this.t0, kp: pose.kp }));
  }
  stop(name = 'recording') {
    this.recording = false;
    return { format: 'taikan-pose/1', name, keypoints: KEYPOINTS, frames: this.frames };
  }
}
