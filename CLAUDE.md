# CLAUDE.md — POE Trade Dashboard

## 專案意圖

用於瀏覽 Path of Exile（PoE1，PC realm）通貨交易所資料的儀表板：Python 後端（`server.py`，FastAPI）代理官方 API 並提供靜態頁面，前端純 vanilla JS。

**核心目標：**
- 用「五檔報價」風格展示買賣盤：掛賣/掛買各列**最多 5 個價位檔 + 掛單量**（API 無真掛單簿分檔，價位檔由逐小時快照彙整，見下文）
- 混沌石（Chaos Orb）與神聖石（Divine Orb）是兩大計價基準，用顯眼的 Hero card 呈現
- **顯示以實際掛單為準**：混沌石行/神聖石行各自來自真實配對市場，不做匯率換算的假報價；標價格式固定「1 個 : N 基準幣」
- 通貨按種類（高價通貨、製作通貨、消耗品）分組，組內依價格由高到低排序
- 通貨分頁頂部有「套利機會」表：最便宜掛賣 < 最高掛買（含跨基準幣換算比較）的品項依價差排列
- 支援所有 22 個靜態分類，用分頁（tabs）切換；中文名稱以官方 `/trade/data/static` 的繁中 `text` 為準
- Demo 模式：後端未啟動時可載入本地假資料

---

## 架構

```
poe-trade-dashboard/
├── server.py                     # FastAPI 後端：API 代理、快照合併、限流自我節流、靜態檔案
├── .env                          # CLIENT_ID / CLIENT_SECRET（gitignore）
├── index.html                    # 主頁面，包含 tab nav、settings modal
├── assets/
│   ├── app.js                    # 全部前端邏輯：渲染、五檔、排序、套利
│   ├── zh-names.js               # 繁中名稱 fallback 對照（官方 static API 優先）
│   └── style.css                 # POE 黑金主題，含 tab bar、orderbook 卡片
├── public/res/img/               # 本地通貨圖示（28 個 PNG，以 currency ID 命名）
├── data/
│   ├── cache/{unix_hour}.json    # 不可變的整點快照永久快取（gitignore）
│   └── mock-currency-exchange.json  # Demo 模式假資料
├── poe_static.json               # 靜態資料 fallback（英文；正式來源是 TW API）
├── scripts/
│   ├── test-orderbook.mjs        # 掛單簿解析單元測試（node scripts/test-orderbook.mjs）
│   ├── debug-api.mjs             # API 連線除錯工具
│   └── download-imgs.py          # 一次性工具：從 POE CDN 批次下載通貨圖示
└── .github/workflows/
    └── fetch-data.yml            # 手動觸發的 GitHub Action（不排程）
```

啟動：`pip install -r requirements.txt && python server.py` → http://localhost:8000
（**不要開 uvicorn 的 `reload=True`**：Windows 上 watchfiles 重載會卡死、伺服器無聲斷線）

---

## 資料流

### 真實模式（瀏覽器一律只打本地後端，憑證放 `.env`）

```
瀏覽器啟動
  → GET /api/leagues    （後端代理 pathofexile.tw/api/leagues，記憶體快取 1h）
  → GET /api/static     （後端代理 /api/trade/data/static，快取 6h；fallback: 本地 poe_static.json）
  → GET /api/exchange   （後端合併最近 MERGE_HOURS 個整點快照 + 各市場逐小時 history）
  → allMarkets.filter(league === currentLeague)
  → render()
```

後端 token（client_credentials，POST pathofexile.tw/oauth/token，**無 /api 前綴**）由 `server.py` 自動管理。

### Demo 模式（設定面板手動切換）

```
瀏覽器啟動 → 同上，但改 fetch data/mock-currency-exchange.json
```

---

## 重要 API 說明

**端點與文件：**
- API 使用方式（參數、欄位、scope）請查官方文件：https://www.pathofexile.com/developer/docs
- 但**實際呼叫時的端點統一是 `https://pathofexile.tw/api`**，不是 `api.pathofexile.tw` 子網域
  - 例：`https://pathofexile.tw/api/leagues`、`https://pathofexile.tw/api/currency-exchange`
  - **唯一例外：OAuth token 在 `https://pathofexile.tw/oauth/token`（無 `/api` 前綴），放在 `/api` 下會 404**
- **通貨靜態資料統一來自 `https://pathofexile.tw/api/trade/data/static`**（無需 auth，含繁中名稱與圖片路徑），由 `server.py` 的 `/api/static` 代理；本地 `poe_static.json` 僅作為 API 失敗時的 fallback

### `GET /currency-exchange`（需要 `service:cxapi` scope）

**陷阱一：不帶 change_id 的 `GET /currency-exchange` 會回傳空的 `markets`**。必須呼叫 `GET /currency-exchange/{unix_hour}`（整點 unix timestamp）取得該小時快照。

**陷阱二：限流非常嚴格 — `5:3600:600`（每小時 5 個請求，違規罰停 600 秒）**，見 `x-rate-limit-client` header。`server.py` 自我節流為滾動一小時最多 4 個上游請求，429 時讀 `Retry-After` 退避。

**陷阱三：單一整點快照只含「該小時有成交」的市場**（實測 1420 個品項僅涵蓋約 95 種，連崇高石、點金石都可能缺席）。`server.py` 的 `/api/exchange` 會合併最近 `MERGE_HOURS`（預設 24）個小時快照、每個市場取最新一筆；過去的小時快照不可變，永久快取於 `data/cache/{unix_hour}.json`（已 gitignore），涵蓋率隨運行時間逐步補齊。

