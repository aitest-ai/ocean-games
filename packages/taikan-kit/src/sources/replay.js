// 預錄姿態播放：讀取錄好的骨架數字檔（不是影片），照原本的時間播放。
// 檔案格式：{ "format": "taikan-pose/1", "name": "...", "keypoints": [...], "frames": [[t, x, y, v, ...], ...] }
import { unpackPose } from '../pose.js';

export class ReplaySource {
  constructor(clip, { loop = true, speed = 1 } = {}) {
    if (clip.format !== 'taikan-pose/1') throw new Error('不是 taikan-pose/1 格式的預錄檔');
    this.name = 'replay';
    this.clip = clip;
    this.frames = clip.frames.map(unpackPose);
    this.loop = loop;
    this.speed = speed;
  }

  async start(onPose) {
    const F = this.frames;
    const t0 = F[0].t, len = F[F.length - 1].t - t0 + 33;
    let start = performance.now(), i = 0, lap = 0;
    this.timer = setInterval(() => {
      const el = (performance.now() - start) * this.speed;
      while (i < F.length && F[i].t - t0 <= el) {
        const f = F[i++];
        onPose({ t: start + (f.t - t0) / this.speed, kp: f.kp });
      }
      if (i >= F.length) {
        if (!this.loop) { this.stop(); this.onEnd?.(); return; }
        i = 0; lap++; start += len / this.speed;
      }
    }, 10);
  }

  stop() { clearInterval(this.timer); }
}
