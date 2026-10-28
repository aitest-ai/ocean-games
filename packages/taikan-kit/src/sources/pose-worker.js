// 背景執行緒（Web Worker）裡的姿態推論：讓 MediaPipe 的運算不卡住遊戲畫面。
// 主執行緒每一格把鏡頭影格做成 ImageBitmap 傳過來，這裡算出骨架座標傳回去，影格立刻關掉。
// 影像一樣只在這台裝置的記憶體裡，不存檔、不上傳。
//
// 用「classic worker」（不是 module worker）：MediaPipe 載入 wasm 時要用 importScripts。
// 程式庫本身是 ES module，用 import() 動態載入（Chrome、Safari 15 以上的 classic worker 都支援）。
let landmarker = null;
self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'init') {
    try {
      const vision = await import(m.urls.bundleUrl);
      const fileset = await vision.FilesetResolver.forVisionTasks(m.urls.wasmBase);
      landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: m.urls.modelUrl, delegate: m.delegate },
        runningMode: 'VIDEO', numPoses: m.numPoses,
        minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      self.postMessage({ type: 'ready', delegate: m.delegate });
    } catch (e) {
      self.postMessage({ type: 'error', message: String(e?.message || e) });
    }
  } else if (m.type === 'frame') {
    const t0 = performance.now();
    let landmarks = [];
    try { landmarks = landmarker.detectForVideo(m.bitmap, m.ts).landmarks || []; }
    catch (e) { self.postMessage({ type: 'frameError', message: String(e?.message || e) }); }
    finally { m.bitmap.close(); }
    // 時間只回傳「花了多久」：worker 的 performance.now() 起點跟主畫面不同
    self.postMessage({ type: 'pose', t: m.t, landmarks, ms: performance.now() - t0 });
  } else if (m.type === 'close') {
    landmarker?.close(); landmarker = null; self.close();
  }
};