**429 退避注意**：限流是滾動一小時窗口，罰停歸零≠額度恢復；以 600s 週期探路 = 6 次/小時，本身就超限而永遠打不進去。`server.py` 的對策：429 後退避至少 900s + 慢啟動（剛被 429 或剛重啟時只用 1 個請求探路，成功才恢復正常預算）。

**`/api/exchange` 回傳的擴充欄位**（server 加上的，非上游原生）：`change_id`（最新有資料的整點）、`fetched_at`、`hours_merged`、`rate_limited`，以及每個 market 的 `snapshot_hour` 和 `history[]`（該市場逐小時的 ratio/stock/volume，前端用來組五檔價位）。

回傳該小時的通貨交易所資料，欄位含義：

| 欄位 | 說明 |
|------|------|
| `market_id` | `"賣出貨幣\|買入貨幣"`，例如 `"chaos\|divine"` |
| `volume_traded` | 本小時各幣種的成交量 |
| `lowest_ratio` | 最優掛單比率（買方最佳價格） |
| `highest_ratio` | 最差掛單比率（買方最差價格） |
| `lowest_stock` | 最小單筆掛單庫存量 |
| `highest_stock` | 最大單筆掛單庫存量 |

**比率格式規則（實測真實資料，與舊文件不同）：**
- ratio 物件**同時帶兩側數量**：`{"chaos": 11, "regret": 10}` = 11 混沌石 : 10 後悔石 → 單價 = 兩側相除（1.1 混沌石/顆）
- **絕不能只讀第一個 key 並假設另一側是 1**：`{"divine": 1, "regret": 401}` 那樣會錯 400 倍
- ratio 任一側為 0 = 該小時無成交 → 視為無報價（`lowest_stock` 可能仍有掛單庫存，如鏡子市場）
- mock 資料用舊的單 key 形式（`{"alt": 11}` 隱含另一側 = 1），前端解析時缺側補 1 以保持兼容

**掛盤方向對應：**
- `chaos|X` 方向 → **掛買（bid）**：有人想用混沌石買 X
- `X|chaos` 方向 → **掛賣（ask）**：有人想賣 X 換混沌石

### `GET /leagues?type=main&realm=pc`（無需 auth）

用於取得當前賽季聯賽名稱（找 `category.current === true` 且非永久聯賽）。

---

## 通貨圖示

- 本地圖示：`public/res/img/{id}.png`（28 種常見通貨）
- 其他品項：使用 `poe_static.json` 中的 `/gen/image/...` 路徑，從 `www.pathofexile.tw` CDN 載入
- `scripts/download-imgs.py` 記錄了正確的 CDN 檔名對應，可重新執行下載

**已知 CDN 檔名陷阱：**
- `annul` → `AnnullOrb.png`（雙 l）
- `chance` → `CurrencyUpgradeRandomly.png`（不是 ToMagic）
- `transmute` → `CurrencyUpgradeToMagic.png`（不是 Shard）
- `gcp` → `CurrencyGemQuality.png`
- `regret` → `CurrencyPassiveSkillRefund.png`

---

## API 憑證設定

1. 前往 https://www.pathofexile.tw/developer/docs/ 申請 **Confidential Client**，scope 選 `service:cxapi`
2. 把 `CLIENT_ID` 與 `CLIENT_SECRET` 寫進專案根目錄的 `.env`（已 gitignore）
3. `server.py` 啟動時自動取 token，401 時自動重取；瀏覽器端不經手憑證

---

## 修改注意事項

- **每次改動 `assets/app.js` 或 `assets/style.css` 時，同步調高 `index.html` 裡的 `?v=N` 版本號**，避免瀏覽器快取舊版
- **改完掛單簿相關邏輯務必跑 `node scripts/test-orderbook.mjs`**（含真實快照樣本的回歸測試）
- `renderTabContent()` 是 tab 切換的入口，Currency tab 走 `renderHero()` + `renderCurrencyTab()`，其餘走 `renderGenericTab()`
- `getOrderBook(currency, base='chaos')` 是核心 helper，傳回 `{ bid, ask, vol, base }`；
  每側有 `levels[]`（≤5 個價位檔 `{price, stock}`，掛賣由低到高、掛買由高到低）與 `priceMin/priceMax`；
  價位檔由市場的 `history[]` 彙整（每小時最多 2 檔、同價位取最新庫存）
- 成交量用 `itemVolume()` / 目標通貨側，**兩側相加會重複計算**（19 顆崇高石換 19 混沌 = 19 筆不是 38）
- 卡片掛賣/掛買兩側獨立取簿：混沌石簿優先，缺的那側用神聖石簿補（`renderCurrencyCard`）
- 標價一律「1 個 : N 基準幣」（`ratioLabel`/`fmtAmount`），各基準行只在該配對市場真實有掛單時顯示
- Demo 模式的假資料在 `data/mock-currency-exchange.json`（舊單 key ratio 格式，解析時缺側補 1）
- **Sparkline 趨勢圖**：`priceHistory(pair, base, currency)` 從 `history[]` 提取逐小時最低報價；`sparklineSVG(pts, color)` 渲染 inline SVG 折線（< 2 個點回傳空字串）。Hero card 顯示混沌↔神聖石過去 N 小時走勢（`.hero-chart`），各通貨卡片底部附小型趨勢圖（`.card-chart`）

---

## GitHub Action

`.github/workflows/fetch-data.yml` 保留了使用 GitHub Secrets 呼叫 API 並 commit 資料的工作流程，**目前不排程**，僅供手動觸發（`workflow_dispatch`）備用。

需要設定的 Secrets：`POE_CLIENT_ID`、`POE_CLIENT_SECRET`
