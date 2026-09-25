import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import jwt
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field

from auth import hash_password, verify_password, get_current_user
from db import db

router = APIRouter()
DEFAULT_GROUPS = [
    ("Administrator", 3, True, True, True),
    ("Supervisor", 2, True, True, False),
    ("Operator", 1, True, True, False),
    ("Viewer", 0, False, False, False),
]


class GroupIn(BaseModel):
    name: str
    level: int = 0
    can_operate: bool = False
    can_ack: bool = False
    can_manage_users: bool = False
    screens: List[str] = []


class ClientUserIn(BaseModel):
    username: str
    password: Optional[str] = None
    full_name: str = ""
    group_id: str
    active: bool = True


class LoginIn(BaseModel):
    username: str
    password: str


class PasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=4)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def ensure_default_groups(pid: str):
    if await db.client_groups.count_documents({"project_id": pid}):
        return
    groups = [{"id": str(uuid.uuid4()), "project_id": pid, "name": n, "level": lv, "can_operate": op, "can_ack": ack,
               "can_manage_users": mu, "screens": []} for n, lv, op, ack, mu in DEFAULT_GROUPS]
    await db.client_groups.insert_many([dict(g) for g in groups])
    await db.client_users.insert_one({"id": str(uuid.uuid4()), "project_id": pid, "username": "admin", "full_name": "Administrator",
                                      "password_hash": hash_password("admin123"), "group_id": groups[0]["id"], "active": True, "created_at": now_iso()})


async def engineer_project(pid: str, user: dict):
    if not await db.projects.find_one({"id": pid, "owner_id": user["id"]}, {"_id": 1}):
        raise HTTPException(404, "Proyek tidak ditemukan")


def user_out(u: dict) -> dict:
    return {k: u.get(k) for k in ("id", "username", "full_name", "group_id", "active", "created_at")}


async def check_user_payload(pid: str, body: ClientUserIn, uid: Optional[str] = None):
    if not await db.client_groups.find_one({"id": body.group_id, "project_id": pid}):
        raise HTTPException(400, "Group tidak valid")
    q = {"project_id": pid, "username": body.username.strip().lower()}
    if uid:
        q["id"] = {"$ne": uid}
    if await db.client_users.find_one(q):
        raise HTTPException(400, "Username sudah dipakai")


async def create_user(pid: str, body: ClientUserIn) -> dict:
    await check_user_payload(pid, body)
    if not body.password or len(body.password) < 4:
        raise HTTPException(400, "Password minimal 4 karakter")
    u = {"id": str(uuid.uuid4()), "project_id": pid, "username": body.username.strip().lower(), "full_name": body.full_name,
         "password_hash": hash_password(body.password), "group_id": body.group_id, "active": body.active, "created_at": now_iso()}
    await db.client_users.insert_one(dict(u))
    return user_out(u)


async def update_user(pid: str, uid: str, body: ClientUserIn) -> dict:
    await check_user_payload(pid, body, uid)
    upd = {"username": body.username.strip().lower(), "full_name": body.full_name, "group_id": body.group_id, "active": body.active}
    if body.password:
        upd["password_hash"] = hash_password(body.password)
    await db.client_users.update_one({"id": uid, "project_id": pid}, {"$set": upd})
    return user_out(await db.client_users.find_one({"id": uid}, {"_id": 0}))


