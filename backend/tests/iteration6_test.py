"""Iteration 6 — Hide engineer / boot, export-import, ensure-tag, data log formats."""
import io
import json
import os
import uuid

import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "amoskun99@gmail.com", "password": "admin123"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


DEFAULT_RESTORE = {"hide_engineer": False, "engineer_path": "", "default_slug": "",
                   "mdns_name": "", "custom_domain": "", "http_port": 8080}


@pytest.fixture(scope="module", autouse=True)
def restore_settings_at_end(H):
    yield
    requests.put(f"{BASE}/api/system/settings", headers=H, json=DEFAULT_RESTORE)


@pytest.fixture(scope="module")
def demo_pid(H):
    r = requests.get(f"{BASE}/api/projects", headers=H)
    assert r.status_code == 200
    demo = next((p for p in r.json() if p["name"] == "Demo Pengolahan Air"), None)
    assert demo, "Demo project missing"
    return demo["id"]


@pytest.fixture(scope="module")
def demo_slug(H, demo_pid):
    r = requests.get(f"{BASE}/api/projects/{demo_pid}", headers=H)
    assert r.status_code == 200
    slug = r.json().get("publish_slug")
    assert slug, "Demo not published"
    return slug


# ---------------- boot + system settings ----------------
class TestBootAndSettings:
    def test_boot_default(self, H):
        # ensure clean state first
        requests.put(f"{BASE}/api/system/settings", headers=H, json=DEFAULT_RESTORE)
        r = requests.get(f"{BASE}/api/boot")
        assert r.status_code == 200
        d = r.json()
        assert d["hide"] is False
        assert d["engineer"] is True
        assert d["default_slug"] == ""

    def test_settings_get_shape(self, H):
        r = requests.get(f"{BASE}/api/system/settings", headers=H)
        assert r.status_code == 200
        d = r.json()
        assert d["mode"] == "cloud"
        assert "running_port" in d and "urls" in d and "lan_ips" in d
        assert d["urls"] == []  # cloud mode

    def test_enable_hide_and_boot(self, H, demo_slug):
        body = {"hide_engineer": True, "engineer_path": "eng-test1", "default_slug": demo_slug,
                "mdns_name": "", "custom_domain": "", "http_port": 8080}
        r = requests.put(f"{BASE}/api/system/settings", headers=H, json=body)
        assert r.status_code == 200, r.text

        r1 = requests.get(f"{BASE}/api/boot", params={"seg": "eng-test1"})
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["hide"] is True and d1["engineer"] is True
        assert d1["default_slug"] == demo_slug

        r2 = requests.get(f"{BASE}/api/boot", params={"seg": "projects"})
        assert r2.json()["engineer"] is False

    @pytest.mark.parametrize("path", ["abc", "view", "api", "login", "AB@#"])
    def test_bad_engineer_path(self, H, path):
        body = {"hide_engineer": True, "engineer_path": path, "default_slug": "",
                "mdns_name": "", "custom_domain": "", "http_port": 8080}
        r = requests.put(f"{BASE}/api/system/settings", headers=H, json=body)
        assert r.status_code == 400, r.text

    def test_bad_mdns(self, H):
        r = requests.put(f"{BASE}/api/system/settings", headers=H, json={
            **DEFAULT_RESTORE, "mdns_name": "Bad Name!!"})
        assert r.status_code == 400

    def test_bad_domain(self, H):
        r = requests.put(f"{BASE}/api/system/settings", headers=H, json={
            **DEFAULT_RESTORE, "custom_domain": "no dots"})
        assert r.status_code == 400

    def test_bad_default_slug(self, H):
        r = requests.put(f"{BASE}/api/system/settings", headers=H, json={
            **DEFAULT_RESTORE, "default_slug": "doesnotexist-xyz"})
        assert r.status_code == 400

    def test_restart_400_in_cloud(self, H):
        r = requests.post(f"{BASE}/api/system/restart", headers=H)
        assert r.status_code == 400


