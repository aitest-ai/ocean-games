// 鏡頭來源：在這台裝置上用 MediaPipe Pose Landmarker（lite 模型）即時算出骨架。
//
// 隱私：影像只存在這台裝置的記憶體裡（<video> 元素；worker 模式時另做一份 ImageBitmap 交給背景執行緒），
// 每一格算完就丟。本程式不把畫面畫到看得見的 canvas、不呼叫任何上傳、不錄影。對外只輸出骨架座標（數字）。
// 網路只用來「下載」模型檔一次。
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
  // numPoses：最多找幾個人。2 = 可以提醒「鏡頭前有兩個人」，但只有一個人時 MediaPipe 每格都要多跑一次
  //   「找人」模型，推論時間約變兩倍（雲端實測 55 → 101 毫秒）。要求反應快的遊戲（打擊）用 1。
  // worker：true＝推論放到背景執行緒（遊戲畫面不會被推論卡住）；背景執行緒啟動失敗會自動改回主執行緒。
  constructor({ video, maxFps = 30, width = 640, height = 480, delegate = 'GPU', numPoses = 2, worker = false, onStatus, ...urls } = {}) {
    this.name = 'camera';
    this.video = video || Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    Object.assign(this, { maxFps, width, height, delegate, numPoses, wantWorker: worker, urls: { ...DEFAULTS, ...urls } });
    // modelSource：'local'（本站或自訂位置）或 'cdn'
    // 延遲診斷（毫秒，近幾秒的平均）：frameMs 影格間隔、inferMs 推論耗時、pipeMs 影格拍到 → 骨架算完、
    //   skipped 來不及算而跳過的影格數、clock 時間戳的來源（capture＝真的拍攝時間；present／raf＝估計，比真實晚）
    //   thread：推論在哪裡跑（worker＝背景執行緒、main＝主執行緒）
    this.stats = { fps: 0, inferMs: 0, frameMs: 0, pipeMs: 0, skipped: 0, clock: null, delegate: null, modelSource: null, numPoses, thread: null };
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
    if (this.wantWorker) {
      try { await this._startWorker(this.urls); }
      catch (e) { console.warn('背景執行緒推論無法啟動，改用主執行緒', e); this.worker?.terminate(); this.worker = null; }
    }
    if (this.worker) this.stats.thread = 'worker';
    else try {
      this.landmarker = await this._load(this.urls);
      this.stats.modelSource = sameUrls(this.urls, CDN_FALLBACK) ? 'cdn' : 'local';
    } catch (e) {
      if (sameUrls(this.urls, CDN_FALLBACK)) throw e;
      console.warn('本站的姿態模型檔載入失敗，改用 CDN', e);
      onStatus('本站的模型檔載入失敗，改從備用網站下載…');
      this.landmarker = await this._load(CDN_FALLBACK);
      this.stats.modelSource = 'cdn';
    }
    if (!this.worker) this.stats.thread = 'main';
    onStatus('');
    this.running = true;
    const st = this.stats, avg = (k, v, a = 0.1) => { st[k] = st[k] ? st[k] + (v - st[k]) * a : v; };
    let lastVideoTime = -1, lastRun = 0, lastFrame = 0, frames = 0, fpsT = performance.now(), lastTs = 0;
    // 每一格：用 MediaPipe 算骨架。t＝這一格「被拍到」的時間（能拿到就用，拿不到才用現在時間），
    // 遊戲用它算「玩家真正揮棒的時刻」，不受鏡頭、推論的延遲影響
    const process = (now, t, clock) => {
      if (now - lastRun < 700 / this.maxFps) { st.skipped++; return; }  // 鏡頭比設定快（例如 60 格）時才會跳
      if (lastFrame) avg('frameMs', t - lastFrame);
      lastFrame = t; lastRun = now;
      // MediaPipe 要求時間戳一直往前（同一毫秒內兩格會出錯）
      const ts = Math.max(lastTs + 1, Math.round(t));
      lastTs = ts;
      st.clock = clock;
      if (this.worker) {
        // 背景執行緒還在算上一格：這格跳過（只算最新的，不排隊，排隊只會讓延遲越來越大）
        if (this.busy) { st.skipped++; return; }
        this.busy = true;
        createImageBitmap(this.video).then((bitmap) => {
          if (!this.running || !this.worker) { bitmap.close(); this.busy = false; return; }
          this.worker.postMessage({ type: 'frame', bitmap, t, ts }, [bitmap]);
        }, () => { this.busy = false; });
        return;
      }
      const t0 = performance.now();
      const res = this.landmarker.detectForVideo(this.video, ts);
      done(res.landmarks || [], t, performance.now() - t0);
    };
    // 骨架算好了（主執行緒或背景執行緒）
    const done = (all, t, ms) => {
      const t1 = performance.now();
      avg('inferMs', ms);
      avg('pipeMs', t1 - t);
      frames++;
      if (t1 - fpsT > 1000) { st.fps = Math.round((frames * 1000) / (t1 - fpsT)); frames = 0; fpsT = t1; }
      // up to two people are detected: the player is the larger one (nearest the camera), and the
      // recognizer is told someone else is in the picture so it can ask for one player only
      const size = (l) => Math.hypot(l[11].x - l[12].x, l[11].y - l[12].y);
      const lm = all.length > 1 ? all.reduce((a, b) => (size(b) > size(a) ? b : a)) : all[0];
      const pose = lm ? fromMediaPipe(lm, t) : null;
      if (pose) { pose.others = all.length - 1; pose.recv = t1; pose.inferMs = ms; }
      onPose(pose);
    };
    if (this.worker) {
      this.worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'pose') { this.busy = false; if (this.running) done(m.landmarks, m.t, m.ms); }
        else if (m.type === 'frameError') { this.busy = false; console.warn('背景推論錯誤', m.message); }
      };
    }
    // 優先用 requestVideoFrameCallback：新影格一出現就算（不用等下一次畫面更新），而且 Chrome 會給
    // 這一格的拍攝時間（captureTime）。不支援、或影片沒顯示而不觸發時，改用 requestAnimationFrame 輪詢。
    const rafLoop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(rafLoop);
      if (this.video.readyState < 2 || this.video.currentTime === lastVideoTime) return;
      lastVideoTime = this.video.currentTime;
      const now = performance.now();
      process(now, now, 'raf');
    };
    if (this.video.requestVideoFrameCallback && this.useVideoFrameCallback !== false) {
      let fired = false;
      const vfc = (now, meta) => {
        if (!this.running || this.mode !== 'vfc') return;
        fired = true;
        this.vfc = this.video.requestVideoFrameCallback(vfc);
        const cap = meta.captureTime, pres = meta.presentationTime;
        // 合理性檢查：拍攝時間應該在現在之前 0～1 秒
        if (cap > 0 && now - cap >= 0 && now - cap < 1000) process(now, cap, 'capture');
        else process(now, pres > 0 && now - pres >= 0 && now - pres < 1000 ? pres : now, pres > 0 ? 'present' : 'raf');
      };
      this.mode = 'vfc';
      this.vfc = this.video.requestVideoFrameCallback(vfc);
      // 0.8 秒內都沒觸發（例如某些瀏覽器對沒顯示的 <video> 不送影格）：改用輪詢
      this.fallback = setTimeout(() => { if (!fired && this.running) { this.mode = 'raf'; rafLoop(); } }, 800);
    } else { this.mode = 'raf'; rafLoop(); }
  }

  // 背景執行緒：建立 worker、在裡面載入模型。只試指定的 delegate（GPU）——worker 裡 GPU 不行時，
  // 主執行緒的 GPU 通常還是比 worker 裡的 CPU 快，所以直接改回主執行緒，不在 worker 裡退到 CPU。
  _startWorker(urls) {
    return new Promise((resolve, reject) => {
      let w;
      try { w = new Worker(new URL('./pose-worker.js', import.meta.url)); } catch (e) { reject(e); return; }
      this.worker = w;
      const timer = setTimeout(() => reject(new Error('worker 啟動逾時')), 60000); // 第一次要下載模型，給長一點
      w.onmessage = (ev) => {
        if (ev.data.type === 'ready') { clearTimeout(timer); this.stats.delegate = ev.data.delegate; this.stats.modelSource = sameUrls(urls, CDN_FALLBACK) ? 'cdn' : 'local'; resolve(); }
        else if (ev.data.type === 'error') { clearTimeout(timer); reject(new Error(ev.data.message)); }
      };
      w.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || 'worker 錯誤')); };
      const { bundleUrl, wasmBase, modelUrl } = urls; // 只傳網址（函式不能傳給 worker）
      w.postMessage({ type: 'init', urls: { bundleUrl, wasmBase, modelUrl }, delegate: this.delegate, numPoses: this.numPoses });
    });
  }

  // 載入程式庫、wasm 與模型，建立 PoseLandmarker。GPU 失敗就改用 CPU；兩者都失敗才丟出錯誤（交給上面改用 CDN）。
  async _load(urls) {
    const vision = await import(/* @vite-ignore */ urls.bundleUrl);
    const fileset = await vision.FilesetResolver.forVisionTasks(urls.wasmBase);
    const make = (delegate) => vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: urls.modelUrl, delegate },
      runningMode: 'VIDEO', numPoses: this.numPoses,
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
    clearTimeout(this.fallback);
    if (this.vfc && this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.vfc);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
    this.landmarker?.close();
    this.landmarker = null;
    if (this.worker) { this.worker.postMessage({ type: 'close' }); this.worker = null; }
    this.busy = false;
  }
}
