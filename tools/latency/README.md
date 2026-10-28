# 揮棒延遲量測工具

給開發者重新量「玩家揮棒 → 人物揮棒」延遲用。學校實測請直接用遊戲裡的「延遲診斷」（打擊練習選單勾「顯示延遲診斷」，或網址加 `?diag=1`）。

| 檔案 | 做什麼 |
|---|---|
| `gen.html`、`gen.cjs` | 用 three.js 人偶做揮棒（正面站／側身站／坐著），每一格交給 MediaPipe（VIDEO 模式、固定 30 格/秒）算骨架，存成預錄檔；檔案裡記著真實的「開始往前揮」時間。`taikan-kit/fixtures/mp-bat-*.json` 就是這樣做的 |
| `measure.mjs` | 把預錄檔餵給辨識器，列出「真實起動 → batStart／bat」各幾毫秒 |
| `e2e-camera.cjs` | 把人偶影格做成影片，當成 Chromium 的「假鏡頭」，開打擊練習的鏡頭模式，印出延遲診斷 |

```bash
npm run dev                                         # 本機伺服器（另一個終端機）
node tools/latency/measure.mjs                      # 辨識延遲（不需要瀏覽器）
node tools/latency/gen.cjs side 0 1                 # 重新產生側身站預錄檔＋影格
ffmpeg -framerate 30 -i out/latency/mp-bat-side-png/%04d.png -pix_fmt yuv420p out/latency/mp-bat-side.y4m
node tools/latency/e2e-camera.cjs out/latency/mp-bat-side.y4m "&delegate=cpu"
```

限制：人偶不是真人（MediaPipe 對人偶的追蹤比真人穩），沙盒沒有顯示卡（推論比平板慢很多）。
