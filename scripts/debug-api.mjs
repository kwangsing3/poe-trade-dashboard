// Debug script: mirrors app.js fetch logic using .env credentials
// Usage: node scripts/debug-api.mjs

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env ────────────────────────────────────────────────────────────────
const envPath = join(__dirname, '..', '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n')
    .filter(l => l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);

const CLIENT_ID     = env.CLIENT_ID;
const CLIENT_SECRET = env.CLIENT_SECRET;
const API_BASE      = 'https://pathofexile.tw/api';

console.log(`\n=== POE Trade Dashboard — API Debug ===`);
console.log(`Client ID: ${CLIENT_ID}`);
console.log(`Client Secret: ${CLIENT_SECRET.slice(0,4)}${'*'.repeat(CLIENT_SECRET.length - 4)}\n`);

// ── Step 1: Fetch league ─────────────────────────────────────────────────────
console.log('▶ Step 1: Fetching current league...');
let currentLeague = 'Standard';
try {
  const res = await fetch(`${API_BASE}/leagues?type=main&realm=pc&limit=20`);
  console.log(`  HTTP ${res.status} ${res.statusText}`);
  if (res.ok) {
    const json = await res.json();
    const leagues = Array.isArray(json) ? json : (json.result || json.leagues || []);
    const PERMANENT = new Set(['Standard','Hardcore','Solo Self-Found','Hardcore Solo Self-Found',
      'Ruthless','Hardcore Ruthless','SSF Ruthless','Hardcore SSF Ruthless']);
    const seasonal = leagues.find(l => l.category?.current === true && !PERMANENT.has(l.id));
    if (seasonal) {
      currentLeague = seasonal.id;
      console.log(`  ✓ Current league: ${currentLeague}`);
    } else {
      console.log(`  ! No seasonal league found. Available leagues:`);
      leagues.slice(0, 8).forEach(l => console.log(`    - ${l.id} (current=${l.category?.current})`));
    }
  }
} catch (e) {
  console.error(`  ✗ League fetch failed: ${e.message}`);
}

// ── Step 2: Get OAuth token ──────────────────────────────────────────────────
console.log('\n▶ Step 2: Getting OAuth token...');
let token = null;
try {
  const body = new URLSearchParams({
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type:    'client_credentials',
    scope:         'service:cxapi',
  });
  const res = await fetch('https://pathofexile.tw/oauth/token', {  // oauth is NOT under /api
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  console.log(`  HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    console.error(`  ✗ Token error: ${JSON.stringify(json)}`);
    process.exit(1);
  }
  token = json.access_token;
  console.log(`  ✓ Token acquired (${json.token_type}, expires_in=${json.expires_in}s, scope=${json.scope})`);
} catch (e) {
  console.error(`  ✗ Token fetch failed: ${e.message}`);
  process.exit(1);
}

// ── Step 3: Fetch currency exchange ─────────────────────────────────────────
console.log('\n▶ Step 3: Fetching currency-exchange data...');
let markets = [];
try {
  const res = await fetch(`${API_BASE}/currency-exchange`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'poe-trade-dashboard/debug',
    },
  });
  console.log(`  HTTP ${res.status} ${res.statusText}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`  ✗ Exchange API error: ${text.slice(0, 300)}`);
    process.exit(1);
  }
  const json = await res.json();

  // Show top-level keys
  console.log(`  ✓ Response keys: ${Object.keys(json).join(', ')}`);

  if (Array.isArray(json.markets)) {
    markets = json.markets;
    console.log(`  Total markets: ${markets.length}`);

    // Filter by league
    const leagueMarkets = markets.filter(m => m.league === currentLeague);
    console.log(`  Markets for "${currentLeague}": ${leagueMarkets.length}`);

    if (leagueMarkets.length === 0) {
      const leagues = [...new Set(markets.map(m => m.league))];
      console.log(`  ! Available leagues in data: ${leagues.join(', ')}`);
    } else {
      // Sample: chaos|divine
      const chaosDivine = leagueMarkets.find(m => m.market_id === 'chaos|divine');
      const divineChars = leagueMarkets.find(m => m.market_id === 'divine|chaos');
      console.log('\n  ── chaos|divine (掛買 divine):');
      console.log(JSON.stringify(chaosDivine, null, 4));
      console.log('\n  ── divine|chaos (掛賣 divine):');
      console.log(JSON.stringify(divineChars, null, 4));

      // Show first 5 markets
      console.log('\n  ── First 5 market IDs:');
      leagueMarkets.slice(0, 5).forEach(m => console.log(`    ${m.market_id}`));
    }
  } else {
    console.log(`  ! Unexpected response shape: ${JSON.stringify(json).slice(0, 300)}`);
  }
} catch (e) {
  console.error(`  ✗ Exchange fetch failed: ${e.message}`);
}

console.log('\n=== Done ===\n');
