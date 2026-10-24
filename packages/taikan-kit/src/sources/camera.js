// 鏡頭來源：在這台裝置上用 MediaPipe Pose Landmarker（lite 模型）即時算出骨架。
//
// 隱私：影像只存在 <video> 元素的記憶體裡，每一格算完就丟。本程式不把畫面畫到 canvas、
// 不呼叫任何上傳、不錄影。對外只輸出骨架座標（數字）。網路只用來「下載」模型檔一次。
import { fromMediaPipe } from '../pose.js';

// 版本鎖定，避免 CDN 更新造成行為改變。學校網路若擋 CDN，可以把這些檔案放到自己的伺服器，改用 options 指定。
const MP_VERSION = '0.10.21';
export const DEFAULTS = {
  bundleUrl: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`,
  wasmBase: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
  modelUrl: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};

export class CameraSource {
  constructor({ video, maxFps = 30, width = 640, height = 480, delegate = 'GPU', ...urls } = {}) {
    this.name = 'camera';
    this.video = video || Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    Object.assign(this, { maxFps, width, height, delegate, urls: { ...DEFAULTS, ...urls } });
    this.stats = { fps: 0, inferMs: 0, delegate: null };
  }

  async start(onPose, onStatus = () => {}) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('這個瀏覽器不能使用鏡頭（需要 https 網址，或用 Chrome / Safari 新版）');
    onStatus('正在開啟鏡頭…');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: this.width }, height: { ideal: this.height }, frameRate: { ideal: 30, max: 30 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play();
    onStatus('正在下載姿態模型（第一次約 10 MB，之後會快取）…');
    const vision = await import(/* @vite-ignore */ this.urls.bundleUrl);
    const fileset = await vision.FilesetResolver.forVisionTasks(this.urls.wasmBase);
    const make = (delegate) => vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: this.urls.modelUrl, delegate },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { this.landmarker = await make(this.delegate); this.stats.delegate = this.delegate; }
    catch (e) { console.warn('GPU 模式失敗，改用 CPU', e); this.landmarker = await make('CPU'); this.stats.delegate = 'CPU'; }
    onStatus('');
    this.running = true;
    let lastVideoTime = -1, lastRun = 0, frames = 0, fpsT = performance.now();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - lastRun < 1000 / this.maxFps - 2) return;
      if (this.video.readyState < 2 || this.video.currentTime === lastVideoTime) return;
      lastVideoTime = this.video.currentTime; lastRun = now;
      const t0 = performance.now();
      const res = this.landmarker.detectForVideo(this.video, now);
      const ms = performance.now() - t0;
      this.stats.inferMs += (ms - this.stats.inferMs) * 0.1;
      frames++;
      if (now - fpsT > 1000) { this.stats.fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
      const lm = res.landmarks && res.landmarks[0];
      onPose(lm ? fromMediaPipe(lm, now) : null);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this.landmarker?.close();
    this.landmarker = null;
  }
}
