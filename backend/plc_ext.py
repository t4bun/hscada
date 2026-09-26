import re
import socket
import struct

from driver_common import PROTOCOLS, TYPE_SIZE, PlcError, decode_bytes, encode_bytes, text_from


def dev_timeout(dev) -> float:
    return max(0.2, int(dev.get("timeout_ms") or 1000) / 1000)


class Link:
    """Byte transport over TCP socket or serial (USB-RS232/422/485)."""

    def __init__(self, dev):
        self.dev = dev
        self.is_serial = bool(PROTOCOLS[dev["protocol"]].get("serial"))
        self.timeout = dev_timeout(dev)
        self.conn = None

    def open(self):
        if self.conn:
            return
        d = self.dev
        if self.is_serial:
            import serial
            self.conn = serial.Serial(d.get("serial_port") or "COM1", baudrate=int(d.get("baudrate") or 9600), bytesize=int(d.get("databits") or 8),
                                      parity=(d.get("parity") or "N")[0], stopbits=int(d.get("stopbits") or 1), timeout=self.timeout)
        else:
            self.conn = socket.create_connection((d["host"], int(d.get("port") or 0)), timeout=self.timeout)

    def send(self, data: bytes):
        if self.is_serial:
            self.conn.reset_input_buffer()
            self.conn.write(data)
        else:
            self.conn.sendall(data)

    def read_until(self, end: bytes, maxlen: int = 8192) -> bytes:
        buf = b""
        while not buf.endswith(end):
            chunk = self.conn.read(1) if self.is_serial else self.conn.recv(1024)
            if not chunk:
                raise TimeoutError("Perangkat tidak menjawab (no response)")
            buf += chunk
            if len(buf) > maxlen:
                raise IOError("Frame terlalu panjang")
        return buf

    def close(self):
        if self.conn:
            try:
                self.conn.close()
            except Exception:
                pass
            self.conn = None


# ---------------- Wecon (Modbus mapping LX3V/LX5V) ----------------
WECON_MAP = {"M": ("coil", 0x0000), "S": ("coil", 0xE000), "T": ("coil", 0xF000), "C": ("coil", 0xF400),
             "Y": ("coil", 0xFC00), "X": ("di", 0xF800), "D": ("hr", 0x0000), "TD": ("hr", 0xF000), "CD": ("hr", 0xF400)}


def parse_wecon(address: str):
    a = address.strip().upper().replace(" ", "")
    m = re.match(r"^(TD|CD|D|M|X|Y|S|T|C)(\d+)(?:\.(\d+))?$", a)
    if not m:
        raise ValueError(f"Alamat Wecon tidak valid: {address} (contoh D100, M10, X7, Y10, D5.3)")
    area, num = m.group(1), m.group(2)
    if area in ("X", "Y"):
        if re.search(r"[89]", num):
            raise ValueError(f"Alamat {area} Wecon memakai oktal (0-7): {address}")
        n = int(num, 8)
    else:
        n = int(num)
    kind, base = WECON_MAP[area]
    return {"kind": kind, "addr": base + n, "bit": int(m.group(3)) if m.group(3) else None}


# ---------------- Omron Host Link (C-mode, serial) ----------------
HL_AREAS = {"D": ("RD", "WD"), "DM": ("RD", "WD"), "CIO": ("RR", "WR"), "IR": ("RR", "WR"), "H": ("RH", "WH"), "HR": ("RH", "WH"),
            "LR": ("RL", "WL"), "AR": ("RJ", "WJ")}


def parse_hostlink(address: str):
    m = re.match(r"^(DM|D|CIO|IR|HR|H|LR|AR)(\d+)(?:\.(\d+))?$", address.strip().upper().replace(" ", ""))
    if not m:
        raise ValueError(f"Alamat Host Link tidak valid: {address} (contoh D100, CIO10.3, H5, LR2)")
    return {"area": m.group(1), "addr": int(m.group(2)), "bit": int(m.group(3)) if m.group(3) else None}


