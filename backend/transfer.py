import asyncio
import base64
import json
import re
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from fastapi.responses import Response

from auth import get_current_user
from db import db
from storage import get_object, put_object

router = APIRouter()
FORMAT = "t4bun-project"
FORMATS_OK = {FORMAT, "nusahmi-project"}
MAX_TEMPLATE = 15 * 1024 * 1024
COLLS = ("devices", "tags", "alarm_defs", "data_records", "client_groups", "client_users")
SKIP = {"_id", "owner_id", "published", "publish_slug", "published_screens", "published_meta", "published_at", "record_cleanup"}
FILE_RE = re.compile(r"/api/files/([A-Za-z0-9_\-./]+\.[A-Za-z0-9]+)")
UUID_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")


def now_iso():
    return datetime.now(timezone.utc).isoformat()


async def publish_project(p: dict, allow_operate: bool) -> dict:
    slug = p.get("publish_slug") or secrets.token_urlsafe(8).replace("_", "x").replace("-", "y").lower()
    upd = {"published": True, "publish_slug": slug, "allow_operate": allow_operate, "published_at": now_iso(),
           "published_screens": p["screens"], "published_meta": {"name": p["name"], "width": p["width"], "height": p["height"], "fonts": p.get("fonts", [])}}
    await db.projects.update_one({"id": p["id"]}, {"$set": upd})
    return {"published": True, "publish_slug": slug, "allow_operate": allow_operate, "published_at": upd["published_at"]}


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""


class FromTemplateIn(BaseModel):
    name: str = ""
    publish: bool = False


