import asyncio
import logging
import os
import secrets
import socket
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

from db import db, client
from auth import hash_password, verify_password, set_auth_cookies, decode_token, get_current_user, create_token
from drivers import PROTOCOLS, validate_address, infer_type
from plc_ext import list_serial_ports
from security import router as security_router, client_from_request
from tag_import import parse_tag_file
from records import router as records_router, build_pdf
from engine import Engine
from formats import TYPE_SPEC, spec_for
from seed import create_demo_project
from storage import init_storage, put_object, get_object, APP_NAME

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI()
api = APIRouter(prefix="/api")
engine = Engine(db)
DEFAULT_SETTINGS = {"byte_order": "ABCD", "initial_screen": "", "screen_saver_enabled": False, "screen_saver_minutes": 5, "security_enabled": False,
                    "record_retention_enabled": True, "record_retention_days": 90}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------------- Models ----------------
class RegisterIn(BaseModel):
    email: str
    password: str = Field(min_length=6)
    name: str = ""


class LoginIn(BaseModel):
    email: str
    password: str


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    width: int = 1280
    height: int = 720


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    screens: Optional[List[dict]] = None
    settings: Optional[dict] = None
    text_library: Optional[List[dict]] = None
    fonts: Optional[List[dict]] = None


class PublishIn(BaseModel):
    allow_operate: bool = True


class DeviceIn(BaseModel):
    name: str
    protocol: str
    host: str = ""
    port: Optional[int] = None
    rack: int = 0
    slot: int = 1
    unit_id: int = 1
    word_swap: bool = False
    byte_order: str = ""
    serial_port: str = ""
    baudrate: int = 9600
    databits: int = 8
    parity: str = "N"
    stopbits: int = 1
    serial_mode: str = "RS485"
    simulate: bool = True
    reconnect_s: int = Field(5, ge=1, le=3600)
    timeout_ms: int = Field(1000, ge=100, le=30000)
    opc_namespace: int = 3
    opc_endpoint: str = ""
    opc_user: str = ""
    opc_password: str = ""
    fins_src_node: int = 0
    fins_dst_node: int = 0
    local_tsap: str = ""
    remote_tsap: str = ""


class TagIn(BaseModel):
    name: str
    device_id: str
    address: str
    data_type: str = "INT16"
    decimals: int = 0
    unit: str = ""
    description: str = ""
    sim_mode: str = "sine"
    sim_min: float = 0
    sim_max: float = 100
    sim_period: float = 30
    alarm_enabled: bool = False
    hh: Optional[float] = None
    h: Optional[float] = None
    l: Optional[float] = None
    ll: Optional[float] = None
    alarm_on_true: bool = True
    alarm_message: str = ""
    log_enabled: bool = True
    writable: bool = True


class WriteIn(BaseModel):
    tag_id: str
    value: Any


class AckIn(BaseModel):
    alarm_id: Optional[str] = None


