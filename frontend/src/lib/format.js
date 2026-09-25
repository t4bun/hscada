export const TYPE_SPEC = {
  BOOL: { digits: 1, signed: false, min: 0, max: 1, label: "BOOL (1 bit)" },
  INT16: { digits: 5, signed: true, min: -32768, max: 32767, label: "INT16 (16-bit signed)" },
  UINT16: { digits: 5, signed: false, min: 0, max: 65535, label: "UINT16 (16-bit unsigned)" },
  INT32: { digits: 10, signed: true, min: -2147483648, max: 2147483647, label: "INT32 (32-bit signed)" },
  UINT32: { digits: 10, signed: false, min: 0, max: 4294967295, label: "UINT32 (32-bit unsigned)" },
  FLOAT32: { digits: 7, signed: true, min: -3.4e38, max: 3.4e38, label: "FLOAT32 (32-bit real)" },
  BCD16: { digits: 4, signed: false, min: 0, max: 9999, label: "BCD16 (4 digit, 0–9999)" },
  BCD32: { digits: 8, signed: false, min: 0, max: 99999999, label: "BCD32 (8 digit, 0–99999999)" },
  STRING: { digits: 0, signed: false, min: 0, max: 0, label: "STRING (ASCII, 1–256 karakter)" },
};
export const DATA_TYPES = Object.keys(TYPE_SPEC);
export const defaultDecimals = (dt) => (dt === "FLOAT32" ? 2 : 0);

export function specFor(dt = "INT16", decimals = 0) {
  const s = TYPE_SPEC[dt] || TYPE_SPEC.INT16;
  if (dt === "BOOL") return { maxChars: 1, intDigits: 1, decimals: 0, min: 0, max: 1 };
  if (dt === "STRING") return { maxChars: 256, intDigits: 0, decimals: 0, min: 0, max: 0 };
  const cap = dt === "FLOAT32" ? s.digits - 1 : s.digits;
  const dec = Math.max(0, Math.min(Number(decimals) || 0, cap));
  const intDigits = Math.max(1, s.digits - dec);
  const maxChars = intDigits + dec + (dec ? 1 : 0) + (s.signed ? 1 : 0);
  let min, max;
  if (dt === "FLOAT32") {
    max = 10 ** intDigits - 10 ** -dec;
    min = -max;
  } else {
    min = s.min / 10 ** dec;
    max = s.max / 10 ** dec;
  }
  return { maxChars, intDigits, decimals: dec, min, max };
}

export function formatValue(v, dt = "INT16", decimals = 0) {
  if (v === undefined || v === null) return "----";
  if (typeof v === "string") return v;
  if (dt === "BOOL" || typeof v === "boolean") return v ? "1" : "0";
  const sp = specFor(dt, decimals);
  const s = Number(v).toFixed(sp.decimals);
  return s.length > sp.maxChars ? "#".repeat(sp.maxChars) : s;
}

export const BUILTIN_FONTS = ["IBM Plex Sans", "Chivo", "JetBrains Mono", "Share Tech Mono", "Orbitron", "Rajdhani", "Oswald", "Barlow Condensed"];
export const SERIES_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#06B6D4", "#E879F9", "#A3E635", "#F97316"];
