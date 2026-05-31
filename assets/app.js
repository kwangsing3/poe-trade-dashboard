'use strict';

const API_BASE   = 'https://api.pathofexile.com';
const TOKEN_URL  = `${API_BASE}/oauth/token`;
const CX_URL     = `${API_BASE}/currency-exchange`;
const STORE_KEY  = 'poe_cx_creds';
const TOKEN_KEY  = 'poe_cx_token';
const MOCK_URL   = 'data/mock-currency-exchange.json';
const STATIC_URL = 'poe_static.json';
const POE_CDN    = 'https://www.pathofexile.com';

let isDemoMode    = false;
let currentLeague = 'Mirage';
let activeTab     = 'Currency';
let staticData    = null;   // poe_static.json result array
let allMarkets    = [];

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

function currencyName(id) {
  return CURRENCY_ZH[id] || id;
}

// ── Currency sub-category grouping ────────────────────────────────────────────
const CURRENCY_GROUPS = [
  { id: 'high',  label: '高價通貨', currencies: ['exalted','mirror','annul','ancient-orb','eternal'] },
  { id: 'craft', label: '製作通貨', currencies: ['vaal','regal','gcp','alch','fusing','alt','chrome','jewellers','chance','scour','regret','blessed','transmute','aug','chisel','bauble'] },
  { id: 'misc',  label: '消耗品',   currencies: ['wisdom','portal','whetstone','scrap','engineers'] },
];

// ── Credentials ───────────────────────────────────────────────────────────────
function getCreds() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
}
function saveCreds(id, secret) {
  localStorage.setItem(STORE_KEY, JSON.stringify({ clientId: id, clientSecret: secret }));
}
function clearCredsAndToken() {
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

// ── League detection ──────────────────────────────────────────────────────────
async function fetchCurrentLeague() {
  try {
    const res = await fetch(`${API_BASE}/leagues?type=main&realm=pc&limit=20`);
    if (!res.ok) return;
    const json = await res.json();
    const leagues = Array.isArray(json) ? json : (json.result || json.leagues || []);
    const PERMANENT = new Set(['Standard','Hardcore','Solo Self-Found','Hardcore Solo Self-Found',
      'Ruthless','Hardcore Ruthless','SSF Ruthless','Hardcore SSF Ruthless']);
    const seasonal = leagues.find(l => (l.category?.current === true) && !PERMANENT.has(l.id));
    if (seasonal) {
      currentLeague = seasonal.id;
      document.querySelector('.realm-badge').textContent = `PC · PoE1 · ${currentLeague}`;
    }
  } catch { /* keep default */ }
}

// ── Static data ───────────────────────────────────────────────────────────────
async function loadStaticData() {
  try {
    const res = await fetch(STATIC_URL);
    if (!res.ok) return;
    const json = await res.json();
    staticData = (json.result || []).filter(cat => cat.entries?.length > 0 && TAB_ZH[cat.id]);
  } catch (e) {
    console.warn('Could not load poe_static.json:', e);
  }
}

// ── OAuth token ───────────────────────────────────────────────────────────────
async function getToken(force = false) {
  if (!force) {
    const cached = localStorage.getItem(TOKEN_KEY);
    if (cached) return cached;
  }
  const creds = getCreds();
  if (!creds) throw new Error('未設定 API 憑證');
  const body = new URLSearchParams({
    client_id: creds.clientId, client_secret: creds.clientSecret,
    grant_type: 'client_credentials', scope: 'service:cxapi',
  });
  const res  = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`取得 Token 失敗：${json.error_description || json.error || `HTTP ${res.status}`}`);
  localStorage.setItem(TOKEN_KEY, json.access_token);
  return json.access_token;
}

