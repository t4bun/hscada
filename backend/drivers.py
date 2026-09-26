import re
import socket
import struct

from driver_common import PROTOCOLS, PlcError, TYPE_SIZE, TYPE_FMT, BYTE_ORDERS, bcd_decode, bcd_encode, text_from, reorder, decode_bytes, encode_bytes  # noqa: F401


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
        if self.client.get_connected():
            return
        d = self.dev
        rack, slot, port = int(d.get("rack") or 0), int(d.get("slot") or 1), int(d.get("port") or 102)
        if d.get("local_tsap") and d.get("remote_tsap"):
            self.client.set_connection_params(d["host"], int(str(d["local_tsap"]).replace(".", ""), 16), int(str(d["remote_tsap"]).replace(".", ""), 16))
            self.client._connect(d["host"], rack, slot, port)
        else:
            self.client.connect(d["host"], rack, slot, port)

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

    def read_string(self, address, n):
        self.connect()
        p = parse_s7(address)
        return text_from(self.client.read_area(self._area(p["area"]), p["db"], p["start"], n), n)

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
        from plc_ext import parse_wecon, dev_timeout
        self.dev = dev
        self.unit = int(dev.get("unit_id") or 1)
        self.swap = dev.get("_order") or "ABCD"
        self.parse = parse_wecon if PROTOCOLS[dev["protocol"]]["family"] == "wecon" else parse_modbus
        self.serial = bool(PROTOCOLS[dev["protocol"]].get("serial"))
        tmo = dev_timeout(dev)
        if self.serial:
            self.client = ModbusSerialClient(
                port=dev.get("serial_port") or "COM1", baudrate=int(dev.get("baudrate") or 9600),
                bytesize=int(dev.get("databits") or 8), parity=(dev.get("parity") or "N")[0], stopbits=int(dev.get("stopbits") or 1),
                timeout=tmo, retries=1)
        elif dev["protocol"] == "modbus_rtu_tcp":
            self.client = ModbusTcpClient(dev["host"], port=int(dev.get("port") or 502), framer=FramerType.RTU, timeout=tmo)
        else:
            self.client = ModbusTcpClient(dev["host"], port=int(dev.get("port") or 502), timeout=tmo)

    def connect(self):
        if self.client.connected or self.client.connect():
            return
        if self.serial:
            import serial
            try:
                serial.Serial(self.dev.get("serial_port") or "COM1").close()
            except Exception as e:
                raise ConnectionError(str(e))
        raise ConnectionError("Tidak dapat terhubung ke perangkat Modbus (timeout)")

    def read(self, address, dtype):
        self.connect()
        p = self.parse(address)
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

    def read_string(self, address, n):
        self.connect()
        p = self.parse(address)
        fn = self.client.read_holding_registers if p["kind"] == "hr" else self.client.read_input_registers
        r = fn(p["addr"], count=(n + 1) // 2, device_id=self.unit)
        if r.isError():
            raise IOError(str(r))
        return text_from(b"".join(struct.pack(">H", x) for x in r.registers), n)

    def write(self, address, dtype, value):
        self.connect()
        p = self.parse(address)
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
        self.udp = bool(PROTOCOLS[dev["protocol"]].get("udp"))

    @staticmethod
    def _octet(ip, fallback=0):
        try:
            return int(str(ip).split(".")[-1])
        except ValueError:
            return fallback

    def connect(self):
        if self.sock:
            return
        from plc_ext import dev_timeout
        addr = (self.dev["host"], int(self.dev.get("port") or 9600))
        if self.udp:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(dev_timeout(self.dev))
            s.connect(addr)
            self.server_node = int(self.dev.get("fins_dst_node") or 0) or self._octet(self.dev["host"])
            self.client_node = int(self.dev.get("fins_src_node") or 0) or self._octet(s.getsockname()[0], 1)
            self.sock = s
            return
        s = socket.create_connection(addr, timeout=dev_timeout(self.dev))
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
        if self.udp:
            self.sock.send(frame)
            resp, off = self.sock.recv(2048), 12
        else:
            self.sock.sendall(b"FINS" + struct.pack(">III", len(frame) + 8, 2, 0) + frame)
            resp, off = self.sock.recv(2048), 28
        if len(resp) < off + 2:
            raise IOError("Respon FINS terlalu pendek")
        if resp[off:off + 2] != b"\x00\x00":
            raise PlcError(f"FINS end code {resp[off:off + 2].hex()}")
        return resp[off + 2:]

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

    def read_string(self, address, n):
        self.connect()
        p = parse_fins(address)
        data = self._cmd(b"\x01\x01" + bytes([FINS_AREAS[p["area"]][0]]) + struct.pack(">HBH", p["addr"], 0, (n + 1) // 2))
        return text_from(data, n)

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
    import plc_ext
    family = PROTOCOLS[dev["protocol"]]["family"]
    return {"s7": S7Driver, "modbus": ModbusDriver, "wecon": ModbusDriver, "fins": FinsDriver, "hostlink": plc_ext.HostLinkDriver,
            "fatek": plc_ext.FatekDriver, "opcua": plc_ext.OpcUaDriver}[family](dev)


def parse_internal(address: str):
    m = re.match(r"^(LB|LW)(\d+)(?:\.(\d+))?$", address.strip().upper())
    if not m:
        raise ValueError(f"Alamat internal tidak valid: {address} (gunakan LB0 / LW0)")
    return {"area": m.group(1), "addr": int(m.group(2))}


def validate_address(protocol: str, address: str):
    import plc_ext
    family = PROTOCOLS[protocol]["family"]
    {"s7": parse_s7, "modbus": parse_modbus, "fins": parse_fins, "internal": parse_internal, "wecon": plc_ext.parse_wecon,
     "hostlink": plc_ext.parse_hostlink, "fatek": plc_ext.parse_fatek, "opcua": plc_ext.parse_opcua}[family](address)


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
    if family in ("wecon", "fatek"):
        import plc_ext
        try:
            p = (plc_ext.parse_wecon if family == "wecon" else plc_ext.parse_fatek)(a)
        except ValueError:
            return "INT16"
        return "BOOL" if p["kind"] in ("coil", "di", "bit") or p["bit"] is not None else "INT16"
    if family == "opcua":
        return "FLOAT32"
    return "BOOL" if "." in a else "INT16"
