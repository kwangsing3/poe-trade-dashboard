"""
POE Trade Dashboard — Python backend
Proxies pathofexile.tw API (no CORS) and serves the static site.

Usage:
    pip install -r requirements.txt
    python server.py
"""

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
import os
import time

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

CLIENT_ID     = os.getenv('CLIENT_ID', '')
CLIENT_SECRET = os.getenv('CLIENT_SECRET', '')
TW_BASE       = 'https://pathofexile.tw/api'
TOKEN_URL     = 'https://pathofexile.tw/oauth/token'  # oauth is NOT under /api
ROOT_DIR      = Path(__file__).parent
CACHE_DIR     = ROOT_DIR / 'data' / 'cache'   # 過去整點快照不可變，永久快取
MERGE_HOURS   = int(os.getenv('MERGE_HOURS', '24'))

# In-memory caches: {'at': unix_ts, 'data': ...}
_leagues_cache = {'at': 0, 'data': None}   # TTL 1h
_static_cache  = {'at': 0, 'data': None}   # TTL 6h
_merged_cache  = {'at': 0, 'data': None}   # TTL 2min（擋住短時間連按刷新）

# 上游限流規則（實測 x-rate-limit-client）：5 個請求 / 3600 秒，違規罰停 600 秒。
# 自我節流：滾動一小時內最多打 4 個 currency-exchange 請求，留 1 個餘裕。
UPSTREAM_BUDGET  = 4
CURRENT_HOUR_TTL = 900          # 當前小時快照的記憶體快取（秒），過期才重抓
_upstream_calls: list[float] = []                 # 滾動視窗內的上游呼叫時間戳
_rate_limit_until = 0.0                           # 429 罰停解除時間
# 剛被 429 過（或剛啟動、不知道滾動窗口歷史）：下次只用 1 個請求探路
_slow_start = True
_hour_mem: dict[int, tuple[float, dict]] = {}     # 未進磁碟的小時快照（記憶體）

def _budget_left(now: float) -> int:
    while _upstream_calls and now - _upstream_calls[0] > 3600:
        _upstream_calls.pop(0)
    return UPSTREAM_BUDGET - len(_upstream_calls)

def _sync_rate_limit_headers(headers, now: float) -> None:
    """x-rate-limit-client-state: used:window:penalty — 用 API 回傳的實際狀態同步本地計數。"""
    global _upstream_calls, _rate_limit_until
    state = headers.get('x-rate-limit-client-state', '')
    if not state:
        return
    try:
        parts = state.split(':')
        used    = int(parts[0])
        penalty = int(parts[2]) if len(parts) >= 3 else 0
    except (ValueError, IndexError):
        return
    # 以 server 回報的 used 數重建滾動視窗（時間戳密集集中在最近 1ms 內，
    # 只是為了讓 _budget_left() 能正確計算剩餘配額）
    _upstream_calls.clear()
    _upstream_calls.extend(now - i * 0.001 for i in range(used))
    if penalty > 0:
        _rate_limit_until = now + penalty
    print(f"[server] rate-limit state: {used} used, {penalty}s penalty, budget_left={_budget_left(now)}")

# ── Token cache ───────────────────────────────────────────────────────────────
_token: str | None = None

async def _fetch_token() -> str:
    async with httpx.AsyncClient() as c:
        r = await c.post(
            TOKEN_URL,
            data={
                'client_id':     CLIENT_ID,
                'client_secret': CLIENT_SECRET,
                'grant_type':    'client_credentials',
                'scope':         'service:cxapi',
            },
        )
        r.raise_for_status()
        data = r.json()
        if 'access_token' not in data:
            raise RuntimeError(f"Token error: {data}")
        return data['access_token']

async def get_token(force: bool = False) -> str:
    global _token
    if _token and not force:
        return _token
    _token = await _fetch_token()
    return _token

