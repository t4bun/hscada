import struct

PROTOCOLS = {
    "s7_1200_1500": {"label": "Siemens S7-1200/1500 (Alamat Absolut)", "family": "s7", "port": 102, "rack": 0, "slot": 1},
    "s7_1200_1500_sym": {"label": "Siemens S7-1200/1500 (Simbolik via OPC UA)", "family": "opcua", "port": 4840},
    "s7_300_400": {"label": "Siemens S7-300/400", "family": "s7", "port": 102, "rack": 0, "slot": 2},
    "s7_200": {"label": "Siemens S7-200 (CP243-1) / S7-200 SMART", "family": "s7", "port": 102, "rack": 0, "slot": 1, "tsap": True},
    "omron_fins": {"label": "Omron FINS TCP", "family": "fins", "port": 9600},
    "omron_fins_udp": {"label": "Omron FINS UDP", "family": "fins", "port": 9600, "udp": True},
    "omron_hostlink": {"label": "Omron Host Link (Serial RS232/485)", "family": "hostlink", "port": 0, "serial": True},
    "fatek_tcp": {"label": "Fatek FBs (Ethernet)", "family": "fatek", "port": 500},
    "fatek_serial": {"label": "Fatek FBs (Serial RS232/485)", "family": "fatek", "port": 0, "serial": True},
    "wecon": {"label": "Wecon (Modbus TCP, alamat D/M/X/Y)", "family": "wecon", "port": 502},
    "wecon_rtu": {"label": "Wecon (Modbus RTU Serial, alamat D/M/X/Y)", "family": "wecon", "port": 0, "serial": True},
    "haiwell": {"label": "Haiwell (Modbus TCP)", "family": "modbus", "port": 502},
    "weintek": {"label": "Weintek (Modbus TCP)", "family": "modbus", "port": 502},
    "modbus_tcp": {"label": "Modbus TCP Generic", "family": "modbus", "port": 502},
    "modbus_rtu": {"label": "Modbus RTU (Serial RS485/RS232/RS422)", "family": "modbus", "port": 0, "serial": True},
    "modbus_rtu_tcp": {"label": "Modbus RTU over TCP (Gateway RS485)", "family": "modbus", "port": 502},
    "internal": {"label": "SCADA Internal Memory (LB/LW)", "family": "internal", "port": 0},
}


class PlcError(Exception):
    """PLC answered but rejected the request (bad address / area) - connection still OK."""

TYPE_SIZE = {"BOOL": 1, "INT16": 2, "UINT16": 2, "INT32": 4, "UINT32": 4, "FLOAT32": 4, "BCD16": 2, "BCD32": 4, "STRING": 2}
TYPE_FMT = {"INT16": ">h", "UINT16": ">H", "INT32": ">i", "UINT32": ">I", "FLOAT32": ">f", "BCD16": ">H", "BCD32": ">I"}


def bcd_decode(n: int) -> int:
    s = f"{n:X}"
    if not s.isdigit():
        raise PlcError(f"Nilai 0x{s} bukan BCD valid")
    return int(s)


def bcd_encode(v) -> int:
    return int(str(max(0, int(v))), 16)


def text_from(data: bytes, n: int) -> str:
    return bytes(data[:n]).split(b"\x00")[0].decode("latin-1", errors="ignore")
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
    v = struct.unpack(TYPE_FMT[dtype], data)[0]
    return bcd_decode(v) if dtype.startswith("BCD") else v


def encode_bytes(dtype: str, value, order: str = "ABCD") -> bytes:
    v = float(value) if dtype == "FLOAT32" else (bcd_encode(value) if dtype.startswith("BCD") else int(value))
    return reorder(struct.pack(TYPE_FMT[dtype], v), order)
