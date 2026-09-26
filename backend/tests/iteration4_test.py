"""
Iteration 4 backend tests for SCADA/HMI builder (On-Premise / real PLC drivers).

Covers:
- /api/meta protocol keys
- Real device create + /api/devices/{id}/test success against virtual PLCs (Modbus TCP,
  Fatek TCP, Omron FINS UDP, Wecon (Modbus), S7-1200 abs, OPC UA symbolic, Host Link,
  Modbus RTU virtual pty if available)
- Runtime /rt/values status=online, stats, quality=good
- Tag address validation per protocol
- Runtime write to real device
- Auto-reconnect status + retry_in + human-readable Indonesian error + stats.attempts
- /api/system/serial-ports (list), /api/system/info (mode=cloud in preview)
- TIA symbolic import with symbol_prefix
"""
import io
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

from creds import ADMIN_EMAIL, ADMIN_PASSWORD, CLIENT_PASSWORD  # noqa: F401
ADMIN = {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
HOSTLINK_PTY = None
if os.path.exists("/tmp/hostlink_pty"):
    with open("/tmp/hostlink_pty") as f:
        HOSTLINK_PTY = f.read().strip()


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers["Content-Type"] = "application/json"
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="session")
def project_id(client):
    r = client.get(f"{BASE_URL}/api/projects")
    assert r.status_code == 200
    projs = r.json()
    assert projs, "No project available for admin"
    return projs[0]["id"]


CREATED_DEVICES = []
CREATED_TAGS = []


@pytest.fixture(scope="session", autouse=True)
def cleanup(client):
    yield
    for tid in CREATED_TAGS:
        try:
            client.delete(f"{BASE_URL}/api/tags/{tid}")
        except Exception:
            pass
    for did in CREATED_DEVICES:
        try:
            client.delete(f"{BASE_URL}/api/devices/{did}")
        except Exception:
            pass


def _make_device(client, project_id, **overrides):
    body = {"name": "TEST_dev", "protocol": "modbus_tcp", "host": "127.0.0.1", "port": 5020,
            "simulate": False, "reconnect_s": 3, "timeout_ms": 2000, "unit_id": 1}
    body.update(overrides)
    r = client.post(f"{BASE_URL}/api/projects/{project_id}/devices", json=body)
    assert r.status_code == 200, f"create device failed: {r.status_code} {r.text}"
    d = r.json()
    CREATED_DEVICES.append(d["id"])
    return d


def _make_tag(client, project_id, device_id, name, address, data_type="INT16", writable=True):
    body = {"name": name, "device_id": device_id, "address": address, "data_type": data_type, "writable": writable}
    r = client.post(f"{BASE_URL}/api/projects/{project_id}/tags", json=body)
    assert r.status_code == 200, f"create tag failed: {r.status_code} {r.text}"
    t = r.json()
    CREATED_TAGS.append(t["id"])
    return t


# ---------- /api/meta ----------
def test_meta_has_new_protocols(client):
    r = client.get(f"{BASE_URL}/api/meta")
    assert r.status_code == 200
    meta = r.json()
    protos = meta.get("protocols") or meta.get("PROTOCOLS") or {}
    # Convert to dict of key->info if list
    keys = list(protos.keys()) if isinstance(protos, dict) else [p.get("key") for p in protos]
    expected = ["s7_1200_1500_sym", "omron_fins_udp", "omron_hostlink", "fatek_tcp",
                "fatek_serial", "wecon", "wecon_rtu", "modbus_rtu"]
    missing = [k for k in expected if k not in keys]
    assert not missing, f"Missing protocol keys in /api/meta: {missing}. Got: {keys}"
    # Check family=opcua for s7_1200_1500_sym
    if isinstance(protos, dict):
        fam = protos["s7_1200_1500_sym"].get("family")
        assert fam == "opcua", f"s7_1200_1500_sym family should be opcua, got {fam}"


# ---------- System endpoints ----------
def test_system_serial_ports(client):
    r = client.get(f"{BASE_URL}/api/system/serial-ports")
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_system_info(client):
    r = client.get(f"{BASE_URL}/api/system/info")
    assert r.status_code == 200
    info = r.json()
    assert info.get("mode") == "cloud", f"Expected mode=cloud in preview, got {info}"


