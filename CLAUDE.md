# CLAUDE.md — POE Trade Dashboard

## 專案意圖

這是一個部署在 GitHub Pages 的靜態儀表板，用於瀏覽 Path of Exile（PoE1，PC realm）的通貨交易所即時資料。

**核心目標：**
- 用「五檔報價」風格（掛買/掛賣 + 庫存）展示通貨交易所的買賣盤
- 混沌石（Chaos Orb）與神聖石（Divine Orb）是兩大計價基準，用顯眼的 Hero card 呈現
- 通貨按種類（高價通貨、製作通貨、消耗品）分組顯示
- 支援 `poe_static.json` 所有 22 個靜態分類，用分頁（tabs）切換
- 無後端服務：資料直接從瀏覽器呼叫官方 API，或使用 Demo 模式載入本地假資料

---

## 架構

```
poe-trade-dashboard/
├── index.html                    # 主頁面，包含 tab nav、settings modal
├── assets/
│   ├── app.js                    # 全部邏輯：API 呼叫、渲染、tab 切換
│   └── style.css                 # POE 黑金主題，含 tab bar、orderbook 卡片
├── public/res/img/               # 本地通貨圖示（28 個 PNG，以 currency ID 命名）
├── data/
│   └── mock-currency-exchange.json  # Demo 模式假資料（模擬 API 回應格式）
├── poe_static.json               # POE 官方貿易靜態資料（102+ 通貨、22 分類）
├── scripts/
│   └── download-imgs.py          # 一次性工具：從 POE CDN 批次下載通貨圖示
└── .github/workflows/
    └── fetch-data.yml            # 手動觸發的 GitHub Action（不排程）
```

---

## 資料流

### 真實模式（需要 API 憑證）

```
瀏覽器啟動
  → fetchCurrentLeague()     GET api.pathofexile.tw/leagues  （無需 auth）
  → loadStaticData()         fetch poe_static.json            （本地靜態檔）
  → getToken()               POST api.pathofexile.tw/oauth/token  （client_credentials）
  → fetchCurrencyExchange()  GET api.pathofexile.tw/currency-exchange
  → allMarkets.filter(league === currentLeague)
  → render()
```

### Demo 模式（無憑證時自動啟用）

```
瀏覽器啟動
  → fetchCurrentLeague()     GET api.pathofexile.tw/leagues
  → loadStaticData()         fetch poe_static.json
  → fetch data/mock-currency-exchange.json
  → render()
```

---

## 重要 API 說明

### `GET /currency-exchange`（需要 `service:cxapi` scope）

回傳當前小時的通貨交易所資料，欄位含義：

| 欄位 | 說明 |
|------|------|
| `market_id` | `"賣出貨幣\|買入貨幣"`，例如 `"chaos\|divine"` |
| `volume_traded` | 本小時各幣種的成交量 |
| `lowest_ratio` | 最優掛單比率（買方最佳價格） |
| `highest_ratio` | 最差掛單比率（買方最差價格） |
| `lowest_stock` | 最小單筆掛單庫存量 |
| `highest_stock` | 最大單筆掛單庫存量 |

**比率格式規則：**
- ratio key 固定為「數量較多」的那側貨幣
- `chaos|divine` → `{"chaos": 185}` = 185 混沌石換 1 神聖石
- `alt|chaos` → `{"alt": 11}` = 11 改造石換 1 混沌石

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
2. 取得 `client_id` 與 `client_secret`
3. 在頁面右上角 ⚙ 設定面板輸入憑證 → 儲存於 `localStorage`（不上傳至任何伺服器）
4. Token 自動快取於 `localStorage`，401 時重新申請

---

## 修改注意事項

- **每次改動 `assets/app.js` 或 `assets/style.css` 時，同步調高 `index.html` 裡的 `?v=N` 版本號**，避免瀏覽器快取舊版
- `renderTabContent()` 是 tab 切換的入口，Currency tab 走 `renderHero()` + `renderCurrencyTab()`，其餘走 `renderGenericTab()`
- `getOrderBook(currency)` 是取得掛買/掛賣資料的核心 helper，傳回 `{ bid, ask, vol }`
- Demo 模式的假資料在 `data/mock-currency-exchange.json`，ratio key 必須遵守「數量較多側」規則
- `poe_static.json` 放在 repo 根目錄，GitHub Pages 直接以 `fetch('poe_static.json')` 存取

---

## GitHub Action

`.github/workflows/fetch-data.yml` 保留了使用 GitHub Secrets 呼叫 API 並 commit 資料的工作流程，**目前不排程**，僅供手動觸發（`workflow_dispatch`）備用。

需要設定的 Secrets：`POE_CLIENT_ID`、`POE_CLIENT_SECRET`