def hl_fcs(text: str) -> str:
    x = 0
    for c in text:
        x ^= ord(c)
    return f"{x:02X}"


class HostLinkDriver:
    def __init__(self, dev):
        self.link = Link(dev)
        self.unit = int(dev.get("unit_id") or 0)
        self.order = dev.get("_order") or "CDAB"

    def connect(self):
        self.link.open()

    def _cmd(self, hdr: str, body: str) -> str:
        txt = f"@{self.unit:02d}{hdr}{body}"
        self.link.send((txt + hl_fcs(txt) + "*\r").encode())
        resp = self.link.read_until(b"*\r").decode(errors="ignore")
        resp = resp[resp.find("@"):]
        if len(resp) < 11 or resp[3:5] != hdr:
            raise IOError("Respon Host Link tidak valid")
        if hl_fcs(resp[:-4]) != resp[-4:-2]:
            raise IOError("FCS Host Link salah")
        if resp[5:7] != "00":
            raise PlcError(f"Host Link end code {resp[5:7]}")
        return resp[7:-4]

    def _words(self, p, n) -> bytes:
        data = self._cmd(HL_AREAS[p["area"]][0], f"{p['addr']:04d}{n:04d}")
        return bytes.fromhex(data[: n * 4])

    def read(self, address, dtype):
        self.connect()
        p = parse_hostlink(address)
        data = self._words(p, 2 if TYPE_SIZE[dtype] == 4 else 1)
        if dtype == "BOOL":
            return bool((struct.unpack(">H", data[:2])[0] >> (p["bit"] or 0)) & 1)
        return decode_bytes(dtype, data, self.order)

    def read_string(self, address, n):
        self.connect()
        return text_from(self._words(parse_hostlink(address), (n + 1) // 2), n)

    def write(self, address, dtype, value):
        self.connect()
        p = parse_hostlink(address)
        if dtype == "BOOL":
            w, b = struct.unpack(">H", self._words(p, 1))[0], p["bit"] or 0
            data = struct.pack(">H", ((w | (1 << b)) if value else (w & ~(1 << b))) & 0xFFFF)
        else:
            data = encode_bytes(dtype, value, self.order)
        self._cmd(HL_AREAS[p["area"]][1], f"{p['addr']:04d}{data.hex().upper()}")

    def close(self):
        self.link.close()


# ---------------- Fatek FBs (TCP port 500 / serial) ----------------
def parse_fatek(address: str):
    a = address.strip().upper().replace(" ", "")
    m = re.match(r"^(R|D)(\d+)(?:\.(\d+))?$", a)
    if m:
        return {"kind": "reg", "name": f"{m.group(1)}{int(m.group(2)):05d}", "bit": int(m.group(3)) if m.group(3) else None}
    m = re.match(r"^(M|X|Y|S|T|C)(\d+)$", a)
    if m:
        return {"kind": "bit", "name": f"{m.group(1)}{int(m.group(2)):04d}", "bit": None}
    raise ValueError(f"Alamat Fatek tidak valid: {address} (contoh R100, D10, M0, X0, Y5, R20.3)")


class FatekDriver:
    def __init__(self, dev):
        self.link = Link(dev)
        self.st = int(dev.get("unit_id") or 1)
        self.order = dev.get("_order") or "CDAB"

    def connect(self):
        self.link.open()

    def _cmd(self, cmd: str, payload: str) -> str:
        frame = b"\x02" + f"{self.st:02X}{cmd}{payload}".encode()
        self.link.send(frame + f"{sum(frame) & 0xFF:02X}".encode() + b"\x03")
        resp = self.link.read_until(b"\x03")
        resp = resp[resp.find(b"\x02"):]
        if len(resp) < 9:
            raise IOError("Respon Fatek terlalu pendek")
        if f"{sum(resp[:-3]) & 0xFF:02X}".encode() != resp[-3:-1]:
            raise IOError("Checksum Fatek salah")
        txt = resp[1:-3].decode(errors="ignore")
        if txt[2:4] != cmd:
            raise IOError("Respon Fatek tidak sesuai")
        if txt[4] != "0":
            raise PlcError(f"Fatek error code {txt[4]}")
        return txt[5:]

    def _regs(self, p, n) -> bytes:
        return bytes.fromhex(self._cmd("46", f"{n:02X}{p['name']}")[: n * 4])

    def read(self, address, dtype):
        self.connect()
        p = parse_fatek(address)
        if p["kind"] == "bit":
            return self._cmd("44", f"01{p['name']}")[:1] == "1"
        data = self._regs(p, 2 if TYPE_SIZE[dtype] == 4 else 1)
        if dtype == "BOOL":
            return bool((struct.unpack(">H", data[:2])[0] >> (p["bit"] or 0)) & 1)
        return decode_bytes(dtype, data, self.order)

    def read_string(self, address, n):
        self.connect()
        p = parse_fatek(address)
        if p["kind"] != "reg":
            raise PlcError("STRING harus di register R/D")
        return text_from(self._regs(p, (n + 1) // 2), n)

    def write(self, address, dtype, value):
        self.connect()
        p = parse_fatek(address)
        if p["kind"] == "bit":
            self._cmd("45", f"01{p['name']}{'1' if value else '0'}")
            return
        if dtype == "BOOL":
            w, b = struct.unpack(">H", self._regs(p, 1))[0], p["bit"] or 0
            data = struct.pack(">H", ((w | (1 << b)) if value else (w & ~(1 << b))) & 0xFFFF)
        else:
            data = encode_bytes(dtype, value, self.order)
        self._cmd("47", f"{len(data) // 2:02X}{p['name']}{data.hex().upper()}")

    def close(self):
        self.link.close()


# ---------------- Siemens S7-1200/1500 symbolic (OPC UA) ----------------
def _split_symbol(a: str):
    parts, cur, quoted = [], "", False
    for ch in a:
        if ch == '"':
            quoted = not quoted
        if ch == "." and not quoted:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    return parts + [cur]


def opc_node_id(address: str, ns: int = 3) -> str:
    a = address.strip()
    if a.lower().startswith("ns="):
        return a
    out = []
    for part in _split_symbol(a):
        m = re.match(r'^"?([^"\[\]]+)"?((?:\[[\d,]+\])?)$', part.strip())
        if not m:
            raise ValueError(f'Simbol tidak valid: {address} (contoh "Motor1".Start atau "Tag_Level")')
        out.append(f'"{m.group(1)}"{m.group(2)}')
    return f"ns={ns};s=" + ".".join(out)


def parse_opcua(address: str):
    if not address.strip():
        raise ValueError("Simbol kosong")
    return opc_node_id(address)


UA_TYPES = {"BOOL": "Boolean", "INT16": "Int16", "UINT16": "UInt16", "INT32": "Int32", "UINT32": "UInt32", "FLOAT32": "Float", "BCD16": "UInt16", "BCD32": "UInt32"}


class OpcUaDriver:
    def __init__(self, dev):
        self.dev = dev
        self.client = None
        self.nodes = {}
        ns = dev.get("opc_namespace")
        self.ns = 3 if ns in (None, "") else int(ns)

    def connect(self):
        if self.client:
            return
        from asyncua.sync import Client, ThreadLoop
        d = self.dev
        url = d.get("opc_endpoint") or f"opc.tcp://{d['host']}:{int(d.get('port') or 4840)}"
        tloop = ThreadLoop()
        tloop.daemon = True
        tloop.start()
        try:
            c = Client(url, timeout=max(2, dev_timeout(d) * 2), tloop=tloop)
            if d.get("opc_user"):
                c.set_user(d["opc_user"])
                c.set_password(d.get("opc_password") or "")
            c.connect()
        except Exception:
            tloop.stop()
            raise
        self.client, self.tloop = c, tloop

    def _node(self, address):
        nid = opc_node_id(address, self.ns)
        if nid not in self.nodes:
            self.nodes[nid] = self.client.get_node(nid)
        return self.nodes[nid]

    def read(self, address, dtype):
        from asyncua import ua
        self.connect()
        try:
            v = self._node(address).read_value()
        except ua.UaStatusCodeError as e:
            raise PlcError(str(e))
        return bool(v) if dtype == "BOOL" else v

    def read_string(self, address, n):
        return str(self.read(address, "STRING"))[:n]

    def write(self, address, dtype, value):
        from asyncua import ua
        self.connect()
        v = bool(value) if dtype == "BOOL" else (float(value) if dtype == "FLOAT32" else int(value))
        try:
            self._node(address).write_value(ua.DataValue(ua.Variant(v, getattr(ua.VariantType, UA_TYPES[dtype]))))
        except ua.UaStatusCodeError as e:
            raise PlcError(str(e))

    def close(self):
        if self.client:
            try:
                self.client.disconnect()
            except Exception:
                pass
            self.tloop.stop()
        self.client, self.nodes = None, {}


# ---------------- Diagnostics ----------------
def is_conn_error(e: Exception) -> bool:
    if isinstance(e, (PlcError, ValueError, KeyError)):
        return False
    low = str(e).lower()
    if any(k in low for k in ("out of range", "item not available", "not exist", "badnodeid")):
        return False
    name = type(e).__name__
    return isinstance(e, (ConnectionError, OSError, TimeoutError, RuntimeError, EOFError)) or any(
        k in name for k in ("ModbusIOException", "ConnectionException", "S7ConnectionError", "S7TimeoutError")) or "no response" in low


def humanize(dev, err) -> str:
    msg = str(err) or type(err).__name__
    low = f"{type(err).__name__} {msg}".lower()
    port = dev.get("serial_port") or "Port serial"
    target = port if PROTOCOLS.get(dev.get("protocol"), {}).get("serial") else f"{dev.get('host')}:{dev.get('port')}"
    rules = [
        (("access is denied", "permissionerror", "resource busy", "errno 16", "being used"), f"{port} sedang dipakai program lain — tutup software lain yang memakai port ini"),
        (("filenotfound", "cannot find the file", "no such file", "could not open port"), f"{port} tidak ditemukan — cek kabel USB, konverter, dan driver"),
        (("function not available", "function refused", "not authorized", "access denied"), "PUT/GET belum diaktifkan di PLC (TIA Portal → Properties → Protection & Security → Permit access with PUT/GET)"),
        (("address out of range", "item not available", "not exist"), "Alamat tidak tersedia — cek nomor DB/offset dan pastikan 'Optimized block access' nonaktif"),
        (("baduseraccessdenied", "badidentitytoken"), "Login OPC UA ditolak — periksa username/password"),
        (("badnodeidunknown",), "Simbol tidak ditemukan di PLC — cek nama tag dan namespace OPC UA"),
        (("invalid argument", "errno 22"), f"{port} menolak pengaturan serial — cek baudrate/data bit/parity/stop bit didukung konverter"),
        (("checksum", "fcs"), "Data rusak (checksum salah) — cek baudrate/parity dan kualitas kabel"),
        (("no response", "not answer", "tidak menjawab"), f"Perangkat di {target} tidak menjawab — cek Station/Slave ID, baudrate, parity, dan wiring A/B"),
        (("connection refused", "10061", "actively refused"), f"PLC menolak koneksi di {target} — cek port / layanan komunikasi PLC"),
        (("timed out", "timeout", "10060", "unreachable", "no route", "10065", "10051"), f"PLC tidak merespon di {target} — cek kabel, IP, dan jaringan"),
    ]
    for keys, text in rules:
        if any(k in low for k in keys):
            return text
    return msg[:200]


def list_serial_ports():
    from serial.tools import list_ports
    return [{"device": p.device, "description": p.description or "", "hwid": p.hwid or ""} for p in sorted(list_ports.comports(), key=lambda p: p.device)]
