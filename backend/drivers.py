import re
import socket
import struct

PROTOCOLS = {
    "s7_1200_1500": {"label": "Siemens S7-1200/1500", "family": "s7", "port": 102, "rack": 0, "slot": 1},
    "s7_300_400": {"label": "Siemens S7-300/400", "family": "s7", "port": 102, "rack": 0, "slot": 2},
    "s7_200": {"label": "Siemens S7-200 / Smart", "family": "s7", "port": 102, "rack": 0, "slot": 1},
    "omron_fins": {"label": "Omron FINS TCP", "family": "fins", "port": 9600},
    "wecon": {"label": "Wecon (Modbus TCP)", "family": "modbus", "port": 502},
    "haiwell": {"label": "Haiwell (Modbus TCP)", "family": "modbus", "port": 502},
    "weintek": {"label": "Weintek (Modbus TCP)", "family": "modbus", "port": 502},
    "modbus_tcp": {"label": "Modbus TCP Generic", "family": "modbus", "port": 502},
    "modbus_rtu": {"label": "Modbus RTU RS485 (Serial)", "family": "modbus", "port": 0, "serial": True},
    "modbus_rtu_tcp": {"label": "Modbus RTU over TCP (Gateway RS485)", "family": "modbus", "port": 502},
    "internal": {"label": "SCADA Internal Memory (LB/LW)", "family": "internal", "port": 0},
}

TYPE_SIZE = {"BOOL": 1, "INT16": 2, "UINT16": 2, "INT32": 4, "UINT32": 4, "FLOAT32": 4}
TYPE_FMT = {"INT16": ">h", "UINT16": ">H", "INT32": ">i", "UINT32": ">I", "FLOAT32": ">f"}
BYTE_ORDERS = {"ABCD": (0, 1, 2, 3), "CDAB": (2, 3, 0, 1), "BADC": (1, 0, 3, 2), "DCBA": (3, 2, 1, 0)}


def reorder(data: bytes, order: str) -> bytes:
    order = order or "ABCD"
    if len(data) == 4:
        return bytes(data[i] for i in BYTE_ORDERS.get(order, BYTE_ORDERS["ABCD"]))
    if len(data) == 2 and order in ("BADC", "DCBA"):
        return data[1:2] + data[0:1]
    return data


def decode_bytes(dtype: str, data: bytes, order: str = "ABCD"):
    data = reorder(bytes(data[: TYPE_SIZE[dtype]]), order)
    return struct.unpack(TYPE_FMT[dtype], data)[0]


def encode_bytes(dtype: str, value, order: str = "ABCD") -> bytes:
    v = float(value) if dtype == "FLOAT32" else int(value)
    return reorder(struct.pack(TYPE_FMT[dtype], v), order)


# ---------------- Siemens S7 (snap7) ----------------
S7_DB_RE = re.compile(r"^DB(\d+)\.DB([XBWD])(\d+)(?:\.(\d))?$", re.I)
S7_V_RE = re.compile(r"^V([XBWD])?(\d+)(?:\.(\d))?$", re.I)
S7_AREA_RE = re.compile(r"^([MIQE A])([XBWD])?(\d+)(?:\.(\d))?$".replace(" ", ""), re.I)


def parse_s7(address: str):
    a = address.strip().upper().replace(" ", "")
    m = S7_DB_RE.match(a)
    if m:
        return {"area": "DB", "db": int(m.group(1)), "start": int(m.group(3)), "bit": int(m.group(4) or 0)}
    m = S7_V_RE.match(a)
    if m:
        return {"area": "DB", "db": 1, "start": int(m.group(2)), "bit": int(m.group(3) or 0)}
    m = S7_AREA_RE.match(a)
    if m:
        area = {"M": "MK", "I": "PE", "E": "PE", "Q": "PA", "A": "PA"}[m.group(1)]
        return {"area": area, "db": 0, "start": int(m.group(3)), "bit": int(m.group(4) or 0)}
    raise ValueError(f"Alamat S7 tidak valid: {address}")


class S7Driver:
    def __init__(self, dev):
        import snap7
        self.snap7 = snap7
        self.dev = dev
        self.order = dev.get("_order") or "ABCD"
        self.client = snap7.client.Client()

    def connect(self):
        if not self.client.get_connected():
            self.client.connect(self.dev["host"], int(self.dev.get("rack") or 0), int(self.dev.get("slot") or 1), int(self.dev.get("port") or 102))

    def _area(self, name):
        from snap7.type import Area
        return getattr(Area, name)

    def read(self, address, dtype):
        self.connect()
        p = parse_s7(address)
        data = self.client.read_area(self._area(p["area"]), p["db"], p["start"], TYPE_SIZE[dtype])
        if dtype == "BOOL":
            return bool((data[0] >> p["bit"]) & 1)
        return decode_bytes(dtype, bytes(data), self.order)

    def write(self, address, dtype, value):
        self.connect()
        p = parse_s7(address)
        area = self._area(p["area"])
        if dtype == "BOOL":
            data = bytearray(self.client.read_area(area, p["db"], p["start"], 1))
            data[0] = (data[0] | (1 << p["bit"])) if value else (data[0] & ~(1 << p["bit"]))
            self.client.write_area(area, p["db"], p["start"], data)
        else:
            self.client.write_area(area, p["db"], p["start"], bytearray(encode_bytes(dtype, value, self.order)))

    def close(self):
        try:
            self.client.disconnect()
        except Exception:
            pass


