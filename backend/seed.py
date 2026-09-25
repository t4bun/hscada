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
        w("sym_pump", 410, 330, 96, 110, symbol="pump", tag=i("pump"), tag_mode="bit", animate=True, show_label=True, label="POMPA P-01",
          states=[{"value": 0, "text": "STOP", "bg": "#64748B", "color": "#94A3B8", "blink": False}, {"value": 1, "text": "RUN", "bg": "#22C55E", "color": "#22C55E", "blink": False}]),
        w("line", 492, 380, 200, 12, stroke="#475569", stroke_width=10, flow=True, tag=i("valve"), flow_color="#06B6D4"),
        w("sym_valve", 692, 336, 72, 80, symbol="valve", tag=i("valve"), tag_mode="bit", animate=True, show_label=True, label="XV-01",
          states=[{"value": 0, "text": "CLOSE", "bg": "#64748B", "color": "#94A3B8", "blink": False}, {"value": 1, "text": "OPEN", "bg": "#22C55E", "color": "#22C55E", "blink": False}]),
        w("bit_lamp", 770, 350, 40, 40, tag=i("pump"), shape="bezel_round", show_text=False,
          states=[{"value": 0, "text": "OFF", "bg": "#1F2937", "color": "#fff", "blink": False}, {"value": 1, "text": "ON", "bg": "#22C55E", "color": "#fff", "blink": False}]),
        w("gauge", 820, 100, 200, 200, tag=i("press"), min=0, max=10, unit="bar", label="TEKANAN", warn=7, danger=8.5),
        w("gauge", 1040, 100, 200, 200, tag=i("speed"), min=0, max=1500, unit="rpm", label="MOTOR", warn=1200, danger=1400),
        w("numeric", 820, 320, 200, 64, tag=i("flow"), label="FLOW RATE", data_type="FLOAT32", decimals=2, unit="m³/h", font_size=26),
        w("numeric", 1040, 320, 200, 64, tag=i("temp"), label="SUHU AIR", data_type="FLOAT32", decimals=1, unit="°C", font_size=26),
        w("bar", 300, 120, 40, 200, tag=i("temp"), min=20, max=40, orientation="vertical", color="#F59E0B", show_value=True),
        w("bit_button", 80, 456, 150, 56, tag=i("pump"), mode="toggle", pulse_ms=500, shape="bevel3d", font_family="Chivo", font_size=14,
          states=[{"value": 0, "text": "POMPA OFF", "bg": "#334155", "color": "#F8FAFC", "blink": False}, {"value": 1, "text": "POMPA ON", "bg": "#16A34A", "color": "#FFFFFF", "blink": False}]),
        w("func_button", 700, 464, 110, 40, text="DETAIL", action="open_subscreen", screen_id="__S3__", shape="rounded", bg="#334155", color="#fff", font_family="Chivo", font_size=13),
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
    s1, s2, s3 = _id(), _id(), _id()
    main.append(w("func_button", 1100, 12, 150, 40, text="LAPORAN ›", action="next", shape="rounded", bg="#2563EB", color="#fff", font_family="Chivo", font_size=14))
    report.append(w("func_button", 1100, 16, 150, 40, text="‹ UTAMA", action="open_screen", screen_id=s1, shape="rounded", bg="#2563EB", color="#fff", font_family="Chivo", font_size=14))
    for x in main:
        if x["props"].get("screen_id") == "__S3__":
            x["props"]["screen_id"] = s3
    popup = [
        w("label", 16, 12, 300, 28, text="DETAIL POMPA P-01", font_family="Chivo", font_size=18, color="#F8FAFC", bold=True),
        w("numeric", 16, 56, 190, 60, tag=i("speed"), label="MOTOR SPEED", data_type="UINT16", decimals=0, unit="rpm", font_size=24),
        w("word_lamp", 222, 56, 180, 60, tag=i("sp"), shape="led_bar", show_text=True, font_family="Chivo", font_size=13,
          states=[{"value": 70, "text": "SP NORMAL (70)", "bg": "#16A34A", "color": "#fff", "blink": False}, {"value": 90, "text": "SP TINGGI (90)", "bg": "#D97706", "color": "#fff", "blink": False}]),
        w("bit_button", 16, 140, 190, 56, tag=i("pump"), mode="momentary", pulse_ms=1500, shape="bezel_round", font_family="Chivo", font_size=13,
          states=[{"value": 0, "text": "START 1.5s", "bg": "#1E3A8A", "color": "#fff", "blink": False}, {"value": 1, "text": "RUNNING", "bg": "#16A34A", "color": "#fff", "blink": False}]),
        w("func_button", 290, 200, 110, 40, text="TUTUP", action="close_subscreen", shape="rounded", bg="#DC2626", color="#fff", font_family="Chivo", font_size=13),
    ]
    await db.projects.insert_one({
        "id": pid, "owner_id": owner_id, "name": "Demo Pengolahan Air", "description": "Contoh proyek dengan simulator S7-1200",
        "width": 1280, "height": 720, "fonts": [],
        "screens": [
            {"id": s1, "name": "Utama", "bg_color": "#0B0F17", "bg_image": "", "widgets": main},
            {"id": s2, "name": "Laporan", "bg_color": "#0B0F17", "bg_image": "", "widgets": report},
            {"id": s3, "name": "Detail Pompa", "bg_color": "#111827", "bg_image": "", "widgets": popup, "type": "popup", "popup_width": 420, "popup_height": 260},
        ],
        "published": False, "publish_slug": None, "allow_operate": True, "published_screens": None,
        "settings": {"byte_order": "ABCD", "initial_screen": "", "screen_saver_enabled": False, "screen_saver_minutes": 5, "security_enabled": False},
        "created_at": now, "updated_at": now,
    })
    return pid
