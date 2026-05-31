'use strict';

const API_BASE   = 'https://api.pathofexile.com';
const TOKEN_URL  = `${API_BASE}/oauth/token`;
const CX_URL     = `${API_BASE}/currency-exchange`;
const STORE_KEY  = 'poe_cx_creds';
const TOKEN_KEY  = 'poe_cx_token';
const MOCK_URL   = 'data/mock-currency-exchange.json';

let isDemoMode = false;

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

    allMarkets = Array.isArray(json.markets) ? json.markets : [];

    populateLeagueFilter(allMarkets);
    renderTable();
    renderStats(json);

    const now = new Date();
    const prefix = isDemoMode ? '[Demo] 上次更新：' : '上次更新：';
    updatedEl.textContent = prefix + now.toLocaleTimeString('zh-TW');

  } catch (err) {
    document.getElementById('market-body').innerHTML =
      `<tr><td colspan="8" class="error">⚠ ${escHtml(err.message)}</td></tr>`;
    updatedEl.textContent = '載入失敗';
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = '重新整理';
  }

  scheduleAutoRefresh();
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function populateLeagueFilter(markets) {
  const sel = document.getElementById('league-filter');
  const current = sel.value;
  const leagues = [...new Set(markets.map(m => m.league))].sort();
  sel.innerHTML = '<option value="">全部</option>' +
    leagues.map(l => `<option value="${l}"${l === current ? ' selected' : ''}>${escHtml(l)}</option>`).join('');
}

function renderTable() {
  const leagueFilter = document.getElementById('league-filter').value;
  const search  = document.getElementById('pair-search').value.toLowerCase().trim();
  const sortBy  = document.getElementById('sort-by').value;

  let rows = allMarkets.filter(m => {
    if (leagueFilter && m.league !== leagueFilter) return false;
    if (search && !m.market_id.toLowerCase().includes(search)) return false;
    return true;
  });

  rows.sort((a, b) => {
    switch (sortBy) {
      case 'volume_asc': return sumVolume(a) - sumVolume(b);
      case 'pair_asc':   return a.market_id.localeCompare(b.market_id);
      case 'ratio_asc':  return minRatio(a) - minRatio(b);
      default:           return sumVolume(b) - sumVolume(a);
    }
  });

  const tbody = document.getElementById('market-body');

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">沒有符合條件的資料</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(m => {
    const [sell, buy] = m.market_id.split('|');
    const volSell   = getVal(m.volume_traded,  sell);
    const volBuy    = getVal(m.volume_traded,  buy);
    const lowStock  = getVal(m.lowest_stock,   sell) ?? getVal(m.lowest_stock,  buy);
    const highStock = getVal(m.highest_stock,  sell) ?? getVal(m.highest_stock, buy);
    const lowRatio  = getVal(m.lowest_ratio,   sell) ?? getVal(m.lowest_ratio,  buy);
    const highRatio = getVal(m.highest_ratio,  sell) ?? getVal(m.highest_ratio, buy);

    return `<tr>
      <td><div class="pair-cell">
        <span class="currency-tag">${escHtml(sell)}</span>
        <span class="arrow">→</span>
        <span class="currency-tag">${escHtml(buy)}</span>
      </div></td>
      <td><span class="league-tag">${escHtml(m.league)}</span></td>
      <td class="num volume">${fmt(volSell)}</td>
      <td class="num volume">${fmt(volBuy)}</td>
      <td class="num">${fmt(lowStock)}</td>
      <td class="num">${fmt(highStock)}</td>
      <td class="num ratio-low">${fmt(lowRatio)}</td>
      <td class="num ratio-high">${fmt(highRatio)}</td>
    </tr>`;
  }).join('');
}

function renderStats(json) {
  const bar = document.getElementById('stats-bar');
  const totalVol = allMarkets.reduce((sum, m) =>
    sum + Object.values(m.volume_traded || {}).reduce((s, v) => s + v, 0), 0);
  const leagues = new Set(allMarkets.map(m => m.league)).size;

  bar.innerHTML = [
    stat('交易對', allMarkets.length.toLocaleString()),
    stat('聯賽', leagues.toString()),
    stat('總交易量', totalVol.toLocaleString()),
    json.next_change_id ? stat('Next Change ID', json.next_change_id) : '',
  ].join('');
}

function stat(label, value) {
  return `<div class="stat-card"><div class="label">${label}</div><div class="value">${value}</div></div>`;
}

// ── Auto-refresh ──────────────────────────────────────────────────────────────

function scheduleAutoRefresh() {
  clearTimeout(refreshTimer);
  clearInterval(countdownTimer);

  const minutes = parseInt(document.getElementById('refresh-interval').value, 10);
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
loadData();
