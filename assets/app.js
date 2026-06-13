'use strict';

const MOCK_URL        = 'data/mock-currency-exchange.json';
const MOCK_PRICES_URL = 'data/mock-prices.json';
const STATIC_URL          = '/api/static';
const STATIC_FALLBACK_URL = 'poe_static.json';
const POE_CDN         = 'https://www.pathofexile.tw';
const CACHED_URL      = 'data/currency-exchange.json';

let isDemoMode    = false;
let currentLeague = 'Mirage';
let activeTab     = 'Currency';
let staticData    = null;
let allMarkets    = [];
let mockPrices    = null;
let staticNames   = {};    // id → 官方繁中名稱（來自 /api/static）
let chaosPerDiv   = null;  // 每顆神聖石值多少混沌石（由掛單簿推算）

// ── Local images we downloaded ────────────────────────────────────────────────
const LOCAL_IMGS = new Set([
  'chaos','divine','exalted','mirror','annul','ancient-orb','vaal','regal',
  'gcp','alch','fusing','alt','chrome','jewellers','chance','scour','regret',
  'blessed','transmute','aug','chisel','wisdom','portal','whetstone','scrap',
  'bauble','eternal','engineers',
]);

function imgSrc(entry) {
  if (!entry) return '';
  if (LOCAL_IMGS.has(entry.id)) return `public/res/img/${entry.id}.png`;
  if (entry.image) return POE_CDN + entry.image;
  return '';
}

// ── Tab label map ─────────────────────────────────────────────────────────────
const TAB_ZH = {
  Currency:       '通貨',
  Fragments:      '殘片 & 地圖',
  DjinnCoins:     '精靈幣',
  Keepers:        '腐蝕通貨',
  AllflameEmbers: '燃焰餘燼',
  Runegrafts:     '符文嫁接',
  Ancestor:       '刺青 & 預兆',
  Sanctum:        '禁地',
  Heist:          '搶劫',
  Expedition:     '遠征',
  DeliriumOrbs:   '幻象石',
  Catalysts:      '催化劑',
  Oils:           '油品',
  Incubators:     '孵化器',
  Delve:          '深淵',
  Essences:       '精華',
  Beasts:         '野獸',
  Cards:          '分裂卡',
  MapKey:         '地圖',
  MapsSpecial:    '特殊地圖',
  MapsUnique:     '傳奇地圖',
  Legacy:         '傳承',
};

// ── Currency ZH names ─────────────────────────────────────────────────────────
const CURRENCY_ZH = {
  'chaos':                '混沌石',
  'divine':               '神聖石',
  'exalted':              '崇高石',
  'mirror':               '卡蘭德之鏡',
  'annul':                '廢除石',
  'ancient-orb':          '古代石',
  'vaal':                 '瓦爾石',
  'regal':                '皇家石',
  'gcp':                  '鑄石師稜鏡',
  'alch':                 '點金石',
  'fusing':               '融合石',
  'alt':                  '改造石',
  'chrome':               '換色石',
  'chisel':               '地圖師的鑿子',
  'scour':                '洗鍊石',
  'regret':               '懊悔石',
  'blessed':              '祝福石',
  'jewellers':            '珠寶商的寶珠',
  'chance':               '機率石',
  'transmute':            '蛻變石',
  'aug':                  '強化石',
  'wisdom':               '辨識卷軸',
  'portal':               '傳送門卷軸',
  'whetstone':            '磨刀石',
  'scrap':                '鎧甲廢料',
  'bauble':               '玻璃吹製寶珠',
  'eternal':              '永恆石',
  'engineers':            '工程師的寶珠',
  'infused-engineers-orb':'注魔工程師寶珠',
  'orb-of-horizons':      '視界石',
  'harbingers-orb':       '先兆者的寶珠',
  'mirror-shard':         '鏡子碎片',
  'exalted-shard':        '崇高石碎片',
  'regal-shard':          '皇家石碎片',
  'chaos-shard':          '混沌石碎片',
  'alchemy-shard':        '點金石碎片',
  'alteration-shard':     '改造石碎片',
  'transmutation-shard':  '蛻變石碎片',
  'annulment-shard':      '廢除石碎片',
};

