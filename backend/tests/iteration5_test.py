"""Iteration 5 — Data record retention cleanup tests.

Covers:
- GET /api/projects/{pid}/records/storage
- POST /api/projects/{pid}/records/cleanup
- Project settings default record_retention_enabled/days
- PUT settings persistence
- Old TTL index 'rs_ttl' dropped
- Engine cleanup path (import + callable)
- 404 for other user's project
"""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DBNAME = os.environ.get("DB_NAME", "test_database")
ADMIN = {"email": "amoskun99@gmail.com", "password": "admin123"}


@pytest.fixture(scope="module")
def mdb():
    c = MongoClient(MONGO)
    yield c[DBNAME]
    c.close()


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def H(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def test_project(H, mdb):
    """Create disposable project used for destructive cleanup tests."""
    r = requests.post(f"{BASE}/api/projects", headers=H, json={"name": f"TEST_retention_{uuid.uuid4().hex[:6]}"})
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    yield pid
    # Cleanup
    requests.delete(f"{BASE}/api/projects/{pid}", headers=H)
    mdb.record_samples.delete_many({"project_id": pid})


# ---------- 1. Default settings ----------
def test_default_settings_contain_retention(H, test_project):
    r = requests.get(f"{BASE}/api/projects/{test_project}", headers=H)
    assert r.status_code == 200
    s = r.json()["settings"]
    assert s["record_retention_enabled"] is True
    assert s["record_retention_days"] == 90


# ---------- 2. Old TTL index dropped ----------
def test_ttl_index_rs_ttl_absent(mdb):
    idxs = mdb.record_samples.index_information()
    assert "rs_ttl" not in idxs, f"Old TTL index still present: {list(idxs.keys())}"


# ---------- 3. Storage endpoint ----------
def test_storage_endpoint_empty(H, test_project):
    r = requests.get(f"{BASE}/api/projects/{test_project}/records/storage", headers=H)
    assert r.status_code == 200
    data = r.json()
    for k in ("samples", "oldest", "newest", "est_bytes", "enabled", "days", "last_cleanup"):
        assert k in data
    assert data["samples"] == 0
    assert data["enabled"] is True
    assert data["days"] == 90
    assert data["last_cleanup"] is None


# ---------- 4. Storage 404 for other owner ----------
def test_storage_404_for_non_owner(mdb, H):
    fake_pid = str(uuid.uuid4())
    mdb.projects.insert_one({"id": fake_pid, "owner_id": "someone-else", "name": "TEST_foreign",
                             "screens": [], "settings": {}, "created_at": "x", "updated_at": "x"})
    try:
        r = requests.get(f"{BASE}/api/projects/{fake_pid}/records/storage", headers=H)
        assert r.status_code == 404
        r2 = requests.post(f"{BASE}/api/projects/{fake_pid}/records/cleanup", headers=H)
        assert r2.status_code == 404
    finally:
        mdb.projects.delete_one({"id": fake_pid})


# ---------- 5. Cleanup respects retention days ----------
def test_cleanup_deletes_old_samples_only(H, test_project, mdb):
    now = datetime.now(timezone.utc)
    docs = [
        {"project_id": test_project, "record": 1, "ts": now - timedelta(days=200), "v": {}},
        {"project_id": test_project, "record": 1, "ts": now - timedelta(days=40),  "v": {}},
        {"project_id": test_project, "record": 1, "ts": now - timedelta(days=5),   "v": {}},
        {"project_id": test_project, "record": 1, "ts": now - timedelta(hours=1),  "v": {}},
    ]
    mdb.record_samples.insert_many([dict(d) for d in docs])
    assert mdb.record_samples.count_documents({"project_id": test_project}) == 4

    # Set retention to 30 days
    r = requests.put(f"{BASE}/api/projects/{test_project}", headers=H,
                     json={"settings": {"record_retention_enabled": True, "record_retention_days": 30,
                                        "byte_order": "ABCD", "initial_screen": "",
                                        "screen_saver_enabled": False, "screen_saver_minutes": 5,
                                        "security_enabled": False}})
    assert r.status_code == 200

    r = requests.post(f"{BASE}/api/projects/{test_project}/records/cleanup", headers=H)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["deleted"] == 2  # 200d + 40d
    assert body["days"] == 30

    remaining = mdb.record_samples.count_documents({"project_id": test_project})
    assert remaining == 2

    # last_cleanup persisted
    r = requests.get(f"{BASE}/api/projects/{test_project}/records/storage", headers=H)
    lc = r.json()["last_cleanup"]
    assert lc and lc["deleted"] == 2 and "at" in lc and "cutoff" in lc


# ---------- 6. Cleanup 400 when disabled ----------
def test_cleanup_400_when_disabled(H, test_project):
    r = requests.put(f"{BASE}/api/projects/{test_project}", headers=H,
                     json={"settings": {"record_retention_enabled": False, "record_retention_days": 30,
                                        "byte_order": "ABCD", "initial_screen": "",
                                        "screen_saver_enabled": False, "screen_saver_minutes": 5,
                                        "security_enabled": False}})
    assert r.status_code == 200
    r = requests.post(f"{BASE}/api/projects/{test_project}/records/cleanup", headers=H)
    assert r.status_code == 400

    # Storage still reflects disabled
    r = requests.get(f"{BASE}/api/projects/{test_project}/records/storage", headers=H)
    assert r.json()["enabled"] is False

    # Re-enable for good hygiene
    requests.put(f"{BASE}/api/projects/{test_project}", headers=H,
                 json={"settings": {"record_retention_enabled": True, "record_retention_days": 90,
                                    "byte_order": "ABCD", "initial_screen": "",
                                    "screen_saver_enabled": False, "screen_saver_minutes": 5,
                                    "security_enabled": False}})


# ---------- 7. Cleanup only affects the project scope ----------
def test_cleanup_project_scoped(H, test_project, mdb):
    # Insert samples in another project id (fake) — should NOT be deleted
    other_pid = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    mdb.record_samples.insert_one({"project_id": other_pid, "record": 1, "ts": now - timedelta(days=500), "v": {}})
    try:
        # Ensure retention on our project = 30
        requests.put(f"{BASE}/api/projects/{test_project}", headers=H,
                     json={"settings": {"record_retention_enabled": True, "record_retention_days": 30,
                                        "byte_order": "ABCD", "initial_screen": "",
                                        "screen_saver_enabled": False, "screen_saver_minutes": 5,
                                        "security_enabled": False}})
        # Insert an old doc in our project
        mdb.record_samples.insert_one({"project_id": test_project, "record": 1,
                                       "ts": now - timedelta(days=100), "v": {}})
        r = requests.post(f"{BASE}/api/projects/{test_project}/records/cleanup", headers=H)
        assert r.status_code == 200
        # Other project's old doc still present
        assert mdb.record_samples.count_documents({"project_id": other_pid}) == 1
    finally:
        mdb.record_samples.delete_many({"project_id": other_pid})


# ---------- 8. Engine cleanup code path is importable/callable ----------
def test_engine_cleanup_path_exists():
    import sys
    sys.path.insert(0, "/app/backend")
    from records import cleanup_all, cleanup_project  # noqa
    from engine import Engine  # noqa
    assert callable(cleanup_all)
    assert callable(cleanup_project)
    assert hasattr(Engine, "cleanup_records")
