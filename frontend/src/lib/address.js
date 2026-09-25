export const ADDRESS_MAP = {
  s7: [
    ["Input (I)", "I<byte>.<bit>", "BOOL", "I0.0"], ["Output (Q)", "Q<byte>.<bit>", "BOOL", "Q0.0"], ["Memori Bit (M)", "M<byte>.<bit>", "BOOL", "M10.0"],
    ["Memori Word", "MW<n>", "INT16", "MW20"], ["Memori DWord", "MD<n>", "INT32", "MD40"], ["DB Bit", "DB<n>.DBX<byte>.<bit>", "BOOL", "DB1.DBX0.0"],
    ["DB Word", "DB<n>.DBW<n>", "INT16", "DB1.DBW2"], ["DB DWord / Real", "DB<n>.DBD<n>", "INT32", "DB1.DBD4"], ["S7-200 V Word", "VW<n> (→DB1)", "INT16", "VW100"],
  ],
  modbus: [
    ["Coil (0x)", "0xxxxx / C<n>", "BOOL", "00001"], ["Discrete Input (1x)", "1xxxxx / DI<n>", "BOOL", "10001"], ["Input Register (3x)", "3xxxxx / IR<n>", "INT16", "30001"],
    ["Holding Register (4x)", "4xxxxx / HR<n>", "INT16", "40001"], ["Bit dalam Register", "4xxxxx.<bit>", "BOOL", "40010.3"], ["Holding 32-bit", "4xxxxx (2 reg)", "INT32", "40020"],
  ],
  fins: [
    ["CIO Bit", "CIO<w>.<bit>", "BOOL", "CIO0.00"], ["Work Bit (W)", "W<w>.<bit>", "BOOL", "W0.00"], ["Holding Bit (H)", "H<w>.<bit>", "BOOL", "H0.00"],
    ["DM Word", "D<n>", "INT16", "D100"], ["DM DWord", "D<n> (2 word)", "INT32", "D200"], ["CIO Word", "CIO<n>", "INT16", "CIO10"],
  ],
  internal: [["Local Bit (LB)", "LB<n>", "BOOL", "LB0"], ["Local Word (LW)", "LW<n>", "INT16", "LW0"], ["Local DWord", "LW<n> (2 word)", "INT32", "LW100"]],
  wecon: [
    ["Data Register (D)", "D<n> → HR n", "INT16", "D100"], ["Bit dalam D", "D<n>.<bit>", "BOOL", "D10.3"], ["Relay Internal (M)", "M<n> → Coil n", "BOOL", "M10"],
    ["Input (X, oktal)", "X<oct> → DI 0xF800", "BOOL", "X7"], ["Output (Y, oktal)", "Y<oct> → Coil 0xFC00", "BOOL", "Y10"], ["State (S)", "S<n> → Coil 0xE000", "BOOL", "S0"],
    ["Nilai Timer / Counter", "TD<n> / CD<n>", "INT16", "TD5"], ["D 32-bit", "D<n> (2 reg)", "INT32", "D200"],
  ],
  hostlink: [
    ["DM Word", "D<n>", "INT16", "D100"], ["DM Bit", "D<n>.<bit>", "BOOL", "D100.05"], ["CIO Word", "CIO<n>", "INT16", "CIO10"],
    ["CIO Bit", "CIO<w>.<bit>", "BOOL", "CIO0.03"], ["Holding (H)", "H<n>", "INT16", "H5"], ["DM DWord", "D<n> (2 word)", "INT32", "D200"],
  ],
  fatek: [
    ["Data Register (R)", "R<n>", "INT16", "R100"], ["Data Register (D)", "D<n>", "INT16", "D10"], ["Bit dalam R", "R<n>.<bit>", "BOOL", "R20.3"],
    ["Relay (M)", "M<n>", "BOOL", "M0"], ["Input (X)", "X<n>", "BOOL", "X0"], ["Output (Y)", "Y<n>", "BOOL", "Y5"], ["R 32-bit", "R<n> (2 reg)", "INT32", "R200"],
  ],
  opcua: [
    ["Tag PLC", "\"Nama_Tag\"", "BOOL", "\"Motor_Start\""], ["Member DB", "\"DB\".Member", "FLOAT32", "\"DB_Tank\".Level"],
    ["Struct bertingkat", "\"DB\".Struct.Member", "INT16", "\"DB_Line\".Motor1.Speed"], ["Elemen Array", "\"DB\".Arr[i]", "INT16", "\"DB_Data\".Arr[3]"],
    ["NodeId lengkap", "ns=3;s=...", "INT32", "ns=3;s=\"DB1\".\"Count\""],
  ],
};

export function inferType(family, address) {
  const a = (address || "").trim().toUpperCase().replace(/^%/, "");
  if (family === "s7") {
    if (a.includes(".DBX") || /^[MIQEAV]X?\d+\.\d$/.test(a)) return "BOOL";
    if (/(DBD|^[MIQEAV]D)\d/.test(a)) return "INT32";
    return "INT16";
  }
  if (family === "modbus") return /^(0\d{4,5}|1\d{4,5}|C\d+|DI\d+|M\d+)$/.test(a) || a.includes(".") ? "BOOL" : "INT16";
  if (family === "internal") return a.startsWith("LB") ? "BOOL" : "INT16";
  if (family === "opcua") return null;
  if (family === "fins" || family === "hostlink") return a.includes(".") ? "BOOL" : "BCD16";
  if (family === "wecon" || family === "fatek") return /^[MXYSTC]\d+$/.test(a) || a.includes(".") ? "BOOL" : "INT16";
  return a.includes(".") ? "BOOL" : "INT16";
}