# ---------------- Auth ----------------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.strip().lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email sudah terdaftar")
    user = {"id": str(uuid.uuid4()), "email": email, "name": body.name or email.split("@")[0], "role": "engineer", "created_at": now_iso()}
    await db.users.insert_one({**user, "password_hash": hash_password(body.password)})
    await create_demo_project(db, user["id"])
    token = set_auth_cookies(response, user["id"], email)
    return {**user, "token": token}


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.strip().lower()
    ident = f"{request.client.host if request.client else ''}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and att.get("locked_until", "") > now_iso():
        raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        count = (att.get("count", 0) if att else 0) + 1
        await db.login_attempts.update_one({"identifier": ident}, {"$set": {"count": count, "locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}}, upsert=True)
        raise HTTPException(401, "Email atau password salah")
    await db.login_attempts.delete_one({"identifier": ident})
    token = set_auth_cookies(response, user["id"], email)
    return {"id": user["id"], "email": email, "name": user.get("name"), "role": user.get("role"), "token": token}


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/", secure=True, samesite="none")
    response.delete_cookie("refresh_token", path="/", secure=True, samesite="none")
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


@api.post("/auth/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "Tidak ada refresh token")
    p = decode_token(token, "refresh")
    access = create_token(p["sub"], p.get("email", ""), "access", timedelta(hours=12))
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=43200, path="/")
    return {"token": access}


# ---------------- Helpers ----------------
async def owned_project(project_id: str, user: dict) -> dict:
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Proyek tidak ditemukan")
    return p


CATEGORY = {"BOOL": "Bit", "INT16": "Word", "UINT16": "Word", "INT32": "DWord", "UINT32": "DWord", "FLOAT32": "Float"}


def tag_out(t: dict) -> dict:
    return {**t, "max_chars": spec_for(t["data_type"], t.get("decimals", 0))["max_chars"], "category": CATEGORY[t["data_type"]]}


async def project_tags(pid: str):
    return [tag_out(t) for t in await db.tags.find({"project_id": pid}, {"_id": 0}).to_list(5000)]


def project_summary(p: dict) -> dict:
    return {k: p.get(k) for k in ("id", "name", "description", "width", "height", "published", "publish_slug", "allow_operate", "created_at", "updated_at", "published_at")} | {
        "screen_count": len(p.get("screens") or []), "widget_count": sum(len(s.get("widgets", [])) for s in p.get("screens") or [])}


# ---------------- Projects ----------------
@api.get("/meta")
async def meta():
    return {"protocols": PROTOCOLS, "data_types": list(TYPE_SPEC.keys())}


@api.get("/projects")
async def list_projects(user=Depends(get_current_user)):
    items = await db.projects.find({"owner_id": user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(500)
    counts = {}
    async for t in db.tags.aggregate([{"$group": {"_id": "$project_id", "n": {"$sum": 1}}}]):
        counts[t["_id"]] = t["n"]
    return [project_summary(p) | {"tag_count": counts.get(p["id"], 0)} for p in items]


@api.post("/projects")
async def create_project(body: ProjectCreate, user=Depends(get_current_user)):
    p = {
        "id": str(uuid.uuid4()), "owner_id": user["id"], "name": body.name, "description": body.description,
        "width": body.width, "height": body.height, "fonts": [],
        "screens": [{"id": str(uuid.uuid4()), "name": "Layar 1", "bg_color": "#0B0F17", "bg_image": "", "widgets": []}],
        "published": False, "publish_slug": None, "allow_operate": True, "published_screens": None, "settings": dict(DEFAULT_SETTINGS),
        "created_at": now_iso(), "updated_at": now_iso(),
    }
    await db.projects.insert_one(dict(p))
    return project_summary(p)


@api.get("/projects/{project_id}")
async def get_project(project_id: str, user=Depends(get_current_user)):
    p = await owned_project(project_id, user)
    p.pop("published_screens", None)
    p["settings"] = {**DEFAULT_SETTINGS, **(p.get("settings") or {})}
    return p


@api.put("/projects/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate, user=Depends(get_current_user)):
    await owned_project(project_id, user)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    upd["updated_at"] = now_iso()
    await db.projects.update_one({"id": project_id}, {"$set": upd})
    return {"ok": True, "updated_at": upd["updated_at"]}


@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, user=Depends(get_current_user)):
    await owned_project(project_id, user)
    await db.projects.delete_one({"id": project_id})
    await db.devices.delete_many({"project_id": project_id})
    await db.tags.delete_many({"project_id": project_id})
    await db.alarms.delete_many({"project_id": project_id})
    await db.tag_history.delete_many({"project_id": project_id})
    for c in ("data_records", "alarm_defs", "record_samples", "client_groups", "client_users"):
        await db[c].delete_many({"project_id": project_id})
    return {"ok": True}


@api.post("/projects/{project_id}/publish")
async def publish(project_id: str, body: PublishIn, user=Depends(get_current_user)):
    p = await owned_project(project_id, user)
    slug = p.get("publish_slug") or secrets.token_urlsafe(8).replace("_", "x").replace("-", "y").lower()
    upd = {"published": True, "publish_slug": slug, "allow_operate": body.allow_operate, "published_at": now_iso(),
           "published_screens": p["screens"], "published_meta": {"name": p["name"], "width": p["width"], "height": p["height"], "fonts": p.get("fonts", [])}}
    await db.projects.update_one({"id": project_id}, {"$set": upd})
    return {"published": True, "publish_slug": slug, "allow_operate": body.allow_operate, "published_at": upd["published_at"]}


@api.post("/projects/{project_id}/unpublish")
async def unpublish(project_id: str, user=Depends(get_current_user)):
    await owned_project(project_id, user)
    await db.projects.update_one({"id": project_id}, {"$set": {"published": False}})
    return {"published": False}


# ---------------- Devices ----------------
def check_protocol(protocol: str):
    if protocol not in PROTOCOLS:
        raise HTTPException(400, "Protokol tidak dikenal")


@api.get("/projects/{project_id}/devices")
async def list_devices(project_id: str, user=Depends(get_current_user)):
    await owned_project(project_id, user)
    devs = await db.devices.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    return [d | {"runtime": engine.dev_status.get(d["id"], {"status": "menunggu", "error": None})} for d in devs]


@api.post("/projects/{project_id}/devices")
async def create_device(project_id: str, body: DeviceIn, user=Depends(get_current_user)):
    await owned_project(project_id, user)
    check_protocol(body.protocol)
    d = body.model_dump() | {"id": str(uuid.uuid4()), "project_id": project_id, "created_at": now_iso()}
    d["port"] = d["port"] or PROTOCOLS[body.protocol]["port"]
    await db.devices.insert_one(dict(d))
    await engine.load_config()
    d.pop("_id", None)
    return d


async def owned_device(device_id: str, user: dict) -> dict:
    d = await db.devices.find_one({"id": device_id}, {"_id": 0})
    if not d:
        raise HTTPException(404, "Perangkat tidak ditemukan")
    await owned_project(d["project_id"], user)
    return d


@api.put("/devices/{device_id}")
async def update_device(device_id: str, body: DeviceIn, user=Depends(get_current_user)):
    await owned_device(device_id, user)
    check_protocol(body.protocol)
    upd = body.model_dump()
    upd["port"] = upd["port"] or PROTOCOLS[body.protocol]["port"]
    await db.devices.update_one({"id": device_id}, {"$set": upd})
    engine.reset_driver(device_id)
    await engine.load_config()
    return await db.devices.find_one({"id": device_id}, {"_id": 0})


@api.delete("/devices/{device_id}")
async def delete_device(device_id: str, user=Depends(get_current_user)):
    await owned_device(device_id, user)
    await db.devices.delete_one({"id": device_id})
    await db.tags.delete_many({"device_id": device_id})
    engine.reset_driver(device_id)
    await engine.load_config()
    return {"ok": True}


@api.post("/devices/{device_id}/test")
async def test_device(device_id: str, user=Depends(get_current_user)):
    d = await owned_device(device_id, user)
    if d.get("simulate", True) or d["protocol"] == "internal":
        return {"ok": True, "message": "Mode simulasi / memori internal — tidak perlu koneksi fisik"}
    tag = await db.tags.find_one({"device_id": device_id}, {"_id": 0})
    res = await engine.test(d, tag)
    if res["ok"]:
        engine._count(device_id, 0, 0, res["rtt_ms"])
    return res


@api.get("/system/serial-ports")
async def serial_ports(user=Depends(get_current_user)):
    try:
        return await asyncio.to_thread(list_serial_ports)
    except Exception as e:
        raise HTTPException(500, f"Gagal membaca daftar port: {e}")


def lan_addresses():
    ips = set()
    try:
        ips.update(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


@api.get("/system/info")
async def system_info(user=Depends(get_current_user)):
    mode = os.environ.get("APP_MODE", "cloud")
    port = os.environ.get("HTTP_PORT", "8080")
    urls = [f"http://{ip}:{port}" for ip in lan_addresses()] if mode == "local" else []
    return {"mode": mode, "hostname": socket.gethostname(), "port": port, "urls": urls, "local_url": f"http://localhost:{port}" if mode == "local" else None}


# ---------------- Tags ----------------
async def validate_tag(body: TagIn, project_id: str) -> dict:
    dev = await db.devices.find_one({"id": body.device_id, "project_id": project_id}, {"_id": 0})
    if not dev:
        raise HTTPException(400, "Perangkat tidak valid")
    if body.data_type not in TYPE_SPEC:
        raise HTTPException(400, "Tipe data tidak valid")
    try:
        validate_address(dev["protocol"], body.address)
    except ValueError as e:
        raise HTTPException(400, str(e))
    data = body.model_dump()
    data["decimals"] = spec_for(body.data_type, body.decimals)["decimals"]
    return data


@api.get("/projects/{project_id}/tags")
async def list_tags(project_id: str, user=Depends(get_current_user)):
    await owned_project(project_id, user)
    return await project_tags(project_id)


@api.post("/projects/{project_id}/tags")
async def create_tag(project_id: str, body: TagIn, user=Depends(get_current_user)):
    await owned_project(project_id, user)
    data = await validate_tag(body, project_id)
    if await db.tags.find_one({"project_id": project_id, "name": body.name}):
        raise HTTPException(400, "Nama tag sudah dipakai")
    t = data | {"id": str(uuid.uuid4()), "project_id": project_id}
    await db.tags.insert_one(dict(t))
    await engine.load_config()
    return tag_out(t)


@api.put("/tags/{tag_id}")
async def update_tag(tag_id: str, body: TagIn, user=Depends(get_current_user)):
    t = await db.tags.find_one({"id": tag_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tag tidak ditemukan")
    await owned_project(t["project_id"], user)
    data = await validate_tag(body, t["project_id"])
    await db.tags.update_one({"id": tag_id}, {"$set": data})
    await engine.load_config()
    return tag_out(t | data)


@api.delete("/tags/{tag_id}")
async def delete_tag(tag_id: str, user=Depends(get_current_user)):
    t = await db.tags.find_one({"id": tag_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tag tidak ditemukan")
    await owned_project(t["project_id"], user)
    await db.tags.delete_one({"id": tag_id})
    await engine.load_config()
    return {"ok": True}


# ---------------- Runtime (shared by editor preview & public app) ----------------
async def rt_private(project_id: str, user=Depends(get_current_user)) -> dict:
    p = await owned_project(project_id, user)
    return {"id": p["id"], "allow_operate": True}


async def rt_public(slug: str, request: Request) -> dict:
    p = await db.projects.find_one({"publish_slug": slug, "published": True}, {"_id": 0, "id": 1, "allow_operate": 1, "settings": 1})
    if not p:
        raise HTTPException(404, "Aplikasi tidak ditemukan atau belum dipublish")
    ctx = {"id": p["id"], "allow_operate": p.get("allow_operate", True), "can_ack": True}
    if (p.get("settings") or {}).get("security_enabled"):
        _, g = await client_from_request(request, p["id"])
        ctx["allow_operate"] = ctx["allow_operate"] and g.get("can_operate", False)
        ctx["can_ack"] = g.get("can_ack", False)
    return ctx


def make_rt_router(resolver):
    r = APIRouter()

    @r.get("/values")
    async def values(ctx=Depends(resolver)):
        dev_ids = [d["id"] async for d in db.devices.find({"project_id": ctx["id"]}, {"_id": 0, "id": 1})]
        snap = engine.snapshot(ctx["id"], dev_ids)
        events = await db.alarms.find({"project_id": ctx["id"], "active": True}, {"_id": 0, "id": 1, "message": 1, "level": 1, "group": 1, "acked": 1,
                                       "beep": 1, "beep_once": 1, "alarm_screen": 1, "popup_once": 1, "ts_in": 1}).to_list(200)
        snap["active_alarms"] = len(events)
        snap["alarm_events"] = events
        return snap

    async def record_meta(pid: str, no: int):
        rec = await db.data_records.find_one({"project_id": pid, "number": no}, {"_id": 0})
        if not rec:
            raise HTTPException(404, f"Data record #{no} tidak ditemukan")
        return rec

    def time_range(start: Optional[str], end: Optional[str], minutes: int):
        e = datetime.fromisoformat(end.replace("Z", "+00:00")) if end else datetime.now(timezone.utc)
        s = datetime.fromisoformat(start.replace("Z", "+00:00")) if start else e - timedelta(minutes=max(1, minutes))
        return s, e

    @r.get("/records")
    async def records(ctx=Depends(resolver)):
        tags = {t["id"]: t for t in await db.tags.find({"project_id": ctx["id"]}, {"_id": 0}).to_list(5000)}
        recs = await db.data_records.find({"project_id": ctx["id"]}, {"_id": 0}).sort("number", 1).to_list(100)
        return [{"number": x["number"], "name": x.get("name", ""), "interval_s": x.get("interval_s", 5),
                 "channels": [{"tag_id": c, "name": tags[c]["name"], "unit": tags[c].get("unit", ""), "decimals": tags[c].get("decimals", 0)} for c in x["channels"] if c in tags]} for x in recs]

    @r.get("/records/{no}/samples")
    async def samples(no: int, start: Optional[str] = None, end: Optional[str] = None, minutes: int = 60, limit: int = 3000, ctx=Depends(resolver)):
        s, e = time_range(start, end, minutes)
        rows = await db.record_samples.find({"project_id": ctx["id"], "record": no, "ts": {"$gte": s, "$lte": e}}, {"_id": 0, "ts": 1, "v": 1}).sort("ts", -1).to_list(min(limit, 20000))
        return [{"ts": x["ts"].replace(tzinfo=timezone.utc).isoformat(), "v": x["v"]} for x in reversed(rows)]

    @r.get("/records/{no}/pdf")
    async def pdf(no: int, start: Optional[str] = None, end: Optional[str] = None, minutes: int = 60, ctx=Depends(resolver)):
        rec = await record_meta(ctx["id"], no)
        s, e = time_range(start, end, minutes)
        rows = await db.record_samples.find({"project_id": ctx["id"], "record": no, "ts": {"$gte": s, "$lte": e}}, {"_id": 0}).sort("ts", 1).to_list(20000)
        tags = {t["id"]: t for t in await db.tags.find({"project_id": ctx["id"]}, {"_id": 0}).to_list(5000)}
        p = await db.projects.find_one({"id": ctx["id"]}, {"_id": 0, "name": 1})
        data = await asyncio.to_thread(build_pdf, p["name"], rec, tags, rows, s, e)
        return Response(data, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=record-{no}.pdf"})

    @r.post("/write")
    async def write(body: WriteIn, ctx=Depends(resolver)):
        if not ctx.get("allow_operate", True):
            raise HTTPException(403, "Mode operasi tidak diizinkan (read-only)")
        t = await db.tags.find_one({"id": body.tag_id, "project_id": ctx["id"]}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Tag tidak ditemukan")
        if not t.get("writable", True):
            raise HTTPException(403, "Tag read-only")
        try:
            v = await engine.write(t, body.value)
        except Exception as e:
            raise HTTPException(502, f"Gagal menulis ke PLC: {e}")
        return {"ok": True, "value": v}

    @r.get("/history")
    async def history(tags: str = "", minutes: int = 30, limit: int = 2000, ctx=Depends(resolver)):
        ids = [x for x in tags.split(",") if x]
        since = datetime.now(timezone.utc) - timedelta(minutes=max(1, min(minutes, 10080)))
        q = {"project_id": ctx["id"], "ts": {"$gte": since}}
        if ids:
            q["tag_id"] = {"$in": ids}
        rows = await db.tag_history.find(q, {"_id": 0, "tag_id": 1, "ts": 1, "v": 1}).sort("ts", -1).to_list(min(limit, 20000))
        return [{"tag_id": r_["tag_id"], "ts": r_["ts"].replace(tzinfo=timezone.utc).isoformat(), "v": r_["v"]} for r_ in reversed(rows)]

    @r.get("/alarms")
    async def alarms(active_only: bool = False, limit: int = 100, ctx=Depends(resolver)):
        q = {"project_id": ctx["id"]}
        if active_only:
            q["active"] = True
        return await db.alarms.find(q, {"_id": 0}).sort("ts_in", -1).to_list(min(limit, 1000))

    @r.post("/alarms/ack")
    async def ack(body: AckIn, ctx=Depends(resolver)):
        if not ctx.get("can_ack", True):
            raise HTTPException(403, "Tidak punya hak ACK alarm")
        q = {"project_id": ctx["id"], "acked": False}
        if body.alarm_id:
            q["id"] = body.alarm_id
        res = await db.alarms.update_many(q, {"$set": {"acked": True, "ack_at": now_iso()}})
        return {"acked": res.modified_count}

    return r


api.include_router(make_rt_router(rt_private), prefix="/projects/{project_id}/rt")
api.include_router(make_rt_router(rt_public), prefix="/public/{slug}/rt")


@api.get("/public/{slug}")
async def public_app(slug: str, request: Request):
    p = await db.projects.find_one({"publish_slug": slug, "published": True}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Aplikasi tidak ditemukan atau belum dipublish")
    m = p.get("published_meta") or {}
    settings = {**DEFAULT_SETTINGS, **(p.get("settings") or {})}
    base = {"name": m.get("name", p["name"]), "security_enabled": settings["security_enabled"]}
    session = None
    if settings["security_enabled"]:
        try:
            u, g = await client_from_request(request, p["id"])
            session = {"user": {"id": u["id"], "username": u["username"], "full_name": u.get("full_name", "")}, "group": g}
        except HTTPException:
            return base | {"requires_login": True}
    tags = await project_tags(p["id"])
    devices = await db.devices.find({"project_id": p["id"]}, {"_id": 0, "id": 1, "name": 1, "protocol": 1}).to_list(500)
    return base | {"width": m.get("width", p["width"]), "height": m.get("height", p["height"]),
            "fonts": m.get("fonts", []), "screens": p["published_screens"], "allow_operate": p.get("allow_operate", True),
            "published_at": p.get("published_at"), "tags": tags, "devices": devices, "settings": settings, "session": session}


# ---------------- Tag import / export ----------------
@api.post("/projects/{project_id}/tags/import")
async def import_tags(project_id: str, device_id: str = Form(...), file: UploadFile = File(...), symbol_prefix: str = Form(""), user=Depends(get_current_user)):
    await owned_project(project_id, user)
    dev = await db.devices.find_one({"id": device_id, "project_id": project_id}, {"_id": 0})
    if not dev:
        raise HTTPException(400, "Perangkat tidak valid")
    try:
        rows = parse_tag_file(file.filename or "", await file.read())
    except Exception as e:
        raise HTTPException(400, f"Gagal membaca file: {e}")
    existing = {t["name"] async for t in db.tags.find({"project_id": project_id}, {"_id": 0, "name": 1})}
    created, skipped = [], []
    symbolic = PROTOCOLS[dev["protocol"]]["family"] == "opcua"
    prefix = symbol_prefix.strip().strip(".")
    for r in rows:
        if symbolic:
            r["address"] = f'{prefix}."{r["raw_name"]}"' if prefix else f'"{r["raw_name"]}"'
        elif not r["address"]:
            skipped.append({"name": r["name"], "reason": "Alamat kosong"})
            continue
        if r["name"] in existing:
            skipped.append({"name": r["name"], "reason": "Nama sudah ada"})
            continue
        if r["raw_type"] and not r["data_type"]:
            skipped.append({"name": r["name"], "reason": f"Tipe {r['raw_type']} tidak didukung"})
            continue
        try:
            validate_address(dev["protocol"], r["address"])
        except ValueError as e:
            skipped.append({"name": r["name"], "reason": str(e)})
            continue
        dt = r["data_type"] or infer_type(dev["protocol"], r["address"])
        dec = int(r["decimals"]) if str(r["decimals"]).isdigit() else (2 if dt == "FLOAT32" else 0)
        body = TagIn(name=r["name"], device_id=device_id, address=r["address"], data_type=dt, decimals=dec, unit=r["unit"],
                     description=r["description"], sim_mode="static" if dt == "BOOL" else "sine")
        created.append(body.model_dump() | {"id": str(uuid.uuid4()), "project_id": project_id})
        existing.add(r["name"])
    if created:
        await db.tags.insert_many([dict(c) for c in created])
        await engine.load_config()
    return {"created": len(created), "skipped": skipped, "total": len(rows)}


@api.get("/projects/{project_id}/tags/export")
async def export_tags(project_id: str, user=Depends(get_current_user)):
    await owned_project(project_id, user)
    devs = {d["id"]: d["name"] async for d in db.devices.find({"project_id": project_id}, {"_id": 0, "id": 1, "name": 1})}
    lines = ["Name,Device,Address,Data Type,Decimals,Unit,Comment"]
    async for t in db.tags.find({"project_id": project_id}, {"_id": 0}):
        lines.append(",".join(str(x).replace(",", " ") for x in (t["name"], devs.get(t["device_id"], ""), t["address"], t["data_type"], t.get("decimals", 0), t.get("unit", ""), t.get("description", ""))))
    return Response("\n".join(lines), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=tags.csv"})


# ---------------- Files ----------------
ALLOWED = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp", "svg": "image/svg+xml",
           "ttf": "font/ttf", "otf": "font/otf", "woff": "font/woff", "woff2": "font/woff2"}


@api.post("/uploads")
async def upload(file: UploadFile = File(...), user=Depends(get_current_user)):
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "").lower()
    if ext not in ALLOWED:
        raise HTTPException(400, "Format file tidak didukung")
    data = await file.read()
    if len(data) > 8 * 1024 * 1024:
        raise HTTPException(400, "Ukuran file maksimal 8MB")
    path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    try:
        res = await asyncio.to_thread(put_object, path, data, ALLOWED[ext])
    except Exception as e:
        raise HTTPException(502, f"Upload gagal: {e}")
    await db.files.insert_one({"id": str(uuid.uuid4()), "owner_id": user["id"], "storage_path": res["path"], "original_filename": file.filename,
                               "content_type": ALLOWED[ext], "size": len(data), "is_deleted": False, "created_at": now_iso()})
    return {"path": res["path"], "url": f"/api/files/{res['path']}", "name": file.filename, "kind": "font" if ext in ("ttf", "otf", "woff", "woff2") else "image"}


@api.get("/files/{path:path}")
async def download(path: str):
    rec = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "File tidak ditemukan")
    data, _ = await asyncio.to_thread(get_object, path)
    return Response(content=data, media_type=rec["content_type"], headers={"Cache-Control": "public, max-age=86400"})


@api.get("/")
async def root():
    return {"message": "SCADA HMI Builder API"}


app.include_router(api)
app.include_router(security_router, prefix="/api")
app.include_router(records_router, prefix="/api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ["FRONTEND_URL"], "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def seed_admin():
    email, pwd = os.environ["ADMIN_EMAIL"].lower(), os.environ["ADMIN_PASSWORD"]
    u = await db.users.find_one({"email": email})
    if not u:
        uid = str(uuid.uuid4())
        await db.users.insert_one({"id": uid, "email": email, "name": "Admin", "role": "admin", "password_hash": hash_password(pwd), "created_at": now_iso()})
        await create_demo_project(db, uid)
    elif not verify_password(pwd, u["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pwd)}})


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.tag_history.create_index([("project_id", 1), ("ts", -1)])
    await db.tag_history.create_index("ts", expireAfterSeconds=7 * 86400, name="ts_ttl")
    await db.record_samples.create_index([("project_id", 1), ("record", 1), ("ts", -1)])
    if "rs_ttl" in await db.record_samples.index_information():
        await db.record_samples.drop_index("rs_ttl")
    await db.alarms.create_index([("project_id", 1), ("ts_in", -1)])
    await db.projects.create_index("publish_slug")
    await seed_admin()
    if not os.environ.get("LOCAL_STORAGE_DIR"):
        try:
            await asyncio.to_thread(init_storage)
        except Exception as e:
            logger.error(f"Storage init failed: {e}")
    asyncio.create_task(engine.run())


@app.on_event("shutdown")
async def shutdown():
    for dev_id in list(engine.drivers):
        try:
            await asyncio.wait_for(asyncio.to_thread(engine.reset_driver, dev_id), timeout=3)
        except Exception:
            pass
    client.close()


STATIC_DIR = os.environ.get("STATIC_DIR")
if STATIC_DIR and os.path.isdir(STATIC_DIR):
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    STATIC_ROOT = os.path.realpath(STATIC_DIR)
    app.mount("/static", StaticFiles(directory=os.path.join(STATIC_ROOT, "static")), name="static")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        f = os.path.realpath(os.path.join(STATIC_ROOT, full_path))
        if full_path and f.startswith(STATIC_ROOT + os.sep) and os.path.isfile(f):
            return FileResponse(f)
        return FileResponse(os.path.join(STATIC_ROOT, "index.html"))
