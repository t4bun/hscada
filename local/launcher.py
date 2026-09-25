"""Scada by T4bun local launcher: starts bundled MongoDB + backend (API + HMI web) on the factory LAN."""
import argparse
import json
import os
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend" if (ROOT / "backend" / "server.py").exists() else ROOT.parent / "backend"
FRONTEND = ROOT / "frontend" if (ROOT / "frontend" / "index.html").exists() else ROOT.parent / "frontend" / "build"
DATA = Path(os.environ.get("SCADA_DATA") or Path(os.environ.get("PROGRAMDATA") or Path.home()) / "ScadaT4bun")
CONFIG, PIDS = DATA / "config.json", DATA / "pids.json"
WIN = os.name == "nt"


def load_config():
    DATA.mkdir(parents=True, exist_ok=True)
    cfg = json.loads(CONFIG.read_text()) if CONFIG.exists() else {}
    cfg.setdefault("http_port", 8080)
    cfg.setdefault("mongo_port", 27027)
    cfg.setdefault("db_name", "scada_t4bun")
    cfg.setdefault("jwt_secret", secrets.token_hex(32))
    cfg.setdefault("admin_email", "admin@t4bun.local")
    cfg.setdefault("admin_password", secrets.token_urlsafe(9))
    CONFIG.write_text(json.dumps(cfg, indent=2))
    (DATA / "LOGIN-ADMIN.txt").write_text(
        f"Scada by T4bun - Login Engineer\r\n\r\nAlamat : http://localhost:{cfg['http_port']}\r\nEmail  : {cfg['admin_email']}\r\n"
        f"Sandi  : {cfg['admin_password']}\r\n\r\nUbah di {CONFIG} lalu restart PC / layanan ScadaT4bun.\r\n")
    return cfg


def lan_ips():
    ips = set()
    try:
        ips.update(socket.gethostbyname_ex(socket.gethostname())[2])
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(ip for ip in ips if not ip.startswith("127."))


def wait_port(port, timeout=40):
    end = time.time() + timeout
    while time.time() < end:
        try:
            socket.create_connection(("127.0.0.1", port), timeout=1).close()
            return True
        except OSError:
            time.sleep(0.5)
    return False


def start_mongo(cfg):
    if os.environ.get("MONGO_URL"):
        return None, os.environ["MONGO_URL"]
    exe = next((str(p) for p in (ROOT / "mongodb" / "bin" / "mongod.exe", ROOT / "mongodb" / "bin" / "mongod") if p.exists()), None) or shutil.which("mongod")
    if not exe:
        sys.exit("MongoDB (mongod) tidak ditemukan di paket instalasi.")
    port = int(cfg["mongo_port"])
    (DATA / "db").mkdir(exist_ok=True)
    flags = subprocess.CREATE_NO_WINDOW if WIN else 0
    proc = subprocess.Popen([exe, "--dbpath", str(DATA / "db"), "--port", str(port), "--bind_ip", "127.0.0.1",
                             "--logpath", str(DATA / "mongod.log"), "--logappend"], creationflags=flags)
    if not wait_port(port):
        proc.kill()
        sys.exit(f"MongoDB gagal start, lihat {DATA / 'mongod.log'}")
    return proc, f"mongodb://127.0.0.1:{port}"


def stop():
    if not PIDS.exists():
        print("ScadaT4bun tidak berjalan.")
        return
    for pid in json.loads(PIDS.read_text()).values():
        if not pid:
            continue
        try:
            if WIN:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True)
            else:
                os.kill(pid, signal.SIGTERM)
        except OSError:
            pass
    PIDS.unlink(missing_ok=True)
    print("ScadaT4bun dihentikan.")


def main():
    ap = argparse.ArgumentParser(description="Scada by T4bun lokal")
    ap.add_argument("--service", action="store_true", help="mode layanan (tanpa membuka browser)")
    ap.add_argument("--init", action="store_true", help="buat konfigurasi awal lalu keluar")
    ap.add_argument("--stop", action="store_true", help="hentikan layanan yang berjalan")
    args = ap.parse_args()
    if args.stop:
        return stop()
    cfg = load_config()
    if args.init:
        return print(f"Konfigurasi dibuat di {CONFIG}")
    mongo, url = start_mongo(cfg)
    PIDS.write_text(json.dumps({"launcher": os.getpid(), "mongod": mongo.pid if mongo else None}))
    try:
        while True:
            cfg = load_config()
            if serve(cfg, url, args.service) != 3:
                break
            args.service = True
            print("Restart layanan...")
    finally:
        if mongo:
            mongo.terminate()
        PIDS.unlink(missing_ok=True)


def serve(cfg, url, service):
    http = int(cfg["http_port"])
    os.environ.update({
        "MONGO_URL": url, "DB_NAME": os.environ.get("DB_NAME") or cfg["db_name"], "JWT_SECRET": cfg["jwt_secret"],
        "ADMIN_EMAIL": cfg["admin_email"], "ADMIN_PASSWORD": cfg["admin_password"], "FRONTEND_URL": f"http://localhost:{http}",
        "APP_MODE": "local", "HTTP_PORT": str(http), "COOKIE_SECURE": "false", "STATIC_DIR": str(FRONTEND),
        "LOCAL_STORAGE_DIR": str(DATA / "files"), "SCADA_CONFIG": str(CONFIG), "SCADA_DATA": str(DATA),
    })
    sfx = "" if http == 80 else f":{http}"
    print("=" * 60 + "\n Scada by T4bun - Versi Lokal\n" + "=" * 60)
    print(f" Buka di PC ini   : http://localhost{sfx}")
    for ip in lan_ips():
        print(f" Dari jaringan    : http://{ip}{sfx}")
    print(f" Login engineer   : lihat {DATA / 'LOGIN-ADMIN.txt'} dan {DATA / 'ENGINEER-URL.txt'}\n" + "=" * 60)
    if not service:
        webbrowser.open(f"http://localhost{sfx}")
    flags = subprocess.CREATE_NO_WINDOW if WIN else 0
    return subprocess.call([sys.executable, "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", str(http)], cwd=str(BACKEND), creationflags=flags)


if __name__ == "__main__":
    main()
