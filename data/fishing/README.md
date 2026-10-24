# 魚類資料庫（data/fishing）格式說明

格式代號：`ocean-fish/1`。全部是 JSON，用一般文字編輯器就能改；遊戲（`src/fishing/data.js`）在開頁時讀取。

```
data/fishing/
  index.json               清單：用到哪些海域、資料來源檔、魚種檔、垃圾檔
  sources.json             所有來源（論文、政府網站、資料庫……）與它們的授權
  regions/tw-northeast.json  海域：台灣東北角（釣點位置、礁石、外海範圍）
  species/<id>.json        一種魚（或海龜）一個檔，id = 學名小寫用 - 連接
  junk.json                海洋垃圾
```

## 新增一種魚

1. 複製一個現有的 `species/*.json`，改檔名與 `id`（例：`lutjanus-russellii`）。
2. 填好下面的欄位；每個數據都要有「來源、授權、查證狀態」。
3. 在 `index.json` 的 `species` 加上這個檔。
4. 執行 `node --test tests/fishing.test.mjs`：測試會檢查每個數據都有來源與狀態、體長分布合理、引用的來源存在、來源授權不是 NC 或 SA。
5. 圖檔照 `assets/fishing/README.md` 的檔名規則放進去（沒有圖時遊戲會自動畫暫代圖）。

## 新增一個海域

在 `regions/` 新增一個檔（格式同 `tw-northeast.json`），每種魚在 `regions` 底下加上該海域的月份。目前遊戲只讀第一個海域；選擇海域的畫面是下一步。

## 每一個數據的寫法

```json
"p50": { "value": 26, "src": ["R29"], "status": "partial", "note": "商業漁獲平均…" }
```

| 欄位 | 意思 |
|---|---|
| `value` | 數值或文字 |
| `src` | 來源代號（對應 `sources.json` 的 `id`），可以多個 |
| `license` | 可省略；省略時用來源的授權。自己寫的文字填「本專案自寫」 |
| `status` | 查證狀態（見下表） |
| `note` | 補充：例如「只讀到摘要」「地區不同」 |

| status | 卡片上顯示 | 意思 |
|---|---|---|
| `verified` | 已查證 | 兩個以上獨立來源一致，或直接讀過權威原始資料 |
| `partial` | 部分查證 | 只有一個來源、只讀到摘要，或來源之間有差異 |
| `illustrative` | 示意 | 找不到可靠來源，只是合理的示意值，**不能當精確資料引用** |
| `game-design` | 遊戲設定 | 為了遊戲而設的值（例如拉扯力道），不是科學數據 |

## 魚種檔的欄位

| 欄位 | 內容 |
|---|---|
| `id`、`kind` | `kind`：`fish`（魚）或 `bycatch`（誤釣的保育類，例如海龜，一律放流） |
| `names` | `zh` 中文名、`aliases` 俗名、`scientific` 學名、`family` 科、`en` 英文名 |
| `regions.<海域>` | `months` 可釣月份、`peakMonths` 最多的月份 |
| `habitat`、`depth`、`diet`、`behavior`、`fightNote` | 棲息環境、水深、食性、習性、上鉤後的拉扯特性（文字） |
| `length` | `type` 量法（TL 全長／FL 尾叉長／CCL 背甲曲線長）；`catch.p50`、`catch.p95` 常見釣獲體長的中位數與 95 百分位（公分）；`min`、`maxCommon`、`maxRecorded` |
| `lengthWeight` | 體重公式 W = a × L^b（公克、公分），`lengthType` 要和 `length.type` 一樣 |
| `maturity.L50` | 初次成熟體長（有一半個體成熟的長度） |
| `intro` | 介紹文字（用自己的話寫） |
| `safety` | 安全提醒（毒棘、利齒…） |
| `conservation` | `iucn`、`taiwan`（法規地位）、`legalMinSize`、`release`（放流規則，見下）、`note` |
| `game` | 遊戲用的設定（都不是科學數據）：`zones` 喜歡的區域（reef 礁石／sand 沙底／open 外海）、`abundance` 多寡、`difficulty` 難釣程度 1～5、`swim` 魚影的游法、`bite` 咬餌方式、`fight` 拉扯力道與衝刺 |
| `art` | `file` 圖檔路徑、`facing` 圖中魚頭方向、`placeholder` 暫代圖的畫法、`idFeatures` 給畫家核對的辨識特徵 |

### 大小怎麼算

- 每一隻的體長從「常見釣獲體長」的分布抽出來：用 `p50` 與 `p95` 決定一個對數常態分布，限制在 `min`～`maxCommon` 之間。
- 「比 X% 的同種魚長」就是這個分布的百分位；卡片上的「小型、中型、大型」依百分位分級（<15% 小型、<40% 中小型、<60% 中型、<85% 中大型、<97% 大型、其餘特大型）。
- 體重 = a × 長度^b × 個體胖瘦（±7%，所以卡片寫「約」）。

### 放流規則 `conservation.release`

| mode | 意思 |
|---|---|
| `always` | 一律放流（保育類） |
| `belowSize` | 未滿 `sizeCm` 公分要放流 |
| `none` | 不需放流（玩家仍可自己選擇放流） |

`basis` 寫明依據：`protected`（保育類）、`law`（法規）、`law-reference`（比照漁船法規的遊戲規則）、`maturity-suggestion`（依初次成熟體長的遊戲規則）。卡片會把「遊戲規則」和「法規」分開寫清楚。

## 授權原則

- 只用 CC0、CC BY、政府公開資料、法令、或論文中的**數值事實**（並註明出處）。
- **不使用 FishBase 的數據**（CC BY-NC，非商用）；也不轉載維基百科文字（CC BY-SA）。
- 介紹文字一律用自己的話寫，授權欄寫「本專案自寫」。
- 查證過程見 `docs/fishing-research-notes.md`。
