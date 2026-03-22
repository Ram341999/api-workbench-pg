from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import os, logging, httpx, uuid, time, base64, json, secrets
import ipaddress, socket
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
from contextlib import asynccontextmanager
from collections import defaultdict
import threading

try:
    import bcrypt
    BCRYPT_AVAILABLE = True
except ImportError:
    BCRYPT_AVAILABLE = False
    import hashlib

import asyncpg

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

GOOGLE_CLIENT_ID     = os.environ.get('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET', '')
GOOGLE_REDIRECT_URI  = os.environ.get('GOOGLE_REDIRECT_URI', 'http://localhost:8000/api/auth/google/callback')
FRONTEND_URL         = os.environ.get('FRONTEND_URL', 'http://localhost:8000')
SESSION_SECRET       = os.environ.get('SESSION_SECRET', '')
DATABASE_URL         = os.environ.get('DATABASE_URL', '')
STATIC_DIR           = ROOT_DIR / 'static'
IS_PRODUCTION        = os.environ.get('PRODUCTION', 'false').lower() == 'true'
TEST_MODE            = os.environ.get('TEST_MODE', 'false').lower() == 'true'
ALLOWED_ORIGINS      = os.environ.get('CORS_ORIGINS', 'http://localhost:8000').split(',')
MAX_BODY_SIZE        = int(os.environ.get('MAX_BODY_SIZE_MB', '10')) * 1024 * 1024
REQUEST_TIMEOUT      = float(os.environ.get('REQUEST_TIMEOUT', '30'))

if not SESSION_SECRET:
    SESSION_SECRET = secrets.token_hex(32)

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set!\n"
        "1. Create a project at supabase.com\n"
        "2. Go to Settings → Database → URI tab\n"
        "3. Copy the connection string into backend/.env"
    )

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
#  PASSWORD HASHING
# ═══════════════════════════════════════════════════

def hash_password(p: str) -> str:
    if BCRYPT_AVAILABLE:
        return bcrypt.hashpw(p.encode(), bcrypt.gensalt(rounds=12)).decode()
    return hashlib.sha256(p.encode()).hexdigest()

def verify_password(p: str, h: str) -> bool:
    if BCRYPT_AVAILABLE:
        try:
            return bcrypt.checkpw(p.encode(), h.encode())
        except Exception:
            return False
    return hashlib.sha256(p.encode()).hexdigest() == h

# ═══════════════════════════════════════════════════
#  SSRF PROTECTION
# ═══════════════════════════════════════════════════

SSRF_BLOCKLIST = os.environ.get('SSRF_BLOCKLIST', 'true').lower() == 'true'

def is_safe_url(url: str) -> tuple[bool, str]:
    if not SSRF_BLOCKLIST:
        return True, ""
    try:
        from urllib.parse import urlparse
        host = urlparse(url).hostname
        if not host:
            return False, "Invalid URL"
        if host in ['169.254.169.254', 'metadata.google.internal', '100.100.100.200']:
            return False, f"Blocked: cloud metadata endpoint"
        try:
            infos = socket.getaddrinfo(host, None)
        except (socket.gaierror, OSError):
            return False, "Could not resolve hostname"
        for info in infos:
            try:
                addr = ipaddress.ip_address(info[4][0])
                if addr.is_loopback or addr.is_private or addr.is_link_local or addr.is_reserved:
                    return False, f"Blocked: private/internal address"
            except ValueError:
                pass
        return True, ""
    except Exception as e:
        return False, f"URL validation error: {str(e)}"

# ═══════════════════════════════════════════════════
#  RATE LIMITING
# ═══════════════════════════════════════════════════

_rate_store: Dict[str, list] = defaultdict(list)
_rate_lock = threading.Lock()

def rate_limit(key: str, max_calls: int, window_seconds: int) -> bool:
    now = time.monotonic()
    with _rate_lock:
        _rate_store[key] = [t for t in _rate_store[key] if t > now - window_seconds]
        if len(_rate_store[key]) >= max_calls:
            return False
        _rate_store[key].append(now)
        return True

