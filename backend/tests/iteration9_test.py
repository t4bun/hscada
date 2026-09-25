"""Iteration 9 - Kiosk Exit PIN tests."""
import os
import time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://plc-visual-studio.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
EMAIL = "amoskun99@gmail.com"
PASSWORD = "admin123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def base_settings(headers):
    r = requests.get(f"{API}/system/settings", headers=headers)
    assert r.status_code == 200
    d = r.json()
    # keep body clean
    return {k: d.get(k, "") for k in ["hide_engineer", "engineer_path", "default_slug", "mdns_name",
                                       "custom_domain", "http_port", "workspace_name", "workspace_logo"]}


def put_settings(headers, base, **extra):
    body = {**base, **extra}
    body.setdefault("kiosk_pin", "")
    body.setdefault("kiosk_pin_clear", False)
    return requests.put(f"{API}/system/settings", headers=headers, json=body)


# --- GET response never includes hash ---
def test_get_settings_no_hash(headers):
    r = requests.get(f"{API}/system/settings", headers=headers)
    assert r.status_code == 200
    d = r.json()
    assert "kiosk_pin_hash" not in d
    assert "kiosk_pin_set" in d and isinstance(d["kiosk_pin_set"], bool)


def test_boot_has_kiosk_pin_set():
    r = requests.get(f"{API}/boot")
    assert r.status_code == 200
    assert "kiosk_pin_set" in r.json()


# --- validation ---
def test_put_invalid_pin_length(headers, base_settings):
    r = put_settings(headers, base_settings, kiosk_pin="123")
    assert r.status_code == 400


def test_put_invalid_pin_nondigit(headers, base_settings):
    r = put_settings(headers, base_settings, kiosk_pin="abcd")
    assert r.status_code == 400


# --- set / verify / clear cycle ---
def test_set_pin_and_verify(headers, base_settings):
    # Set PIN 246810
    r = put_settings(headers, base_settings, kiosk_pin="246810")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["kiosk_pin_set"] is True
    assert "kiosk_pin_hash" not in d

    # boot reflects
    b = requests.get(f"{API}/boot").json()
    assert b["kiosk_pin_set"] is True

    # verify correct
    v = requests.post(f"{API}/kiosk/verify", json={"pin": "246810"})
    assert v.status_code == 200
    assert v.json() == {"ok": True}


def test_verify_wrong_pin(headers):
    # use a fresh IP to avoid lockout collision
    ip = "10.9.9.10"
    v = requests.post(f"{API}/kiosk/verify", json={"pin": "000000"},
                      headers={"X-Forwarded-For": ip})
    assert v.status_code == 403


def test_empty_pin_field_keeps_existing(headers, base_settings):
    # Send empty kiosk_pin -> should not clear
    r = put_settings(headers, base_settings)
    assert r.status_code == 200
    assert r.json()["kiosk_pin_set"] is True
    # verify still works
    v = requests.post(f"{API}/kiosk/verify", json={"pin": "246810"},
                      headers={"X-Forwarded-For": "10.9.9.11"})
    assert v.status_code == 200


def test_lockout_after_5_wrong(headers):
    ip = "10.9.9.99"
    codes = []
    for _ in range(5):
        r = requests.post(f"{API}/kiosk/verify", json={"pin": "000000"},
                          headers={"X-Forwarded-For": ip})
        codes.append(r.status_code)
    # After 5th wrong, next attempt should be 429
    r6 = requests.post(f"{API}/kiosk/verify", json={"pin": "246810"},
                       headers={"X-Forwarded-For": ip})
    assert codes.count(403) == 5
    assert r6.status_code == 429


def test_clear_pin(headers, base_settings):
    r = put_settings(headers, base_settings, kiosk_pin_clear=True)
    assert r.status_code == 200
    d = r.json()
    assert d["kiosk_pin_set"] is False
    assert "kiosk_pin_hash" not in d

    b = requests.get(f"{API}/boot").json()
    assert b["kiosk_pin_set"] is False

    # With no PIN set, verify returns 200
    v = requests.post(f"{API}/kiosk/verify", json={"pin": ""},
                      headers={"X-Forwarded-For": "10.9.9.55"})
    assert v.status_code == 200


def test_final_state_restored(headers):
    """Ensure workspace/hide_engineer restored to expected defaults."""
    r = requests.get(f"{API}/system/settings", headers=headers)
    d = r.json()
    assert d["kiosk_pin_set"] is False
    assert d["workspace_name"] == "Scada by T4bun"
    assert d["hide_engineer"] is False
    assert d["workspace_logo"] == ""
