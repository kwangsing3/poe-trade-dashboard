"""
POE Trade Dashboard — Python backend
Proxies pathofexile.tw API (no CORS) and serves the static site.

Usage:
    pip install -r requirements.txt
    python server.py
"""

from contextlib import asynccontextmanager
from pathlib import Path
import os

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

CLIENT_ID     = os.getenv('CLIENT_ID', '')
CLIENT_SECRET = os.getenv('CLIENT_SECRET', '')
TW_BASE       = 'https://pathofexile.tw'
ROOT_DIR      = Path(__file__).parent

# ── Token cache ───────────────────────────────────────────────────────────────
_token: str | None = None

async def _fetch_token() -> str:
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f'{TW_BASE}/oauth/token',
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
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(
                f'{TW_BASE}/api/leagues',
                params={'type': 'main', 'realm': 'pc', 'limit': 20},
                headers={'User-Agent': 'poe-trade-dashboard/1.0'},
            )
            r.raise_for_status()
            return r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

@app.get('/api/exchange')
async def get_exchange():
    global _token
    if not CLIENT_ID:
        raise HTTPException(status_code=503, detail='API credentials not configured')

    async def _fetch(tok: str):
        async with httpx.AsyncClient() as c:
            return await c.get(
                f'{TW_BASE}/api/currency-exchange',
                headers={
                    'Authorization': f'Bearer {tok}',
                    'User-Agent': 'poe-trade-dashboard/1.0',
                },
            )

    try:
        token = await get_token()
        r = await _fetch(token)
        if r.status_code == 401:
            token = await get_token(force=True)
            r = await _fetch(token)
        r.raise_for_status()
        return r.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

# ── Static files (must be last) ───────────────────────────────────────────────
app.mount('/', StaticFiles(directory=str(ROOT_DIR), html=True), name='static')

# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='0.0.0.0', port=8000, reload=True)
