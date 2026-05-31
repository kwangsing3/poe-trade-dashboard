'use strict';

const API_BASE   = 'https://api.pathofexile.com';
const TOKEN_URL  = `${API_BASE}/oauth/token`;
const CX_URL     = `${API_BASE}/currency-exchange`;
const STORE_KEY  = 'poe_cx_creds';
const TOKEN_KEY  = 'poe_cx_token';
const MOCK_URL   = 'data/mock-currency-exchange.json';

let isDemoMode = false;
let currentLeague = 'Mirage'; // updated dynamically on load

// ── 繁體中文通貨名稱對照表 ────────────────────────────────────────────────────
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
};

function currencyName(id) {
  return CURRENCY_ZH[id] || id;
}

let allMarkets   = [];
let refreshTimer = null;
let countdownTimer = null;
let nextRefreshAt  = null;

// ── Credentials (localStorage) ───────────────────────────────────────────────

function getCreds() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; }
  catch { return null; }
}

function saveCreds(clientId, clientSecret) {
  localStorage.setItem(STORE_KEY, JSON.stringify({ clientId, clientSecret }));
}

function clearCredsAndToken() {
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

// ── Current league (no auth needed) ──────────────────────────────────────────

async function fetchCurrentLeague() {
  try {
    const res = await fetch(`${API_BASE}/leagues?type=main&realm=pc&limit=20`);
    if (!res.ok) return;
    const json = await res.json();
    const leagues = Array.isArray(json) ? json : (json.result || json.leagues || []);
    // The current seasonal league has category.current === true and is not a permanent league
    const PERMANENT = new Set(['Standard','Hardcore','Solo Self-Found','Hardcore Solo Self-Found',
      'Ruthless','Hardcore Ruthless','SSF Ruthless','Hardcore SSF Ruthless']);
    const seasonal = leagues.find(l => {
      const cat = l.category || {};
      return cat.current === true && !PERMANENT.has(l.id);
    });
    if (seasonal) {
      currentLeague = seasonal.id;
      document.querySelector('.realm-badge').textContent = `PC · PoE1 · ${currentLeague}`;
    }
  } catch {
    // silently keep the default
  }
}

// ── OAuth token (cached in localStorage, no expiry per POE docs) ─────────────

async function getToken(force = false) {
  if (!force) {
    const cached = localStorage.getItem(TOKEN_KEY);
    if (cached) return cached;
  }

  const creds = getCreds();
  if (!creds) throw new Error('未設定 API 憑證');

  const body = new URLSearchParams({
    client_id:     creds.clientId,
    client_secret: creds.clientSecret,
    grant_type:    'client_credentials',
    scope:         'service:cxapi',
  });

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const json = await res.json();

  if (!res.ok || !json.access_token) {
    const msg = json.error_description || json.error || `HTTP ${res.status}`;
    throw new Error(`取得 Token 失敗：${msg}`);
  }

  localStorage.setItem(TOKEN_KEY, json.access_token);
  return json.access_token;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchCurrencyExchange(token) {
  const res = await fetch(CX_URL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'poe-trade-dashboard/1.0',
    },
  });

  if (res.status === 401) {
    // Token revoked — clear cache and retry once with a fresh token
    localStorage.removeItem(TOKEN_KEY);
    const newToken = await getToken(true);
    return fetchCurrencyExchange(newToken);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API 回傳 HTTP ${res.status}${text ? '：' + text.slice(0, 120) : ''}`);
  }

  return res.json();
}

// ── Main load ─────────────────────────────────────────────────────────────────

async function loadData(manual = false) {
  const btn = document.getElementById('refresh-btn');
  const updatedEl = document.getElementById('last-updated');

  btn.disabled = true;
  btn.textContent = '載入中...';
  updatedEl.textContent = '資料載入中...';

  try {
    let json;

    if (isDemoMode || !getCreds()) {
      // Demo mode: load local mock data
      isDemoMode = true;
      const res = await fetch(manual ? `${MOCK_URL}?t=${Date.now()}` : MOCK_URL);
      if (!res.ok) throw new Error(`無法載入 mock 資料 (HTTP ${res.status})`);
      json = await res.json();
    } else {
      const token = await getToken(manual);
      json = await fetchCurrencyExchange(token);
    }

    allMarkets = (Array.isArray(json.markets) ? json.markets : [])
      .filter(m => m.league === currentLeague);

    render();
    renderStats();

    const now = new Date();
    const prefix = isDemoMode ? '[Demo] 上次更新：' : '上次更新：';
    updatedEl.textContent = prefix + now.toLocaleTimeString('zh-TW');

  } catch (err) {
    document.getElementById('categories-section').innerHTML =
      `<p class="error-msg">⚠ ${escHtml(err.message)}</p>`;
    updatedEl.textContent = '載入失敗';
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = '重新整理';
  }

  scheduleAutoRefresh();
}

// ── Category definitions ──────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: 'high',
    label: '高價通貨',
    currencies: ['exalted', 'mirror', 'annul', 'ancient-orb', 'eternal'],
  },
  {
    id: 'craft',
    label: '製作通貨',
    currencies: ['vaal', 'regal', 'gcp', 'alch', 'fusing', 'alt', 'chrome',
                 'jewellers', 'chance', 'scour', 'regret', 'blessed',
                 'transmute', 'aug', 'chisel', 'bauble'],
  },
  {
    id: 'misc',
    label: '消耗品',
    currencies: ['wisdom', 'portal', 'whetstone', 'scrap', 'engineers'],
  },
];

// ── Rendering ─────────────────────────────────────────────────────────────────

function render() {
  renderHero();
  renderCategories();
}

function renderHero() {
  const heroEl = document.getElementById('hero-section');
  const buy  = allMarkets.find(m => m.market_id === 'chaos|divine');  // chaos → divine
  const sell = allMarkets.find(m => m.market_id === 'divine|chaos');  // divine → chaos

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

function renderCategories() {
  const search = (document.getElementById('pair-search')?.value ?? '').toLowerCase().trim();
  const catEl  = document.getElementById('categories-section');
  let html = '';

  for (const cat of CATEGORIES) {
    const cards = cat.currencies
      .filter(c => !search || c.includes(search) || currencyName(c).includes(search))
      .map(c => renderCurrencyCard(c))
      .filter(Boolean);

    if (cards.length === 0) continue;

    html += `
      <section class="category-section">
        <h2 class="category-title">${cat.label}</h2>
        <div class="card-grid">${cards.join('')}</div>
      </section>`;
  }

  catEl.innerHTML = html || '<p class="empty-msg">沒有符合條件的資料</p>';
}

function renderCurrencyCard(currency) {
  const price = getChaosPrice(currency);
  if (!price) return null;

  const vol  = getCurrencyVolume(currency);
  const name = currencyName(currency);

  let priceHtml;
  if (price.type === 'per-unit') {
    const range = price.min === price.max
      ? `${price.min}`
      : `${price.min} ~ ${price.max}`;
    priceHtml = `<div class="card-price per-unit">
      <span class="price-eq">≈</span>
      <span class="price-val">${range}</span>
      <span class="price-unit">混沌石</span>
    </div>`;
  } else {
    const range = price.min === price.max
      ? `${price.min}`
      : `${price.min} ~ ${price.max}`;
    priceHtml = `<div class="card-price bulk">
      <span class="price-val">${range}</span>
      <span class="price-unit">枚 = 1 混沌石</span>
    </div>`;
  }

  return `<div class="currency-card" title="${escHtml(currency)}">
    <div class="card-header">
      <img class="card-icon" src="public/res/img/${escHtml(currency)}.png" alt="${escHtml(name)}" onerror="this.style.display='none'">
      <div class="card-name">${escHtml(name)}</div>
    </div>
    ${priceHtml}
    <div class="card-vol">成交量 ${fmtK(vol)}</div>
  </div>`;
}

// ratio key is always the "bulk" currency (the cheaper one in the pair)
// e.g. chaos|divine → {"chaos":185} = 185 chaos per 1 divine
// e.g. alch|chaos  → {"alch":3}    = 3 alch per 1 chaos
function getChaosPrice(currency) {
  const pair = allMarkets.find(m =>
    m.market_id === `chaos|${currency}` || m.market_id === `${currency}|chaos`
  );
  if (!pair) return null;

  const chaosMin = getVal(pair.lowest_ratio,  'chaos');
  const chaosMax = getVal(pair.highest_ratio, 'chaos');
  if (chaosMin != null) {
    return { type: 'per-unit', min: chaosMin, max: chaosMax ?? chaosMin };
  }

  const bulkMin = getVal(pair.lowest_ratio,  currency);
  const bulkMax = getVal(pair.highest_ratio, currency);
  if (bulkMin != null) {
    return { type: 'bulk', min: bulkMin, max: bulkMax ?? bulkMin };
  }

  return null;
}

function getCurrencyVolume(currency) {
  return allMarkets
    .filter(m => { const [s, b] = m.market_id.split('|'); return s === currency || b === currency; })
    .reduce((sum, m) => sum + sumVolume(m), 0);
}

function renderStats() {
  const bar = document.getElementById('stats-bar');
  const totalVol = allMarkets.reduce((sum, m) => sum + sumVolume(m), 0);
  const pairs = new Set(allMarkets.map(m => m.market_id.split('|').sort().join('|'))).size;

  bar.innerHTML = [
    stat('聯賽', currentLeague),
    stat('交易對數', pairs.toLocaleString()),
    stat('總交易量', totalVol.toLocaleString()),
  ].join('');
}

function stat(label, value) {
  return `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

function fmtK(v) {
  if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000)    return (v / 1000).toFixed(1) + 'K';
  return String(v);
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────

function scheduleAutoRefresh() {
  clearTimeout(refreshTimer);
  clearInterval(countdownTimer);

  const minutes = parseInt(document.getElementById('refresh-interval')?.value ?? '0', 10);
  const countdownEl = document.getElementById('countdown');

  if (!minutes) {
    countdownEl.textContent = '';
    return;
  }

  const ms = minutes * 60 * 1000;
  nextRefreshAt = Date.now() + ms;
  refreshTimer  = setTimeout(() => loadData(false), ms);

  countdownTimer = setInterval(() => {
    const remaining = Math.max(0, nextRefreshAt - Date.now());
    const m = Math.floor(remaining / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    countdownEl.textContent = `下次刷新 ${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
}

document.getElementById('refresh-interval').addEventListener('change', scheduleAutoRefresh);

// ── Settings modal ────────────────────────────────────────────────────────────

function openSettings() {
  const creds = getCreds();
  if (creds) {
    document.getElementById('input-client-id').value = creds.clientId;
    document.getElementById('input-client-secret').value = creds.clientSecret;
  }
  document.getElementById('settings-error').classList.add('hidden');
  document.getElementById('settings-overlay').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
}

function closeSettingsOnOverlay(e) {
  if (e.target === document.getElementById('settings-overlay')) closeSettings();
}

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

function clearCredentials() {
  clearCredsAndToken();
  isDemoMode = true;
  closeSettings();
  loadData();
}

function useDemo() {
  isDemoMode = true;
  closeSettings();
  loadData();
}

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

function minRatio(m) {
  const vals = Object.values(m.lowest_ratio || {});
  return vals.length ? Math.min(...vals) : Infinity;
}

function fmt(v) {
  if (v === null || v === undefined) return '<span style="color:#555">—</span>';
  return Number(v).toLocaleString();
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Init ──────────────────────────────────────────────────────────────────────

if (!getCreds()) {
  isDemoMode = true;
}
fetchCurrentLeague().then(() => loadData());