# ---------------- Modbus TCP (Wecon / Haiwell / Weintek) ----------------
def parse_modbus(address: str):
    a = address.strip().upper().replace(" ", "")
    bit = None
    if "." in a:
        a, b = a.split(".", 1)
        bit = int(b)
    m = re.match(r"^(HR|IR|C|DI|MW|M)(\d+)$", a)
    if m:
        kind = {"HR": "hr", "MW": "hr", "IR": "ir", "C": "coil", "M": "coil", "DI": "di"}[m.group(1)]
        return {"kind": kind, "addr": int(m.group(2)), "bit": bit}
    if a.isdigit():
        n = int(a)
        if len(a) >= 5:
            prefix, off = int(a[0]), int(a[1:])
            kind = {0: "coil", 1: "di", 3: "ir", 4: "hr"}.get(prefix)
            if kind:
                return {"kind": kind, "addr": max(off - 1, 0), "bit": bit}
        return {"kind": "hr", "addr": n, "bit": bit}
    raise ValueError(f"Alamat Modbus tidak valid: {address}")


class ModbusDriver:
    def __init__(self, dev):
        from pymodbus import FramerType
        from pymodbus.client import ModbusTcpClient, ModbusSerialClient
        self.dev = dev
        self.unit = int(dev.get("unit_id") or 1)
        self.swap = dev.get("_order") or "ABCD"
        if dev["protocol"] == "modbus_rtu":
            self.client = ModbusSerialClient(
                port=dev.get("serial_port") or "/dev/ttyUSB0", baudrate=int(dev.get("baudrate") or 9600),
                bytesize=int(dev.get("databits") or 8), parity=(dev.get("parity") or "N")[0], stopbits=int(dev.get("stopbits") or 1),
                timeout=1, retries=1)
        elif dev["protocol"] == "modbus_rtu_tcp":
            self.client = ModbusTcpClient(dev["host"], port=int(dev.get("port") or 502), framer=FramerType.RTU, timeout=2)
        else:
            self.client = ModbusTcpClient(dev["host"], port=int(dev.get("port") or 502), timeout=2)

    def connect(self):
        if not self.client.connected and not self.client.connect():
            raise ConnectionError("Tidak dapat terhubung ke perangkat Modbus")

    def read(self, address, dtype):
        self.connect()
        p = parse_modbus(address)
        if p["kind"] in ("coil", "di"):
            fn = self.client.read_coils if p["kind"] == "coil" else self.client.read_discrete_inputs
            r = fn(p["addr"], count=1, device_id=self.unit)
            if r.isError():
                raise IOError(str(r))
            return bool(r.bits[0])
        count = 2 if TYPE_SIZE[dtype] == 4 else 1
        fn = self.client.read_holding_registers if p["kind"] == "hr" else self.client.read_input_registers
        r = fn(p["addr"], count=count, device_id=self.unit)
        if r.isError():
            raise IOError(str(r))
        data = b"".join(struct.pack(">H", x) for x in r.registers)
        if dtype == "BOOL":
            return bool((r.registers[0] >> (p["bit"] or 0)) & 1)
        return decode_bytes(dtype, data, self.swap)

    def write(self, address, dtype, value):
        self.connect()
        p = parse_modbus(address)
        if p["kind"] == "coil":
            self.client.write_coil(p["addr"], bool(value), device_id=self.unit)
            return
        if p["kind"] != "hr":
            raise ValueError("Area ini read-only")
        if dtype == "BOOL":
            r = self.client.read_holding_registers(p["addr"], count=1, device_id=self.unit)
            reg = r.registers[0]
            b = p["bit"] or 0
            reg = (reg | (1 << b)) if value else (reg & ~(1 << b))
            self.client.write_register(p["addr"], reg, device_id=self.unit)
            return
        data = encode_bytes(dtype, value, self.swap)
        regs = [struct.unpack(">H", data[i:i + 2])[0] for i in range(0, len(data), 2)]
        self.client.write_registers(p["addr"], regs, device_id=self.unit)

    def close(self):
        try:
            self.client.close()
        except Exception:
            pass