# ── App ───────────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    if CLIENT_ID and CLIENT_SECRET:
        try:
            await get_token()
            print(f"[server] Token acquired for client: {CLIENT_ID}")
        except Exception as e:
            print(f"[server] WARNING: Could not acquire token at startup: {e}")
    else:
        print("[server] WARNING: CLIENT_ID/CLIENT_SECRET not set — API will be unavailable")
    yield

app = FastAPI(title='POE Trade Dashboard', lifespan=lifespan)

# ── API routes ────────────────────────────────────────────────────────────────
@app.get('/api/leagues')
async def get_leagues():
    if _leagues_cache['data'] and time.time() - _leagues_cache['at'] < 3600:
        return _leagues_cache['data']
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(
                f'{TW_BASE}/leagues',
                params={'type': 'main', 'realm': 'pc', 'limit': 20},
                headers={'User-Agent': 'poe-trade-dashboard/1.0'},
            )
            r.raise_for_status()
            _leagues_cache['at'], _leagues_cache['data'] = time.time(), r.json()
            return _leagues_cache['data']
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.get('/api/static')
async def get_static():
    if _static_cache['data'] and time.time() - _static_cache['at'] < 6 * 3600:
        return _static_cache['data']
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(
                f'{TW_BASE}/trade/data/static',
                headers={'User-Agent': 'poe-trade-dashboard/1.0'},
            )
            r.raise_for_status()
            _static_cache['at'], _static_cache['data'] = time.time(), r.json()
            return _static_cache['data']
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.get('/api/exchange')
async def get_exchange():
    """合併最近 MERGE_HOURS 個整點快照，每個市場取最新一筆。

    單一整點快照只含「該小時有成交」的市場（實測 1420 個品項只涵蓋 ~95 種），
    合併多個小時才能補齊低流動性品項。過去的整點快照不可變 → 永久存磁碟。

    上游限流 5 請求/小時：每次呼叫最多花 UPSTREAM_BUDGET 個請求，
    優先抓最新的未快取小時，涵蓋率靠磁碟快取逐次累積補齊。
    """
    global _rate_limit_until, _slow_start
    if not CLIENT_ID:
        raise HTTPException(status_code=503, detail='API credentials not configured')

    now = int(time.time())
    if _merged_cache['data'] and now - _merged_cache['at'] < 120:
        return _merged_cache['data']

    # API 只發布已結束的小時快照，進行中的當前小時尚無資料，固定從前一小時開始
    latest_hour = (now // 3600 - 1) * 3600
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    snapshots: dict[int, dict] = {}
    rate_limited = False
    # 滾動視窗可能還有本進程不知道的請求（重啟前、外部工具）——
    # 剛被 429 過就只用 1 個請求探路，成功才恢復正常預算
    call_limit   = 1 if _slow_start else UPSTREAM_BUDGET
    calls_made   = 0

    try:
        token = await get_token()
        async with httpx.AsyncClient(timeout=30) as c:
            # 由新到舊：預算優先花在最新的小時
            for back in range(MERGE_HOURS):
                hour = latest_hour - 3600 * back
                path = CACHE_DIR / f'{hour}.json'

                if path.exists():
                    try:
                        snapshots[hour] = json.loads(path.read_text(encoding='utf-8'))
                        continue
                    except Exception:
                        pass  # 快取檔損毀 → 重抓

                # 還沒進磁碟的小時（當前小時等）先看記憶體快取
                mem = _hour_mem.get(hour)
                if mem and now - mem[0] < CURRENT_HOUR_TTL:
                    snapshots[hour] = mem[1]
                    continue

                if (time.time() < _rate_limit_until
                        or _budget_left(time.time()) <= 0
                        or calls_made >= call_limit):
                    rate_limited = rate_limited or time.time() < _rate_limit_until
                    if mem:
                        snapshots[hour] = mem[1]  # 過期的記憶體快取也比沒有好
                    continue

                headers = {
                    'Authorization': f'Bearer {token}',
                    'User-Agent':    'poe-trade-dashboard/1.0',
                }
                _upstream_calls.append(time.time())
                calls_made += 1
                r = await c.get(f'{TW_BASE}/currency-exchange/{hour}', headers=headers)
                if r.status_code == 401:
                    token = await get_token(force=True)
                    headers['Authorization'] = f'Bearer {token}'
                    _upstream_calls.append(time.time())
                    r = await c.get(f'{TW_BASE}/currency-exchange/{hour}', headers=headers)
                if r.status_code == 429:
                    retry_after = int(r.headers.get('retry-after', 600))
                    _sync_rate_limit_headers(r.headers, time.time())
                    # 若 header 沒有 penalty 欄位，fallback 用 retry-after
                    if _rate_limit_until <= time.time():
                        _rate_limit_until = time.time() + retry_after
                    _slow_start = True
                    rate_limited = True
                    print(f"[server] upstream 429 (retry-after {retry_after}s), backing off until {int(_rate_limit_until - time.time())}s from now")
                    continue
                r.raise_for_status()
                _sync_rate_limit_headers(r.headers, time.time())
                _slow_start = False  # 成功 → 解除慢啟動
                snap = r.json()
                snapshots[hour] = snap
                # 確定不會再變的小時才進磁碟（空快照也不可變、一樣快取）；
                # 當前小時與剛過、可能尚未發布完整的小時放記憶體
                if hour <= latest_hour - 3600 or (hour < latest_hour and snap.get('markets')):
                    path.write_text(json.dumps(snap, ensure_ascii=False), encoding='utf-8')
                    _hour_mem.pop(hour, None)
                else:
                    _hour_mem[hour] = (now, snap)
                await asyncio.sleep(0.5)  # 對上游溫和一點
    except HTTPException:
        raise
    except Exception as e:
        if not snapshots:
            raise HTTPException(status_code=502, detail=str(e))

    # 由舊到新合併：同一 (league, market_id) 以最新小時覆蓋；
    # 同時保留各小時的歷史（前端用來組價位檔）
    merged:  dict[tuple, dict] = {}
    history: dict[tuple, list] = {}
    newest_hour = None
    for hour in sorted(snapshots):
        markets = snapshots[hour].get('markets') or []
        for m in markets:
            key = (m.get('league'), m.get('market_id'))
            m['snapshot_hour'] = hour
            merged[key] = m
            history.setdefault(key, []).append({
                'hour':          hour,
                'lowest_ratio':  m.get('lowest_ratio'),
                'highest_ratio': m.get('highest_ratio'),
                'lowest_stock':  m.get('lowest_stock'),
                'highest_stock': m.get('highest_stock'),
                'volume_traded': m.get('volume_traded'),
            })
        if markets:
            newest_hour = hour

    for key, m in merged.items():
        m['history'] = history.get(key, [])

    if not merged:
        if rate_limited:
            wait = max(0, int(_rate_limit_until - time.time()))
            raise HTTPException(status_code=502, detail=f'上游限流中（429），約 {wait} 秒後重試；尚無快取資料')
        raise HTTPException(status_code=502, detail='no market data in any snapshot')

    data = {
        'markets':      list(merged.values()),
        'change_id':    newest_hour,
        'fetched_at':   now,
        'hours_merged': len(snapshots),
        'rate_limited': rate_limited,
    }
    _merged_cache['at'], _merged_cache['data'] = now, data
    return data

# ── Static files (must be last) ───────────────────────────────────────────────
app.mount('/', StaticFiles(directory=str(ROOT_DIR), html=True), name='static')

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import uvicorn
    # reload=True 在 Windows 上 watchfiles 重載常卡死（舊進程關閉後新進程不啟動），
    # 造成伺服器無聲斷線 — 改成手動重啟
    uvicorn.run('server:app', host='0.0.0.0', port=8000)
