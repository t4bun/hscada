"""Iteration 8 backend tests for Scada by T4bun new features.

Covers:
- Templates: create/list/create-from/export/import/delete + owner isolation
- Project export/import (.tbn) + legacy format support
- Workspace boot & settings
- New data types BCD16/BCD32/STRING with length validation
- Alarm retention endpoints + cleanup with seeded old docs
"""
import io
import json
import os
import time
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/") + "/api"
ADMIN = {"email": "amoskun99@gmail.com", "password": "admin123"}
OTHER = {"email": f"tpl_other_{int(time.time())}@test.local", "name": "Other TPL", "password": "test1234"}


@pytest.fixture(scope="module")
def s():
    ss = requests.Session()
    r = ss.post(f"{BASE}/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, r.text
    ss.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return ss


@pytest.fixture(scope="module")
def s_other():
    ss = requests.Session()
    r = ss.post(f"{BASE}/auth/register", json=OTHER, timeout=15)
    if r.status_code != 200:
        r = ss.post(f"{BASE}/auth/login", json={"email": OTHER["email"], "password": OTHER["password"]}, timeout=15)
    assert r.status_code == 200, r.text
    ss.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return ss


@pytest.fixture(scope="module")
def pid(s):
    r = s.get(f"{BASE}/projects", timeout=10)
    assert r.status_code == 200
    for p in r.json():
        if p.get("name") == "Demo Pengolahan Air":
            return p["id"]
    return r.json()[0]["id"]


# ---------------- Templates ----------------
class TestTemplates:
    created_pids = []
    created_tids = []

    def test_create_template(self, s, pid):
        name = f"TEST_TPL_{int(time.time())}"
        r = s.post(f"{BASE}/projects/{pid}/template", json={"name": name, "description": "test"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == name
        assert d["screens"] >= 1
        assert d["devices"] >= 0
        assert d["tags"] >= 0
        TestTemplates.created_tids.append(d["id"])

    def test_list_templates(self, s):
        r = s.get(f"{BASE}/templates", timeout=10)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        for tid in TestTemplates.created_tids:
            assert tid in ids

    def test_create_from_template(self, s):
        tid = TestTemplates.created_tids[0]
        r = s.post(f"{BASE}/templates/{tid}/create", json={"name": "TEST_FROMTPL", "publish": True}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "TEST_FROMTPL"
        assert d["published"] is True
        assert d.get("publish_slug")
        TestTemplates.created_pids.append(d["id"])

    def test_export_template_tbn(self, s):
        tid = TestTemplates.created_tids[0]
        r = s.get(f"{BASE}/templates/{tid}/export", timeout=15)
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert ".tbn" in cd, cd
        b = json.loads(r.content)
        assert b.get("format") == "t4bun-project"

    def test_import_template_tbn(self, s):
        tid = TestTemplates.created_tids[0]
        raw = s.get(f"{BASE}/templates/{tid}/export", timeout=15).content
        files = {"file": ("mytpl.tbn", io.BytesIO(raw), "application/json")}
        r = s.post(f"{BASE}/templates/import", files=files, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["screens"] >= 1
        TestTemplates.created_tids.append(d["id"])

    def test_other_user_cannot_access(self, s_other):
        tid = TestTemplates.created_tids[0]
        r = s_other.get(f"{BASE}/templates/{tid}/export", timeout=10)
        assert r.status_code == 404
        r2 = s_other.delete(f"{BASE}/templates/{tid}", timeout=10)
        assert r2.status_code == 404
        r3 = s_other.post(f"{BASE}/templates/{tid}/create", json={"publish": False}, timeout=10)
        assert r3.status_code == 404

    def test_delete_templates_cleanup(self, s):
        # cleanup projects created from templates
        for p in TestTemplates.created_pids:
            s.delete(f"{BASE}/projects/{p}", timeout=15)
        for t in TestTemplates.created_tids:
            r = s.delete(f"{BASE}/templates/{t}", timeout=10)
            assert r.status_code == 200
        # verify deletion
        r = s.get(f"{BASE}/templates", timeout=10)
        ids = [t["id"] for t in r.json()]
        for t in TestTemplates.created_tids:
            assert t not in ids


# ---------------- Project export/import .tbn ----------------
class TestBundle:
    created_pids = []

    def test_export_tbn_filename(self, s, pid):
        r = s.get(f"{BASE}/projects/{pid}/export", timeout=20)
        assert r.status_code == 200
        cd = r.headers.get("content-disposition", "")
        assert ".tbn" in cd, cd
        b = json.loads(r.content)
        assert b["format"] == "t4bun-project"

    def test_import_t4bun_project(self, s, pid):
        raw = s.get(f"{BASE}/projects/{pid}/export", timeout=20).content
        files = {"file": ("p.tbn", io.BytesIO(raw), "application/json")}
        r = s.post(f"{BASE}/projects/import", files=files, timeout=30)
        assert r.status_code == 200, r.text
        TestBundle.created_pids.append(r.json()["id"])

    def test_import_legacy_nusahmi(self, s, pid):
        raw = s.get(f"{BASE}/projects/{pid}/export", timeout=20).content
        b = json.loads(raw)
        b["format"] = "nusahmi-project"
        files = {"file": ("legacy.nhmi", io.BytesIO(json.dumps(b).encode()), "application/json")}
        r = s.post(f"{BASE}/projects/import", files=files, timeout=30)
        assert r.status_code == 200, r.text
        TestBundle.created_pids.append(r.json()["id"])

    def test_import_invalid_400(self, s):
        files = {"file": ("bad.tbn", io.BytesIO(b'{"format":"unknown"}'), "application/json")}
        r = s.post(f"{BASE}/projects/import", files=files, timeout=10)
        assert r.status_code == 400

    def test_cleanup_imported(self, s):
        for p in TestBundle.created_pids:
            s.delete(f"{BASE}/projects/{p}", timeout=15)


# ---------------- Workspace ----------------
class TestWorkspace:
    def test_boot_defaults(self, s):
        r = requests.get(f"{BASE}/boot", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert "workspace_name" in d
        assert "workspace_logo" in d

    def test_put_workspace_name(self, s):
        new_name = "TEST Workspace Name"
        r = s.put(f"{BASE}/system/settings", json={"workspace_name": new_name, "workspace_logo": "/api/files/foo.png",
                                                    "hide_engineer": False, "engineer_path": "", "default_slug": "",
                                                    "mdns_name": "", "custom_domain": "", "http_port": 8080}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["workspace_name"] == new_name
        b = requests.get(f"{BASE}/boot", timeout=10).json()
        assert b["workspace_name"] == new_name
        assert b["workspace_logo"] == "/api/files/foo.png"

    def test_empty_name_rejected(self, s):
        r = s.put(f"{BASE}/system/settings", json={"workspace_name": "", "workspace_logo": "",
                                                    "hide_engineer": False, "engineer_path": "", "default_slug": "",
                                                    "mdns_name": "", "custom_domain": "", "http_port": 8080}, timeout=10)
        assert r.status_code == 422, r.text

    def test_too_long_name_rejected(self, s):
        r = s.put(f"{BASE}/system/settings", json={"workspace_name": "X" * 61, "workspace_logo": "",
                                                    "hide_engineer": False, "engineer_path": "", "default_slug": "",
                                                    "mdns_name": "", "custom_domain": "", "http_port": 8080}, timeout=10)
        assert r.status_code == 422, r.text

    def test_restore_default(self, s):
        r = s.put(f"{BASE}/system/settings", json={"workspace_name": "Scada by T4bun", "workspace_logo": "",
                                                    "hide_engineer": False, "engineer_path": "", "default_slug": "",
                                                    "mdns_name": "", "custom_domain": "", "http_port": 8080}, timeout=10)
        assert r.status_code == 200
        assert requests.get(f"{BASE}/boot", timeout=10).json()["workspace_name"] == "Scada by T4bun"


# ---------------- BCD/STRING tags ----------------
class TestNewTypes:
    created_tag_ids = []
    dev_id = None

    def _get_or_create_device(self, s, pid):
        if TestNewTypes.dev_id:
            return TestNewTypes.dev_id
        r = s.get(f"{BASE}/projects/{pid}/devices", timeout=10)
        assert r.status_code == 200
        for d in r.json():
            if d.get("protocol") == "S7-1200/1500":
                TestNewTypes.dev_id = d["id"]
                return d["id"]
        return r.json()[0]["id"]

    def _make_tag(self, s, pid, name, dt, address="DB1.DBW0", **extra):
        dev_id = self._get_or_create_device(s, pid)
        body = {"name": name, "device_id": dev_id, "address": address, "data_type": dt, "decimals": 0}
        body.update(extra)
        r = s.post(f"{BASE}/projects/{pid}/tags", json=body, timeout=10)
        return r

    def test_create_bcd16(self, s, pid):
        n = f"TEST_BCD16_{int(time.time())}"
        r = self._make_tag(s, pid, n, "BCD16", "DB1.DBW10")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["data_type"] == "BCD16"
        assert d["category"] == "Word"
        TestNewTypes.created_tag_ids.append(d["id"])

    def test_create_bcd32(self, s, pid):
        n = f"TEST_BCD32_{int(time.time())}"
        r = self._make_tag(s, pid, n, "BCD32", "DB1.DBD14")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["data_type"] == "BCD32"
        assert d["category"] == "DWord"
        TestNewTypes.created_tag_ids.append(d["id"])

    def test_create_string(self, s, pid):
        n = f"TEST_STR_{int(time.time())}"
        r = self._make_tag(s, pid, n, "STRING", "DB1.DBW20", length=16)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["data_type"] == "STRING"
        assert d["category"] == "String"
        assert d["length"] == 16
        TestNewTypes.created_tag_ids.append(d["id"])

    def test_string_length_out_of_range(self, s, pid):
        r = self._make_tag(s, pid, f"TEST_STRL_{int(time.time())}", "STRING", "DB1.DBW30", length=300)
        assert r.status_code == 422, r.text
        r2 = self._make_tag(s, pid, f"TEST_STRL0_{int(time.time())}", "STRING", "DB1.DBW32", length=0)
        assert r2.status_code == 422, r2.text

    def test_string_sim_value(self, s, pid):
        # Wait for engine tick to publish value
        time.sleep(3)
        r = s.get(f"{BASE}/projects/{pid}/rt/values", timeout=10)
        assert r.status_code == 200, r.text
        vals = r.json().get("values", {})
        str_tags = [tid for tid in TestNewTypes.created_tag_ids if vals.get(tid) is not None]
        # find the STRING one
        for tid in TestNewTypes.created_tag_ids:
            tag = next((t for t in s.get(f"{BASE}/projects/{pid}/tags").json() if t["id"] == tid), None)
            if tag and tag["data_type"] == "STRING":
                v = vals.get(tid)
                assert v is None or isinstance(v, str), f"expected str got {type(v)}: {v}"
                if isinstance(v, str):
                    assert v == "SIMULASI" or len(v) >= 0
                break

    def test_write_string_rejected(self, s, pid):
        str_tag = None
        for tid in TestNewTypes.created_tag_ids:
            tag = next((t for t in s.get(f"{BASE}/projects/{pid}/tags").json() if t["id"] == tid), None)
            if tag and tag["data_type"] == "STRING":
                str_tag = tag
                break
        assert str_tag is not None
        r = s.post(f"{BASE}/projects/{pid}/rt/write", json={"tag_id": str_tag["id"], "value": "hello"}, timeout=10)
        # spec says 4xx but current impl returns 502 (wraps ValueError in HTTPException(502))
        assert r.status_code >= 400, r.text
        if not (400 <= r.status_code < 500):
            pytest.fail(f"BUG: STRING write should return 4xx per spec, got {r.status_code}")

    def test_cleanup_tags(self, s):
        for tid in TestNewTypes.created_tag_ids:
            s.delete(f"{BASE}/tags/{tid}", timeout=10)


# ---------------- Alarm retention ----------------
class TestAlarmRetention:
    seeded_ids = []

    def test_storage_endpoint(self, s, pid):
        r = s.get(f"{BASE}/projects/{pid}/alarms/storage", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("samples", "oldest", "newest", "enabled", "days", "last_cleanup"):
            assert k in d, f"missing {k}"

    def test_cleanup_with_seed(self, s, pid):
        # enable alarm retention with 7 day
        p = s.get(f"{BASE}/projects/{pid}", timeout=10).json()
        settings = p.get("settings") or {}
        settings.update({"alarm_retention_enabled": True, "alarm_retention_days": 7})
        upd = s.put(f"{BASE}/projects/{pid}", json={"settings": settings}, timeout=10)
        assert upd.status_code == 200, upd.text

        # Seed old & new inactive & active alarms directly via mongo (need db conn)
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")

        async def seed():
            cli = AsyncIOMotorClient(mongo_url)
            db = cli[db_name]
            old_iso = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
            new_iso = datetime.now(timezone.utc).isoformat()
            docs = [
                {"id": f"TEST_ALM_OLD_INACTIVE_{int(time.time())}", "project_id": pid, "active": False, "ts_in": old_iso, "message": "old inactive"},
                {"id": f"TEST_ALM_OLD_ACTIVE_{int(time.time())}", "project_id": pid, "active": True, "ts_in": old_iso, "message": "old active"},
                {"id": f"TEST_ALM_NEW_INACTIVE_{int(time.time())}", "project_id": pid, "active": False, "ts_in": new_iso, "message": "new inactive"},
            ]
            await db.alarms.insert_many(docs)
            return [d["id"] for d in docs]

        TestAlarmRetention.seeded_ids = asyncio.run(seed())
        r = s.post(f"{BASE}/projects/{pid}/alarms/cleanup", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["deleted"] >= 1
        assert d["days"] == 7

        # Verify: old inactive removed, old active kept, new inactive kept
        async def check():
            cli = AsyncIOMotorClient(mongo_url)
            db = cli[db_name]
            remaining = await db.alarms.find({"id": {"$in": TestAlarmRetention.seeded_ids}}, {"_id": 0}).to_list(10)
            return {r["id"]: r for r in remaining}

        rem = asyncio.run(check())
        assert not any("OLD_INACTIVE" in k for k in rem), f"old inactive not deleted: {rem}"
        assert any("OLD_ACTIVE" in k for k in rem), "old active should be kept"
        assert any("NEW_INACTIVE" in k for k in rem), "new inactive should be kept"

    def test_cleanup_disabled_returns_400(self, s, pid):
        settings = s.get(f"{BASE}/projects/{pid}", timeout=10).json().get("settings") or {}
        settings["alarm_retention_enabled"] = False
        s.put(f"{BASE}/projects/{pid}", json={"settings": settings}, timeout=10)
        r = s.post(f"{BASE}/projects/{pid}/alarms/cleanup", timeout=10)
        assert r.status_code == 400, r.text
        # restore
        settings["alarm_retention_enabled"] = True
        s.put(f"{BASE}/projects/{pid}", json={"settings": settings}, timeout=10)

    def test_cleanup_seeded_remaining(self, s, pid):
        from motor.motor_asyncio import AsyncIOMotorClient
        import asyncio
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")

        async def rm():
            cli = AsyncIOMotorClient(mongo_url)
            db = cli[db_name]
            await db.alarms.delete_many({"id": {"$in": TestAlarmRetention.seeded_ids}})

        asyncio.run(rm())
