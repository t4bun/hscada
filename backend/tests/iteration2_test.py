"""
SCADA HMI Builder - Iteration 2 backend regression suite.
Covers: new protocols (modbus_rtu, modbus_rtu_tcp, internal), address auto-infer,
internal LB/LW device + tag persistence, TIA CSV import + export, project settings,
security groups & client users, client login/session on published app with security.
"""
import os
import time
import uuid
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://plc-visual-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Iteration-2 test targets amoskun99 (owns Demo Pengolahan Air, security_enabled=true)
ADMIN_EMAIL = "amoskun99@gmail.com"
ADMIN_PASSWORD = "admin123"
DEMO_SLUG = "ghdhbuxrp4e"          # published slug per review
CLIENT_ADMIN = ("admin", "admin123")


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def s():
    """Authenticated builder session for amoskun99."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    s.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return s


@pytest.fixture(scope="session")
def pid(s):
    """Id of Demo Pengolahan Air project."""
    r = s.get(f"{API}/projects")
    assert r.status_code == 200
    demo = next((p for p in r.json() if "Demo" in p.get("name", "")), None)
    assert demo, "seeded demo project missing for amoskun99"
    return demo["id"]


# ---------------- Meta / protocols ----------------
class TestMetaProtocols:
    def test_meta_has_new_protocols(self, s):
        d = s.get(f"{API}/meta").json()
        for p in ["modbus_rtu", "modbus_rtu_tcp", "internal"]:
            assert p in d["protocols"], f"missing protocol {p}"
        assert d["protocols"]["modbus_rtu"].get("serial") is True
        assert d["protocols"]["internal"]["family"] == "internal"
        assert d["protocols"]["modbus_rtu"]["label"] == "Modbus RTU RS485 (Serial)"


# ---------------- Internal device + LB/LW tags ----------------
class TestInternalMemory:
    def test_internal_device_and_lb_lw_tags(self, s, pid):
        # Create internal device
        r = s.post(f"{API}/projects/{pid}/devices",
                   json={"name": f"TEST_internal_{uuid.uuid4().hex[:5]}", "protocol": "internal", "simulate": False})
        assert r.status_code == 200, r.text
        dev = r.json()
        did = dev["id"]
        try:
            # LW0 -> INT16 (auto-infer via infer_type on internal family)
            lw = s.post(f"{API}/projects/{pid}/tags",
                        json={"name": f"TEST_LW0_{uuid.uuid4().hex[:5]}", "device_id": did, "address": "LW0",
                              "data_type": "INT16", "writable": True, "sim_mode": "static"})
            assert lw.status_code == 200, lw.text
            assert lw.json()["data_type"] == "INT16"
            assert lw.json()["category"] == "Word"

            # LB0 -> BOOL
            lb = s.post(f"{API}/projects/{pid}/tags",
                        json={"name": f"TEST_LB0_{uuid.uuid4().hex[:5]}", "device_id": did, "address": "LB0",
                              "data_type": "BOOL", "writable": True, "sim_mode": "static"})
            assert lb.status_code == 200, lb.text
            assert lb.json()["category"] == "Bit"

            # Write to LW0 and read back via runtime
            wr = s.post(f"{API}/projects/{pid}/rt/write", json={"tag_id": lw.json()["id"], "value": 42})
            assert wr.status_code == 200, wr.text
            time.sleep(1.2)
            snap = s.get(f"{API}/projects/{pid}/rt/values").json()
            values = snap.get("values") or snap.get("tags") or snap
            # snapshot format: {tag_id: {v: ..}} or nested
            found = None
            if isinstance(values, dict):
                for k, v in values.items():
                    if k == lw.json()["id"]:
                        found = v if not isinstance(v, dict) else v.get("v", v.get("value"))
                        break
            assert found is not None, f"LW0 value not present in snapshot: {snap}"

            # Invalid internal address (not LB/LW)
            bad = s.post(f"{API}/projects/{pid}/tags",
                         json={"name": f"TEST_BAD_{uuid.uuid4().hex[:5]}", "device_id": did, "address": "XYZ99",
                               "data_type": "INT16"})
            assert bad.status_code == 400

            # Internal test endpoint returns ok (no phys conn)
            t = s.post(f"{API}/devices/{did}/test")
            assert t.status_code == 200 and t.json()["ok"] is True

            # Clean tags
            for tag_id in (lw.json()["id"], lb.json()["id"]):
                s.delete(f"{API}/tags/{tag_id}")
        finally:
            s.delete(f"{API}/devices/{did}")


# ---------------- Modbus RTU device creation ----------------
class TestModbusRTU:
    def test_create_rtu_device(self, s, pid):
        r = s.post(f"{API}/projects/{pid}/devices",
                   json={"name": f"TEST_rtu_{uuid.uuid4().hex[:4]}", "protocol": "modbus_rtu",
                         "serial_port": "/dev/ttyUSB0", "baudrate": 9600, "parity": "N", "databits": 8, "stopbits": 1,
                         "byte_order": "ABCD", "simulate": True})
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        try:
            # simulate=True -> test returns ok immediately
            t = s.post(f"{API}/devices/{did}/test")
            assert t.status_code == 200 and t.json()["ok"] is True
        finally:
            s.delete(f"{API}/devices/{did}")

    def test_create_rtu_over_tcp_device(self, s, pid):
        r = s.post(f"{API}/projects/{pid}/devices",
                   json={"name": f"TEST_rtutcp_{uuid.uuid4().hex[:4]}", "protocol": "modbus_rtu_tcp",
                         "host": "10.255.255.1", "port": 502, "simulate": False})
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        try:
            t = s.post(f"{API}/devices/{did}/test")
            # unreachable -> ok False; endpoint still 200
            assert t.status_code == 200 and t.json()["ok"] is False
        finally:
            s.delete(f"{API}/devices/{did}")


# ---------------- Tag address auto-infer (backend infer_type function) ----------------
class TestInferType:
    """Verify infer_type through driver imports (unit-style)."""
    @pytest.mark.parametrize("proto,addr,expected", [
        ("s7_1200_1500", "DB1.DBX0.0", "BOOL"),
        ("s7_1200_1500", "MD20", "INT32"),
        ("s7_1200_1500", "MW10", "INT16"),
        ("modbus_tcp", "C10", "BOOL"),
        ("modbus_tcp", "HR100", "INT16"),
        ("modbus_tcp", "HR100.3", "BOOL"),
        ("internal", "LB0", "BOOL"),
        ("internal", "LW10", "INT16"),
    ])
    def test_infer(self, proto, addr, expected):
        import sys
        sys.path.insert(0, "/app/backend")
        from drivers import infer_type
        assert infer_type(proto, addr) == expected


# ---------------- Tag CSV import / export ----------------
class TestTagImportExport:
    TIA_CSV = (
        "Name,Path,Data Type,Logical Address,Comment\n"
        "TEST_M0_bit,Path,Bool,%M0.0,Comment M0.0\n"
        "TEST_MW10,Path,Int,%MW10,int16 tag\n"
        "TEST_MD20,Path,DInt,%MD20,int32 tag\n"
        "TEST_MREAL,Path,Real,%MD30,float32 tag\n"
        "TEST_STR,Path,String,%DB1.STR0,unsupported string\n"
    )

    def test_import_tia_csv_and_export(self, s, pid):
        # Create s7 device to import against
        dr = s.post(f"{API}/projects/{pid}/devices",
                    json={"name": f"TEST_s7imp_{uuid.uuid4().hex[:4]}", "protocol": "s7_1200_1500",
                          "host": "127.0.0.1", "simulate": True})
        assert dr.status_code == 200, dr.text
        did = dr.json()["id"]
        try:
            s2 = requests.Session()
            s2.headers.update({k: v for k, v in s.headers.items() if k != "Content-Type"})
            up = s2.post(f"{API}/projects/{pid}/tags/import",
                         files={"file": ("tia.csv", io.BytesIO(self.TIA_CSV.encode()), "text/csv")},
                         data={"device_id": did})
            assert up.status_code == 200, up.text
            body = up.json()
            assert body["created"] == 4, body
            # String skipped with unsupported reason
            reasons = " | ".join(x.get("reason", "") for x in body["skipped"])
            assert "String" in reasons or "string" in reasons

            # Verify categorization
            tags = s.get(f"{API}/projects/{pid}/tags").json()
            new_tags = {t["name"]: t for t in tags if t["name"].startswith("TEST_")}
            assert new_tags["TEST_M0_bit"]["data_type"] == "BOOL"
            assert new_tags["TEST_M0_bit"]["category"] == "Bit"
            assert new_tags["TEST_MW10"]["data_type"] == "INT16"
            assert new_tags["TEST_MW10"]["category"] == "Word"
            assert new_tags["TEST_MD20"]["data_type"] == "INT32"
            assert new_tags["TEST_MD20"]["category"] == "DWord"
            assert new_tags["TEST_MREAL"]["data_type"] == "FLOAT32"
            assert new_tags["TEST_MREAL"]["category"] == "Float"

            # Export CSV contains those tag names
            ex = s.get(f"{API}/projects/{pid}/tags/export")
            assert ex.status_code == 200
            assert "Name,Device,Address,Data Type" in ex.text
            for n in ("TEST_M0_bit", "TEST_MW10", "TEST_MD20", "TEST_MREAL"):
                assert n in ex.text

            # Cleanup imported tags
            for t in new_tags.values():
                s.delete(f"{API}/tags/{t['id']}")
        finally:
            s.delete(f"{API}/devices/{did}")


# ---------------- Project settings persistence ----------------
class TestProjectSettings:
    def test_settings_roundtrip(self, s, pid):
        original = s.get(f"{API}/projects/{pid}").json().get("settings", {})
        new_settings = {"byte_order": "CDAB", "initial_screen": "screen-x", "screen_saver_enabled": True,
                        "screen_saver_minutes": 7, "security_enabled": True}
        r = s.put(f"{API}/projects/{pid}", json={"settings": new_settings})
        assert r.status_code == 200
        got = s.get(f"{API}/projects/{pid}").json()["settings"]
        for k, v in new_settings.items():
            assert got[k] == v, f"{k}: {got[k]} != {v}"
        # restore (keep security_enabled True since demo has it)
        s.put(f"{API}/projects/{pid}", json={"settings": {**original, "security_enabled": True}})


# ---------------- Security: groups & users ----------------
class TestSecurityBuilder:
    def test_default_groups_present(self, s, pid):
        r = s.get(f"{API}/projects/{pid}/security")
        assert r.status_code == 200, r.text
        d = r.json()
        names = [g["name"] for g in d["groups"]]
        for n in ["Administrator", "Supervisor", "Operator", "Viewer"]:
            assert n in names, f"missing {n}"
        levels = {g["name"]: g["level"] for g in d["groups"]}
        assert levels["Administrator"] == 3
        assert levels["Viewer"] == 0
        assert any(u["username"] == "admin" for u in d["users"])

    def test_group_crud(self, s, pid):
        # add
        r = s.post(f"{API}/projects/{pid}/security/groups",
                   json={"name": f"TEST_G_{uuid.uuid4().hex[:4]}", "level": 1, "can_operate": True,
                         "can_ack": False, "can_manage_users": False, "screens": []})
        assert r.status_code == 200
        gid = r.json()["id"]
        # edit
        u = s.put(f"{API}/projects/{pid}/security/groups/{gid}",
                  json={"name": "TEST_G_edited", "level": 2, "can_operate": False,
                        "can_ack": True, "can_manage_users": False, "screens": []})
        assert u.status_code == 200 and u.json()["name"] == "TEST_G_edited"
        # delete
        d = s.delete(f"{API}/projects/{pid}/security/groups/{gid}")
        assert d.status_code == 200

    def test_user_crud(self, s, pid):
        groups = s.get(f"{API}/projects/{pid}/security").json()["groups"]
        viewer = next(g for g in groups if g["name"] == "Viewer")
        uname = f"test_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{API}/projects/{pid}/security/users",
                   json={"username": uname, "password": "pass1234", "full_name": "Test Viewer",
                         "group_id": viewer["id"], "active": True})
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # edit
        u = s.put(f"{API}/projects/{pid}/security/users/{uid}",
                  json={"username": uname, "password": "", "full_name": "Renamed",
                        "group_id": viewer["id"], "active": True})
        assert u.status_code == 200 and u.json()["full_name"] == "Renamed"
        # delete
        d = s.delete(f"{API}/projects/{pid}/security/users/{uid}")
        assert d.status_code == 200


# ---------------- Public app + client auth (security enabled) ----------------
class TestPublicClientAuth:
    def test_public_requires_login(self):
        r = requests.get(f"{API}/public/{DEMO_SLUG}")
        assert r.status_code == 200
        d = r.json()
        assert d.get("security_enabled") is True
        assert d.get("requires_login") is True
        # payload does not leak screens/tags
        assert "screens" not in d and "tags" not in d

    def test_rt_values_401_without_token(self):
        r = requests.get(f"{API}/public/{DEMO_SLUG}/rt/values")
        assert r.status_code == 401

    def test_client_admin_login(self):
        r = requests.post(f"{API}/public/{DEMO_SLUG}/auth/login",
                          json={"username": CLIENT_ADMIN[0], "password": CLIENT_ADMIN[1]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d and d["user"]["username"] == "admin"
        assert d["group"]["name"] == "Administrator"

    def test_client_wrong_password(self):
        r = requests.post(f"{API}/public/{DEMO_SLUG}/auth/login",
                          json={"username": CLIENT_ADMIN[0], "password": "wrong-xxx"})
        assert r.status_code == 401

    def test_client_authorized_flow(self):
        # login -> me -> values -> write bool
        r = requests.post(f"{API}/public/{DEMO_SLUG}/auth/login",
                          json={"username": CLIENT_ADMIN[0], "password": CLIENT_ADMIN[1]})
        token = r.json()["token"]
        h = {"X-Client-Token": token}

        me = requests.get(f"{API}/public/{DEMO_SLUG}/auth/me", headers=h)
        assert me.status_code == 200 and me.json()["group"]["can_operate"] is True

        pub = requests.get(f"{API}/public/{DEMO_SLUG}", headers=h)
        assert pub.status_code == 200
        d = pub.json()
        assert "screens" in d and "tags" in d
        assert d.get("session", {}).get("user", {}).get("username") == "admin"

        vals = requests.get(f"{API}/public/{DEMO_SLUG}/rt/values", headers=h)
        assert vals.status_code == 200

    def test_manager_cannot_edit_same_or_higher_level(self):
        # login as client admin
        r = requests.post(f"{API}/public/{DEMO_SLUG}/auth/login",
                          json={"username": CLIENT_ADMIN[0], "password": CLIENT_ADMIN[1]})
        token = r.json()["token"]
        h = {"X-Client-Token": token, "Content-Type": "application/json"}

        # get lower groups; try creating a user in admin group (same level) => 403
        me = requests.get(f"{API}/public/{DEMO_SLUG}/auth/me", headers=h).json()
        admin_gid = me["group"]["id"]
        rc = requests.post(f"{API}/public/{DEMO_SLUG}/auth/users",
                           json={"username": f"illegal_{uuid.uuid4().hex[:4]}", "password": "pass1234",
                                 "full_name": "x", "group_id": admin_gid, "active": True}, headers=h)
        assert rc.status_code == 403


# ---------------- Client Viewer user: read-only enforcement ----------------
class TestClientViewerReadOnly:
    def test_viewer_write_forbidden(self, s, pid):
        # ensure project published + security_enabled
        pub = requests.get(f"{API}/public/{DEMO_SLUG}").json()
        assert pub.get("security_enabled") is True

        groups = s.get(f"{API}/projects/{pid}/security").json()["groups"]
        viewer_g = next(g for g in groups if g["name"] == "Viewer")
        # Viewer defaults: can_operate=False, can_ack=False
        assert viewer_g["can_operate"] is False
        assert viewer_g["can_ack"] is False

        uname = f"test_view_{uuid.uuid4().hex[:5]}"
        pw = "pass1234"
        cu = s.post(f"{API}/projects/{pid}/security/users",
                    json={"username": uname, "password": pw, "full_name": "Viewer",
                          "group_id": viewer_g["id"], "active": True})
        assert cu.status_code == 200, cu.text
        uid = cu.json()["id"]
        try:
            # login as viewer via client endpoint
            lr = requests.post(f"{API}/public/{DEMO_SLUG}/auth/login",
                               json={"username": uname, "password": pw})
            assert lr.status_code == 200
            token = lr.json()["token"]
            h = {"X-Client-Token": token, "Content-Type": "application/json"}

            # Fetch a writable tag
            pub = requests.get(f"{API}/public/{DEMO_SLUG}", headers=h).json()
            wtag = next((t for t in pub["tags"] if t.get("writable")), None)
            assert wtag, "no writable tag"

            wr = requests.post(f"{API}/public/{DEMO_SLUG}/rt/write",
                               json={"tag_id": wtag["id"], "value": 1}, headers=h)
            assert wr.status_code == 403, f"expected 403 read-only, got {wr.status_code}"

            ack = requests.post(f"{API}/public/{DEMO_SLUG}/rt/alarms/ack",
                                json={}, headers=h)
            assert ack.status_code == 403

            # Viewer has no manage_users -> listing users forbidden
            lu = requests.get(f"{API}/public/{DEMO_SLUG}/auth/users", headers=h)
            assert lu.status_code == 403
        finally:
            s.delete(f"{API}/projects/{pid}/security/users/{uid}")