# ---------------- Export / Import ----------------
class TestExportImport:
    imported_ids = []

    def test_export_shape(self, H, demo_pid):
        r = requests.get(f"{BASE}/api/projects/{demo_pid}/export", headers=H)
        assert r.status_code == 200
        b = json.loads(r.content)
        assert b["format"] == "nusahmi-project"
        for k in ("project", "devices", "tags", "alarm_defs", "data_records", "client_groups", "client_users", "files"):
            assert k in b, f"missing {k}"
        assert b["project"]["screens"]
        TestExportImport.exported = r.content

    def test_import_invalid(self, H):
        files = {"file": ("bad.nhmi", b"not json", "application/json")}
        r = requests.post(f"{BASE}/api/projects/import", headers=H, files=files, data={"publish": "false"})
        assert r.status_code == 400

        files = {"file": ("bad2.nhmi", json.dumps({"format": "other"}).encode(), "application/json")}
        r = requests.post(f"{BASE}/api/projects/import", headers=H, files=files, data={"publish": "false"})
        assert r.status_code == 400

    def test_import_then_publish(self, H, demo_pid):
        # Re-export to get fresh bytes
        raw = requests.get(f"{BASE}/api/projects/{demo_pid}/export", headers=H).content
        original = json.loads(raw)
        files = {"file": ("copy.nhmi", raw, "application/json")}
        r = requests.post(f"{BASE}/api/projects/import", headers=H, files=files, data={"publish": "true"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["published"] is True and d["publish_slug"]
        assert d["id"] != demo_pid
        TestExportImport.imported_ids.append(d["id"])

        # counts non-trivial
        assert d["counts"]["tags"] > 0
        assert d["counts"]["devices"] > 0

        # verify NEW ids: fetch tags & devices for new project, ensure ids differ
        pr = requests.get(f"{BASE}/api/projects/{d['id']}", headers=H).json()
        new_dev_ids = {x["id"] for x in pr.get("_devices", [])} if pr.get("_devices") else set()
        # Use devices endpoint
        dv = requests.get(f"{BASE}/api/projects/{d['id']}/devices", headers=H)
        if dv.status_code == 200:
            new_dev_ids = {x["id"] for x in dv.json()}
        old_dev_ids = {x["id"] for x in original["devices"]}
        assert new_dev_ids.isdisjoint(old_dev_ids), "device ids should be remapped"

        # tags for new project — device_id should point at new devices
        tg = requests.get(f"{BASE}/api/projects/{d['id']}/tags", headers=H)
        assert tg.status_code == 200
        for t in tg.json():
            assert t["device_id"] in new_dev_ids

        # public runtime works
        pr2 = requests.get(f"{BASE}/api/public/{d['publish_slug']}")
        assert pr2.status_code == 200

    def test_cleanup_imported(self, H):
        for pid in TestExportImport.imported_ids:
            requests.delete(f"{BASE}/api/projects/{pid}", headers=H)
        TestExportImport.imported_ids.clear()


# ---------------- Ensure tag (direct address) ----------------
class TestEnsureTag:
    def test_ensure_and_reuse(self, H, demo_pid):
        dv = requests.get(f"{BASE}/api/projects/{demo_pid}/devices", headers=H).json()
        assert dv
        device_id = dv[0]["id"]
        proto = dv[0].get("protocol", "")

        addr = "M100" if "s7" in proto.lower() or "S7" in proto else "40100"
        # Try a couple candidates for compatibility
        candidates = ["M100.0", "M100", "40100", "%MX100.0"]
        created_id = None
        used_addr = None
        for a in candidates:
            r = requests.post(f"{BASE}/api/projects/{demo_pid}/tags/ensure", headers=H,
                              json={"device_id": device_id, "address": a, "data_type": "BOOL"})
            if r.status_code == 200:
                created_id = r.json()["id"]
                used_addr = a
                break
        assert created_id, f"could not ensure tag on any candidate address; proto={proto}"

        # reuse — same id
        r2 = requests.post(f"{BASE}/api/projects/{demo_pid}/tags/ensure", headers=H,
                           json={"device_id": device_id, "address": used_addr, "data_type": "BOOL"})
        assert r2.status_code == 200
        assert r2.json()["id"] == created_id

        # cleanup: delete this auto tag
        requests.delete(f"{BASE}/api/projects/{demo_pid}/tags/{created_id}", headers=H)

    def test_ensure_bad_address(self, H, demo_pid):
        dv = requests.get(f"{BASE}/api/projects/{demo_pid}/devices", headers=H).json()
        device_id = dv[0]["id"]
        r = requests.post(f"{BASE}/api/projects/{demo_pid}/tags/ensure", headers=H,
                          json={"device_id": device_id, "address": "!!!bad!!!", "data_type": "BOOL"})
        assert r.status_code == 400

    def test_ensure_bad_device(self, H, demo_pid):
        r = requests.post(f"{BASE}/api/projects/{demo_pid}/tags/ensure", headers=H,
                          json={"device_id": "nope-" + uuid.uuid4().hex, "address": "M0.0", "data_type": "BOOL"})
        assert r.status_code == 400


# ---------------- Data log export formats ----------------
class TestDataLog:
    def test_log_csv(self, H, demo_slug):
        r = requests.get(f"{BASE}/api/public/{demo_slug}/rt/records/1/log",
                         params={"format": "csv", "minutes": 60, "tz": -420})
        assert r.status_code == 200
        text = r.content.decode("utf-8", errors="ignore")
        first_line = (text.splitlines()[0] if text else "").lstrip("\ufeff")
        assert first_line.startswith("Waktu"), f"csv header wrong: {first_line!r}"

    def test_log_xlsx(self, H, demo_slug):
        r = requests.get(f"{BASE}/api/public/{demo_slug}/rt/records/1/log",
                         params={"format": "xlsx", "minutes": 60, "tz": -420})
        assert r.status_code == 200
        assert r.content[:2] == b"PK"  # zip magic

    def test_log_pdf(self, H, demo_slug):
        r = requests.get(f"{BASE}/api/public/{demo_slug}/rt/records/1/log",
                         params={"format": "pdf", "minutes": 60, "tz": -420})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_log_bad_format(self, H, demo_slug):
        r = requests.get(f"{BASE}/api/public/{demo_slug}/rt/records/1/log",
                         params={"format": "docx"})
        assert r.status_code == 400

    def test_chart_pdf_still_works(self, H, demo_slug):
        r = requests.get(f"{BASE}/api/public/{demo_slug}/rt/records/1/pdf",
                         params={"minutes": 60, "tz": -420})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
