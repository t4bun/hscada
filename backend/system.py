import asyncio
import json
import os
import re
import socket
import subprocess
import time
from pathlib import Path

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from auth import get_current_user
from db import db

router = APIRouter()
MODE = os.environ.get("APP_MODE", "cloud")
RUN_PORT = int(os.environ.get("HTTP_PORT", "8080"))
DEFAULTS = {"hide_engineer": False, "engineer_path": "", "default_slug": "", "mdns_name": "", "custom_domain": "", "http_port": RUN_PORT,
            "workspace_name": "Scada by T4bun", "workspace_logo": "", "kiosk_pin_hash": ""}
PIN_RE = re.compile(r"^\d{4,8}$")
_pin_fails = {}
PATH_RE = re.compile(r"^[a-z0-9][a-z0-9-]{3,39}$")
MDNS_RE = re.compile(r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")
DOMAIN_RE = re.compile(r"^(?=.{3,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$")
RESERVED = {"view", "api", "static", "login", "projects", "preview"}
HOSTS = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "drivers" / "etc" / "hosts" if os.name == "nt" else Path("/etc/hosts")
_mdns = {"zc": None}


class SysIn(BaseModel):
    hide_engineer: bool = False
    engineer_path: str = ""
    default_slug: str = ""
    mdns_name: str = ""
    custom_domain: str = ""
    http_port: int = Field(8080, ge=1, le=65535)
    workspace_name: str = Field("Scada by T4bun", min_length=1, max_length=60)
    workspace_logo: str = ""
    kiosk_pin: str = Field("", max_length=16)
    kiosk_pin_clear: bool = False


async def get_sys() -> dict:
    d = await db.system.find_one({"key": "main"}, {"_id": 0, "key": 0}) or {}
    return {**DEFAULTS, **d}


def lan_ips():
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


def local_urls(s: dict):
    sfx = "" if RUN_PORT == 80 else f":{RUN_PORT}"
    urls = [f"http://{ip}{sfx}" for ip in lan_ips()]
    if s.get("mdns_name"):
        urls.append(f"http://{s['mdns_name']}.local{sfx}")
    if s.get("custom_domain"):
        urls.append(f"http://{s['custom_domain']}{sfx}")
    return urls


def apply_mdns(name: str):
    if MODE != "local":
        return None
    from zeroconf import ServiceInfo, Zeroconf
    if _mdns["zc"]:
        _mdns["zc"].unregister_all_services()
        _mdns["zc"].close()
        _mdns["zc"] = None
    if not name:
        return None
    try:
        zc = Zeroconf()
        info = ServiceInfo("_http._tcp.local.", f"{name}._http._tcp.local.", addresses=[socket.inet_aton(ip) for ip in lan_ips()],
                           port=RUN_PORT, server=f"{name}.local.")
        zc.register_service(info, allow_name_change=True)
        _mdns["zc"] = zc
        return f"{name}.local aktif di jaringan (mDNS)"
    except Exception as e:
        return f"mDNS gagal: {e}"


def apply_hosts(domain: str):
    if MODE != "local":
        return None
    try:
        txt = re.sub(r"\n?# ScadaT4bun start.*?# ScadaT4bun end\n?", "\n", HOSTS.read_text(), flags=re.S).rstrip("\n") + "\n"
        if domain:
            txt += f"# ScadaT4bun start\n127.0.0.1 {domain}\n# ScadaT4bun end\n"
        HOSTS.write_text(txt)
        return f"File hosts PC ini diperbarui ({domain})" if domain else None
    except Exception as e:
        return f"Gagal menulis file hosts ({e}) — jalankan layanan sebagai Administrator/SYSTEM"


def save_local_config(s: dict):
    cfg = os.environ.get("SCADA_CONFIG")
    if MODE != "local" or not cfg:
        return
    p = Path(cfg)
    c = json.loads(p.read_text()) if p.exists() else {}
    c["http_port"] = s["http_port"]
    p.write_text(json.dumps(c, indent=2))
    eng = f"/{s['engineer_path']}/projects" if s["hide_engineer"] else "/projects"
    (p.parent / "ENGINEER-URL.txt").write_text(f"Halaman engineer: http://localhost:{s['http_port']}{eng}\r\n")
    if os.name == "nt":
        subprocess.run(["netsh", "advfirewall", "firewall", "add", "rule", f"name=ScadaT4bun-{s['http_port']}", "dir=in", "action=allow",
                        "protocol=TCP", f"localport={s['http_port']}"], capture_output=True)


async def startup_system():
    if MODE == "local":
        s = await get_sys()
        await asyncio.to_thread(apply_mdns, s["mdns_name"])


@router.get("/boot")
async def boot(seg: str = ""):
    s = await get_sys()
    hide = bool(s["hide_engineer"] and s["engineer_path"])
    slug = s["default_slug"]
    if slug and not await db.projects.find_one({"publish_slug": slug, "published": True}, {"_id": 1}):
        slug = ""
    return {"hide": hide, "engineer": (not hide) or seg == s["engineer_path"], "default_slug": slug,
            "workspace_name": s["workspace_name"], "workspace_logo": s["workspace_logo"], "kiosk_pin_set": bool(s["kiosk_pin_hash"])}


def public_sys(s: dict) -> dict:
    return {k: v for k, v in s.items() if k != "kiosk_pin_hash"} | {"kiosk_pin_set": bool(s.get("kiosk_pin_hash"))}


class PinIn(BaseModel):
    pin: str = Field(max_length=16)


@router.post("/kiosk/verify")
async def kiosk_verify(body: PinIn, request: Request):
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "")
    now = time.time()
    f = _pin_fails.get(ip, {"n": 0, "until": 0})
    if f["until"] > now:
        raise HTTPException(429, f"Terlalu banyak percobaan. Coba lagi dalam {int(f['until'] - now) + 1} detik")
    s = await get_sys()
    if not s["kiosk_pin_hash"]:
        return {"ok": True}
    if bcrypt.checkpw(body.pin.encode(), s["kiosk_pin_hash"].encode()):
        _pin_fails.pop(ip, None)
        return {"ok": True}
    f["n"] += 1
    if f["n"] >= 5:
        f = {"n": 0, "until": now + 60}
    _pin_fails[ip] = f
    raise HTTPException(403, "PIN salah")