# ---------- Address validation ----------
@pytest.mark.parametrize("protocol,valid_addrs,invalid_addrs", [
    ("fatek_tcp", ["R100", "M5", "R10.3"], ["ZZZ"]),
    ("wecon", ["D100", "X7", "Y10"], ["X8"]),  # X8 invalid (octal)
    ("omron_hostlink", ["D100", "CIO10.3"], ["ZZZ99"]),
    ("s7_1200_1500_sym", ['"Motor1".Start', '"DB_Tank".Level'], [""]),
])
def test_address_validation(client, project_id, protocol, valid_addrs, invalid_addrs):
    # Create a device for this protocol (simulate=true so no connect required)
    kwargs = {"name": f"TEST_val_{protocol}", "protocol": protocol, "simulate": True,
              "host": "127.0.0.1"}
    if protocol == "omron_hostlink":
        kwargs.update({"serial_port": HOSTLINK_PTY or "/dev/null", "baudrate": 9600,
                       "databits": 7, "parity": "E", "stopbits": 2})
    if protocol == "s7_1200_1500_sym":
        kwargs.update({"opc_endpoint": "opc.tcp://127.0.0.1:4841", "opc_namespace": 3})
    dev = _make_device(client, project_id, **kwargs)
    for addr in valid_addrs:
        body = {"name": f"TEST_ok_{protocol}_{addr}".replace('"', '').replace(".", "_"),
                "device_id": dev["id"], "address": addr, "data_type": "BOOL" if ".3" in addr or ".Start" in addr else "INT16"}
        r = client.post(f"{BASE_URL}/api/projects/{project_id}/tags", json=body)
        assert r.status_code == 200, f"[{protocol}] valid addr {addr} rejected: {r.status_code} {r.text}"
        CREATED_TAGS.append(r.json()["id"])
    for addr in invalid_addrs:
        body = {"name": f"TEST_bad_{protocol}_{addr}".replace('"', '_'),
                "device_id": dev["id"], "address": addr, "data_type": "INT16"}
        r = client.post(f"{BASE_URL}/api/projects/{project_id}/tags", json=body)
        assert r.status_code == 400, f"[{protocol}] invalid addr {addr} was accepted: {r.status_code} {r.text}"


# ---------- Test connection + runtime for each protocol ----------
def _rt_values(client, pid):
    r = client.get(f"{BASE_URL}/api/projects/{pid}/rt/values")
    assert r.status_code == 200, r.text
    return r.json()


def _wait_for_online(client, pid, dev_id, tag_id=None, timeout=15):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        snap = _rt_values(client, pid)
        d = snap.get("devices", {}).get(dev_id, {})
        last = d
        if d.get("status") == "online":
            if tag_id is None:
                return snap
            q = snap.get("quality", {}).get(tag_id)
            if q == "good":
                return snap
        time.sleep(1)
    raise AssertionError(f"Device did not reach online (last={last})")


@pytest.mark.parametrize("proto,port,addr,dt,extra", [
    ("modbus_tcp", 5020, "40001", "INT16", {}),
    ("fatek_tcp", 5500, "R100", "INT16", {}),
    ("wecon", 5020, "D0", "INT16", {}),  # wecon uses modbus TCP on 5020
    ("s7_1200_1500", 1102, "DB1.DBW0", "INT16", {"rack": 0, "slot": 1}),
])
def test_device_test_and_runtime_online(client, project_id, proto, port, addr, dt, extra):
    dev = _make_device(client, project_id, name=f"TEST_{proto}", protocol=proto,
                       host="127.0.0.1", port=port, **extra)
    tag = _make_tag(client, project_id, dev["id"], f"TEST_tag_{proto}", addr, data_type=dt)
    # Give engine a moment to load
    time.sleep(1.5)
    r = client.post(f"{BASE_URL}/api/devices/{dev['id']}/test")
    assert r.status_code == 200, r.text
    res = r.json()
    assert res.get("ok") is True, f"[{proto}] test failed: {res}"
    assert "Terhubung" in res.get("message", ""), f"[{proto}] message format: {res}"
    # runtime
    snap = _wait_for_online(client, project_id, dev["id"], tag["id"], timeout=20)
    dstat = snap["devices"][dev["id"]]
    stats = dstat.get("stats", {})
    for k in ("ok", "fail", "rtt_ms", "avg_ms", "attempts"):
        assert k in stats, f"[{proto}] stats missing key {k}: {stats}"


def test_fins_udp(client, project_id):
    dev = _make_device(client, project_id, name="TEST_fins", protocol="omron_fins_udp",
                       host="127.0.0.1", port=9601, fins_src_node=0, fins_dst_node=0)
    tag = _make_tag(client, project_id, dev["id"], "TEST_fins_tag", "D100", "INT16")
    time.sleep(1.5)
    r = client.post(f"{BASE_URL}/api/devices/{dev['id']}/test")
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True, r.json()
    _wait_for_online(client, project_id, dev["id"], tag["id"], timeout=20)


def test_opc_ua_symbolic(client, project_id):
    dev = _make_device(client, project_id, name="TEST_opc", protocol="s7_1200_1500_sym",
                       host="", port=4841, opc_endpoint="opc.tcp://127.0.0.1:4841",
                       opc_namespace=3)
    tag = _make_tag(client, project_id, dev["id"], "TEST_motor_start",
                    '"Motor1".Start', "BOOL")
    time.sleep(2)
    r = client.post(f"{BASE_URL}/api/devices/{dev['id']}/test")
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True, r.json()
    _wait_for_online(client, project_id, dev["id"], tag["id"], timeout=25)