// 官方繁中名稱（/api/static）優先，寫死的對照表僅作 fallback
function currencyName(id) {
  return staticNames[id] || CURRENCY_ZH[id] || id;
}

// ── Currency sub-category grouping ────────────────────────────────────────────
const CURRENCY_GROUPS = [
  { id: 'high',  label: '高價通貨', currencies: ['exalted','mirror','annul','ancient-orb','eternal'] },
  { id: 'craft', label: '製作通貨', currencies: ['vaal','regal','gcp','alch','fusing','alt','chrome','jewellers','chance','scour','regret','blessed','transmute','aug','chisel','bauble'] },
  { id: 'misc',  label: '消耗品',   currencies: ['wisdom','portal','whetstone','scrap','engineers'] },
];

// ── League detection ──────────────────────────────────────────────────────────
async function fetchCurrentLeague() {
  try {
    const res = await fetch('/api/leagues');
    if (!res.ok) return;
    const json = await res.json();
    const leagues = Array.isArray(json) ? json : (json.result || json.leagues || []);
    const PERMANENT = new Set([
      '標準模式','專家模式','標準「自力」','專家「自力」',
      '殘暴','殘暴（專家）','殘暴「自力」','殘暴（專家）「自力」',
      'Standard','Hardcore','Solo Self-Found','Hardcore Solo Self-Found',
      'Ruthless','Hardcore Ruthless','SSF Ruthless','Hardcore SSF Ruthless',
    ]);
    const seasonal = leagues.find(l => (l.category?.current === true) && !PERMANENT.has(l.id));
    if (seasonal) {
      currentLeague = seasonal.id;
      document.querySelector('.realm-badge').textContent = `PC · PoE1 · ${currentLeague}`;
    }
  } catch { /* keep default */ }
}

// ── Static data ───────────────────────────────────────────────────────────────
async function loadStaticData() {
  for (const url of [STATIC_URL, STATIC_FALLBACK_URL]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      staticData = (json.result || []).filter(cat => cat.entries?.length > 0 && TAB_ZH[cat.id]);
      // TW API 的 text 是官方繁中名稱；本地 fallback 檔是英文，僅收錄含中日韓字元者
      staticNames = {};
      for (const cat of staticData) {
        for (const e of cat.entries) {
          if (e.id !== 'sep' && e.text && /[一-鿿]/.test(e.text)) staticNames[e.id] = e.text;
        }
      }
      return;
    } catch (e) {
      console.warn(`Could not load static data from ${url}:`, e);
    }
  }
}

async function loadMockPrices() {
  try {
    const res = await fetch(MOCK_PRICES_URL);
    if (!res.ok) return;
    mockPrices = await res.json();
  } catch (e) {
    console.warn('Could not load mock-prices.json:', e);
  }
}

