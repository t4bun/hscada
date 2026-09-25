const f = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });
const TAG = f("tag", "Tag", "tag");
const FONT = [f("font_family", "Font", "font"), f("font_size", "Ukuran Font", "number")];
const NUM_FMT = [f("data_type", "Tipe Data", "datatype"), f("decimals", "Titik Desimal", "decimals"), f("unit", "Satuan")];
const NUM_RANGE = [f("min", "Nilai Minimum", "number"), f("max", "Nilai Maksimum", "number")];
const SEC = f("min_level", "Level Keamanan Min. (0 = semua)", "number");
const BTN_SHAPES = [["flat", "Flat"], ["rounded", "Rounded"], ["pill", "Pill"], ["bevel3d", "3D Bevel"], ["bezel_round", "Pushbutton Bulat"], ["bezel_square", "Pushbutton Kotak"]];
const LAMP_SHAPES = [["circle", "Bulat"], ["square", "Kotak"], ["bezel_round", "Pilot Lamp Bulat"], ["bezel_square", "Pilot Lamp Kotak"], ["led_bar", "LED Bar"]];
const bitStates = (t0, t1, b0 = "#334155", b1 = "#16A34A") => [
  { value: 0, text: t0, bg: b0, color: "#F8FAFC", blink: false },
  { value: 1, text: t1, bg: b1, color: "#FFFFFF", blink: false },
];
const wordStates = () => [
  { value: 0, text: "STOP", bg: "#334155", color: "#F8FAFC", blink: false },
  { value: 1, text: "RUN", bg: "#16A34A", color: "#FFFFFF", blink: false },
  { value: 2, text: "FAULT", bg: "#DC2626", color: "#FFFFFF", blink: true },
];

const ADDR_PROPS = { addr_mode: "tag", use_read: false, w_dev: "", w_addr: "", w_type: "INT16", r_dev: "", r_addr: "", r_type: "INT16" };
const FN_ACTIONS = [["open_screen", "Open Screen"], ["open_subscreen", "Open Subscreen (popup)"], ["previous", "Previous Screen"], ["next", "Next Screen"], ["close_subscreen", "Close Subscreen"], ["export_pdf", "Export History Trend → PDF"], ["export_log", "Export Data Log (PDF / Excel / CSV)"]];
const FN_LOOK = [["shape", "Bentuk standar"], ["image", "Shape / Gambar"], ["transparent", "Transparan (tak terlihat)"]];

