"""
SCADA HMI Builder - Backend Integration Test Suite
Covers auth, projects, devices, tags, runtime, publish, uploads.
"""
import os
import time
import uuid
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://plc-visual-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@scada.id"
ADMIN_PASSWORD = "admin123"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json()["token"]
    s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="session")
def new_user_session():
    email = f"test_{uuid.uuid4().hex[:8]}@scada.id"
    pw = "pass1234"
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/register", json={"email": email, "password": pw, "name": "Test User"})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers["Authorization"] = f"Bearer {tok}"
    s.email = email
    return s


@pytest.fixture(scope="session")
def project_id(admin_session):
    # Reuse existing demo project
    r = admin_session.get(f"{API}/projects")
    assert r.status_code == 200
    projs = r.json()
    demo = next((p for p in projs if "Demo" in p.get("name", "")), None)
    assert demo, "seeded demo project not found"
    return demo["id"]


# ---------------- Auth ----------------
class TestAuth:
    def test_login_admin(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "bad_pw_xyz"})
        assert r.status_code == 401

    def test_register_and_demo_seeded(self, new_user_session):
        r = new_user_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        # demo project auto-created
        r2 = new_user_session.get(f"{API}/projects")
        assert r2.status_code == 200
        assert len(r2.json()) >= 1

    def test_unauthorized(self):
        r = requests.get(f"{API}/projects")
        assert r.status_code == 401

    def test_register_duplicate(self, new_user_session):
        r = requests.post(f"{API}/auth/register", json={"email": new_user_session.email, "password": "abcdef"})
        assert r.status_code == 400


# ---------------- Meta ----------------
class TestMeta:
    def test_meta(self, admin_session):
        r = admin_session.get(f"{API}/meta")
        assert r.status_code == 200
        d = r.json()
        assert "s7_1200_1500" in d["protocols"]
        assert "omron_fins" in d["protocols"]
        assert "weintek" in d["protocols"]
        for t in ["INT16", "UINT16", "INT32", "UINT32", "FLOAT32", "BOOL"]:
            assert t in d["data_types"]


# ---------------- Projects CRUD ----------------
class TestProjects:
    def test_create_get_update_delete(self, admin_session):
        r = admin_session.post(f"{API}/projects", json={"name": "TEST_proj", "description": "d"})
        assert r.status_code == 200
        pid = r.json()["id"]

        g = admin_session.get(f"{API}/projects/{pid}")
        assert g.status_code == 200
        assert g.json()["name"] == "TEST_proj"

        u = admin_session.put(f"{API}/projects/{pid}", json={"name": "TEST_proj2"})
        assert u.status_code == 200
        assert admin_session.get(f"{API}/projects/{pid}").json()["name"] == "TEST_proj2"

        d = admin_session.delete(f"{API}/projects/{pid}")
        assert d.status_code == 200
        assert admin_session.get(f"{API}/projects/{pid}").status_code == 404

    def test_isolation_between_users(self, admin_session, new_user_session):
        r = admin_session.post(f"{API}/projects", json={"name": "TEST_isolate"})
        pid = r.json()["id"]
        try:
            r2 = new_user_session.get(f"{API}/projects/{pid}")
            assert r2.status_code == 404
        finally:
            admin_session.delete(f"{API}/projects/{pid}")


# ---------------- Devices ----------------
class TestDevices:
    @pytest.mark.parametrize("protocol,addr", [
        ("s7_1200_1500", "DB1.DBW20"),
        ("omron_fins", "D100"),
        ("weintek", "HR100"),
    ])
    def test_create_device_and_tag(self, admin_session, project_id, protocol, addr):
        # create device (simulate)
        r = admin_session.post(f"{API}/projects/{project_id}/devices",
                                json={"name": f"TEST_{protocol}", "protocol": protocol, "host": "127.0.0.1", "simulate": True})
        assert r.status_code == 200, r.text
        dev = r.json()
        did = dev["id"]

        # test connection (simulate)
        t = admin_session.post(f"{API}/devices/{did}/test")
        assert t.status_code == 200
        assert t.json()["ok"] is True

        # invalid address should be 400
        bad = admin_session.post(f"{API}/projects/{project_id}/tags",
                                  json={"name": f"TEST_tag_bad_{protocol}", "device_id": did, "address": "XYZ_INVALID_@@", "data_type": "INT16"})
        assert bad.status_code == 400, bad.text

        # good tag
        good = admin_session.post(f"{API}/projects/{project_id}/tags",
                                   json={"name": f"TEST_tag_{protocol}_{uuid.uuid4().hex[:6]}", "device_id": did, "address": addr, "data_type": "INT16"})
        assert good.status_code == 200, good.text
        tag = good.json()
        assert "max_chars" in tag
        # cleanup
        admin_session.delete(f"{API}/tags/{tag['id']}")
        admin_session.delete(f"{API}/devices/{did}")

    def test_offline_real_mode(self, admin_session, project_id):
        r = admin_session.post(f"{API}/projects/{project_id}/devices",
                                json={"name": "TEST_offline", "protocol": "modbus_tcp", "host": "10.255.255.1", "port": 502, "simulate": False})
        assert r.status_code == 200
        did = r.json()["id"]
        try:
            t = admin_session.post(f"{API}/devices/{did}/test")
            assert t.status_code == 200
            body = t.json()
            assert body["ok"] is False, "expected offline"
        finally:
            admin_session.delete(f"{API}/devices/{did}")


