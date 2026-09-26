import csv
import io
import re

TIA_TYPES = {
    "bool": "BOOL", "int": "INT16", "sint": "INT16", "uint": "UINT16", "word": "UINT16", "byte": "UINT16", "usint": "UINT16",
    "dint": "INT32", "time": "INT32", "udint": "UINT32", "dword": "UINT32", "real": "FLOAT32",
    "int16": "INT16", "uint16": "UINT16", "int32": "INT32", "uint32": "UINT32", "float32": "FLOAT32", "float": "FLOAT32",
}
COLS = {
    "name": ("name", "nama", "tag", "tag name"),
    "address": ("logical address", "address", "alamat", "addr"),
    "data_type": ("data type", "datatype", "data_type", "tipe", "type"),
    "comment": ("comment", "description", "keterangan", "deskripsi"),
    "decimals": ("decimals", "desimal"),
    "unit": ("unit", "satuan"),
}


def _rows(filename: str, data: bytes):
    if filename.lower().endswith((".xlsx", ".xlsm")):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        return [["" if c is None else str(c) for c in r] for r in wb.worksheets[0].iter_rows(values_only=True)]
    text = data.decode("utf-8-sig", errors="ignore")
    delim = ";" if text.count(";") > text.count(",") else ("\t" if text.count("\t") > text.count(",") else ",")
    return list(csv.reader(io.StringIO(text), delimiter=delim))


def parse_tag_file(filename: str, data: bytes):
    rows = [r for r in _rows(filename, data) if any(str(c).strip() for c in r)]
    for hi, row in enumerate(rows[:10]):
        low = [str(c).strip().lower() for c in row]
        idx = {k: next((low.index(a) for a in aliases if a in low), None) for k, aliases in COLS.items()}
        if idx["name"] is not None and (idx["address"] is not None or idx["data_type"] is not None):
            break
    else:
        raise ValueError("Header tidak ditemukan. Butuh kolom 'Name' dan 'Logical Address'/'Address'.")
    out = []
    for r in rows[hi + 1:]:
        def get(k, r=r):
            return str(r[idx[k]]).strip() if idx[k] is not None and idx[k] < len(r) else ""
        name, addr = get("name"), get("address").lstrip("%").replace(" ", "")
        if not name:
            continue
        raw_type = re.sub(r"\s+", "", get("data_type").lower())
        out.append({"name": re.sub(r"[^\w.\-]", "_", name), "raw_name": name.strip('"'), "address": addr, "raw_type": raw_type,
                    "data_type": TIA_TYPES.get(raw_type) if raw_type else None, "description": get("comment"),
                    "decimals": get("decimals"), "unit": get("unit")})
    return out
