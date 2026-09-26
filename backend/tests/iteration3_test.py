"""
SCADA HMI Builder - Iteration 3 backend regression suite.
Covers:
  - Data Records CRUD (/api/projects/{pid}/records) with limits: max 100, channels<=99, unique number 1..100
  - Alarm Defs CRUD (/api/projects/{pid}/alarm-defs) with validation for bit/word conditions
  - Runtime /rt/records list, /rt/records/{no}/samples (engine sampling), /rt/records/{no}/pdf returns application/pdf
  - /rt/values includes alarm_events with kind/group/level from defs
"""
import os, time, uuid, pytest, requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://plc-visual-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
from creds import ADMIN_EMAIL, ADMIN_PASSWORD, CLIENT_PASSWORD  # noqa: F401
DEMO_SLUG = "ghdhbuxrp4e"


@pytest.fixture(scope="session")
def s():
    ss = requests.Session()
    ss.headers.update({"Content-Type": "application/json"})
    r = ss.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    ss.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return ss


@pytest.fixture(scope="session")
def pid(s):
    demo = next((p for p in s.get(f"{API}/projects").json() if "Demo" in p.get("name", "")), None)
    assert demo, "demo project missing"
    return demo["id"]


@pytest.fixture(scope="session")
def tags(s, pid):
    return s.get(f"{API}/projects/{pid}/tags").json()


@pytest.fixture(scope="session")
def bool_tag(tags):
    t = next((t for t in tags if t.get("data_type") == "BOOL"), None)
    assert t, "need a BOOL tag"
    return t


@pytest.fixture(scope="session")
def word_tag(tags):
    t = next((t for t in tags if t.get("data_type") not in ("BOOL",)), None)
    assert t, "need a non-BOOL tag"
    return t


# --------------- DATA RECORDS ---------------
class TestDataRecords:
    def test_seeded_record_1_exists(self, s, pid):
        recs = s.get(f"{API}/projects/{pid}/records").json()
        one = next((r for r in recs if r["number"] == 1), None)
        assert one is not None, "seeded record #1 must exist"
        assert len(one["channels"]) >= 1

    def test_create_and_persist(self, s, pid, tags):
        chans = [t["id"] for t in tags[:3]]
        num = 77
        # delete any leftover with #77
        for r in s.get(f"{API}/projects/{pid}/records").json():
            if r["number"] == num:
                s.delete(f"{API}/projects/{pid}/records/{r['id']}")
        r = s.post(f"{API}/projects/{pid}/records",
                   json={"number": num, "name": "TEST_rec", "interval_s": 5, "channels": chans, "enabled": True})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        try:
            got = next(x for x in s.get(f"{API}/projects/{pid}/records").json() if x["number"] == num)
            assert got["name"] == "TEST_rec"
            assert got["channels"] == chans

            # Duplicate number rejected
            dup = s.post(f"{API}/projects/{pid}/records",
                         json={"number": num, "name": "dup", "interval_s": 5, "channels": [], "enabled": True})
            assert dup.status_code == 400

            # Update
            upd = s.put(f"{API}/projects/{pid}/records/{rid}",
                        json={"number": num, "name": "TEST_upd", "interval_s": 10, "channels": chans[:1], "enabled": True})
            assert upd.status_code == 200
            assert upd.json()["name"] == "TEST_upd"
            assert upd.json()["interval_s"] == 10
        finally:
            d = s.delete(f"{API}/projects/{pid}/records/{rid}")
            assert d.status_code == 200
            # Confirm removed
            assert not any(x["id"] == rid for x in s.get(f"{API}/projects/{pid}/records").json())

    def test_invalid_number_range(self, s, pid):
        # number > 100
        r = s.post(f"{API}/projects/{pid}/records",
                   json={"number": 101, "name": "bad", "interval_s": 5, "channels": [], "enabled": True})
        assert r.status_code in (400, 422)
        r = s.post(f"{API}/projects/{pid}/records",
                   json={"number": 0, "name": "bad", "interval_s": 5, "channels": [], "enabled": True})
        assert r.status_code in (400, 422)

    def test_channels_max_99(self, s, pid, tags):
        # 100 fake channels - reject at pydantic layer
        r = s.post(f"{API}/projects/{pid}/records",
                   json={"number": 78, "name": "bad", "interval_s": 5,
                         "channels": [str(uuid.uuid4()) for _ in range(100)], "enabled": True})
        assert r.status_code in (400, 422)

    def test_invalid_tag_rejected(self, s, pid):
        r = s.post(f"{API}/projects/{pid}/records",
                   json={"number": 79, "name": "bad", "interval_s": 5,
                         "channels": ["not-a-real-tag-id"], "enabled": True})
        assert r.status_code == 400