@router.get("/system/settings")
async def read_settings(user=Depends(get_current_user)):
    s = await get_sys()
    return public_sys(s) | {"mode": MODE, "running_port": RUN_PORT, "urls": local_urls(s) if MODE == "local" else [], "lan_ips": lan_ips()}


@router.put("/system/settings")
async def write_settings(body: SysIn, user=Depends(get_current_user)):
    s = body.model_dump()
    pin, clear = s.pop("kiosk_pin").strip(), s.pop("kiosk_pin_clear")
    if pin and not PIN_RE.match(pin):
        raise HTTPException(400, "PIN kiosk harus 4–8 digit angka")
    if clear:
        s["kiosk_pin_hash"] = ""
    elif pin:
        s["kiosk_pin_hash"] = bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()
    s["engineer_path"] = s["engineer_path"].strip().strip("/").lower()
    s["mdns_name"] = s["mdns_name"].strip().lower().removesuffix(".local")
    s["custom_domain"] = s["custom_domain"].strip().lower()
    s["workspace_name"] = s["workspace_name"].strip() or "Scada by T4bun"
    if s["hide_engineer"] and (not PATH_RE.match(s["engineer_path"]) or s["engineer_path"] in RESERVED):
        raise HTTPException(400, "Path engineer 4-40 karakter (huruf kecil, angka, '-') dan bukan kata sistem (view, api, login, ...)")
    if s["mdns_name"] and not MDNS_RE.match(s["mdns_name"]):
        raise HTTPException(400, "Nama .local hanya huruf kecil, angka, dan '-'")
    if s["custom_domain"] and not DOMAIN_RE.match(s["custom_domain"]):
        raise HTTPException(400, "Domain tidak valid, contoh: scada.pabrik")
    if s["default_slug"] and not await db.projects.find_one({"publish_slug": s["default_slug"], "published": True, "owner_id": user["id"]}, {"_id": 1}):
        raise HTTPException(400, "Project default harus project yang sudah dipublish")
    await db.system.update_one({"key": "main"}, {"$set": s}, upsert=True)
    notes = [n for n in (await asyncio.to_thread(apply_mdns, s["mdns_name"]), await asyncio.to_thread(apply_hosts, s["custom_domain"])) if n]
    await asyncio.to_thread(save_local_config, s)
    s = await get_sys()
    return public_sys(s) | {"mode": MODE, "running_port": RUN_PORT, "restart_required": MODE == "local" and s["http_port"] != RUN_PORT,
                            "urls": local_urls(s) if MODE == "local" else [], "notes": notes}


@router.post("/system/restart")
async def restart(user=Depends(get_current_user)):
    if MODE != "local":
        raise HTTPException(400, "Restart hanya tersedia di versi lokal")
    asyncio.get_running_loop().call_later(0.8, os._exit, 3)
    return {"ok": True}