export const WIDGETS = {
  label: { name: "Teks / Label", icon: "Type", group: "Dasar", size: [220, 40],
    props: { text: "Label", font_family: "IBM Plex Sans", font_size: 18, color: "#F8FAFC", bg: "transparent", bold: false, italic: false, align: "left" },
    fields: [f("text", "Teks", "textarea"), ...FONT, f("color", "Warna Teks", "color"), f("bg", "Latar", "color"), f("bold", "Tebal", "bool"), f("italic", "Miring", "bool"), f("align", "Rata", "select", { options: ["left", "center", "right"] })] },
  rect: { name: "Persegi", icon: "Square", group: "Dasar", size: [160, 100],
    props: { fill: "#1E293B", stroke: "#334155", stroke_width: 1, radius: 4, opacity: 1, tag: "", on_fill: "#10B981" },
    fields: [f("fill", "Isi", "color"), f("stroke", "Garis", "color"), f("stroke_width", "Tebal Garis", "number"), f("radius", "Radius Sudut", "number"), f("opacity", "Opasitas (0-1)", "number"), { ...TAG, label: "Tag Warna (BOOL)" }, f("on_fill", "Isi saat ON", "color")] },
  circle: { name: "Lingkaran", icon: "Circle", group: "Dasar", size: [100, 100],
    props: { fill: "#1E293B", stroke: "#334155", stroke_width: 2, opacity: 1, tag: "", on_fill: "#10B981" },
    fields: [f("fill", "Isi", "color"), f("stroke", "Garis", "color"), f("stroke_width", "Tebal Garis", "number"), f("opacity", "Opasitas (0-1)", "number"), { ...TAG, label: "Tag Warna (BOOL)" }, f("on_fill", "Isi saat ON", "color")] },
  line: { name: "Garis / Pipa", icon: "Minus", group: "Dasar", size: [200, 12],
    props: { stroke: "#475569", stroke_width: 8, dashed: false, flow: false, tag: "", flow_color: "#10B981" },
    fields: [f("stroke", "Warna", "color"), f("stroke_width", "Tebal", "number"), f("dashed", "Putus-putus", "bool"), f("flow", "Animasi Aliran", "bool"), { ...TAG, label: "Tag Aliran (BOOL)" }, f("flow_color", "Warna Aliran", "color")] },
  image: { name: "Gambar / Foto", icon: "Image", group: "Dasar", size: [200, 150],
    props: { src: "", fit: "contain", opacity: 1, radius: 0 },
    fields: [f("src", "Gambar", "image"), f("fit", "Mode", "select", { options: ["contain", "cover", "fill"] }), f("opacity", "Opasitas (0-1)", "number"), f("radius", "Radius", "number")] },
  button: { name: "Tombol (lama)", icon: "MousePointerClick", group: "Kontrol", hidden: true, size: [150, 48],
    props: { text: "START", action: "toggle", tag: "", value: 0, screen_id: "", bg: "#1E293B", on_bg: "#059669", color: "#F8FAFC", font_size: 15, font_family: "Chivo", radius: 4 },
    fields: [f("text", "Teks"), f("action", "Aksi", "select", { options: [["toggle", "Toggle"], ["set_on", "Set ON"], ["set_off", "Set OFF"], ["momentary", "Momentary"], ["set_value", "Set Nilai"], ["goto", "Pindah Layar"]] }), TAG, f("value", "Nilai (Set Nilai)", "number"), f("screen_id", "Layar Tujuan", "screen"), f("bg", "Warna", "color"), f("on_bg", "Warna saat ON", "color"), f("color", "Warna Teks", "color"), ...FONT, f("radius", "Radius", "number")] },
  switch: { name: "Saklar", icon: "ToggleRight", group: "Kontrol", hidden: true, size: [120, 48],
    props: { tag: "", on_label: "ON", off_label: "OFF", on_color: "#10B981" },
    fields: [TAG, f("on_label", "Label ON"), f("off_label", "Label OFF"), f("on_color", "Warna ON", "color")] },
  lamp: { name: "Lampu (lama)", icon: "Lightbulb", group: "Kontrol", hidden: true, size: [60, 60],
    props: { tag: "", label: "", on_color: "#22C55E", off_color: "#334155", shape: "circle", blink: false },
    fields: [TAG, f("label", "Label"), f("on_color", "Warna ON", "color"), f("off_color", "Warna OFF", "color"), f("shape", "Bentuk", "select", { options: ["circle", "square"] }), f("blink", "Berkedip saat ON", "bool")] },
  numeric: { name: "Numeric Display", icon: "Hash", group: "Kontrol", size: [200, 64],
    props: { tag: "", label: "NILAI", data_type: "INT16", decimals: 0, min: -32768, max: 32767, unit: "", font_size: 24, font_family: "JetBrains Mono", color: "#34D399", bg: "#0F172A", align: "right" },
    fields: [TAG, f("label", "Label"), ...NUM_FMT, ...NUM_RANGE, ...FONT, f("color", "Warna Angka", "color"), f("bg", "Latar", "color"), f("align", "Rata", "select", { options: ["left", "center", "right"] })] },
  numeric_input: { name: "Input Setpoint", icon: "TextCursorInput", group: "Kontrol", size: [180, 52],
    props: { tag: "", label: "SETPOINT", data_type: "INT16", decimals: 0, min: -32768, max: 32767, unit: "", font_size: 20, font_family: "JetBrains Mono", color: "#F8FAFC", bg: "#1E293B", align: "right", min_level: 0 },
    fields: [TAG, f("label", "Label"), ...NUM_FMT, ...NUM_RANGE, ...FONT, f("color", "Warna", "color"), f("bg", "Latar", "color"), f("align", "Rata", "select", { options: ["left", "center", "right"] }), SEC] },
  slider: { name: "Slider", icon: "SlidersHorizontal", group: "Kontrol", size: [240, 36],
    props: { tag: "", min: 0, max: 100, step: 1, color: "#3B82F6" },
    fields: [TAG, f("min", "Min", "number"), f("max", "Maks", "number"), f("step", "Step", "number"), f("color", "Warna", "color"), SEC] },
  gauge: { name: "Gauge", icon: "Gauge", group: "Visual", size: [200, 200],
    props: { tag: "", label: "GAUGE", min: 0, max: 100, unit: "", decimals: 1, warn: 70, danger: 90, color: "#3B82F6" },
    fields: [TAG, f("label", "Label"), f("min", "Min", "number"), f("max", "Maks", "number"), f("unit", "Satuan"), f("decimals", "Desimal", "number"), f("warn", "Batas Warning", "number"), f("danger", "Batas Bahaya", "number"), f("color", "Warna", "color")] },
  bar: { name: "Bar Level", icon: "BarChart3", group: "Visual", size: [48, 200],
    props: { tag: "", min: 0, max: 100, orientation: "vertical", color: "#10B981", bg: "#0F172A", show_value: true },
    fields: [TAG, f("min", "Min", "number"), f("max", "Maks", "number"), f("orientation", "Orientasi", "select", { options: ["vertical", "horizontal"] }), f("color", "Warna", "color"), f("bg", "Latar", "color"), f("show_value", "Tampilkan Nilai", "bool")] },
  tank: { name: "Tangki", icon: "Cylinder", group: "Visual", size: [160, 240],
    props: { tag: "", label: "TANGKI", min: 0, max: 100, color: "#3B82F6", show_value: true },
    fields: [TAG, f("label", "Label"), f("min", "Min", "number"), f("max", "Maks", "number"), f("color", "Warna Cairan", "color"), f("show_value", "Tampilkan Nilai", "bool")] },
  trend: { name: "Trend Real-time", icon: "Activity", group: "Data", size: [520, 220],
    props: { title: "TREND", tags: [], window: 120, y_min: "", y_max: "" },
    fields: [f("title", "Judul"), f("tags", "Tag (multi)", "tags"), f("window", "Rentang (detik)", "number"), f("y_min", "Sumbu Y Min", "number"), f("y_max", "Sumbu Y Maks", "number")] },
  history: { name: "History Trend", icon: "LineChart", group: "Data", size: [600, 280],
    props: { title: "HISTORY TREND", record_no: 1, lines: [], x_grids: 6, y_grids: 5, bg: "#0F172A", grid_color: "#1E293B", date_format: "DD/MM", time_format: "HH:mm:ss", show_slider: true, opacity: 1, y_min: "", y_max: "", start_option: "latest", span_value: 30, span_unit: "min" },
    fields: [f("title", "Judul"), f("_src", "— SOURCE —", "heading"), f("record_no", "Curve Buffer (No. Data Record)", "record"), f("lines", "Line / Channel", "lines"),
      f("_app", "— APPEARANCE —", "heading"), f("x_grids", "X Grids", "number"), f("y_grids", "Y Grids", "number"), f("bg", "Warna Latar", "color"), f("grid_color", "Warna Grid", "color"),
      f("date_format", "Format Tanggal", "select", { options: [["none", "Tidak tampil"], ["DD/MM", "DD/MM"], ["DD/MM/YY", "DD/MM/YY"], ["MM/DD", "MM/DD"], ["YYYY-MM-DD", "YYYY-MM-DD"]] }),
      f("time_format", "Format Waktu", "select", { options: [["none", "Tidak tampil"], ["HH:mm", "HH:mm"], ["HH:mm:ss", "HH:mm:ss"]] }), f("show_slider", "Tampilkan Slider", "bool"), f("opacity", "Transparansi (0-1)", "number"),
      f("_rng", "— RANGE —", "heading"), f("y_min", "Y Limit Min (kosong = auto)", "number"), f("y_max", "Y Limit Maks (kosong = auto)", "number"),
      f("_fn", "— FUNCTION —", "heading"), f("start_option", "Start Time", "select", { options: [["latest", "Data terbaru (real-time)"], ["custom", "Pilih waktu mulai (runtime)"]] }), f("span_value", "Span Time", "number"), f("span_unit", "Satuan Span", "select", { options: [["min", "Menit"], ["hour", "Jam"], ["day", "Hari"]] })] },
  alarm_table: { name: "Alarm Record", icon: "Siren", group: "Data", size: [480, 240],
    props: { title: "ALARM", active_only: false, group_no: 0 },
    fields: [f("title", "Judul"), f("active_only", "Hanya alarm aktif", "bool"), f("group_no", "Group Alarm (0 = semua)", "number")] },
  data_record: { name: "Data Record", icon: "Table", group: "Data", size: [520, 260],
    props: { title: "DATA RECORD", record_no: 1, rows: 20 },
    fields: [f("title", "Judul"), f("record_no", "No. Data Record", "record"), f("rows", "Jumlah Baris", "number")] },
  bit_button: { name: "Bit Button", icon: "ToggleLeft", group: "Tombol & Lampu", size: [140, 56],
    props: { tag: "", read_tag: "", ...ADDR_PROPS, w_type: "BOOL", r_type: "BOOL", mode: "toggle", pulse_ms: 500, shape: "bevel3d", states: bitStates("OFF", "ON"), font_family: "Chivo", font_size: 15, min_level: 0 },
    fields: [f("tag", "Alamat Tulis / Baca (Bit)", "addr", { bit: true }), f("mode", "Tipe Bit", "select", { options: [["set_on", "Set ON"], ["set_off", "Set OFF"], ["momentary", "Momentary"], ["toggle", "Switch (Toggle)"]] }), f("pulse_ms", "Durasi Momentary (ms, 0 = selama ditekan)", "number"), f("shape", "Bentuk", "select", { options: BTN_SHAPES }), f("states", "State", "states", { bit: true }), ...FONT, SEC] },
  word_button: { name: "Word Button", icon: "Binary", group: "Tombol & Lampu", size: [140, 56],
    props: { tag: "", read_tag: "", ...ADDR_PROPS, mode: "cycle", value: 1, step: 1, min: 0, max: 100, caption: "", shape: "rounded", states: wordStates(), font_family: "Chivo", font_size: 15, min_level: 0 },
    fields: [f("tag", "Alamat Tulis / Baca (Word)", "addr"), f("mode", "Aksi Word", "select", { options: [["set_value", "Set Nilai Konstan"], ["increment", "Tambah (+step)"], ["decrement", "Kurang (-step)"], ["cycle", "Siklus State"]] }), f("value", "Nilai Konstan", "number"), f("step", "Step", "number"), f("min", "Min", "number"), f("max", "Maks", "number"), f("caption", "Teks Tetap (opsional)"), f("shape", "Bentuk", "select", { options: BTN_SHAPES }), f("states", "State (multi-state)", "states"), ...FONT, SEC] },
  bit_lamp: { name: "Bit Lamp", icon: "Lightbulb", group: "Tombol & Lampu", size: [64, 64],
    props: { tag: "", shape: "bezel_round", show_text: false, states: bitStates("OFF", "ON", "#1F2937", "#22C55E"), font_family: "Chivo", font_size: 12 },
    fields: [{ ...TAG, label: "Tag (Bit)" }, f("shape", "Bentuk", "select", { options: LAMP_SHAPES }), f("show_text", "Tampilkan Teks", "bool"), f("states", "State", "states", { bit: true }), ...FONT] },
  word_lamp: { name: "Word Lamp", icon: "Sun", group: "Tombol & Lampu", size: [120, 48],
    props: { tag: "", shape: "led_bar", show_text: true, states: wordStates(), font_family: "Chivo", font_size: 13 },
    fields: [{ ...TAG, label: "Tag (Word)" }, f("shape", "Bentuk", "select", { options: LAMP_SHAPES }), f("show_text", "Tampilkan Teks", "bool"), f("states", "State (multi-state)", "states"), ...FONT] },
  char_display: { name: "Character Display", icon: "CaseSensitive", group: "Kontrol", size: [200, 56],
    props: { tag: "", label: "TEKS", mode: "ascii", max_chars: 1, states: wordStates(), font_family: "Share Tech Mono", font_size: 22, color: "#FBBF24", bg: "#0F172A", align: "left" },
    fields: [TAG, f("label", "Label"), f("mode", "Mode", "select", { options: [["ascii", "ASCII (karakter dari word / STRING)"], ["message", "Pesan per nilai (word)"]] }), f("max_chars", "Maks Karakter (1–256)", "maxchars"), f("_len", "Panjang Karakter", "charinfo"), f("states", "Daftar Pesan (mode pesan)", "states"), ...FONT, f("color", "Warna", "color"), f("bg", "Latar", "color"), f("align", "Rata", "select", { options: ["left", "center", "right"] })] },
  func_button: { name: "Function Button", icon: "SquareArrowOutUpRight", group: "Tombol & Lampu", size: [150, 48],
    props: { text: "BUKA LAYAR", action: "open_screen", screen_id: "", record_no: 1, appearance: "shape", image: "", show_text: true, min_press_ms: 0, shape: "rounded", bg: "#2563EB", color: "#FFFFFF", font_family: "Chivo", font_size: 14, min_level: 0 },
    fields: [f("text", "Teks"), f("action", "Fungsi", "select", { options: FN_ACTIONS }), f("screen_id", "Layar Tujuan", "screen"), f("record_no", "No. Data Record (Export)", "record"),
      f("appearance", "Tampilan", "select", { options: FN_LOOK }), f("image", "Shape / Gambar (mode Shape)", "shapeimg"), f("show_text", "Tampilkan Teks", "bool"),
      f("min_press_ms", "Minimal Waktu Tekan (ms, 0 = langsung)", "number"), f("shape", "Bentuk", "select", { options: BTN_SHAPES }), f("bg", "Warna", "color"), f("color", "Warna Teks", "color"), ...FONT, SEC] },
  ...Object.fromEntries([["pump", "Pompa", "Fan"], ["valve", "Valve", "Merge"], ["motor", "Motor", "Cog"], ["conveyor", "Konveyor", "ArrowRightLeft"], ["fan", "Kipas / Blower", "Wind"]].map(([s, name, icon]) => [`sym_${s}`, {
    name, icon, group: "Simbol Industri", size: s === "conveyor" ? [200, 90] : [90, 100],
    props: { symbol: s, tag: "", tag_mode: "bit", animate: true, show_label: true, label: "", states: bitStates("STOP", "RUN", "#64748B", "#22C55E") },
    fields: [TAG, f("tag_mode", "Mode Tag", "select", { options: [["bit", "Bit (ON/OFF)"], ["word", "Word (multi-state)"]] }), f("animate", "Animasi saat aktif", "bool"), f("show_label", "Tampilkan Label", "bool"), f("label", "Label Tetap (opsional)"), f("states", "State Warna", "states", { bitKey: "tag_mode" })],
  }])),
};

export const GROUPS = ["Dasar", "Tombol & Lampu", "Kontrol", "Simbol Industri", "Visual", "Data"];

export function newWidget(type, x, y) {
  const def = WIDGETS[type];
  return { id: crypto.randomUUID(), type, x: Math.round(x), y: Math.round(y), w: def.size[0], h: def.size[1], props: JSON.parse(JSON.stringify(def.props)) };
}
