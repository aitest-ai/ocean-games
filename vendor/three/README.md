# three.js（本站自架）

- 版本：three@0.180.0（npm 套件 `three`），MIT 授權，全文見 `LICENSE`。
- 只放陸地系列用到的檔案：`build/three.module.min.js`、`build/three.core.min.js`、`addons/objects/Sky.js`（Preetham 天空模型）。
- 改動：`Sky.js` 的 `import ... from 'three'` 改成相對路徑 `../../build/three.module.min.js`，網頁就不需要 import map。
- 為什麼放在本站：跟姿態模型一樣，學校網路常擋外部 CDN；同一個來源比較穩。約 0.7 MB。
