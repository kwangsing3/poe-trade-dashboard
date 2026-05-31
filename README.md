# POE Trade Dashboard

Path of Exile 通貨交易所即時儀表板，部署於 GitHub Pages。

**Live:** https://kwangsing3.github.io/poe-trade-dashboard/

---

## 功能

- **混沌石 ↔ 神聖石 Hero Card**：顯眼呈現兩大計價基準的即時比率
- **掛買/掛賣報價**：以五檔報價風格顯示價格區間與庫存量
- **22 個物品分類**：通貨、殘片、精華、分裂卡、地圖… 均以標籤分頁呈現
- **繁體中文介面**：通貨名稱翻譯對照，支援中文搜尋
- **自動刷新**：可設定 5 / 15 / 30 / 60 分鐘定時重新整理
- **Demo 模式**：無需 API 憑證即可預覽，使用本地假資料

---

## 快速開始

### Demo 模式（無需任何設定）

直接開啟網頁即可，自動進入 Demo 模式，顯示本地假資料。

### 真實資料模式

1. 前往 [pathofexile.com/developer](https://www.pathofexile.com/developer/docs/) 申請 API 應用
   - 類型：**Confidential Client**
   - Scope：`service:cxapi`
2. 取得 `client_id` 與 `client_secret`
3. 點選頁面右上角 ⚙ → 輸入憑證 → 儲存並載入

憑證儲存於瀏覽器 `localStorage`，不會傳送至任何第三方。

---

## 讀懂報價卡片

```
┌────────────────────────────────┐
│ [img]  崇高石                   │
│                                │
│ 掛賣  80 ~ 92 混沌石             │  ← 有人在賣崇高石（你可買入）
│       庫存 8 ~ 75 崇高石         │
│                                │
│ 掛買  78 ~ 95 混沌石             │  ← 有人想買崇高石（你可賣出）
│       庫存 2K ~ 28K 混沌石       │
│                                │
│ 成交量 39K                       │
└────────────────────────────────┘
```

| 欄位 | 說明 |
|------|------|
| **掛賣（紅）** | 市場上有人正在賣出這個通貨，價格區間為最低～最高掛單 |
| **掛買（綠）** | 市場上有人正在用混沌石買入這個通貨 |
| **庫存** | 最小～最大單筆掛單量，反映市場深度 |
| **成交量** | 本小時兩側合計成交量 |

---

## 資料來源

- **交易所資料**：[Path of Exile Currency Exchange API](https://www.pathofexile.com/developer/docs/reference#currencyexchange)（每小時更新，有 5 分鐘延遲）
- **品項靜態資料**：[POE Trade Static API](https://www.pathofexile.com/api/trade/data/static)
- **通貨圖示**：web.poecdn.com（Grinding Gear Games 官方 CDN）

---

## 專案結構

```
poe-trade-dashboard/
├── index.html                       # 主頁面
├── assets/
│   ├── app.js                       # 全部前端邏輯
│   └── style.css                    # POE 黑金主題
├── public/res/img/                  # 本地通貨圖示（28 個 PNG）
├── data/mock-currency-exchange.json # Demo 假資料
├── poe_static.json                  # POE 靜態品項資料（22 分類）
├── scripts/download-imgs.py         # 通貨圖示下載工具
└── .github/workflows/fetch-data.yml # 手動 GitHub Action（備用）
```

開發說明詳見 [CLAUDE.md](./CLAUDE.md)。

---

## License

本專案為非官方工具，與 Grinding Gear Games 無關。Path of Exile 及所有遊戲素材版權歸 Grinding Gear Games 所有。