# ---------------- Omron FINS/TCP ----------------
FINS_AREAS = {"D": (0x82, 0x02), "DM": (0x82, 0x02), "CIO": (0xB0, 0x30), "W": (0xB1, 0x31), "H": (0xB2, 0x32)}


def parse_fins(address: str):
    a = address.strip().upper().replace(" ", "")
    m = re.match(r"^(DM|D|CIO|W|H)(\d+)(?:\.(\d+))?$", a)
    if not m:
        raise ValueError(f"Alamat Omron tidak valid: {address}")
    return {"area": m.group(1), "addr": int(m.group(2)), "bit": int(m.group(3)) if m.group(3) else None}


class FinsDriver:
    def __init__(self, dev):
        self.dev = dev
        self.order = dev.get("_order") or "CDAB"
        self.sock = None
        self.sid = 0

    def connect(self):
        if self.sock:
            return
        s = socket.create_connection((self.dev["host"], int(self.dev.get("port") or 9600)), timeout=2)
        s.sendall(b"FINS" + struct.pack(">IIII", 12, 0, 0, 0))
        resp = s.recv(24)
        if len(resp) < 24:
            s.close()
            raise ConnectionError("Handshake FINS gagal")
        self.client_node, self.server_node = resp[19], resp[23]
        self.sock = s

    def _cmd(self, body: bytes) -> bytes:
        self.sid = (self.sid + 1) % 256
        hdr = bytes([0x80, 0x00, 0x02, 0x00, self.server_node, 0x00, 0x00, self.client_node, 0x00, self.sid])
        frame = hdr + body
        self.sock.sendall(b"FINS" + struct.pack(">III", len(frame) + 8, 2, 0) + frame)
        resp = self.sock.recv(2048)
        if len(resp) < 30 or resp[28:30] != b"\x00\x00":
            raise IOError("Respon FINS error")
        return resp[30:]

    def read(self, address, dtype):
        self.connect()
        p = parse_fins(address)
        word, bitcode = FINS_AREAS[p["area"]]
        if dtype == "BOOL" and p["bit"] is not None:
            data = self._cmd(b"\x01\x01" + bytes([bitcode]) + struct.pack(">HBH", p["addr"], p["bit"], 1))
            return bool(data[0])
        count = 2 if TYPE_SIZE[dtype] == 4 else 1
        data = self._cmd(b"\x01\x01" + bytes([word]) + struct.pack(">HBH", p["addr"], 0, count))
        if dtype == "BOOL":
            return bool(struct.unpack(">H", data[:2])[0] & 1)
        return decode_bytes(dtype, data, self.order)

    def write(self, address, dtype, value):
        self.connect()
        p = parse_fins(address)
        word, bitcode = FINS_AREAS[p["area"]]
        if dtype == "BOOL":
            self._cmd(b"\x01\x02" + bytes([bitcode]) + struct.pack(">HBH", p["addr"], p["bit"] or 0, 1) + bytes([1 if value else 0]))
            return
        data = encode_bytes(dtype, value, self.order)
        self._cmd(b"\x01\x02" + bytes([word]) + struct.pack(">HBH", p["addr"], 0, len(data) // 2) + data)

    def close(self):
        if self.sock:
            self.sock.close()
            self.sock = None


def make_driver(dev):
    family = PROTOCOLS[dev["protocol"]]["family"]
    return {"s7": S7Driver, "modbus": ModbusDriver, "fins": FinsDriver}[family](dev)


def parse_internal(address: str):
    m = re.match(r"^(LB|LW)(\d+)(?:\.(\d+))?$", address.strip().upper())
    if not m:
        raise ValueError(f"Alamat internal tidak valid: {address} (gunakan LB0 / LW0)")
    return {"area": m.group(1), "addr": int(m.group(2))}


def validate_address(protocol: str, address: str):
    family = PROTOCOLS[protocol]["family"]
    {"s7": parse_s7, "modbus": parse_modbus, "fins": parse_fins, "internal": parse_internal}[family](address)


def infer_type(protocol: str, address: str) -> str:
    family = PROTOCOLS[protocol]["family"]
    a = address.strip().upper().lstrip("%")
    if family == "s7":
        if ".DBX" in a or re.match(r"^[MIQEAV]X?\d+\.\d$", a):
            return "BOOL"
        if re.search(r"(DBD|^[MIQEAV]D)\d", a):
            return "INT32"
        return "INT16"
    if family == "modbus":
        try:
            p = parse_modbus(a)
        except ValueError:
            return "INT16"
        return "BOOL" if p["kind"] in ("coil", "di") or p["bit"] is not None else "INT16"
    if family == "internal":
        return "BOOL" if a.startswith("LB") else "INT16"
    return "BOOL" if "." in a else "INT16"
