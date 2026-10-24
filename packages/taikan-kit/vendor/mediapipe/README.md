# MediaPipe 姿態辨識檔案（放在本站的備份）

這個資料夾裡是「鏡頭體感」用來辨識身體動作的程式和模型。
原本這些檔案是從外部網站（CDN）下載，但學校網路常會擋掉那些網站，
所以我們把同一份檔案原封不動放在自己的網站上。

- 遊戲會**先用這裡的檔案**；如果這裡的檔案讀不到，才會**自動改從原本的外部網站下載**。
- 這些檔案**不要手動修改**。要換版本時，請整批重新下載，並更新下面的版本、大小和檢查碼。
- 辨識全部在使用者自己的裝置上進行，這些檔案不會把影像傳到任何地方。

## 版本

- 程式：`@mediapipe/tasks-vision` **0.10.21**（Google MediaPipe 官方 npm 套件）
- 模型：Pose Landmarker **lite**，float16，第 1 版（檔案日期 2023-04-27）

## 檔案清單

| 檔案 | 大小（位元組） | 約略 | 用途 | 來源 |
|---|---:|---:|---|---|
| `vision_bundle.mjs` | 137,735 | 135 KB | 主程式 | npm 套件 `@mediapipe/tasks-vision@0.10.21`（同 https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs ） |
| `wasm/vision_wasm_internal.js` | 204,284 | 200 KB | 運算核心的載入程式（新裝置用） | 同上套件的 `wasm/` 資料夾（https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm ） |
| `wasm/vision_wasm_internal.wasm` | 9,574,032 | 9.1 MB | 運算核心（新裝置用，支援 SIMD 加速） | 同上 |
| `wasm/vision_wasm_nosimd_internal.js` | 204,137 | 200 KB | 運算核心的載入程式（舊裝置用） | 同上 |
| `wasm/vision_wasm_nosimd_internal.wasm` | 9,448,638 | 9.0 MB | 運算核心（舊 iPad 等不支援 SIMD 的裝置用） | 同上 |
| `pose_landmarker_lite.task` | 5,777,746 | 5.5 MB | 姿態辨識模型 | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task |
| `LICENSE` | 12,331 | 12 KB | 授權條款全文 | https://github.com/google-ai-edge/mediapipe/blob/v0.10.21/LICENSE |

合計 25,358,903 位元組（約 24 MB）。瀏覽器會依裝置只下載其中一組運算核心，
所以每台裝置第一次實際下載約 15 MB，之後會被瀏覽器快取。

## 授權

- **程式（`vision_bundle.mjs`、`wasm/` 裡的檔案）**：Apache License 2.0。
  已確認：npm 套件的 `package.json` 寫明 `"license": "Apache-2.0"`。
  npm 套件本身沒有附 LICENSE 檔，所以這裡的 `LICENSE` 是從 MediaPipe 官方 GitHub 專案
  同版本標籤 `v0.10.21` 取得（https://raw.githubusercontent.com/google-ai-edge/mediapipe/v0.10.21/LICENSE ），
  內容是 Apache 2.0 全文，後面附有 MediaPipe 使用到的第三方元件的授權聲明。
- **模型（`pose_landmarker_lite.task`）**：Apache License 2.0。
  已確認：Google 官方姿態辨識說明頁
  （https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker ）為 lite / full / heavy 三種模型
  連到同一份模型說明書「Model Card BlazePose GHUM 3D」
  （https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf ），
  說明書中「LICENSED UNDER」一欄寫的是「Apache License, Version 2.0」。
- **尚未確定的地方**：
  - 模型說明書沒有標日期或版本號，無法逐字確認它就是針對這一個 2023-04-27 的 `.task` 檔；
    不過官方說明頁是用它來說明這個模型的。
  - `.task` 檔裡其實包含兩個模型（偵測人的 `pose_detector.tflite` 和找關節點的 `pose_landmarks_detector.tflite`）。
    說明書主要描述找關節點的模型，沒有另外寫偵測模型的授權；我們推定兩者一起以 Apache 2.0 發布，但沒有找到逐一寫明的文件。
  - 以上只是整理公開資料，不是法律意見。

依 Apache 2.0 的規定，轉發這些檔案時要附上授權條款全文（就是 `LICENSE`），而且不能修改檔案卻不註明。我們沒有改動任何檔案。

## 檢查碼（SHA-256）

用來確認檔案沒有損壞或被改過（在終端機執行 `sha256sum` 可以比對）。

```
40f4123dfcd75cfa58add046919cc6f52fde66f009ff582997c09ba54c6ba27c  vision_bundle.mjs
4a97e2520ba506c680ecd6ba6acfb146888afa0e2746d57f205352bc6ebb82eb  wasm/vision_wasm_internal.js
f00ec4731faa23b3e714d00e88d4d10e2df5c0a427d3a2b4ae6e3526fdd14ef7  wasm/vision_wasm_internal.wasm
927def7b465c51b86e4b3060f93646aca4e27121f4b8fc0483786e407ea9cf1f  wasm/vision_wasm_nosimd_internal.js
3821ea9b1f7fb8c549ef2a064ef5c85750bf375c545a49fd6eea0df44a95f1f4  wasm/vision_wasm_nosimd_internal.wasm
59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a  pose_landmarker_lite.task
8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8  LICENSE
```

模型檔另外和 Google 伺服器提供的 MD5（`BKdd33yBGsehpFIyZt19iA==`）比對過，完全相同。

## 小提醒

`vision_bundle.mjs` 最後一行有一句指向除錯用檔案（`vision_bundle_mjs.js.map`）的註解。
那個檔案我們沒有放（原套件裡也沒有這個名字的檔案），只會在開發者工具裡看到「找不到」的提示，不影響使用。
