import asyncio
import base64
import json
import re
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

from auth import get_current_user
from db import db
from storage import get_object, put_object

router = APIRouter()
FORMAT = "nusahmi-project"
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


@router.get("/projects/{pid}/export")
async def export_project(pid: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": pid, "owner_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Proyek tidak ditemukan")
    bundle = {"format": FORMAT, "version": 1, "exported_at": now_iso(), "project": {k: v for k, v in p.items() if k not in SKIP}}
    for c in COLLS:
        bundle[c] = await db[c].find({"project_id": pid}, {"_id": 0}).to_list(20000)
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
    name = re.sub(r"[^\w\-]+", "_", p["name"]).strip("_")[:60] or "project"
    return Response(json.dumps(bundle, ensure_ascii=False), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{name}.nhmi"'})


@router.post("/projects/import")
async def import_project(file: UploadFile = File(...), publish: bool = Form(False), user=Depends(get_current_user)):
    raw = await file.read()
    if len(raw) > 300 * 1024 * 1024:
        raise HTTPException(400, "File terlalu besar (maks 300MB)")
    try:
        b = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "File bukan project NusaHMI (.nhmi)")
    if not isinstance(b, dict) or b.get("format") != FORMAT or not isinstance(b.get("project"), dict) or not b["project"].get("screens"):
        raise HTTPException(400, "File bukan project NusaHMI (.nhmi)")
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