// ── Main load ─────────────────────────────────────────────────────────────────
async function loadData(manual = false) {
  const btn       = document.getElementById('refresh-btn');
  const updatedEl = document.getElementById('last-updated');
  btn.disabled    = true;
  btn.textContent = '載入中...';
  updatedEl.textContent = '資料載入中...';

  try {
    let json;

    if (isDemoMode) {
      const url  = manual ? `${MOCK_URL}?t=${Date.now()}` : MOCK_URL;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`無法載入 mock 資料 (HTTP ${res.status})`);
      json = await res.json();
      if (!mockPrices) await loadMockPrices();
    } else {
      mockPrices = null;
      const res  = await fetch(manual ? `/api/exchange?t=${Date.now()}` : '/api/exchange');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`API 錯誤 ${res.status}：${body.detail || res.statusText}`);
      }
      json = await res.json();
    }

    allMarkets = (Array.isArray(json.markets) ? json.markets : [])
      .filter(m => m.league === currentLeague);
    chaosPerDiv = unitChaosPrice(getOrderBook('divine').ask)
               ?? unitChaosPrice(getOrderBook('divine').bid)
               ?? mockPrices?.chaosPerDivine ?? null;

    renderTabs();
    renderTabContent();
    renderStats();

    const parts = [];
    if (json.change_id)  parts.push(`資料快照 ${fmtTime(json.change_id)}`);
    parts.push(`抓取於 ${fmtTime(json.fetched_at ?? Math.floor(Date.now() / 1000))}`);
    updatedEl.textContent = (isDemoMode ? '[Demo] ' : '') + parts.join(' · ');

  } catch (err) {
    document.getElementById('tab-content').innerHTML = `<p class="error-msg">⚠ ${escHtml(err.message)}</p>`;
    updatedEl.textContent = '載入失敗';
    console.error(err);
  } finally {
    btn.disabled    = false;
    btn.textContent = '重新整理';
  }
  scheduleAutoRefresh();
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function renderTabs() {
  const nav  = document.getElementById('tab-nav');
  if (!staticData) { nav.innerHTML = ''; return; }

  nav.innerHTML = staticData.map(cat => {
    const label   = TAB_ZH[cat.id] || cat.label;
    const active  = cat.id === activeTab ? ' active' : '';
    const validN  = cat.entries.filter(e => e.id !== 'sep' && e.text).length;
    return `<button class="tab-btn${active}" onclick="switchTab('${cat.id}')" role="tab">${escHtml(label)}<span class="tab-count-badge">${validN}</span></button>`;
  }).join('');
}

function switchTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.tab-btn[onclick="switchTab('${tabId}')"]`)?.classList.add('active');
  document.getElementById('pair-search').value = '';
  renderTabContent();
}

// ── Tab content ───────────────────────────────────────────────────────────────
function renderTabContent() {
  const heroEl    = document.getElementById('hero-section');
  const contentEl = document.getElementById('tab-content');

  if (activeTab === 'Currency') {
    heroEl.style.display = '';
    renderHero();
    renderCurrencyTab(contentEl);
  } else {
    heroEl.style.display = 'none';
    heroEl.innerHTML     = '';
    renderGenericTab(contentEl);
  }
}

// ── Price helpers ─────────────────────────────────────────────────────────────
// 由掛單比率換算「1 單位 = X 混沌石」：
//   ratio key 是 chaos（如 divine 的 {chaos:185}）→ 直接就是混沌石單價
//   ratio key 是該通貨（如 {alt:11} = 11 個換 1 混沌石）→ 單價為倒數
// 取該側「最佳檔」價格（掛賣最便宜/掛買最高），換算成混沌石
function unitChaosPrice(side) {
  if (!side) return null;
  const p = side.levels?.[0]?.price ?? side.priceMin;
  if (!p) return null;
  if ((side.base || 'chaos') === 'chaos') return p;
  if (side.base === 'divine' && chaosPerDiv) return p * chaosPerDiv;
  return null;
}

// 標價規則：一律硬標註「1 基準幣 : N 個目標通貨」，基準幣固定為 1（整數），
// 小數只出現在目標通貨側
function fmtAmount(n) {
  if (n >= 100) return Math.round(n).toLocaleString();
  if (n >= 10)  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (n >= 1)   return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toPrecision(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function ratioLabel(price, baseZh) {
  // 以目標通貨 1 個為基準：「1 個 : N 基準幣」，小數出現在基準幣側
  return `1 <em>個</em> : ${fmtAmount(price)} <em>${baseZh}</em>`;
}

// 顯示以「實際掛單」為準：混沌石行/神聖石行各自來自真實配對市場的掛單價，
// 沒有該基準的實際掛單就不顯示那一行（不做匯率換算的假報價）
function priceBlockHtml(chaosP, divP) {
  if (chaosP == null && divP == null) return '';
  const lines = [];
  if (chaosP != null) lines.push(`<span class="gp-chaos">${ratioLabel(chaosP, '混沌石')}</span>`);
  if (divP   != null) lines.push(`<span class="gp-divine">${ratioLabel(divP, '神聖石')}</span>`);
  return `<div class="generic-price">${lines.join('')}</div>`;
}

// 取某基準幣配對的實際掛單價（掛賣最佳檔優先，否則掛買最佳檔）
function listedPrice(ob) {
  return ob.ask?.levels?.[0]?.price ?? ob.bid?.levels?.[0]?.price ?? null;
}

// ── 套利偵測（低買高賣）──────────────────────────────────────────────────────
// 把一側掛單的比率區間換算成「1 單位 = X 混沌石」的價格區間
function chaosPriceRange(side) {
  if (!side || !side.priceMin) return null;
  const f = (side.base || 'chaos') === 'chaos' ? 1
          : (side.base === 'divine' && chaosPerDiv ? chaosPerDiv : null);
  if (f == null) return null;
  return { min: side.priceMin * f, max: side.priceMax * f };
}

// 掃描所有與混沌石/神聖石配對的品項：
// 最便宜的掛賣（可直接買入）< 最高的掛買（可直接賣出）→ 有套利空間
function findArbitrage() {
  const ids = new Set();
  for (const m of allMarkets) {
    const [a, b] = m.market_id.split('|');
    if (a === 'chaos' || a === 'divine') ids.add(b);
    if (b === 'chaos' || b === 'divine') ids.add(a);
  }
  ids.delete('chaos'); ids.delete('divine');

  const out = [];
  for (const id of ids) {
    const obC = getOrderBook(id);
    const obD = getOrderBook(id, 'divine');
    const asks = [chaosPriceRange(obC.ask), chaosPriceRange(obD.ask)].filter(Boolean);
    const bids = [chaosPriceRange(obC.bid), chaosPriceRange(obD.bid)].filter(Boolean);
    if (!asks.length || !bids.length) continue;
    const buy  = Math.min(...asks.map(r => r.min));  // 吃最便宜的賣單
    const sell = Math.max(...bids.map(r => r.max));  // 餵最高的買單
    if (sell <= buy) continue;
    out.push({ id, buy, sell, profit: (sell - buy) / buy * 100 });
  }
  return out.sort((a, b) => b.profit - a.profit);
}

function renderArbitrageSection() {
  const arbs = findArbitrage();
  if (!arbs.length) return '';
  const rows = arbs.map(a => `<tr>
    <td class="arb-name">${escHtml(currencyName(a.id))}</td>
    <td class="arb-buy">${ratioLabel(a.buy, '混沌石')}</td>
    <td class="arb-sell">${ratioLabel(a.sell, '混沌石')}</td>
    <td class="arb-profit">+${a.profit.toFixed(1)}%</td>
  </tr>`).join('');
  return `<section class="category-section arb-section">
    <h2 class="category-title">套利機會（低買高賣）</h2>
    <table class="arb-table">
      <thead><tr><th>品項</th><th>買入價</th><th>賣出價</th><th>價差</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="arb-hint">※ 依最近快照的掛單區間估算（含神聖石配對換算），跨小時合併資料僅供參考，下單前請以遊戲內即時報價為準</p>
  </section>`;
}

// ── Order book helper ─────────────────────────────────────────────────────────
// ratio 物件同時帶兩側數量（如 {"chaos":11,"regret":10} = 11 混沌 : 10 後悔石）
// → 單價 = ratio[base] ÷ ratio[currency]，單位固定為「基準幣 / 1 個目標通貨」。
// mock 資料是單 key 形式，缺的一側視為 1。任一側為 0 = 該小時無成交 → 無報價。
function ratioPrice(ratioObj, base, currency) {
  if (!ratioObj) return null;
  if (!(base in ratioObj) && !(currency in ratioObj)) return null;
  const b = ratioObj[base]     ?? 1;
  const t = ratioObj[currency] ?? 1;
  if (!b || !t) return null;
  return b / t;
}

// ── Sparkline trend chart ─────────────────────────────────────────────────────
// 從 market 的 history[] 提取逐小時最低報價，回傳 [{hour, p}] 舊→新排序。
function priceHistory(pair, base, currency) {
  if (!pair) return [];
  const hist = pair.history?.length ? pair.history : [pair];
  return hist
    .map(h => {
      const p = ratioPrice(h.lowest_ratio, base, currency);
      return p != null ? { hour: h.hour ?? pair.snapshot_hour, p } : null;
    })
    .filter(Boolean);
}

// pts: [{hour, p}]。回傳 inline SVG 字串，< 2 個點時回傳空字串。
// viewBox 固定 240×40，CSS 控制實際渲染尺寸；preserveAspectRatio=none 橫向拉伸。
function sparklineSVG(pts, color = 'var(--gold)') {
  if (pts.length < 2) return '';
  const VW = 240, VH = 40, pad = 4;
  const vals = pts.map(x => x.p);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || lo * 0.05 || 1;
  const uw = VW - pad * 2, uh = VH - pad * 2;
  const coords = pts.map((x, i) => {
    const cx = pad + (i / (pts.length - 1)) * uw;
    const cy = pad + (1 - (x.p - lo) / range) * uh;
    return `${cx.toFixed(1)},${cy.toFixed(1)}`;
  }).join(' ');
  const lv = vals[vals.length - 1];
  const lx = (pad + uw).toFixed(1);
  const ly = (pad + (1 - (lv - lo) / range) * uh).toFixed(1);
  return `<svg viewBox="0 0 ${VW} ${VH}" class="sparkline" preserveAspectRatio="none" aria-hidden="true">` +
    `<polyline points="${coords}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${lx}" cy="${ly}" r="3" fill="${color}"/>` +
    `</svg>`;
}

// 從該市場的逐小時歷史蒐集價位檔：每小時最多兩檔（最佳/最差端點），
// 同一價位取最新一筆的庫存。API 不提供真掛單簿分檔，這是近期觀測到的價位。
function collectLevels(pair, base, currency) {
  const hist = pair.history?.length ? pair.history : [pair];
  const byPrice = new Map();
  for (const h of hist) {  // server 依時間由舊到新排序 → 後者覆蓋同價位
    for (const [rk, sk] of [['lowest_ratio', 'lowest_stock'], ['highest_ratio', 'highest_stock']]) {
      const price = ratioPrice(h[rk], base, currency);
      if (price == null) continue;
      const stockKey = currency in (h[sk] || {}) ? currency : base;
      byPrice.set(price.toPrecision(6), { price, stock: h[sk]?.[stockKey] ?? null });
    }
  }
  return [...byPrice.values()];
}

function getOrderBook(currency, base = 'chaos') {
  const bidPair = allMarkets.find(m => m.market_id === `${base}|${currency}`);
  const askPair = allMarkets.find(m => m.market_id === `${currency}|${base}`);

  function side(pair, kind) {
    if (!pair) return null;
    // 掛賣由低到高（最便宜優先）、掛買由高到低（出價最高優先），取前 5 檔
    const levels = collectLevels(pair, base, currency)
      .sort((a, b) => kind === 'ask' ? a.price - b.price : b.price - a.price)
      .slice(0, 5);
    if (!levels.length) return null;
    const prices = levels.map(l => l.price);
    return {
      priceMin: Math.min(...prices),
      priceMax: Math.max(...prices),
      levels,
      base,
    };
  }

  return {
    bid: side(bidPair, 'bid'),
    ask: side(askPair, 'ask'),
    // 成交量只取目標通貨側（兩側相加會重複計算：19 顆崇高石換 19 混沌石是 19 筆，不是 38）
    vol: (bidPair?.volume_traded?.[currency] ?? 0) + (askPair?.volume_traded?.[currency] ?? 0),
    base,
  };
}

// 混沌石配對找不到時，退而求其次用神聖石配對
function getOrderBookAny(currency) {
  const ob = getOrderBook(currency);
  if (ob.bid || ob.ask) return ob;
  return getOrderBook(currency, 'divine');
}

// 取得品項的混沌石單價（排序用；與神聖石價同序），沒有價格回傳 null
function currencyPriceOf(id) {
  const ob = getOrderBookAny(id);
  return unitChaosPrice(ob.ask) ?? unitChaosPrice(ob.bid)
      ?? mockPrices?.prices?.[id] ?? null;
}

function obRowHtml(side, tag, cls) {
  if (!side?.levels?.length) return '';
  const baseZh = escHtml(currencyName(side.base || 'chaos'));
  // 價位階梯：最多 5 檔，每檔「1 個 : N 基準幣」+ 該檔觀測到的掛單量
  const rows = side.levels.map(l => `<div class="ob-level">
      <span class="ob-price">${ratioLabel(l.price, baseZh)}</span>
      ${l.stock != null ? `<span class="ob-stock">${fmtK(l.stock)} <em>個</em></span>` : ''}
    </div>`).join('');
  return `<div class="ob-row ${cls}">
    <span class="ob-tag">${tag}</span>
    <div class="ob-vals">${rows}</div>
  </div>`;
}

// ── Currency tab ──────────────────────────────────────────────────────────────
function renderHero() {
  const heroEl = document.getElementById('hero-section');
  const ob = getOrderBook('divine');
  if (!ob.bid && !ob.ask) { heroEl.innerHTML = ''; return; }

  const divPair = allMarkets.find(m => m.market_id === 'chaos|divine');
  const chartPts = priceHistory(divPair, 'chaos', 'divine');
  const chartHtml = chartPts.length >= 2
    ? `<div class="hero-chart">
        <div class="hero-chart-label">過去 ${chartPts.length} 小時趨勢 · 混沌石/神聖石</div>
        ${sparklineSVG(chartPts)}
      </div>`
    : '';

  heroEl.innerHTML = `
    <div class="hero-card">
      <div class="hero-title">
        <img class="hero-icon" src="public/res/img/chaos.png" alt="混沌石" onerror="this.style.display='none'">
        <span class="hero-currency">混沌石</span>
        <span class="hero-divider">↔</span>
        <span class="hero-currency">神聖石</span>
        <img class="hero-icon" src="public/res/img/divine.png" alt="神聖石" onerror="this.style.display='none'">
      </div>
      <div class="hero-ob">
        ${obRowHtml(ob.ask, '掛賣', 'ask')}
        ${obRowHtml(ob.bid, '掛買', 'bid')}
      </div>
      <div class="hero-vol">成交量 ${ob.vol.toLocaleString()}</div>
      ${chartHtml}
    </div>`;
}

function renderCurrencyTab(el) {
  const search   = (document.getElementById('pair-search')?.value ?? '').toLowerCase().trim();
  const catEntry = staticData?.find(c => c.id === 'Currency');
  let html = '';

  if (!search) html += renderArbitrageSection();

  for (const grp of CURRENCY_GROUPS) {
    // 依神聖石等值價格由高到低排列（混沌石單價同序），沒有價格的排最後
    const cards = grp.currencies
      .filter(c => !search || c.includes(search) || currencyName(c).includes(search))
      .map(c => ({ c, price: currencyPriceOf(c) }))
      .sort((a, b) => (b.price ?? -1) - (a.price ?? -1))
      .map(x => renderCurrencyCard(x.c, catEntry))
      .filter(Boolean);
    if (!cards.length) continue;
    html += `<section class="category-section"><h2 class="category-title">${grp.label}</h2><div class="card-grid">${cards.join('')}</div></section>`;
  }

  const knownIds = new Set(CURRENCY_GROUPS.flatMap(g => g.currencies).concat(['chaos','divine']));
  if (catEntry) {
    const others = catEntry.entries.filter(e => {
      if (e.id === 'sep' || !e.text) return false;
      if (knownIds.has(e.id)) return false;
      if (search) {
        const zh = (staticNames[e.id] || CURRENCY_ZH[e.id] || itemName(e.id, e.text)).toLowerCase();
        if (!e.id.includes(search) && !e.text.toLowerCase().includes(search) && !zh.includes(search)) return false;
      }
      return true;
    });
    if (others.length) {
      // 同樣依價格排序；沒有價格的卡片保留但沉到最後
      const cards = others
        .map(e => ({ e, price: currencyPriceOf(e.id) }))
        .sort((a, b) => (b.price ?? -1) - (a.price ?? -1))
        .map(x => renderGenericCard(x.e));
      html += `<section class="category-section"><h2 class="category-title">其他通貨</h2><div class="card-grid">${cards.join('')}</div></section>`;
    }
  }

  const count = (html.match(/currency-card/g) || []).length;
  document.getElementById('tab-count').textContent = `${count} 個品項`;
  el.innerHTML = html || '<p class="empty-msg">沒有符合條件的資料</p>';
}

function renderCurrencyCard(currency, catEntry) {
  const obC = getOrderBook(currency);
  const obD = getOrderBook(currency, 'divine');
  // 掛賣/掛買各自獨立取簿：混沌石簿優先，缺的那側用神聖石簿補，
  // 兩側可同時顯示（各列會標注自己的基準幣）
  const ask = obC.ask ?? obD.ask;
  const bid = obC.bid ?? obD.bid;
  if (!ask && !bid) return null;

  const entry = catEntry?.entries.find(e => e.id === currency);
  const src   = entry ? imgSrc(entry) : `public/res/img/${currency}.png`;
  const name  = currencyName(currency);

  const askPair = allMarkets.find(m => m.market_id === `${currency}|chaos`);
  const bidPair = allMarkets.find(m => m.market_id === `chaos|${currency}`);
  const trendPair = (askPair?.history?.length ?? 0) >= (bidPair?.history?.length ?? 0) ? askPair : bidPair;
  const trendPts = priceHistory(trendPair, 'chaos', currency);
  const sparkline = trendPts.length >= 2 ? `<div class="card-chart">${sparklineSVG(trendPts, 'var(--accent-light)')}</div>` : '';

  return `<div class="currency-card" title="${escHtml(currency)}">
    <div class="card-header">
      <img class="card-icon" src="${escHtml(src)}" alt="${escHtml(name)}" onerror="this.style.display='none'">
      <div class="card-name">${escHtml(name)}</div>
    </div>
    ${priceBlockHtml(listedPrice(obC), listedPrice(obD))}
    <div class="orderbook">
      ${obRowHtml(ask, '掛賣', 'ask')}
      ${obRowHtml(bid, '掛買', 'bid')}
    </div>
    <div class="card-vol">成交量 ${fmtK(obC.vol + obD.vol)}</div>
    ${sparkline}
  </div>`;
}

// ── Generic tab ───────────────────────────────────────────────────────────────
function renderGenericTab(el) {
  const cat    = staticData?.find(c => c.id === activeTab);
  const search = (document.getElementById('pair-search')?.value ?? '').toLowerCase().trim();
  if (!cat) { el.innerHTML = '<p class="empty-msg">分類資料載入中...</p>'; return; }

  const valid = cat.entries.filter(e => e.id !== 'sep' && e.text);
  const entries = valid.filter(e => {
    if (!search) return true;
    const zh = (staticNames[e.id] || itemName(e.id, e.text)).toLowerCase();
    return e.id.includes(search) || e.text.toLowerCase().includes(search) || zh.includes(search);
  });

  document.getElementById('tab-count').textContent = `${entries.length} / ${valid.length} 個品項`;
  if (!entries.length) { el.innerHTML = '<p class="empty-msg">沒有符合條件的資料</p>'; return; }

  el.innerHTML = `<div class="card-grid generic">${entries.map(e => renderGenericCard(e)).join('')}</div>`;
}

function renderGenericCard(entry) {
  const src  = imgSrc(entry);
  const name = staticNames[entry.id] || CURRENCY_ZH[entry.id] || itemName(entry.id, entry.text);

  // 即時模式：各基準幣行只顯示「實際掛單」的價格；Demo 模式才用 mock 價格表
  const obC  = getOrderBook(entry.id);
  const obD  = getOrderBook(entry.id, 'divine');
  let chaosP = listedPrice(obC);
  let divP   = listedPrice(obD);
  if (chaosP == null && divP == null && mockPrices?.prices?.[entry.id] != null) {
    chaosP = mockPrices.prices[entry.id];
    if (mockPrices.chaosPerDivine) divP = chaosP / mockPrices.chaosPerDivine;
  }
  const priceHtml = priceBlockHtml(chaosP, divP);

  return `<div class="currency-card generic-card" title="${escHtml(entry.id)}">
    <div class="card-header">
      ${src ? `<img class="card-icon" src="${escHtml(src)}" alt="${escHtml(name)}" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="card-name">${escHtml(name)}</div>
    </div>
    ${priceHtml}
  </div>`;
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function renderStats() {
  const bar      = document.getElementById('stats-bar');
  const totalVol = allMarkets.reduce((s, m) => s + itemVolume(m), 0);
  const pairs    = new Set(allMarkets.map(m => m.market_id.split('|').sort().join('|'))).size;

  bar.innerHTML = [
    stat('聯賽', currentLeague),
    stat('交易對數', pairs.toLocaleString()),
    stat('總交易量', totalVol.toLocaleString()),
    staticData ? stat('靜態分類', staticData.length.toLocaleString()) : '',
  ].join('');
}

function stat(label, value) {
  return `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────
let refreshTimer = null, countdownTimer = null, nextRefreshAt = null;

function scheduleAutoRefresh() {
  clearTimeout(refreshTimer);
  clearInterval(countdownTimer);
  const minutes     = parseInt(document.getElementById('refresh-interval')?.value ?? '0', 10);
  const countdownEl = document.getElementById('countdown');
  if (!minutes) { if (countdownEl) countdownEl.textContent = ''; return; }
  const ms = minutes * 60 * 1000;
  nextRefreshAt  = Date.now() + ms;
  refreshTimer   = setTimeout(() => loadData(false), ms);
  countdownTimer = setInterval(() => {
    const rem = Math.max(0, nextRefreshAt - Date.now());
    const m   = Math.floor(rem / 60000);
    const s   = Math.floor((rem % 60000) / 1000);
    if (countdownEl) countdownEl.textContent = `下次刷新 ${m}:${s.toString().padStart(2,'0')}`;
  }, 1000);
}

document.getElementById('refresh-interval').addEventListener('change', scheduleAutoRefresh);

// ── Settings modal ────────────────────────────────────────────────────────────
function openSettings() {
  document.getElementById('settings-overlay').classList.remove('hidden');
}
function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
}
function closeSettingsOnOverlay(e) {
  if (e.target === document.getElementById('settings-overlay')) closeSettings();
}
function useDemo()     { isDemoMode = true;  closeSettings(); loadData(); }
function useRealData() { isDemoMode = false; closeSettings(); loadData(); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtN(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString();
}
function fmtTime(unixSec) {
  return new Date(unixSec * 1000).toLocaleTimeString('zh-TW', { hour12: false });
}
// 市場的成交量：取「品項側」（非基準幣側）的幣量，避免兩側相加重複計算；
// chaos|divine 這種雙基準市場取神聖石側
function itemVolume(m) {
  const [a, b] = m.market_id.split('|');
  const v = m.volume_traded || {};
  const BASES = new Set(['chaos', 'divine']);
  let key;
  if (!BASES.has(a))      key = a;
  else if (!BASES.has(b)) key = b;
  else                    key = a === 'divine' ? a : b;
  return v[key] ?? 0;
}
function fmtK(v) {
  if (v >= 1000000) return (v/1000000).toFixed(1) + 'M';
  if (v >= 1000)    return (v/1000).toFixed(1) + 'K';
  return String(v);
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
Promise.all([fetchCurrentLeague(), loadStaticData()]).then(() => {
  renderTabs();
  loadData();
});
