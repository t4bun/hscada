import asyncio
import logging
import math
import random
import time
import uuid
from datetime import datetime, timezone

from drivers import make_driver
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

    def with_order(self, dev):
        return {**dev, "_order": dev.get("byte_order") or self.proj_order.get(dev["project_id"], "ABCD")}

    @staticmethod
    def is_internal(dev):
        return dev.get("protocol") == "internal"

    async def load_config(self):
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

    def _read_device(self, dev, tags):
        dev = self.with_order(dev)
        sig = tuple(dev.get(k) for k in ("protocol", "host", "port", "rack", "slot", "unit_id", "_order", "serial_port", "baudrate", "parity", "databits", "stopbits"))
        cur = self.drivers.get(dev["id"])
        if not cur or cur[0] != sig:
            if cur:
                cur[1].close()
            cur = (sig, make_driver(dev))
            self.drivers[dev["id"]] = cur
        drv, out, errors = cur[1], {}, []
        for tag in tags:
            try:
                raw = drv.read(tag["address"], tag["data_type"])
                out[tag["id"]] = to_engineering(tag["data_type"], int(tag.get("decimals") or 0), raw)
            except (ConnectionError, OSError, TimeoutError, RuntimeError) as e:
                drv.close()
                self.drivers.pop(dev["id"], None)
                raise ConnectionError(str(e))
            except Exception as e:
                errors.append(f"{tag['name']}: {e}")
        return out, errors

    async def step(self):
        t = time.time()
        by_dev = {}
        for tag in self.tags:
            if tag.get("device_id") in self.devices:
                by_dev.setdefault(tag["device_id"], []).append(tag)
        for dev_id, tags in by_dev.items():
            dev = self.devices[dev_id]
            pv = self.values.setdefault(dev["project_id"], {})
            if self.is_internal(dev):
                for tag in tags:
                    pv[tag["id"]] = self.written.get(tag["id"], False if tag["data_type"] == "BOOL" else 0)
                self.dev_status[dev_id] = {"status": "internal", "error": None}
                continue
            if dev.get("simulate", True):
                for tag in tags:
                    pv[tag["id"]] = self.sim_value(tag, t)
                self.dev_status[dev_id] = {"status": "simulasi", "error": None}
                continue
            if self.retry_at.get(dev_id, 0) > t:
                continue
            try:
                vals, errors = await asyncio.wait_for(asyncio.to_thread(self._read_device, dev, tags), timeout=8)
                pv.update(vals)
                self.dev_status[dev_id] = {"status": "online", "error": "; ".join(errors)[:300] or None}
            except Exception as e:
                self.retry_at[dev_id] = t + 5
                self.dev_status[dev_id] = {"status": "offline", "error": str(e)[:300] or "Timeout"}
        await self.check_alarms()
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
            drv = make_driver(self.with_order(dev))
            try:
                await asyncio.wait_for(asyncio.to_thread(drv.write, tag["address"], dt, raw), timeout=6)
            finally:
                drv.close()
        self.values.setdefault(tag["project_id"], {})[tag["id"]] = v
        return v

    def snapshot(self, project_id, device_ids):
        return {
            "values": self.values.get(project_id, {}),
            "devices": {d: self.dev_status.get(d, {"status": "menunggu", "error": None}) for d in device_ids},
            "ts": datetime.now(timezone.utc).isoformat(),
        }


__all__ = ["Engine", "INT_TYPES"]