# ---------------- Engineer (builder) management ----------------
@router.get("/projects/{pid}/security")
async def get_security(pid: str, user=Depends(get_current_user)):
    await engineer_project(pid, user)
    await ensure_default_groups(pid)
    groups = await db.client_groups.find({"project_id": pid}, {"_id": 0}).sort("level", -1).to_list(100)
    users = await db.client_users.find({"project_id": pid}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return {"groups": groups, "users": users}


@router.post("/projects/{pid}/security/groups")
async def add_group(pid: str, body: GroupIn, user=Depends(get_current_user)):
    await engineer_project(pid, user)
    g = body.model_dump() | {"id": str(uuid.uuid4()), "project_id": pid}
    await db.client_groups.insert_one(dict(g))
    return g


@router.put("/projects/{pid}/security/groups/{gid}")
async def edit_group(pid: str, gid: str, body: GroupIn, user=Depends(get_current_user)):
    await engineer_project(pid, user)
    await db.client_groups.update_one({"id": gid, "project_id": pid}, {"$set": body.model_dump()})
    return await db.client_groups.find_one({"id": gid}, {"_id": 0})


@router.delete("/projects/{pid}/security/groups/{gid}")
async def del_group(pid: str, gid: str, user=Depends(get_current_user)):
    await engineer_project(pid, user)
    if await db.client_users.count_documents({"group_id": gid}):
        raise HTTPException(400, "Group masih memiliki user")
    await db.client_groups.delete_one({"id": gid, "project_id": pid})
    return {"ok": True}


@router.post("/projects/{pid}/security/users")
async def add_user(pid: str, body: ClientUserIn, user=Depends(get_current_user)):
    await engineer_project(pid, user)
    return await create_user(pid, body)


@router.put("/projects/{pid}/security/users/{uid}")
async def edit_user(pid: str, uid: str, body: ClientUserIn, user=Depends(get_current_user)):
    await engineer_project(pid, user)
    return await update_user(pid, uid, body)


@router.delete("/projects/{pid}/security/users/{uid}")
async def del_user(pid: str, uid: str, user=Depends(get_current_user)):
    await engineer_project(pid, user)
    await db.client_users.delete_one({"id": uid, "project_id": pid})
    return {"ok": True}


# ---------------- End-client auth (published app) ----------------
async def published(slug: str) -> dict:
    p = await db.projects.find_one({"publish_slug": slug, "published": True}, {"_id": 0, "id": 1, "settings": 1})
    if not p:
        raise HTTPException(404, "Aplikasi tidak ditemukan atau belum dipublish")
    return p


def client_token(u: dict) -> str:
    payload = {"sub": u["id"], "pid": u["project_id"], "type": "client", "exp": datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm="HS256")


async def client_from_request(request: Request, pid: str):
    token = request.headers.get("X-Client-Token", "")
    if not token:
        raise HTTPException(401, "Silakan login")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Sesi berakhir, silakan login ulang")
    if payload.get("type") != "client" or payload.get("pid") != pid:
        raise HTTPException(401, "Token tidak valid")
    u = await db.client_users.find_one({"id": payload["sub"], "project_id": pid, "active": True}, {"_id": 0})
    if not u:
        raise HTTPException(401, "User tidak aktif")
    g = await db.client_groups.find_one({"id": u["group_id"]}, {"_id": 0})
    if not g:
        raise HTTPException(401, "Group tidak ditemukan")
    return u, g


def session_out(u, g):
    return {"user": user_out(u), "group": g}


@router.post("/public/{slug}/auth/login")
async def client_login(slug: str, body: LoginIn, request: Request):
    p = await published(slug)
    await ensure_default_groups(p["id"])
    uname = body.username.strip().lower()
    ident = f"client:{p['id']}:{request.client.host if request.client else ''}:{uname}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and att.get("locked_until", "") > now_iso():
        raise HTTPException(429, "Terlalu banyak percobaan. Coba lagi 15 menit lagi.")
    u = await db.client_users.find_one({"project_id": p["id"], "username": uname, "active": True}, {"_id": 0})
    if not u or not verify_password(body.password, u["password_hash"]):
        await db.login_attempts.update_one({"identifier": ident}, {"$inc": {"count": 1}, "$set": {"locked_until": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()}}, upsert=True)
        raise HTTPException(401, "Username atau password salah")
    await db.login_attempts.delete_one({"identifier": ident})
    g = await db.client_groups.find_one({"id": u["group_id"]}, {"_id": 0})
    return {"token": client_token(u), **session_out(u, g)}


@router.get("/public/{slug}/auth/me")
async def client_me(slug: str, request: Request):
    p = await published(slug)
    return session_out(*(await client_from_request(request, p["id"])))


@router.post("/public/{slug}/auth/password")
async def client_password(slug: str, body: PasswordIn, request: Request):
    p = await published(slug)
    u, _ = await client_from_request(request, p["id"])
    if not verify_password(body.old_password, u["password_hash"]):
        raise HTTPException(400, "Password lama salah")
    await db.client_users.update_one({"id": u["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}


async def manager(slug: str, request: Request):
    p = await published(slug)
    u, g = await client_from_request(request, p["id"])
    if not g.get("can_manage_users"):
        raise HTTPException(403, "Tidak punya hak mengelola user")
    lower = await db.client_groups.find({"project_id": p["id"], "level": {"$lt": g["level"]}}, {"_id": 0}).sort("level", -1).to_list(100)
    return p["id"], u, lower


@router.get("/public/{slug}/auth/users")
async def client_users(slug: str, request: Request):
    pid, _, lower = await manager(slug, request)
    ids = [x["id"] for x in lower]
    users = await db.client_users.find({"project_id": pid, "group_id": {"$in": ids}}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return {"groups": lower, "users": users}


async def managed_target(pid: str, lower: list, group_id: str, uid: Optional[str] = None):
    ids = {x["id"] for x in lower}
    if group_id not in ids:
        raise HTTPException(403, "Hanya boleh mengelola group di bawah level Anda")
    if uid:
        t = await db.client_users.find_one({"id": uid, "project_id": pid}, {"_id": 0})
        if not t or t["group_id"] not in ids:
            raise HTTPException(403, "User di luar kewenangan Anda")


@router.post("/public/{slug}/auth/users")
async def client_add_user(slug: str, body: ClientUserIn, request: Request):
    pid, _, lower = await manager(slug, request)
    await managed_target(pid, lower, body.group_id)
    return await create_user(pid, body)


@router.put("/public/{slug}/auth/users/{uid}")
async def client_edit_user(slug: str, uid: str, body: ClientUserIn, request: Request):
    pid, _, lower = await manager(slug, request)
    await managed_target(pid, lower, body.group_id, uid)
    return await update_user(pid, uid, body)


@router.delete("/public/{slug}/auth/users/{uid}")
async def client_del_user(slug: str, uid: str, request: Request):
    pid, _, lower = await manager(slug, request)
    t = await db.client_users.find_one({"id": uid, "project_id": pid}, {"_id": 0})
    if t:
        await managed_target(pid, lower, t["group_id"], uid)
    await db.client_users.delete_one({"id": uid, "project_id": pid})
    return {"ok": True}