@pytest.mark.skipif(not HOSTLINK_PTY, reason="No hostlink pty available")
def test_hostlink_serial(client, project_id):
    dev = _make_device(client, project_id, name="TEST_hostlink", protocol="omron_hostlink",
                       host="", port=0, serial_port=HOSTLINK_PTY, baudrate=9600,
                       databits=7, parity="E", stopbits=2, unit_id=0)
    _make_tag(client, project_id, dev["id"], "TEST_hostlink_tag", "D100", "INT16")
    time.sleep(1.5)
    r = client.post(f"{BASE_URL}/api/devices/{dev['id']}/test")
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True, f"hostlink test: {r.json()}"


# ---------- Runtime write ----------
def test_runtime_write_modbus(client, project_id):
    dev = _make_device(client, project_id, name="TEST_modbus_write", protocol="modbus_tcp",
                       host="127.0.0.1", port=5020)
    tag = _make_tag(client, project_id, dev["id"], "TEST_holding_reg", "40010", "INT16",
                    writable=True)
    time.sleep(1.5)
    _wait_for_online(client, project_id, dev["id"], tag["id"], timeout=15)
    r = client.post(f"{BASE_URL}/api/projects/{project_id}/rt/write",
                    json={"tag_id": tag["id"], "value": 4321})
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    # verify readback
    time.sleep(2)
    snap = _rt_values(client, project_id)
    v = snap.get("values", {}).get(tag["id"])
    assert v == 4321 or v == 4321.0, f"readback got {v}, expected 4321"


# ---------- Auto-reconnect ----------
def test_auto_reconnect_and_recover(client, project_id):
    dev = _make_device(client, project_id, name="TEST_reconn", protocol="fatek_tcp",
                       host="127.0.0.1", port=5599, reconnect_s=3, timeout_ms=1500)
    tag = _make_tag(client, project_id, dev["id"], "TEST_reconn_tag", "R100", "INT16")
    # Wait for engine to try connection at least twice
    time.sleep(6)
    snap = _rt_values(client, project_id)
    d = snap["devices"][dev["id"]]
    assert d["status"] in ("reconnecting", "error"), f"Expected reconnecting, got {d}"
    assert d.get("retry_in") == 3, f"retry_in should be 3, got {d.get('retry_in')}"
    err = (d.get("error") or "").lower()
    # Human readable Indonesian: 'menolak koneksi', 'tidak dapat', 'timeout', 'gagal'
    assert any(k in err for k in ["menolak", "tidak", "gagal", "koneksi", "timeout"]), \
        f"Error not human-readable Indonesian: {d.get('error')}"
    attempts = d.get("stats", {}).get("attempts", 0)
    assert attempts >= 1, f"attempts should increase, got {attempts}"
    assert snap.get("quality", {}).get(tag["id"]) == "bad", \
        f"tag quality should be bad, got {snap.get('quality', {}).get(tag['id'])}"
    # Now fix port to 5500 -> should reconnect
    upd = {"name": "TEST_reconn", "protocol": "fatek_tcp", "host": "127.0.0.1", "port": 5500,
           "simulate": False, "reconnect_s": 3, "timeout_ms": 2000, "unit_id": 1}
    r = client.put(f"{BASE_URL}/api/devices/{dev['id']}", json=upd)
    assert r.status_code == 200, r.text
    time.sleep(4)
    _wait_for_online(client, project_id, dev["id"], tag["id"], timeout=20)


# ---------- TIA import symbolic ----------
def test_tia_symbolic_import(client, project_id):
    dev = _make_device(client, project_id, name="TEST_opc_import", protocol="s7_1200_1500_sym",
                       host="", port=4841, opc_endpoint="opc.tcp://127.0.0.1:4841",
                       opc_namespace=3)
    csv = "Name,Data Type\nLevel,Real\nPressure,Int\n"
    # multipart upload
    s = requests.Session()
    s.headers.update({k: v for k, v in client.headers.items() if k != "Content-Type"})
    s.cookies.update(client.cookies)
    files = {"file": ("tags.csv", io.BytesIO(csv.encode()), "text/csv")}
    data = {"device_id": dev["id"], "symbol_prefix": '"DB_Tank"'}
    r = s.post(f"{BASE_URL}/api/projects/{project_id}/tags/import", files=files, data=data)
    assert r.status_code == 200, r.text
    res = r.json()
    assert res["created"] >= 1, f"Import did not create tags: {res}"
    # Fetch tags & verify addresses
    r = client.get(f"{BASE_URL}/api/projects/{project_id}/tags")
    assert r.status_code == 200
    tags = [t for t in r.json() if t["device_id"] == dev["id"]]
    for t in tags:
        CREATED_TAGS.append(t["id"])
        assert t["address"].startswith('"DB_Tank".'), \
            f"address should start with \"DB_Tank\". prefix, got {t['address']}"


# ---------- Runtime regression: demo view ----------
def test_public_runtime_view_regression():
    # Public view should load without auth
    r = requests.get(f"{BASE_URL}/api/public/ghdhbuxrp4e")
    assert r.status_code == 200, f"Demo published view failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    assert "screens" in body or body.get("requires_login") is not None