# --------------- ALARM DEFS ---------------
class TestAlarmDefs:
    def test_list_seeded(self, s, pid):
        defs = s.get(f"{API}/projects/{pid}/alarm-defs").json()
        assert isinstance(defs, list)
        # per review: seeded bit + word alarm
        kinds = {d["kind"] for d in defs}
        assert "bit" in kinds and "word" in kinds, f"seeded alarms missing, got {kinds}"

    def test_bit_alarm_crud(self, s, pid, bool_tag):
        r = s.post(f"{API}/projects/{pid}/alarm-defs",
                   json={"kind": "bit", "tag_id": bool_tag["id"], "group": 3, "condition": "on",
                         "content": "TEST_bit alarm", "record": True, "beep": True, "popup_once": True})
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        try:
            assert r.json()["group"] == 3
            # update to off
            u = s.put(f"{API}/projects/{pid}/alarm-defs/{did}",
                      json={"kind": "bit", "tag_id": bool_tag["id"], "group": 3, "condition": "off",
                            "content": "TEST_bit off", "record": False, "not_save_off": True})
            assert u.status_code == 200
            assert u.json()["condition"] == "off"
            # bit condition validation - anything else 400
            bad = s.post(f"{API}/projects/{pid}/alarm-defs",
                         json={"kind": "bit", "tag_id": bool_tag["id"], "condition": "high"})
            assert bad.status_code == 400
        finally:
            s.delete(f"{API}/projects/{pid}/alarm-defs/{did}")

    def test_word_alarm_crud_and_validation(self, s, pid, word_tag):
        # missing value for 'high' -> 400
        bad = s.post(f"{API}/projects/{pid}/alarm-defs",
                     json={"kind": "word", "tag_id": word_tag["id"], "condition": "high"})
        assert bad.status_code == 400

        # missing low/high for range -> 400
        bad2 = s.post(f"{API}/projects/{pid}/alarm-defs",
                      json={"kind": "word", "tag_id": word_tag["id"], "condition": "range", "low": 0})
        assert bad2.status_code == 400

        # valid range
        r = s.post(f"{API}/projects/{pid}/alarm-defs",
                   json={"kind": "word", "tag_id": word_tag["id"], "group": 4, "condition": "range",
                         "low": 1, "high": 10, "content": "TEST_word range"})
        assert r.status_code == 200, r.text
        did = r.json()["id"]
        try:
            assert r.json()["condition"] == "range"
            assert r.json()["low"] == 1 and r.json()["high"] == 10
        finally:
            s.delete(f"{API}/projects/{pid}/alarm-defs/{did}")

    def test_invalid_word_condition(self, s, pid, word_tag):
        r = s.post(f"{API}/projects/{pid}/alarm-defs",
                   json={"kind": "word", "tag_id": word_tag["id"], "condition": "wrong", "value": 1})
        assert r.status_code == 400


# --------------- RUNTIME RECORDS API ---------------
class TestRuntimeRecords:
    def test_rt_records_list(self, s, pid):
        recs = s.get(f"{API}/projects/{pid}/rt/records").json()
        assert isinstance(recs, list) and len(recs) >= 1
        one = next((r for r in recs if r["number"] == 1), None)
        assert one, "record #1 missing at runtime"
        assert "channels" in one and isinstance(one["channels"], list)
        if one["channels"]:
            assert "tag_id" in one["channels"][0] and "name" in one["channels"][0]

    def test_rt_samples_shape(self, s, pid):
        # After several seconds the engine should have produced samples
        for _ in range(3):
            rows = s.get(f"{API}/projects/{pid}/rt/records/1/samples", params={"minutes": 60}).json()
            if rows:
                break
            time.sleep(3)
        assert isinstance(rows, list)
        if rows:
            assert "ts" in rows[0] and "v" in rows[0]
            assert isinstance(rows[0]["v"], dict)

    def test_rt_pdf(self, s, pid):
        r = s.get(f"{API}/projects/{pid}/rt/records/1/pdf", params={"minutes": 60})
        assert r.status_code == 200, r.text[:400]
        assert r.headers["content-type"].startswith("application/pdf"), r.headers
        assert r.content[:4] == b"%PDF", "response body not a PDF"
        assert len(r.content) > 1500

    def test_rt_pdf_missing_record_404(self, s, pid):
        r = s.get(f"{API}/projects/{pid}/rt/records/99/pdf", params={"minutes": 10})
        assert r.status_code == 404


# --------------- ALARM EVENTS ---------------
class TestAlarmEvents:
    def test_values_contains_alarm_events(self, s, pid):
        snap = s.get(f"{API}/projects/{pid}/rt/values").json()
        assert "alarm_events" in snap
        assert "active_alarms" in snap
        assert isinstance(snap["alarm_events"], list)
        # If any active, each item should have level & group
        for e in snap["alarm_events"]:
            assert "level" in e
            # def-based alarms use BIT/HI/LO/EQ/RNG; legacy tag-based use HH/H/LL/L/ON
            assert e["level"] in ("BIT", "HI", "LO", "EQ", "RNG", "HH", "H", "LL", "L", "ON")
            assert "group" in e


# --------------- Public runtime PDF (client) ---------------
class TestPublicPdf:
    def test_public_pdf_requires_login_when_security(self, s):
        # security_enabled=true, so anonymous -> 401
        r = requests.get(f"{API}/public/{DEMO_SLUG}/rt/records/1/pdf", params={"minutes": 60})
        assert r.status_code == 401

    def test_public_pdf_with_client_login(self):
        lr = requests.post(f"{API}/public/{DEMO_SLUG}/auth/login",
                           json={"username": "admin", "password": CLIENT_PASSWORD})
        assert lr.status_code == 200
        tok = lr.json()["token"]
        r = requests.get(f"{API}/public/{DEMO_SLUG}/rt/records/1/pdf",
                         params={"minutes": 60}, headers={"X-Client-Token": tok})
        assert r.status_code == 200, r.text[:400]
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