async def owned(pid: str, user: dict) -> dict:
    p = await db.projects.find_one({"id": pid, "owner_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Proyek tidak ditemukan")
    return p


async def build_bundle(p: dict) -> dict:
    bundle = {"format": FORMAT, "version": 1, "exported_at": now_iso(), "project": {k: v for k, v in p.items() if k not in SKIP}}
    for c in COLLS:
        bundle[c] = await db[c].find({"project_id": p["id"]}, {"_id": 0}).to_list(20000)
    files = []
    for path in sorted(set(FILE_RE.findall(json.dumps(bundle)))):
        rec = await db.files.find_one({"storage_path": path, "is_deleted": False}, {"_id": 0})
        if not rec:
            continue
        try:
            data, _ = await asyncio.to_thread(get_object, path)
        except Exception:
            continue
        files.append({"path": path, "name": rec.get("original_filename", ""), "content_type": rec["content_type"], "data": base64.b64encode(data).decode()})
    bundle["files"] = files
    return bundle


def parse_bundle(raw: bytes) -> dict:
    if len(raw) > 300 * 1024 * 1024:
        raise HTTPException(400, "File terlalu besar (maks 300MB)")
    try:
        b = json.loads(raw)
    except ValueError:
        b = None
    if not isinstance(b, dict) or b.get("format") not in FORMATS_OK or not isinstance(b.get("project"), dict) or not b["project"].get("screens"):
        raise HTTPException(400, "File bukan project Scada by T4bun (.tbn)")
    return b


async def import_bundle(b: dict, user: dict, publish: bool, name: str = "") -> dict:
    ids = {}
    remap = lambda s: UUID_RE.sub(lambda m: ids.setdefault(m.group(0), str(uuid.uuid4())), s)  # noqa: E731
    d = json.loads(remap(json.dumps({k: b.get(k) or [] for k in ("project", *COLLS)})))
    for f in b.get("files") or []:
        path = remap(f["path"])
        try:
            await asyncio.to_thread(put_object, path, base64.b64decode(f["data"]), f["content_type"])
        except Exception as e:
            raise HTTPException(502, f"Gagal menyimpan file {f.get('name')}: {e}")
        await db.files.insert_one({"id": str(uuid.uuid4()), "owner_id": user["id"], "storage_path": path, "original_filename": f.get("name", ""),
                                   "content_type": f["content_type"], "size": len(f["data"]) * 3 // 4, "is_deleted": False, "created_at": now_iso()})
    p = {k: v for k, v in d["project"].items() if k not in SKIP}
    p.update(owner_id=user["id"], published=False, publish_slug=None, published_screens=None, created_at=now_iso(), updated_at=now_iso())
    p.setdefault("id", str(uuid.uuid4()))
    if name.strip():
        p["name"] = name.strip()
    await db.projects.insert_one(dict(p))
    counts = {}
    for c in COLLS:
        docs = [x | {"project_id": p["id"]} for x in d[c] if isinstance(x, dict)]
        if docs:
            await db[c].insert_many([dict(x) for x in docs])
        counts[c] = len(docs)
    res = {"id": p["id"], "name": p["name"], "published": False, "publish_slug": None, "counts": counts, "files": len(b.get("files") or [])}
    if publish:
        res |= await publish_project(p, True)
    return res


def tbn_response(bundle: dict, name: str, prefix: str = ""):
    fn = re.sub(r"[^\w\-]+", "_", name).strip("_")[:60] or "project"
    return Response(json.dumps(bundle, ensure_ascii=False), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{prefix}{fn}.tbn"'})


def tpl_out(t: dict) -> dict:
    b = t.get("bundle") or {}
    return {"id": t["id"], "name": t["name"], "description": t.get("description", ""), "created_at": t.get("created_at"),
            "screens": len((b.get("project") or {}).get("screens") or []), "devices": len(b.get("devices") or []), "tags": len(b.get("tags") or [])}


async def save_template(bundle: dict, user: dict, name: str, description: str = "") -> dict:
    if len(json.dumps(bundle)) > MAX_TEMPLATE:
        raise HTTPException(400, "Template terlalu besar (maks 15MB) — kurangi gambar/shape")
    t = {"id": str(uuid.uuid4()), "owner_id": user["id"], "name": name.strip(), "description": description, "created_at": now_iso(), "bundle": bundle | {"template": True}}
    await db.templates.insert_one(dict(t))
    return tpl_out(t)


async def owned_template(tid: str, user: dict) -> dict:
    t = await db.templates.find_one({"id": tid, "owner_id": user["id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Template tidak ditemukan")
    return t


@router.get("/projects/{pid}/export")
async def export_project(pid: str, user=Depends(get_current_user)):
    p = await owned(pid, user)
    return tbn_response(await build_bundle(p), p["name"])


@router.post("/projects/import")
async def import_project(file: UploadFile = File(...), publish: bool = Form(False), user=Depends(get_current_user)):
    return await import_bundle(parse_bundle(await file.read()), user, publish)


@router.post("/projects/{pid}/template")
async def project_to_template(pid: str, body: TemplateIn, user=Depends(get_current_user)):
    p = await owned(pid, user)
    return await save_template(await build_bundle(p), user, body.name, body.description)


@router.get("/templates")
async def list_templates(user=Depends(get_current_user)):
    return [tpl_out(t) async for t in db.templates.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1)]


@router.post("/templates/import")
async def import_template(file: UploadFile = File(...), user=Depends(get_current_user)):
    b = parse_bundle(await file.read())
    name = (file.filename or "").rsplit(".", 1)[0] or b["project"].get("name", "Template")
    return await save_template(b, user, name[:80], "Diimport dari file .tbn")


@router.post("/templates/{tid}/create")
async def create_from_template(tid: str, body: FromTemplateIn, user=Depends(get_current_user)):
    t = await owned_template(tid, user)
    return await import_bundle(t["bundle"], user, body.publish, body.name or t["name"])


@router.get("/templates/{tid}/export")
async def export_template(tid: str, user=Depends(get_current_user)):
    t = await owned_template(tid, user)
    return tbn_response(t["bundle"], t["name"], "template-")


@router.delete("/templates/{tid}")
async def delete_template(tid: str, user=Depends(get_current_user)):
    await owned_template(tid, user)
    await db.templates.delete_one({"id": tid})
    return {"ok": True}
