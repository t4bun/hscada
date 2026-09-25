TYPE_SPEC = {
    "BOOL": {"digits": 1, "signed": False, "min": 0, "max": 1},
    "INT16": {"digits": 5, "signed": True, "min": -32768, "max": 32767},
    "UINT16": {"digits": 5, "signed": False, "min": 0, "max": 65535},
    "INT32": {"digits": 10, "signed": True, "min": -2147483648, "max": 2147483647},
    "UINT32": {"digits": 10, "signed": False, "min": 0, "max": 4294967295},
    "FLOAT32": {"digits": 7, "signed": True, "min": -3.4e38, "max": 3.4e38},
    "BCD16": {"digits": 4, "signed": False, "min": 0, "max": 9999},
    "BCD32": {"digits": 8, "signed": False, "min": 0, "max": 99999999},
    "STRING": {"digits": 0, "signed": False, "min": 0, "max": 0},
}
INT_TYPES = ("INT16", "UINT16", "INT32", "UINT32", "BCD16", "BCD32")


def default_decimals(dt: str) -> int:
    return 2 if dt == "FLOAT32" else 0


def spec_for(dt: str, decimals: int) -> dict:
    s = TYPE_SPEC[dt]
    if dt == "BOOL":
        return {"max_chars": 1, "int_digits": 1, "decimals": 0, "min": 0, "max": 1}
    if dt == "STRING":
        return {"max_chars": 256, "int_digits": 0, "decimals": 0, "min": 0, "max": 0}
    dec = max(0, min(int(decimals or 0), s["digits"] - 1 if dt == "FLOAT32" else s["digits"]))
    int_digits = max(1, s["digits"] - dec)
    max_chars = int_digits + dec + (1 if dec else 0) + (1 if s["signed"] else 0)
    if dt == "FLOAT32":
        lim = 10 ** int_digits - 10 ** (-dec)
        mn, mx = -lim, lim
    else:
        mn, mx = s["min"] / 10 ** dec, s["max"] / 10 ** dec
    return {"max_chars": max_chars, "int_digits": int_digits, "decimals": dec, "min": mn, "max": mx}


def clamp_value(dt: str, decimals: int, v: float):
    if dt == "BOOL":
        return bool(v)
    if dt == "STRING":
        raise ValueError("Tag STRING hanya bisa dibaca")
    sp = spec_for(dt, decimals)
    v = min(sp["max"], max(sp["min"], float(v)))
    if dt in INT_TYPES and sp["decimals"] == 0:
        return int(round(v))
    return round(v, sp["decimals"] if dt in INT_TYPES else max(sp["decimals"], 3))


def to_engineering(dt: str, decimals: int, raw):
    if dt == "BOOL":
        return bool(raw)
    if dt == "STRING":
        return str(raw)
    if dt in INT_TYPES and decimals:
        return round(raw / 10 ** decimals, decimals)
    return raw if dt in INT_TYPES else round(float(raw), 4)


def to_raw(dt: str, decimals: int, v: float) -> int:
    return int(round(float(v) * 10 ** (decimals or 0)))
