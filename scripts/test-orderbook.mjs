// 驗證 app.js 的掛單簿解析：用真實快照樣本（後悔石、鏡子、神聖石）對照期望值
// 執行：node scripts/test-orderbook.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const stubEl = () => ({
  addEventListener() {}, classList: { add() {}, remove() {} },
  style: {}, value: '0', textContent: '', innerHTML: '', disabled: false,
});
const ctx = vm.createContext({
  document: { getElementById: stubEl, querySelector: () => null, querySelectorAll: () => [] },
  fetch: async () => ({ ok: false, json: async () => ({}) }),
  console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise,
});
vm.runInContext(readFileSync(new URL('../assets/zh-names.js', import.meta.url), 'utf8'), ctx);
vm.runInContext(readFileSync(new URL('../assets/app.js',    import.meta.url), 'utf8'), ctx);

// ── 真實快照樣本（遠古蜃景，2026-06 實測）────────────────────────────────────
const SAMPLES = [
  { league: 'L', market_id: 'chaos|regret',
    volume_traded: { chaos: 495, regret: 450 },
    lowest_stock:  { chaos: 10, regret: 9347 }, highest_stock: { chaos: 10, regret: 9347 },
    lowest_ratio:  { chaos: 11, regret: 10 },   highest_ratio: { chaos: 11, regret: 10 } },
  { league: 'L', market_id: 'divine|regret',
    volume_traded: { divine: 1, regret: 401 },
    lowest_stock:  { divine: 0, regret: 15226 }, highest_stock: { divine: 0, regret: 15226 },
    lowest_ratio:  { divine: 1, regret: 401 },   highest_ratio: { divine: 1, regret: 401 } },
  { league: 'L', market_id: 'mirror|divine',
    volume_traded: { mirror: 0, divine: 0 },
    lowest_stock:  { mirror: 13, divine: 2604 }, highest_stock: { mirror: 14, divine: 2604 },
    lowest_ratio:  { mirror: 0, divine: 0 },     highest_ratio: { mirror: 0, divine: 0 } },
  { league: 'L', market_id: 'chaos|divine',
    volume_traded: { chaos: 10000, divine: 54 },
    lowest_stock:  { chaos: 500, divine: 3 },    highest_stock: { chaos: 500, divine: 3 },
    lowest_ratio:  { chaos: 185, divine: 1 },    highest_ratio: { chaos: 190, divine: 1 } },
  // mock 舊格式：單 key、隱含另一側 = 1
  { league: 'L', market_id: 'alt|chaos',
    volume_traded: { alt: 1100 },
    lowest_stock:  { alt: 900 }, highest_stock: { alt: 900 },
    lowest_ratio:  { alt: 11 },  highest_ratio: { alt: 12 } },
  { league: 'L', market_id: 'chaos|exalted',
    volume_traded: { chaos: 19, exalted: 19 },
    lowest_stock:  { chaos: 15486, exalted: 1662 }, highest_stock: { chaos: 15505, exalted: 1662 },
    lowest_ratio:  { chaos: 1, exalted: 1 },        highest_ratio: { chaos: 1, exalted: 1 },
    history: [
      { hour: 1, lowest_ratio: { chaos: 1, exalted: 1 }, highest_ratio: { chaos: 2, exalted: 1 },
        lowest_stock: { exalted: 500 },  highest_stock: { exalted: 600 } },
      { hour: 2, lowest_ratio: { chaos: 4, exalted: 1 }, highest_ratio: { chaos: 4, exalted: 1 },
        lowest_stock: { exalted: 100 },  highest_stock: { exalted: 100 } },
      { hour: 3, lowest_ratio: { chaos: 1, exalted: 1 }, highest_ratio: { chaos: 1, exalted: 1 },
        lowest_stock: { exalted: 1662 }, highest_stock: { exalted: 1662 } },
    ] },
];

vm.runInContext('allMarkets = ' + JSON.stringify(SAMPLES) + '; chaosPerDiv = 185;', ctx);

let failed = 0;
function check(name, expr, expected, tol = 1e-9) {
  const got = vm.runInContext(expr, ctx);
  const ok  = expected === null ? got === null : Math.abs(got - expected) < tol;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${expr} => ${got} (期望 ${expected})`);
  if (!ok) failed++;
}

// 後悔石掛買（chaos|regret 11:10）= 1.1 混沌石/顆
check('後悔石 chaos 掛買', `getOrderBook('regret').bid.priceMin`, 1.1);
// 後悔石 divine 掛買（1 divine : 401 regret）→ 換算 185/401 ≈ 0.4613 混沌石/顆
check('後悔石 divine 掛買換算', `unitChaosPrice(getOrderBook('regret','divine').bid)`, 185 / 401);
// 鏡子：ratio 全 0 = 無報價（不能變成價格 0）
check('鏡子 ratio=0 → 無報價', `getOrderBook('mirror','divine').ask`, null);
// 神聖石（chaos|divine 185~190:1）
check('神聖石掛買下限', `getOrderBook('divine').bid.priceMin`, 185);
check('神聖石掛買上限', `getOrderBook('divine').bid.priceMax`, 190);
// mock 舊格式：alt|chaos {"alt":11} = 11 個換 1 混沌 → 1/11 混沌石/顆
check('mock 單 key 兼容', `getOrderBook('alt').ask.priceMin`, 1 / 12);
check('mock 單 key 兼容(max)', `getOrderBook('alt').ask.priceMax`, 1 / 11);
// currencyPriceOf 整合（後悔石應取 chaos 掛買 1.1 — 無掛賣時 fallback 掛買）
check('currencyPriceOf 後悔石', `currencyPriceOf('regret')`, 1.1);
// 成交量只取目標通貨側：19 顆崇高石換手，不是 19+19=38
check('崇高石成交量不重複計算', `getOrderBook('exalted').vol`, 19);
// 五檔：歷史 3 小時去重後有 1/2/4 三個價位；掛買由高到低 → [4,2,1]
check('崇高石掛買檔數', `getOrderBook('exalted').bid.levels.length`, 3);
check('崇高石掛買第1檔(最高價)', `getOrderBook('exalted').bid.levels[0].price`, 4);
check('崇高石掛買第3檔(最低價)', `getOrderBook('exalted').bid.levels[2].price`, 1);
// 同價位（1 混沌）取最新一筆庫存：hour3 的 1662 蓋過 hour1 的 500
check('同價位取最新庫存', `getOrderBook('exalted').bid.levels[2].stock`, 1662);
// itemVolume：chaos|divine 取神聖石側
check('itemVolume 雙基準市場', `itemVolume({ market_id: 'chaos|divine', volume_traded: { chaos: 5474, divine: 11 } })`, 11);

process.exit(failed ? 1 : 0);
