import asyncio
import logging
import math
import random
import threading
import time
import uuid
from datetime import datetime, timezone

from drivers import make_driver
from plc_ext import is_conn_error, humanize
from formats import clamp_value, to_engineering, to_raw, INT_TYPES

log = logging.getLogger("engine")
LEVEL_LABEL = {"HH": "Sangat Tinggi", "H": "Tinggi", "L": "Rendah", "LL": "Sangat Rendah", "ON": "Aktif"}


class Engine:
    def __init__(self, db):
        self.db = db
        self.values = {}
        self.dev_status = {}
        self.drivers = {}
        self.retry_at = {}
        self.written = {}
        self.walk = {}
        self.active_alarms = {}
        self.devices = {}
        self.tags = []
        self.tick = 0
        self.proj_order = {}
        self.loaded_internal = False
        self.records, self.alarm_defs, self.text_lib = [], [], {}
        self.rec_last = {}
        self.def_active = {}
        self.def_loaded = False
        self.locks = {}
        self.stats = {}
        self.quality = {}

    def _stats(self, dev_id):
        return self.stats.setdefault(dev_id, {"ok": 0, "fail": 0, "rtt_ms": None, "avg_ms": None, "last_ok": None, "attempts": 0})

    def _count(self, dev_id, ok, fail, rtt=None):
        st = self._stats(dev_id)
        st["ok"] += ok
        st["fail"] += fail
        if rtt is not None:
            st["rtt_ms"] = round(rtt, 1)
            st["avg_ms"] = round(rtt if st["avg_ms"] is None else st["avg_ms"] * 0.8 + rtt * 0.2, 1)
            st["last_ok"] = datetime.now(timezone.utc).isoformat()
            st["attempts"] = 0
        return st

    def reset_driver(self, dev_id):
        cur = self.drivers.pop(dev_id, None)
        if cur:
            cur[1].close()
        self.retry_at.pop(dev_id, None)
        self.stats.pop(dev_id, None)

    async def sample_records(self, t):
        now = datetime.now(timezone.utc)
        docs = []
        for r in self.records:
            if t - self.rec_last.get(r["id"], 0) < max(1, int(r.get("interval_s") or 5)) - 0.05:
                continue
            pv = self.values.get(r["project_id"], {})
            vals = {c: float(pv[c]) for c in r.get("channels", []) if pv.get(c) is not None}
            if vals:
                docs.append({"project_id": r["project_id"], "record": r["number"], "ts": now, "v": vals})
            self.rec_last[r["id"]] = t
        if docs:
            await self.db.record_samples.insert_many(docs)

    @staticmethod
    def def_state(d, v):
        if d["kind"] == "bit":
            return bool(v) == (d.get("condition") == "on")
        v = float(v)
        c = d.get("condition")
        if c == "range":
            return v < float(d["low"]) or v > float(d["high"])
        lim = float(d.get("value") or 0)
        return {"high": v >= lim, "low": v <= lim, "equal": v == lim}.get(c, False)

    async def check_alarm_defs(self):
        now = datetime.now(timezone.utc).isoformat()
        names = {t["id"]: t["name"] for t in self.tags}
        for d in self.alarm_defs:
            v = self.values.get(d["project_id"], {}).get(d["tag_id"])
            active = v is not None and self.def_state(d, v)
            cur = self.def_active.get(d["id"])
            if active and not cur:
                aid = str(uuid.uuid4())
                msg = self.text_lib.get(d["project_id"], {}).get(d.get("library_id")) or d.get("content") or f"{names.get(d['tag_id'], '?')} alarm"
                level = "BIT" if d["kind"] == "bit" else {"high": "HI", "low": "LO", "equal": "EQ", "range": "RNG"}[d["condition"]]
                await self.db.alarms.insert_one({
                    "id": aid, "project_id": d["project_id"], "def_id": d["id"], "kind": d["kind"], "group": d.get("group", 1),
                    "tag_id": d["tag_id"], "tag_name": names.get(d["tag_id"], ""), "level": level, "value": float(v), "message": msg,
                    "active": True, "acked": False, "ts_in": now, "ts_out": None, "recorded": d.get("record", True),
                    "beep": d.get("beep", False), "beep_once": d.get("beep_once", False),
                    "alarm_screen": d.get("alarm_screen", ""), "popup_once": d.get("popup_once", True),
                })
                self.def_active[d["id"]] = aid
            elif not active and cur:
                self.def_active.pop(d["id"], None)
                if not d.get("record", True):
                    await self.db.alarms.delete_one({"id": cur})
                else:
                    upd = {"active": False} if d.get("not_save_off") else {"active": False, "ts_out": now}
                    await self.db.alarms.update_one({"id": cur}, {"$set": upd})

    def with_order(self, dev):
        return {**dev, "_order": dev.get("byte_order") or self.proj_order.get(dev["project_id"], "ABCD")}

    @staticmethod
    def is_internal(dev):
        return dev.get("protocol") == "internal"

    async def load_config(self):
        self.records = await self.db.data_records.find({"enabled": True}, {"_id": 0}).to_list(10000)
        self.alarm_defs = await self.db.alarm_defs.find({}, {"_id": 0}).to_list(50000)
        self.text_lib = {p["id"]: {x["id"]: x.get("text", "") for x in p.get("text_library") or []}
                         async for p in self.db.projects.find({}, {"_id": 0, "id": 1, "text_library": 1})}
        if not self.def_loaded:
            async for a in self.db.alarms.find({"active": True, "def_id": {"$exists": True}}, {"_id": 0, "id": 1, "def_id": 1}):
                self.def_active[a["def_id"]] = a["id"]
            self.def_loaded = True
        self.devices = {d["id"]: d for d in await self.db.devices.find({}, {"_id": 0}).to_list(5000)}
        self.tags = await self.db.tags.find({}, {"_id": 0}).to_list(50000)
        self.proj_order = {p["id"]: (p.get("settings") or {}).get("byte_order") or "ABCD"
                           async for p in self.db.projects.find({}, {"_id": 0, "id": 1, "settings": 1})}
        if not self.loaded_internal:
            async for m in self.db.internal_values.find({}, {"_id": 0}):
                self.written.setdefault(m["tag_id"], m["v"])
            self.loaded_internal = True
        if not self.active_alarms:
            async for a in self.db.alarms.find({"active": True}, {"_id": 0, "id": 1, "tag_id": 1, "level": 1}):
                self.active_alarms[a["tag_id"]] = (a["id"], a["level"])

    async def run(self):
        while True:
            try:
                if self.tick % 5 == 0:
                    await self.load_config()
                await self.step()
            except Exception:
                log.exception("engine step failed")
            self.tick += 1
            await asyncio.sleep(1)

    def sim_value(self, tag, t):
        tid, dt = tag["id"], tag["data_type"]
        mode = tag.get("sim_mode") or ("static" if dt == "BOOL" else "sine")
        lo, hi = float(tag.get("sim_min") or 0), float(tag.get("sim_max") or 100)
        period = max(float(tag.get("sim_period") or 30), 2)
        if dt == "BOOL":
            if mode == "toggle":
                return int(t / (period / 2)) % 2 == 0
            if mode == "random" and random.random() < 0.05:
                self.written[tid] = not self.written.get(tid, False)
            return bool(self.written.get(tid, False))
        if mode == "static":
            v = self.written.get(tid, lo)
        elif mode == "ramp":
            v = lo + (hi - lo) * ((t % period) / period)
        elif mode == "random":
            prev = self.walk.get(tid, (lo + hi) / 2)
            v = min(hi, max(lo, prev + (random.random() - 0.5) * (hi - lo) * 0.08))
            self.walk[tid] = v
        else:
            phase = (sum(ord(c) for c in tid) % 360) / 57.3
            v = lo + (hi - lo) * (0.5 + 0.5 * math.sin(2 * math.pi * t / period + phase))
        return clamp_value(dt, int(tag.get("decimals") or 0), v)

    SIG_KEYS = ("protocol", "host", "port", "rack", "slot", "unit_id", "_order", "serial_port", "baudrate", "parity", "databits", "stopbits",
                "timeout_ms", "opc_namespace", "opc_user", "opc_password", "opc_endpoint", "fins_src_node", "fins_dst_node", "local_tsap", "remote_tsap")

    def _driver(self, dev):
        dev = self.with_order(dev)
        sig = tuple(dev.get(k) for k in self.SIG_KEYS)
        cur = self.drivers.get(dev["id"])
        if not cur or cur[0] != sig:
            if cur:
                cur[1].close()
            cur = (sig, make_driver(dev))
            self.drivers[dev["id"]] = cur
        return cur[1]

    def _drop(self, dev_id):
        cur = self.drivers.pop(dev_id, None)
        if cur:
            cur[1].close()

    def _lock(self, dev_id):
        return self.locks.setdefault(dev_id, threading.Lock())

    def _read_device(self, dev, tags):
        with self._lock(dev["id"]):
            drv, out, errors, bad = self._driver(dev), {}, [], []
            t0 = time.perf_counter()
            for tag in tags:
                try:
                    raw = drv.read(tag["address"], tag["data_type"])
                    out[tag["id"]] = to_engineering(tag["data_type"], int(tag.get("decimals") or 0), raw)
                except Exception as e:
                    if is_conn_error(e):
                        self._drop(dev["id"])
                        raise ConnectionError(humanize(dev, e))
                    errors.append(f"{tag['name']}: {humanize(dev, e)}")
                    bad.append(tag["id"])
            return out, errors, bad, (time.perf_counter() - t0) * 1000 / max(1, len(tags))

    def _write_device(self, dev, address, dtype, raw):
        with self._lock(dev["id"]):
            try:
                self._driver(dev).write(address, dtype, raw)
            except Exception as e:
                if is_conn_error(e):
                    self._drop(dev["id"])
                raise IOError(humanize(dev, e))

    def _test_device(self, dev, tag):
        with self._lock(dev["id"]):
            t0 = time.perf_counter()
            try:
                drv = self._driver(dev)
                drv.connect()
                value = drv.read(tag["address"], tag["data_type"]) if tag else None
            except Exception as e:
                self._drop(dev["id"])
                return {"ok": False, "message": humanize(dev, e)}
            rtt = round((time.perf_counter() - t0) * 1000, 1)
            where = dev.get("serial_port") if self.is_serial(dev) else f"{dev.get('host')}:{dev.get('port')}"
            msg = f"Terhubung ke {where} ({rtt} ms)" + (f" · {tag['name']} = {value}" if tag else "")
            return {"ok": True, "message": msg, "rtt_ms": rtt}

    @staticmethod
    def is_serial(dev):
        from drivers import PROTOCOLS
        return bool(PROTOCOLS.get(dev.get("protocol"), {}).get("serial"))

    async def test(self, dev, tag=None):
        self.retry_at.pop(dev["id"], None)
        try:
            return await asyncio.wait_for(asyncio.to_thread(self._test_device, self.with_order(dev), tag), timeout=15)
        except asyncio.TimeoutError:
            return {"ok": False, "message": humanize(dev, TimeoutError("timed out"))}

    async def step(self):
        t = time.time()
        by_dev = {}
        for tag in self.tags:
            if tag.get("device_id") in self.devices:
                by_dev.setdefault(tag["device_id"], []).append(tag)
        for dev_id, tags in by_dev.items():
            dev = self.devices[dev_id]
            pv = self.values.setdefault(dev["project_id"], {})
            q = self.quality.setdefault(dev["project_id"], {})
            if self.is_internal(dev) or dev.get("simulate", True):
                sim = not self.is_internal(dev)
                for tag in tags:
                    pv[tag["id"]] = self.sim_value(tag, t) if sim else self.written.get(tag["id"], False if tag["data_type"] == "BOOL" else 0)
                    q[tag["id"]] = "good"
                self.dev_status[dev_id] = {"status": "simulasi" if sim else "internal", "error": None}
                continue
            if self.retry_at.get(dev_id, 0) > t:
                continue
            iv = max(1, int(dev.get("reconnect_s") or 5))
            try:
                vals, errors, bad, rtt = await asyncio.wait_for(asyncio.to_thread(self._read_device, dev, tags), timeout=max(8, len(tags) * 2))
                pv.update(vals)
                q.update({k: "good" for k in vals})
                q.update({k: "bad" for k in bad})
                st = self._count(dev_id, len(vals), len(bad), rtt if vals else None)
                self.dev_status[dev_id] = {"status": "error" if bad and not vals else "online", "error": "; ".join(errors)[:300] or None, "stats": st}
            except Exception as e:
                self.retry_at[dev_id] = t + iv
                q.update({tag["id"]: "bad" for tag in tags})
                st = self._count(dev_id, 0, len(tags))
                st["attempts"] += 1
                msg = str(e) if isinstance(e, ConnectionError) and str(e) else humanize(dev, e if str(e) else TimeoutError("timed out"))
                self.dev_status[dev_id] = {"status": "reconnecting", "error": msg[:300], "stats": st, "retry_in": iv}
        await self.check_alarms()
        await self.check_alarm_defs()
        await self.sample_records(t)
        if self.tick % 5 == 0:
            await self.log_history()

    async def log_history(self):
        now = datetime.now(timezone.utc)
        docs = []
        for tag in self.tags:
            v = self.values.get(tag["project_id"], {}).get(tag["id"])
            if v is not None and tag.get("log_enabled", True):
                docs.append({"project_id": tag["project_id"], "tag_id": tag["id"], "ts": now, "v": float(v)})
        if docs:
            await self.db.tag_history.insert_many(docs)

    def level_for(self, tag, v):
        if tag["data_type"] == "BOOL":
            return "ON" if bool(v) == bool(tag.get("alarm_on_true", True)) else None
        for lvl, cmp in (("HH", lambda x, lim: x >= lim), ("LL", lambda x, lim: x <= lim), ("H", lambda x, lim: x >= lim), ("L", lambda x, lim: x <= lim)):
            lim = tag.get(lvl.lower())
            if lim is not None and lim != "" and cmp(float(v), float(lim)):
                return lvl
        return None

    async def check_alarms(self):
        now = datetime.now(timezone.utc).isoformat()
        for tag in self.tags:
            v = self.values.get(tag["project_id"], {}).get(tag["id"])
            level = self.level_for(tag, v) if (tag.get("alarm_enabled") and v is not None) else None
            cur = self.active_alarms.get(tag["id"])
            if (cur[1] if cur else None) == level:
                continue
            if cur:
                await self.db.alarms.update_one({"id": cur[0]}, {"$set": {"active": False, "ts_out": now}})
                self.active_alarms.pop(tag["id"], None)
            if level:
                aid = str(uuid.uuid4())
                msg = tag.get("alarm_message") or f"{tag['name']} {LEVEL_LABEL[level]}"
                await self.db.alarms.insert_one({
                    "id": aid, "project_id": tag["project_id"], "tag_id": tag["id"], "tag_name": tag["name"],
                    "level": level, "value": float(v), "message": msg, "active": True, "acked": False,
                    "ts_in": now, "ts_out": None,
                })
                self.active_alarms[tag["id"]] = (aid, level)

    async def write(self, tag, value):
        dt, dec = tag["data_type"], int(tag.get("decimals") or 0)
        v = bool(value) if dt == "BOOL" else clamp_value(dt, dec, float(value))
        dev = await self.db.devices.find_one({"id": tag["device_id"]}, {"_id": 0})
        if not dev:
            raise ValueError("Perangkat tidak ditemukan")
        if self.is_internal(dev):
            self.written[tag["id"]] = v
            await self.db.internal_values.update_one({"tag_id": tag["id"]}, {"$set": {"v": v}}, upsert=True)
        elif dev.get("simulate", True):
            self.written[tag["id"]] = v
            self.walk[tag["id"]] = v
        else:
            raw = v if dt in ("BOOL", "FLOAT32") else to_raw(dt, dec, v)
            await asyncio.wait_for(asyncio.to_thread(self._write_device, dev, tag["address"], dt, raw), timeout=10)
        self.values.setdefault(tag["project_id"], {})[tag["id"]] = v
        return v

    def snapshot(self, project_id, device_ids):
        return {
            "values": self.values.get(project_id, {}),
            "quality": self.quality.get(project_id, {}),
            "devices": {d: self.dev_status.get(d, {"status": "menunggu", "error": None}) for d in device_ids},
            "ts": datetime.now(timezone.utc).isoformat(),
        }


__all__ = ["Engine", "INT_TYPES"]