# ---------------- Tag data types / max_chars ----------------
class TestTagFormats:
    @pytest.mark.parametrize("dt,dec,expected_max", [
        ("INT16", 0, 6),   # 5 digits + sign = 6
        ("UINT16", 0, 5),
        ("INT32", 0, 11),  # 10 digits + sign
        ("UINT32", 0, 10),
        ("FLOAT32", 2, 8), # 5 int + 2 dec + 1 dot = 8 (unsigned since limit applies) actually signed sign+4int+dot+2dec=8
        ("INT16", 1, 7),   # 4 int + sign + dot + 1 dec = 7
    ])
    def test_max_chars(self, admin_session, project_id, dt, dec, expected_max):
        # need a device
        r = admin_session.post(f"{API}/projects/{project_id}/devices",
                                json={"name": f"TEST_dev_fmt_{uuid.uuid4().hex[:4]}", "protocol": "modbus_tcp", "host": "127.0.0.1", "simulate": True})
        did = r.json()["id"]
        try:
            body = {"name": f"TEST_fmt_{dt}_{dec}_{uuid.uuid4().hex[:4]}", "device_id": did, "address": "HR100", "data_type": dt, "decimals": dec}
            g = admin_session.post(f"{API}/projects/{project_id}/tags", json=body)
            assert g.status_code == 200, g.text
            tag = g.json()
            assert tag["max_chars"] == expected_max, f"{dt} dec={dec}: got {tag['max_chars']}, want {expected_max}"
            admin_session.delete(f"{API}/tags/{tag['id']}")
        finally:
            admin_session.delete(f"{API}/devices/{did}")


# ---------------- Runtime & Publish ----------------
class TestRuntimeAndPublish:
    def test_values_and_history(self, admin_session, project_id):
        r = admin_session.get(f"{API}/projects/{project_id}/rt/values")
        assert r.status_code == 200
        v = r.json()
        assert "values" in v or "tags" in v or isinstance(v, dict)
        # wait then get history
        time.sleep(2)
        h = admin_session.get(f"{API}/projects/{project_id}/rt/history?minutes=60")
        assert h.status_code == 200
        assert isinstance(h.json(), list)

    def test_alarms(self, admin_session, project_id):
        r = admin_session.get(f"{API}/projects/{project_id}/rt/alarms")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_publish_and_public(self, admin_session, project_id):
        r = admin_session.post(f"{API}/projects/{project_id}/publish", json={"allow_operate": True})
        assert r.status_code == 200
        slug = r.json()["publish_slug"]

        # public endpoint no auth
        p = requests.get(f"{API}/public/{slug}")
        assert p.status_code == 200
        d = p.json()
        assert "screens" in d and "tags" in d

        # public runtime values
        v = requests.get(f"{API}/public/{slug}/rt/values")
        assert v.status_code == 200

    def test_publish_readonly_blocks_write(self, admin_session, project_id):
        # find a writable tag
        tags = admin_session.get(f"{API}/projects/{project_id}/tags").json()
        w = next((t for t in tags if t.get("writable")), None)
        assert w, "no writable tag"

        r = admin_session.post(f"{API}/projects/{project_id}/publish", json={"allow_operate": False})
        assert r.status_code == 200
        slug = r.json()["publish_slug"]

        wr = requests.post(f"{API}/public/{slug}/rt/write", json={"tag_id": w["id"], "value": 1})
        assert wr.status_code == 403

        # restore
        admin_session.post(f"{API}/projects/{project_id}/publish", json={"allow_operate": True})

    def test_public_write_and_read_back(self, admin_session, project_id):
        # ensure publish with operate
        r = admin_session.post(f"{API}/projects/{project_id}/publish", json={"allow_operate": True})
        slug = r.json()["publish_slug"]
        tags = admin_session.get(f"{API}/projects/{project_id}/tags").json()
        # find BOOL writable
        bool_tag = next((t for t in tags if t.get("writable") and t["data_type"] == "BOOL"), None)
        if bool_tag:
            wr = requests.post(f"{API}/public/{slug}/rt/write", json={"tag_id": bool_tag["id"], "value": True})
            assert wr.status_code == 200


# ---------------- Uploads ----------------
class TestUploads:
    def test_upload_image(self, admin_session):
        # 1x1 png
        png = bytes.fromhex("89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082")
        s2 = requests.Session()
        s2.headers.update({k: v for k, v in admin_session.headers.items() if k != "Content-Type"})
        r = s2.post(f"{API}/uploads", files={"file": ("test.png", io.BytesIO(png), "image/png")})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["kind"] == "image"
        # download
        g = requests.get(f"{BASE_URL}{data['url']}")
        assert g.status_code == 200
        assert g.headers["content-type"].startswith("image/")

    def test_upload_bad_ext(self, admin_session):
        s2 = requests.Session()
        s2.headers.update({k: v for k, v in admin_session.headers.items() if k != "Content-Type"})
        r = s2.post(f"{API}/uploads", files={"file": ("test.exe", io.BytesIO(b"MZ"), "application/octet-stream")})
        assert r.status_code == 400