def get_client_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

# ═══════════════════════════════════════════════════
#  DATABASE POOL
# ═══════════════════════════════════════════════════

_pool: asyncpg.Pool = None

async def get_pool() -> asyncpg.Pool:
    return _pool

async def init_db(pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT DEFAULT '',
            picture TEXT DEFAULT '',
            password_hash TEXT,
            failed_login_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id TEXT PRIMARY KEY,
            timestamp TIMESTAMPTZ DEFAULT NOW(),
            event TEXT NOT NULL,
            user_id TEXT,
            ip TEXT,
            details JSONB DEFAULT '{}'
        );
        CREATE TABLE IF NOT EXISTS collections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            parent_id TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS requests (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            collection_id TEXT,
            name TEXT NOT NULL,
            method TEXT DEFAULT 'GET',
            url TEXT DEFAULT '',
            params JSONB DEFAULT '[]',
            headers JSONB DEFAULT '[]',
            body TEXT DEFAULT '',
            body_type TEXT DEFAULT 'json',
            auth JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS environments (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            variables JSONB DEFAULT '[]',
            is_active BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            request_name TEXT,
            method TEXT,
            url TEXT,
            status_code INTEGER,
            response_time REAL,
            response_size INTEGER,
            timestamp TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_col_user  ON collections(user_id);
        CREATE INDEX IF NOT EXISTS idx_req_user  ON requests(user_id);
        CREATE INDEX IF NOT EXISTS idx_env_user  ON environments(user_id);
        CREATE INDEX IF NOT EXISTS idx_hist_user ON history(user_id);
        CREATE INDEX IF NOT EXISTS idx_hist_ts   ON history(timestamp DESC);
        """)
    logger.info("✓ Database schema ready")

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def row_to_dict(row) -> dict:
    if row is None:
        return None
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, 'isoformat'):
            d[k] = v.isoformat()
        # asyncpg returns JSONB as dicts/lists already — no need to parse
    return d

# ═══════════════════════════════════════════════════
#  AUDIT LOG
# ═══════════════════════════════════════════════════

async def audit_log(event: str, user_id: str = None, ip: str = None, details: dict = None):
    logger.info(f"AUDIT event={event} user={user_id} ip={ip}")
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO audit_log (id,event,user_id,ip,details) VALUES ($1,$2,$3,$4,$5)",
                str(uuid.uuid4()), event, user_id, ip, json.dumps(details or {})
            )
    except Exception as e:
        logger.error(f"Audit log failed: {e}")

# ═══════════════════════════════════════════════════
#  SECURITY HEADERS
# ═══════════════════════════════════════════════════

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        if IS_PRODUCTION:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https:; connect-src 'self'"
        )
        return response

# ═══════════════════════════════════════════════════
#  LIFESPAN (startup / shutdown)
# ═══════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    logger.info("Connecting to Postgres (Supabase)...")
    _pool = await asyncpg.create_pool(
        DATABASE_URL, ssl='require',
        min_size=1, max_size=10, command_timeout=30,
    )
    await init_db(_pool)
    yield
    await _pool.close()
    logger.info("Database pool closed")

# ═══════════════════════════════════════════════════
#  APP + MIDDLEWARE
# ═══════════════════════════════════════════════════

app = FastAPI(
    title="API Workbench",
    lifespan=lifespan,
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None if IS_PRODUCTION else "/redoc",
)
api_router = APIRouter(prefix="/api")

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="awb_session",
    max_age=86400 * 7,
    same_site="lax",
    https_only=IS_PRODUCTION,
)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET","POST","PUT","DELETE","PATCH"],
    allow_headers=["Content-Type","Authorization"],
)

# ═══════════════════════════════════════════════════
#  AUTH HELPERS
# ═══════════════════════════════════════════════════

MAX_LOGIN_ATTEMPTS = 10
LOCKOUT_MINUTES    = 15

async def get_current_user(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user

async def check_lockout(email: str, pool):
    row = await pool.fetchrow(
        "SELECT failed_login_attempts, locked_until FROM users WHERE email=$1", email.lower())
    if not row or not row['locked_until']:
        return
    lock_dt = row['locked_until']
    if lock_dt.tzinfo is None:
        lock_dt = lock_dt.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) < lock_dt:
        mins = int((lock_dt - datetime.now(timezone.utc)).total_seconds() / 60) + 1
        raise HTTPException(429, f"Account locked. Try again in {mins} minute(s).")

async def record_fail(email: str, pool):
    await pool.execute(
        "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE email=$1", email.lower())
    row = await pool.fetchrow(
        "SELECT failed_login_attempts FROM users WHERE email=$1", email.lower())
    if row and row['failed_login_attempts'] >= MAX_LOGIN_ATTEMPTS:
        lock_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)
        await pool.execute("UPDATE users SET locked_until=$1 WHERE email=$2", lock_until, email.lower())

async def reset_fail(email: str, pool):
    await pool.execute(
        "UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE email=$1", email.lower())

# ═══════════════════════════════════════════════════
#  MODELS
# ═══════════════════════════════════════════════════

class KeyValuePair(BaseModel):
    key: str
    value: str
    enabled: bool = True

class AuthConfig(BaseModel):
    type: str = "none"
    bearer_token: Optional[str] = None
    basic_username: Optional[str] = None
    basic_password: Optional[str] = None
    api_key_name: Optional[str] = None
    api_key_value: Optional[str] = None
    api_key_location: Optional[str] = "header"

class RequestConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    method: str = "GET"
    url: str = ""
    params: List[KeyValuePair] = []
    headers: List[KeyValuePair] = []
    body: str = ""
    body_type: str = "json"
    auth: AuthConfig = Field(default_factory=AuthConfig)
    collection_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)

class RequestCreate(BaseModel):
    name: str
    method: str = "GET"
    url: str = ""
    params: List[KeyValuePair] = []
    headers: List[KeyValuePair] = []
    body: str = ""
    body_type: str = "json"
    auth: AuthConfig = Field(default_factory=AuthConfig)
    collection_id: Optional[str] = None

class Collection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    parent_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)

class CollectionCreate(BaseModel):
    name: str
    description: str = ""
    parent_id: Optional[str] = None

class Environment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    variables: List[KeyValuePair] = []
    is_active: bool = False
    created_at: str = Field(default_factory=now_iso)

class EnvironmentCreate(BaseModel):
    name: str
    variables: List[KeyValuePair] = []
    is_active: bool = False

class HistoryEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    request_name: str
    method: str
    url: str
    status_code: Optional[int] = None
    response_time: Optional[float] = None
    response_size: Optional[int] = None
    timestamp: str = Field(default_factory=now_iso)

class ExecuteRequest(BaseModel):
    method: str
    url: str
    params: List[KeyValuePair] = []
    headers: List[KeyValuePair] = []
    body: str = ""
    body_type: str = "json"
    auth: AuthConfig = Field(default_factory=AuthConfig)

class ExecuteResponse(BaseModel):
    status_code: int
    headers: Dict[str, str]
    body: str
    response_time: float
    response_size: int
    redirect_count: int = 0
    final_url: str = ""

class ImportPayload(BaseModel):
    data: Dict[str, Any]

# ═══════════════════════════════════════════════════
#  AUTH ROUTES
# ═══════════════════════════════════════════════════

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = request.session.get("user")
    return {"authenticated": bool(user), "user": user}

@api_router.post("/auth/register")
async def register_email(request: Request, pool=Depends(get_pool)):
    ip = get_client_ip(request)
    lim = 500 if TEST_MODE else 5
    if not rate_limit(f"reg:{ip}", lim, 3600):
        raise HTTPException(429, "Too many registration attempts. Try again later.")
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()
    if not email or not password:
        raise HTTPException(400, "Email and password are required")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if len(email) > 254:
        raise HTTPException(400, "Invalid email address")
    pw_hash = hash_password(password)
    user_id = str(uuid.uuid4())
    try:
        await pool.execute(
            "INSERT INTO users (id,email,name,picture,password_hash) VALUES ($1,$2,$3,$4,$5)",
            user_id, email, name, "", pw_hash)
    except asyncpg.UniqueViolationError:
        raise HTTPException(409, "An account with this email already exists")
    await audit_log("register", user_id=user_id, ip=ip, details={"email": email})
    return {"message": "Account created"}

@api_router.post("/auth/login")
async def login_email(request: Request, pool=Depends(get_pool)):
    ip = get_client_ip(request)
    lim = 500 if TEST_MODE else 10
    if not rate_limit(f"login:{ip}", lim, 300):
        raise HTTPException(429, "Too many login attempts. Wait 5 minutes.")
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        raise HTTPException(400, "Email and password are required")
    await check_lockout(email, pool)
    user = await pool.fetchrow("SELECT * FROM users WHERE email=$1", email)
    if not user or not user['password_hash']:
        verify_password(password, "$2b$12$invalidhashpadding000000000000000000000000000000000000")
        raise HTTPException(401, "Invalid email or password")
    if not verify_password(password, user['password_hash']):
        await record_fail(email, pool)
        raise HTTPException(401, "Invalid email or password")
    await reset_fail(email, pool)
    request.session["user"] = {
        "id": user['id'], "email": user['email'],
        "name": user['name'] or "", "picture": user['picture'] or "",
    }
    await audit_log("login_success", user_id=user['id'], ip=ip)
    return {"message": "Logged in"}

@api_router.get("/auth/google")
async def google_login():
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(501, "Google OAuth not configured. Use email login.")
    state = secrets.token_urlsafe(16)
    params = (f"client_id={GOOGLE_CLIENT_ID}&redirect_uri={GOOGLE_REDIRECT_URI}"
              f"&response_type=code&scope=openid%20email%20profile&access_type=offline&state={state}")
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")

@api_router.get("/auth/google/callback")
async def google_callback(request: Request, code: str = None, error: str = None, pool=Depends(get_pool)):
    if error or not code:
        return RedirectResponse(f"{FRONTEND_URL}/login?error=oauth_failed")
    try:
        async with httpx.AsyncClient(timeout=10.0) as hc:
            tokens = (await hc.post("https://oauth2.googleapis.com/token", data={
                "code": code, "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI, "grant_type": "authorization_code",
            })).json()
            if "error" in tokens:
                return RedirectResponse(f"{FRONTEND_URL}/login?error=token_exchange_failed")
            ui = (await hc.get("https://www.googleapis.com/oauth2/v2/userinfo",
                headers={"Authorization": f"Bearer {tokens['access_token']}"})).json()
        existing = await pool.fetchrow("SELECT id FROM users WHERE email=$1", ui["email"])
        if existing:
            user_id = existing['id']
            await pool.execute("UPDATE users SET name=$1, picture=$2 WHERE id=$3",
                ui.get("name",""), ui.get("picture",""), user_id)
        else:
            user_id = ui["id"]
            await pool.execute(
                "INSERT INTO users (id,email,name,picture) VALUES ($1,$2,$3,$4)",
                user_id, ui["email"], ui.get("name",""), ui.get("picture",""))
        request.session["user"] = {
            "id": user_id, "email": ui["email"],
            "name": ui.get("name",""), "picture": ui.get("picture",""),
        }
        return RedirectResponse(f"{FRONTEND_URL}/?login=success")
    except Exception as e:
        logger.error(f"OAuth error: {e}")
        return RedirectResponse(f"{FRONTEND_URL}/login?error=server_error")

@api_router.post("/auth/logout")
async def logout(request: Request):
    request.session.clear()
    return {"message": "Logged out"}

@api_router.post("/auth/demo")
async def demo_login(request: Request, pool=Depends(get_pool)):
    ip = get_client_ip(request)
    if not rate_limit(f"demo:{ip}", 20, 3600):
        raise HTTPException(429, "Too many demo attempts.")
    await pool.execute(
        "INSERT INTO users (id,email,name,picture) VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING",
        "demo-user", "demo@apiworkbench.dev", "Demo User", "")
    request.session["user"] = {"id":"demo-user","email":"demo@apiworkbench.dev","name":"Demo User","picture":""}
    return {"message": "Logged in as demo user"}

@api_router.get("/audit")
async def get_audit_log(limit: int = 100, user=Depends(get_current_user), pool=Depends(get_pool)):
    rows = await pool.fetch(
        "SELECT timestamp,event,ip,details FROM audit_log WHERE user_id=$1 ORDER BY timestamp DESC LIMIT $2",
        user["id"], min(limit, 500))
    return [row_to_dict(r) for r in rows]

# ═══════════════════════════════════════════════════
#  COLLECTIONS
# ═══════════════════════════════════════════════════

@api_router.get("/collections", response_model=List[Collection])
async def get_collections(user=Depends(get_current_user), pool=Depends(get_pool)):
    rows = await pool.fetch("SELECT * FROM collections WHERE user_id=$1 ORDER BY created_at", user["id"])
    return [Collection(**row_to_dict(r)) for r in rows]

@api_router.post("/collections", response_model=Collection)
async def create_collection(inp: CollectionCreate, user=Depends(get_current_user), pool=Depends(get_pool)):
    col = Collection(**inp.model_dump())
    await pool.execute(
        "INSERT INTO collections (id,user_id,name,description,parent_id) VALUES ($1,$2,$3,$4,$5)",
        col.id, user["id"], col.name, col.description, col.parent_id)
    return col

@api_router.put("/collections/{cid}", response_model=Collection)
async def update_collection(cid: str, inp: CollectionCreate, user=Depends(get_current_user), pool=Depends(get_pool)):
    if not await pool.fetchrow("SELECT id FROM collections WHERE id=$1 AND user_id=$2", cid, user["id"]):
        raise HTTPException(404, "Not found")
    await pool.execute(
        "UPDATE collections SET name=$1,description=$2,parent_id=$3 WHERE id=$4 AND user_id=$5",
        inp.name, inp.description, inp.parent_id, cid, user["id"])
    return Collection(**row_to_dict(await pool.fetchrow("SELECT * FROM collections WHERE id=$1", cid)))

@api_router.delete("/collections/{cid}")
async def delete_collection(cid: str, user=Depends(get_current_user), pool=Depends(get_pool)):
    if not await pool.fetchrow("SELECT id FROM collections WHERE id=$1 AND user_id=$2", cid, user["id"]):
        raise HTTPException(404, "Not found")
    await pool.execute("DELETE FROM requests WHERE collection_id=$1 AND user_id=$2", cid, user["id"])
    await pool.execute("DELETE FROM collections WHERE id=$1 AND user_id=$2", cid, user["id"])
    return {"message": "Deleted"}

# ═══════════════════════════════════════════════════
#  REQUESTS
# ═══════════════════════════════════════════════════

@api_router.get("/requests", response_model=List[RequestConfig])
async def get_requests(collection_id: Optional[str] = None, user=Depends(get_current_user), pool=Depends(get_pool)):
    if collection_id:
        rows = await pool.fetch(
            "SELECT * FROM requests WHERE user_id=$1 AND collection_id=$2 ORDER BY created_at",
            user["id"], collection_id)
    else:
        rows = await pool.fetch(
            "SELECT * FROM requests WHERE user_id=$1 ORDER BY created_at", user["id"])
    return [RequestConfig(**row_to_dict(r)) for r in rows]

@api_router.post("/requests", response_model=RequestConfig)
async def create_request(inp: RequestCreate, user=Depends(get_current_user), pool=Depends(get_pool)):
    req = RequestConfig(**inp.model_dump())
    await pool.execute(
        "INSERT INTO requests (id,user_id,collection_id,name,method,url,params,headers,body,body_type,auth) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        req.id, user["id"], req.collection_id, req.name, req.method, req.url,
        json.dumps([p.model_dump() for p in req.params]),
        json.dumps([h.model_dump() for h in req.headers]),
        req.body, req.body_type, json.dumps(req.auth.model_dump()))
    return req

@api_router.put("/requests/{rid}", response_model=RequestConfig)
async def update_request(rid: str, inp: RequestCreate, user=Depends(get_current_user), pool=Depends(get_pool)):
    if not await pool.fetchrow("SELECT id FROM requests WHERE id=$1 AND user_id=$2", rid, user["id"]):
        raise HTTPException(404, "Not found")
    await pool.execute(
        "UPDATE requests SET name=$1,method=$2,url=$3,params=$4,headers=$5,body=$6,body_type=$7,auth=$8,collection_id=$9,updated_at=NOW() WHERE id=$10 AND user_id=$11",
        inp.name, inp.method, inp.url,
        json.dumps([p.model_dump() for p in inp.params]),
        json.dumps([h.model_dump() for h in inp.headers]),
        inp.body, inp.body_type, json.dumps(inp.auth.model_dump()),
        inp.collection_id, rid, user["id"])
    return RequestConfig(**row_to_dict(await pool.fetchrow("SELECT * FROM requests WHERE id=$1", rid)))

@api_router.delete("/requests/{rid}")
async def delete_request(rid: str, user=Depends(get_current_user), pool=Depends(get_pool)):
    if not await pool.fetchrow("SELECT id FROM requests WHERE id=$1 AND user_id=$2", rid, user["id"]):
        raise HTTPException(404, "Not found")
    await pool.execute("DELETE FROM requests WHERE id=$1 AND user_id=$2", rid, user["id"])
    return {"message": "Deleted"}

# ═══════════════════════════════════════════════════
#  ENVIRONMENTS
# ═══════════════════════════════════════════════════

@api_router.get("/environments", response_model=List[Environment])
async def get_environments(user=Depends(get_current_user), pool=Depends(get_pool)):
    rows = await pool.fetch("SELECT * FROM environments WHERE user_id=$1 ORDER BY created_at", user["id"])
    return [Environment(**row_to_dict(r)) for r in rows]

@api_router.post("/environments", response_model=Environment)
async def create_environment(inp: EnvironmentCreate, user=Depends(get_current_user), pool=Depends(get_pool)):
    env = Environment(**inp.model_dump())
    await pool.execute(
        "INSERT INTO environments (id,user_id,name,variables,is_active) VALUES ($1,$2,$3,$4,$5)",
        env.id, user["id"], env.name,
        json.dumps([v.model_dump() for v in env.variables]), env.is_active)
    return env

@api_router.put("/environments/{eid}", response_model=Environment)
async def update_environment(eid: str, inp: EnvironmentCreate, user=Depends(get_current_user), pool=Depends(get_pool)):
    if not await pool.fetchrow("SELECT id FROM environments WHERE id=$1 AND user_id=$2", eid, user["id"]):
        raise HTTPException(404, "Not found")
    await pool.execute(
        "UPDATE environments SET name=$1,variables=$2,is_active=$3 WHERE id=$4 AND user_id=$5",
        inp.name, json.dumps([v.model_dump() for v in inp.variables]), inp.is_active, eid, user["id"])
    return Environment(**row_to_dict(await pool.fetchrow("SELECT * FROM environments WHERE id=$1", eid)))

@api_router.delete("/environments/{eid}")
async def delete_environment(eid: str, user=Depends(get_current_user), pool=Depends(get_pool)):
    if not await pool.fetchrow("SELECT id FROM environments WHERE id=$1 AND user_id=$2", eid, user["id"]):
        raise HTTPException(404, "Not found")
    await pool.execute("DELETE FROM environments WHERE id=$1 AND user_id=$2", eid, user["id"])
    return {"message": "Deleted"}

@api_router.post("/environments/{eid}/activate")
async def activate_environment(eid: str, user=Depends(get_current_user), pool=Depends(get_pool)):
    await pool.execute("UPDATE environments SET is_active=FALSE WHERE user_id=$1", user["id"])
    result = await pool.execute(
        "UPDATE environments SET is_active=TRUE WHERE id=$1 AND user_id=$2", eid, user["id"])
    if result == "UPDATE 0":
        raise HTTPException(404, "Not found")
    return {"message": "Activated"}

# ═══════════════════════════════════════════════════
#  HISTORY
# ═══════════════════════════════════════════════════

@api_router.get("/history", response_model=List[HistoryEntry])
async def get_history(limit: int = 50, user=Depends(get_current_user), pool=Depends(get_pool)):
    rows = await pool.fetch(
        "SELECT * FROM history WHERE user_id=$1 ORDER BY timestamp DESC LIMIT $2",
        user["id"], min(limit, 200))
    return [HistoryEntry(**row_to_dict(r)) for r in rows]

@api_router.delete("/history")
async def clear_history(user=Depends(get_current_user), pool=Depends(get_pool)):
    await pool.execute("DELETE FROM history WHERE user_id=$1", user["id"])
    return {"message": "Cleared"}

# ═══════════════════════════════════════════════════
#  EXECUTE
# ═══════════════════════════════════════════════════

@api_router.post("/execute", response_model=ExecuteResponse)
async def execute_request(request: ExecuteRequest, req: Request,
                          user=Depends(get_current_user), pool=Depends(get_pool)):
    ip = get_client_ip(req)
    if not rate_limit(f"exec:{user['id']}", 60, 60):
        raise HTTPException(429, "Too many requests. Slow down.")
    safe, reason = is_safe_url(request.url)
    if not safe:
        await audit_log("ssrf_blocked", user_id=user["id"], ip=ip, details={"url": request.url})
        raise HTTPException(403, f"Request blocked: {reason}")
    if len((request.body or "").encode()) > MAX_BODY_SIZE:
        raise HTTPException(413, "Request body too large")

    headers = {h.key: h.value for h in request.headers if h.enabled and h.key}
    if request.auth.type == "bearer" and request.auth.bearer_token:
        headers["Authorization"] = f"Bearer {request.auth.bearer_token}"
    elif request.auth.type == "basic" and request.auth.basic_username:
        creds = f"{request.auth.basic_username}:{request.auth.basic_password or ''}"
        headers["Authorization"] = f"Basic {base64.b64encode(creds.encode()).decode()}"
    elif request.auth.type == "api_key" and request.auth.api_key_name and request.auth.api_key_value:
        if request.auth.api_key_location == "header":
            headers[request.auth.api_key_name] = request.auth.api_key_value

    params = {p.key: p.value for p in request.params if p.enabled and p.key}
    if request.auth.type == "api_key" and request.auth.api_key_location == "query":
        if request.auth.api_key_name and request.auth.api_key_value:
            params[request.auth.api_key_name] = request.auth.api_key_value

    body = None
    if request.method.upper() in ["POST","PUT","PATCH"] and request.body:
        body = request.body
        ct = {"json":"application/json","xml":"application/xml",
              "form":"application/x-www-form-urlencoded","text":"text/plain"}
        if "Content-Type" not in headers:
            headers["Content-Type"] = ct.get(request.body_type, "application/json")

    try:
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, follow_redirects=True, verify=True) as hc:
            resp = await hc.request(method=request.method.upper(), url=request.url,
                params=params or None, headers=headers or None, content=body)
        elapsed = round((time.monotonic() - t0) * 1000, 2)
        try:
            resp_body = resp.text
        except Exception:
            resp_body = resp.content.decode("utf-8", errors="replace")

        req_name = request.url.split("?")[0].split("/")[-1] or "Request"
        await pool.execute(
            "INSERT INTO history (id,user_id,request_name,method,url,status_code,response_time,response_size) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
            str(uuid.uuid4()), user["id"], req_name, request.method.upper(), request.url,
            resp.status_code, elapsed, len(resp.content))
        await pool.execute("""
            DELETE FROM history WHERE user_id=$1 AND id NOT IN (
                SELECT id FROM history WHERE user_id=$1 ORDER BY timestamp DESC LIMIT 100)""",
            user["id"])

        return ExecuteResponse(
            status_code=resp.status_code, headers=dict(resp.headers),
            body=resp_body, response_time=elapsed, response_size=len(resp.content),
            redirect_count=len(resp.history), final_url=str(resp.url))
    except httpx.TimeoutException:
        raise HTTPException(408, f"Request timed out after {REQUEST_TIMEOUT}s")
    except httpx.RequestError as e:
        raise HTTPException(400, f"Request failed: {str(e)}")

# ═══════════════════════════════════════════════════
#  IMPORT / EXPORT
# ═══════════════════════════════════════════════════

@api_router.get("/export")
async def export_collection(user=Depends(get_current_user), pool=Depends(get_pool)):
    cols = [row_to_dict(r) for r in await pool.fetch(
        "SELECT id,name,description,parent_id,created_at FROM collections WHERE user_id=$1", user["id"])]
    reqs = [row_to_dict(r) for r in await pool.fetch(
        "SELECT id,collection_id,name,method,url,params,headers,body,body_type,auth,created_at,updated_at FROM requests WHERE user_id=$1", user["id"])]
    envs = [row_to_dict(r) for r in await pool.fetch(
        "SELECT id,name,variables,is_active,created_at FROM environments WHERE user_id=$1", user["id"])]
    return {"version": 2, "collections": cols, "requests": reqs, "environments": envs}

@api_router.post("/import")
async def import_collection(payload: ImportPayload, user=Depends(get_current_user), pool=Depends(get_pool)):
    data = payload.data
    imported = {"collections": 0, "requests": 0}
    if "requests" in data:
        for item in data.get("collections", []):
            await pool.execute(
                "INSERT INTO collections (id,user_id,name,description,parent_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
                str(uuid.uuid4()), user["id"], item.get("name","Imported"),
                item.get("description",""), item.get("parent_id"))
            imported["collections"] += 1
        for item in data.get("requests", []):
            await pool.execute(
                "INSERT INTO requests (id,user_id,collection_id,name,method,url,params,headers,body,body_type,auth) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
                str(uuid.uuid4()), user["id"], item.get("collection_id"),
                item.get("name","Imported"), item.get("method","GET"), item.get("url",""),
                json.dumps(item.get("params",[])), json.dumps(item.get("headers",[])),
                item.get("body",""), item.get("body_type","json"), json.dumps(item.get("auth",{})))
            imported["requests"] += 1
    elif "item" in data:
        for item in data.get("item", []):
            req = item.get("request", {})
            url_obj = req.get("url", {})
            url = url_obj if isinstance(url_obj, str) else url_obj.get("raw","")
            hdrs = [{"key":h.get("key",""),"value":h.get("value",""),"enabled":True} for h in req.get("header",[])]
            await pool.execute(
                "INSERT INTO requests (id,user_id,collection_id,name,method,url,params,headers,body,body_type,auth) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
                str(uuid.uuid4()), user["id"], None,
                item.get("name","Imported"), req.get("method","GET"), url,
                "[]", json.dumps(hdrs), req.get("body",{}).get("raw",""), "json", '{"type":"none"}')
            imported["requests"] += 1
    return {"message": f"Imported {imported['requests']} requests, {imported['collections']} collections"}

@api_router.get("/health")
async def health(pool=Depends(get_pool)):
    await pool.fetchval("SELECT 1")
    return {"status":"healthy","version":"2.0.0","db":"postgres","bcrypt":BCRYPT_AVAILABLE}

# ═══════════════════════════════════════════════════
#  Serve React SPA
# ═══════════════════════════════════════════════════

app.include_router(api_router)

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=STATIC_DIR / "static"), name="assets")

    @app.get("/{full_path:path}", response_class=HTMLResponse)
    async def serve_spa(full_path: str):
        index = STATIC_DIR / "index.html"
        if index.exists():
            return HTMLResponse(index.read_text())
        return HTMLResponse("<h1>Build frontend first</h1>", status_code=503)
else:
    @app.get("/")
    async def root():
        return {"message": "API Workbench (Postgres) — build frontend first."}
