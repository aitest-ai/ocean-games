// 鏡頭來源：在這台裝置上用 MediaPipe Pose Landmarker（lite 模型）即時算出骨架。
//
// 隱私：影像只存在 <video> 元素的記憶體裡，每一格算完就丟。本程式不把畫面畫到 canvas、
// 不呼叫任何上傳、不錄影。對外只輸出骨架座標（數字）。網路只用來「下載」模型檔一次。
import { fromMediaPipe } from '../pose.js';

// 版本鎖定，避免 CDN 更新造成行為改變。
// 預設先用放在本站的檔案（vendor/mediapipe/，學校網路常擋 CDN）；本站的載入失敗才自動改用 CDN。
// 仍可用 options 的 bundleUrl / wasmBase / modelUrl 指定其他位置。
const MP_VERSION = '0.10.21';
const vendor = (path) => new URL(`../../vendor/mediapipe/${path}`, import.meta.url).href;
export const DEFAULTS = {
  bundleUrl: vendor('vision_bundle.mjs'),
  wasmBase: vendor('wasm'), // 結尾不要斜線：FilesetResolver 會自己接「/vision_wasm_…」
  modelUrl: vendor('pose_landmarker_lite.task'),
};
export const CDN_FALLBACK = {
  bundleUrl: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`,
  wasmBase: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`,
  modelUrl: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
};
const sameUrls = (a, b) => a.bundleUrl === b.bundleUrl && a.wasmBase === b.wasmBase && a.modelUrl === b.modelUrl;

export class CameraSource {
  constructor({ video, maxFps = 30, width = 640, height = 480, delegate = 'GPU', ...urls } = {}) {
    this.name = 'camera';
    this.video = video || Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    Object.assign(this, { maxFps, width, height, delegate, urls: { ...DEFAULTS, ...urls } });
    this.stats = { fps: 0, inferMs: 0, delegate: null, modelSource: null }; // modelSource：'local'（本站或自訂位置）或 'cdn'
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
    onStatus('正在下載姿態模型（第一次約 15 MB，之後會快取）…');
    try {
      this.landmarker = await this._load(this.urls);
      this.stats.modelSource = sameUrls(this.urls, CDN_FALLBACK) ? 'cdn' : 'local';
    } catch (e) {
      if (sameUrls(this.urls, CDN_FALLBACK)) throw e;
      console.warn('本站的姿態模型檔載入失敗，改用 CDN', e);
      onStatus('本站的模型檔載入失敗，改從備用網站下載…');
      this.landmarker = await this._load(CDN_FALLBACK);
      this.stats.modelSource = 'cdn';
    }
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
      // up to two people are detected: the player is the larger one (nearest the camera), and the
      // recognizer is told someone else is in the picture so it can ask for one player only
      const all = res.landmarks || [];
      const size = (l) => Math.hypot(l[11].x - l[12].x, l[11].y - l[12].y);
      const lm = all.length > 1 ? all.reduce((a, b) => (size(b) > size(a) ? b : a)) : all[0];
      const pose = lm ? fromMediaPipe(lm, now) : null;
      if (pose) pose.others = all.length - 1;
      onPose(pose);
    };
    loop();
  }

  // 載入程式庫、wasm 與模型，建立 PoseLandmarker。GPU 失敗就改用 CPU；兩者都失敗才丟出錯誤（交給上面改用 CDN）。
  async _load(urls) {
    const vision = await import(/* @vite-ignore */ urls.bundleUrl);
    const fileset = await vision.FilesetResolver.forVisionTasks(urls.wasmBase);
    const make = (delegate) => vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: urls.modelUrl, delegate },
      runningMode: 'VIDEO', numPoses: 2,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    });
    try { const lm = await make(this.delegate); this.stats.delegate = this.delegate; return lm; }
    catch (e) {
      if (this.delegate === 'CPU') throw e;
      console.warn('GPU 模式失敗，改用 CPU', e);
      const lm = await make('CPU'); this.stats.delegate = 'CPU'; return lm;
    }
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