// ── Exchange data fetch ───────────────────────────────────────────────────────
async function fetchCurrencyExchange(token) {
  const res = await fetch(CX_URL, { headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'poe-trade-dashboard/1.0' } });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    return fetchCurrencyExchange(await getToken(true));
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API 回傳 HTTP ${res.status}${text ? '：' + text.slice(0, 120) : ''}`);
  }
  return res.json();
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
    if (isDemoMode || !getCreds()) {
      isDemoMode = true;
      const res  = await fetch(manual ? `${MOCK_URL}?t=${Date.now()}` : MOCK_URL);
      if (!res.ok) throw new Error(`無法載入 mock 資料 (HTTP ${res.status})`);
      json = await res.json();
    } else {
      json = await fetchCurrencyExchange(await getToken(manual));
    }

    allMarkets = (Array.isArray(json.markets) ? json.markets : [])
      .filter(m => m.league === currentLeague);

    renderTabs();
    renderTabContent();
    renderStats();

    const prefix = isDemoMode ? '[Demo] 上次更新：' : '上次更新：';
    updatedEl.textContent = prefix + new Date().toLocaleTimeString('zh-TW');

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
    const label = TAB_ZH[cat.id] || cat.label;
    const active = cat.id === activeTab ? ' active' : '';
    return `<button class="tab-btn${active}" onclick="switchTab('${cat.id}')" role="tab">${escHtml(label)}<span class="tab-count-badge">${cat.entries.length}</span></button>`;
  }).join('');
}

function switchTab(tabId) {
  activeTab = tabId;
  // Update active class
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelector(`.tab-btn[onclick="switchTab('${tabId}')"]`)?.classList.add('active');
  // Clear search
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

// ── Currency tab ──────────────────────────────────────────────────────────────
function renderHero() {
  const heroEl = document.getElementById('hero-section');
  const buy    = allMarkets.find(m => m.market_id === 'chaos|divine');
  const sell   = allMarkets.find(m => m.market_id === 'divine|chaos');
  if (!buy && !sell) { heroEl.innerHTML = ''; return; }

  const buyMin  = buy  ? getVal(buy.lowest_ratio,  'chaos') : null;
  const buyMax  = buy  ? getVal(buy.highest_ratio, 'chaos') : null;
  const sellMin = sell ? getVal(sell.lowest_ratio,  'chaos') : null;
  const sellMax = sell ? getVal(sell.highest_ratio, 'chaos') : null;
  const totalVol = (buy ? sumVolume(buy) : 0) + (sell ? sumVolume(sell) : 0);

  heroEl.innerHTML = `
    <div class="hero-card">
      <div class="hero-title">
        <img class="hero-icon" src="public/res/img/chaos.png" alt="混沌石" onerror="this.style.display='none'">
        <span class="hero-currency">混沌石</span>
        <span class="hero-divider">↔</span>
        <span class="hero-currency">神聖石</span>
        <img class="hero-icon" src="public/res/img/divine.png" alt="神聖石" onerror="this.style.display='none'">
      </div>
      <div class="hero-rates">
        ${buyMin  != null ? `<div class="hero-rate-row"><span class="rate-dir">買入神聖石</span><span class="rate-val">${buyMin}${buyMax !== buyMin ? ' ~ ' + buyMax : ''}</span><span class="rate-unit">混沌石</span></div>` : ''}
        ${sellMin != null ? `<div class="hero-rate-row"><span class="rate-dir">賣出神聖石</span><span class="rate-val">${sellMin}${sellMax !== sellMin ? ' ~ ' + sellMax : ''}</span><span class="rate-unit">混沌石</span></div>` : ''}
      </div>
      <div class="hero-vol">成交量 ${totalVol.toLocaleString()}</div>
    </div>`;
}

function renderCurrencyTab(el) {
  const search   = (document.getElementById('pair-search')?.value ?? '').toLowerCase().trim();
  const catEntry = staticData?.find(c => c.id === 'Currency');
  let html = '';

  // Known groups with exchange data
  for (const grp of CURRENCY_GROUPS) {
    const cards = grp.currencies
      .filter(c => !search || c.includes(search) || currencyName(c).includes(search))
      .map(c => renderCurrencyCard(c, catEntry))
      .filter(Boolean);
    if (!cards.length) continue;
    html += `<section class="category-section"><h2 class="category-title">${grp.label}</h2><div class="card-grid">${cards.join('')}</div></section>`;
  }

  // Other currencies from poe_static.json not in our groups
  const knownIds = new Set(CURRENCY_GROUPS.flatMap(g => g.currencies).concat(['chaos','divine']));
  if (catEntry) {
    const others = catEntry.entries.filter(e => {
      if (knownIds.has(e.id)) return false;
      if (search && !e.id.includes(search) && !e.text.toLowerCase().includes(search) && !(CURRENCY_ZH[e.id]||'').includes(search)) return false;
      return true;
    });
    if (others.length) {
      const cards = others.map(e => renderGenericCard(e));
      html += `<section class="category-section"><h2 class="category-title">其他通貨</h2><div class="card-grid">${cards.join('')}</div></section>`;
    }
  }

  const count = (html.match(/currency-card/g) || []).length;
  document.getElementById('tab-count').textContent = `${count} 個品項`;
  el.innerHTML = html || '<p class="empty-msg">沒有符合條件的資料</p>';
}

function renderCurrencyCard(currency, catEntry) {
  const price = getChaosPrice(currency);
  if (!price) return null;

  const entry = catEntry?.entries.find(e => e.id === currency);
  const src   = entry ? imgSrc(entry) : `public/res/img/${currency}.png`;
  const name  = currencyName(currency);
  const vol   = getCurrencyVolume(currency);

  let priceHtml;
  if (price.type === 'per-unit') {
    const range = price.min === price.max ? `${price.min}` : `${price.min} ~ ${price.max}`;
    priceHtml = `<div class="card-price per-unit"><span class="price-eq">≈</span><span class="price-val">${range}</span><span class="price-unit">混沌石</span></div>`;
  } else {
    const range = price.min === price.max ? `${price.min}` : `${price.min} ~ ${price.max}`;
    priceHtml = `<div class="card-price bulk"><span class="price-val">${range}</span><span class="price-unit">枚 = 1 混沌石</span></div>`;
  }

  return `<div class="currency-card" title="${escHtml(currency)}">
    <div class="card-header">
      <img class="card-icon" src="${escHtml(src)}" alt="${escHtml(name)}" onerror="this.style.display='none'">
      <div class="card-name">${escHtml(name)}</div>
    </div>
    ${priceHtml}
    <div class="card-vol">成交量 ${fmtK(vol)}</div>
  </div>`;
}

// ── Generic tab ───────────────────────────────────────────────────────────────
function renderGenericTab(el) {
  const cat    = staticData?.find(c => c.id === activeTab);
  const search = (document.getElementById('pair-search')?.value ?? '').toLowerCase().trim();
  if (!cat) { el.innerHTML = '<p class="empty-msg">分類資料載入中...</p>'; return; }

  const entries = cat.entries.filter(e => {
    if (!search) return true;
    return e.id.includes(search) || e.text.toLowerCase().includes(search);
  });

  document.getElementById('tab-count').textContent = `${entries.length} / ${cat.entries.length} 個品項`;
  if (!entries.length) { el.innerHTML = '<p class="empty-msg">沒有符合條件的資料</p>'; return; }

  el.innerHTML = `<div class="card-grid generic">${entries.map(e => renderGenericCard(e)).join('')}</div>`;
}

function renderGenericCard(entry) {
  const src  = imgSrc(entry);
  const name = CURRENCY_ZH[entry.id] || entry.text || entry.id;
  return `<div class="currency-card generic-card" title="${escHtml(entry.id)}">
    <div class="card-header">
      ${src ? `<img class="card-icon" src="${escHtml(src)}" alt="${escHtml(name)}" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="card-name">${escHtml(name)}</div>
    </div>
  </div>`;
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function renderStats() {
  const bar      = document.getElementById('stats-bar');
  const totalVol = allMarkets.reduce((s, m) => s + sumVolume(m), 0);
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

// ── Price helpers ─────────────────────────────────────────────────────────────
function getChaosPrice(currency) {
  const pair = allMarkets.find(m => m.market_id === `chaos|${currency}` || m.market_id === `${currency}|chaos`);
  if (!pair) return null;
  const chaosMin = getVal(pair.lowest_ratio,  'chaos');
  const chaosMax = getVal(pair.highest_ratio, 'chaos');
  if (chaosMin != null) return { type: 'per-unit', min: chaosMin, max: chaosMax ?? chaosMin };
  const bulkMin = getVal(pair.lowest_ratio,  currency);
  const bulkMax = getVal(pair.highest_ratio, currency);
  if (bulkMin != null) return { type: 'bulk', min: bulkMin, max: bulkMax ?? bulkMin };
  return null;
}

function getCurrencyVolume(currency) {
  return allMarkets
    .filter(m => { const [s,b] = m.market_id.split('|'); return s===currency||b===currency; })
    .reduce((s, m) => s + sumVolume(m), 0);
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────
let refreshTimer = null, countdownTimer = null, nextRefreshAt = null;

function scheduleAutoRefresh() {
  clearTimeout(refreshTimer);
  clearInterval(countdownTimer);
  const minutes    = parseInt(document.getElementById('refresh-interval')?.value ?? '0', 10);
  const countdownEl = document.getElementById('countdown');
  if (!minutes) { if (countdownEl) countdownEl.textContent = ''; return; }
  const ms = minutes * 60 * 1000;
  nextRefreshAt = Date.now() + ms;
  refreshTimer  = setTimeout(() => loadData(false), ms);
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
  const creds = getCreds();
  if (creds) {
    document.getElementById('input-client-id').value     = creds.clientId;
    document.getElementById('input-client-secret').value = creds.clientSecret;
  }
  document.getElementById('settings-error').classList.add('hidden');
  document.getElementById('settings-overlay').classList.remove('hidden');
}
function closeSettings() { document.getElementById('settings-overlay').classList.add('hidden'); }
function closeSettingsOnOverlay(e) { if (e.target === document.getElementById('settings-overlay')) closeSettings(); }

function saveCredentials() {
  const clientId     = document.getElementById('input-client-id').value.trim();
  const clientSecret = document.getElementById('input-client-secret').value.trim();
  const errEl        = document.getElementById('settings-error');
  if (!clientId || !clientSecret) {
    errEl.textContent = '請填入 Client ID 和 Client Secret';
    errEl.classList.remove('hidden');
    return;
  }
  saveCreds(clientId, clientSecret);
  localStorage.removeItem(TOKEN_KEY);
  isDemoMode = false;
  closeSettings();
  loadData(true);
}

function clearCredentials() { clearCredsAndToken(); isDemoMode = true; closeSettings(); loadData(); }
function useDemo()          { isDemoMode = true; closeSettings(); loadData(); }

// ── Helpers ───────────────────────────────────────────────────────────────────
function getVal(obj, key) {
  if (!obj) return null;
  if (key in obj) return obj[key];
  const k = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
  return k !== undefined ? obj[k] : null;
}
function sumVolume(m) {
  return Object.values(m.volume_traded || {}).reduce((s, v) => s + v, 0);
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
if (!getCreds()) isDemoMode = true;

Promise.all([fetchCurrentLeague(), loadStaticData()]).then(() => {
  renderTabs();
  loadData();
});
