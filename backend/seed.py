import uuid
from datetime import datetime, timezone


def _id():
    return str(uuid.uuid4())


def w(type_, x, y, w_, h, **props):
    return {"id": _id(), "type": type_, "x": x, "y": y, "w": w_, "h": h, "props": props}


def tag(project_id, device_id, name, address, dt, dec=0, unit="", **kw):
    base = {
        "id": _id(), "project_id": project_id, "device_id": device_id, "name": name, "address": address,
        "data_type": dt, "decimals": dec, "unit": unit, "description": "", "sim_mode": "static" if dt == "BOOL" else "sine",
        "sim_min": 0, "sim_max": 100, "sim_period": 30, "alarm_enabled": False, "hh": None, "h": None, "l": None,
        "ll": None, "alarm_on_true": True, "alarm_message": "", "log_enabled": True, "writable": True,
    }
    base.update(kw)
    return base


async def create_demo_project(db, owner_id: str):
    now = datetime.now(timezone.utc).isoformat()
    pid, did = _id(), _id()
    await db.devices.insert_one({
        "id": did, "project_id": pid, "name": "PLC Utama", "protocol": "s7_1200_1500", "host": "192.168.0.1",
        "port": 102, "rack": 0, "slot": 1, "unit_id": 1, "word_swap": False, "simulate": True, "created_at": now,
    })
    t = {
        "level": tag(pid, did, "Level_Tangki", "DB1.DBD0", "FLOAT32", 1, "%", sim_max=100, sim_period=60, alarm_enabled=True, hh=95, h=85, l=15, ll=5),
        "pump": tag(pid, did, "Pompa_Run", "DB1.DBX10.0", "BOOL", sim_mode="static"),
        "valve": tag(pid, did, "Valve_Open", "DB1.DBX10.1", "BOOL", sim_mode="toggle", sim_period=20),
        "flow": tag(pid, did, "Flow_Rate", "DB1.DBD4", "FLOAT32", 2, "m³/h", sim_mode="random", sim_min=40, sim_max=220),
        "press": tag(pid, did, "Tekanan", "DB1.DBW12", "INT16", 1, "bar", sim_min=1, sim_max=9, sim_period=40, alarm_enabled=True, h=8),
        "sp": tag(pid, did, "Setpoint_Level", "DB1.DBW14", "INT16", 0, "%", sim_mode="static", sim_min=70, sim_max=100),
        "speed": tag(pid, did, "Motor_Speed", "DB1.DBW16", "UINT16", 0, "rpm", sim_mode="ramp", sim_max=1500, sim_period=45),
        "temp": tag(pid, did, "Suhu_Air", "DB1.DBD20", "FLOAT32", 1, "°C", sim_min=24, sim_max=38, sim_period=90),
    }
    await db.tags.insert_many([dict(v) for v in t.values()])
    i = lambda k: t[k]["id"]
    main = [
        w("rect", 0, 0, 1280, 64, fill="#111827", stroke="#1E293B", stroke_width=1, radius=0),
        w("label", 24, 14, 520, 36, text="INSTALASI PENGOLAHAN AIR — UNIT 1", font_family="Chivo", font_size=22, color="#F8FAFC", bold=True),
        w("label", 760, 20, 320, 24, text="PLC Utama · S7-1200", font_family="JetBrains Mono", font_size=13, color="#94A3B8", align="right"),
        w("tank", 80, 120, 180, 300, tag=i("level"), min=0, max=100, color="#3B82F6", label="Tangki T-101", show_value=True),
        w("line", 260, 380, 160, 12, stroke="#475569", stroke_width=10, flow=True, tag=i("pump"), flow_color="#10B981"),
        w("circle", 420, 350, 72, 72, fill="#334155", stroke="#64748B", stroke_width=3, tag=i("pump"), on_fill="#10B981"),
        w("label", 404, 428, 110, 22, text="POMPA P-01", font_family="JetBrains Mono", font_size=12, color="#94A3B8", align="center"),
        w("line", 492, 380, 200, 12, stroke="#475569", stroke_width=10, flow=True, tag=i("valve"), flow_color="#06B6D4"),
        w("lamp", 700, 360, 48, 48, tag=i("valve"), on_color="#22C55E", off_color="#334155", label="VALVE"),
        w("gauge", 820, 100, 200, 200, tag=i("press"), min=0, max=10, unit="bar", label="TEKANAN", warn=7, danger=8.5),
        w("gauge", 1040, 100, 200, 200, tag=i("speed"), min=0, max=1500, unit="rpm", label="MOTOR", warn=1200, danger=1400),
        w("numeric", 820, 320, 200, 64, tag=i("flow"), label="FLOW RATE", data_type="FLOAT32", decimals=2, unit="m³/h", font_size=26),
        w("numeric", 1040, 320, 200, 64, tag=i("temp"), label="SUHU AIR", data_type="FLOAT32", decimals=1, unit="°C", font_size=26),
        w("bar", 300, 120, 40, 200, tag=i("temp"), min=20, max=40, orientation="vertical", color="#F59E0B", show_value=True),
        w("button", 80, 460, 150, 48, text="POMPA ON/OFF", action="toggle", tag=i("pump"), bg="#1E293B", on_bg="#059669"),
        w("numeric_input", 250, 460, 170, 48, tag=i("sp"), label="SETPOINT", data_type="INT16", decimals=0, unit="%", font_size=20),
        w("slider", 440, 468, 240, 32, tag=i("sp"), min=0, max=100, step=1, color="#3B82F6"),
        w("trend", 80, 540, 740, 160, tags=[i("level"), i("flow"), i("temp")], window=120, title="TREND REAL-TIME"),
        w("alarm_table", 840, 420, 400, 280, title="ALARM AKTIF", active_only=True),
    ]
    report = [
        w("label", 24, 16, 600, 36, text="LAPORAN & HISTORI", font_family="Chivo", font_size=22, color="#F8FAFC", bold=True),
        w("history", 24, 70, 1232, 300, tags=[i("level"), i("press"), i("temp")], minutes=30, title="HISTORY TREND 30 MENIT"),
        w("data_record", 24, 390, 700, 310, tags=[i("level"), i("flow"), i("press"), i("temp")], rows=15, title="DATA RECORD"),
        w("alarm_table", 744, 390, 512, 310, title="RIWAYAT ALARM", active_only=False),
    ]
    s1, s2 = _id(), _id()
    main.append(w("button", 1100, 12, 150, 40, text="LAPORAN ›", action="goto", screen_id=s2, bg="#2563EB"))
    report.append(w("button", 1100, 16, 150, 40, text="‹ UTAMA", action="goto", screen_id=s1, bg="#2563EB"))
    await db.projects.insert_one({
        "id": pid, "owner_id": owner_id, "name": "Demo Pengolahan Air", "description": "Contoh proyek dengan simulator S7-1200",
        "width": 1280, "height": 720, "fonts": [],
        "screens": [
            {"id": s1, "name": "Utama", "bg_color": "#0B0F17", "bg_image": "", "widgets": main},
            {"id": s2, "name": "Laporan", "bg_color": "#0B0F17", "bg_image": "", "widgets": report},
        ],
        "published": False, "publish_slug": None, "allow_operate": True, "published_screens": None,
        "created_at": now, "updated_at": now,
    })
    return pid
