const f = (key, label, type = "text", extra = {}) => ({ key, label, type, ...extra });
const TAG = f("tag", "Tag", "tag");
const FONT = [f("font_family", "Font", "font"), f("font_size", "Ukuran Font", "number")];
const NUM_FMT = [f("data_type", "Tipe Data", "datatype"), f("decimals", "Titik Desimal", "decimals"), f("unit", "Satuan")];

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
  button: { name: "Tombol", icon: "MousePointerClick", group: "Kontrol", size: [150, 48],
    props: { text: "START", action: "toggle", tag: "", value: 0, screen_id: "", bg: "#1E293B", on_bg: "#059669", color: "#F8FAFC", font_size: 15, font_family: "Chivo", radius: 4 },
    fields: [f("text", "Teks"), f("action", "Aksi", "select", { options: [["toggle", "Toggle"], ["set_on", "Set ON"], ["set_off", "Set OFF"], ["momentary", "Momentary"], ["set_value", "Set Nilai"], ["goto", "Pindah Layar"]] }), TAG, f("value", "Nilai (Set Nilai)", "number"), f("screen_id", "Layar Tujuan", "screen"), f("bg", "Warna", "color"), f("on_bg", "Warna saat ON", "color"), f("color", "Warna Teks", "color"), ...FONT, f("radius", "Radius", "number")] },
  switch: { name: "Saklar", icon: "ToggleRight", group: "Kontrol", size: [120, 48],
    props: { tag: "", on_label: "ON", off_label: "OFF", on_color: "#10B981" },
    fields: [TAG, f("on_label", "Label ON"), f("off_label", "Label OFF"), f("on_color", "Warna ON", "color")] },
  lamp: { name: "Lampu Indikator", icon: "Lightbulb", group: "Kontrol", size: [60, 60],
    props: { tag: "", label: "", on_color: "#22C55E", off_color: "#334155", shape: "circle", blink: false },
    fields: [TAG, f("label", "Label"), f("on_color", "Warna ON", "color"), f("off_color", "Warna OFF", "color"), f("shape", "Bentuk", "select", { options: ["circle", "square"] }), f("blink", "Berkedip saat ON", "bool")] },
  numeric: { name: "Tampilan Angka", icon: "Hash", group: "Kontrol", size: [200, 64],
    props: { tag: "", label: "NILAI", data_type: "INT16", decimals: 0, unit: "", font_size: 24, font_family: "JetBrains Mono", color: "#34D399", bg: "#0F172A", align: "right" },
    fields: [TAG, f("label", "Label"), ...NUM_FMT, ...FONT, f("color", "Warna Angka", "color"), f("bg", "Latar", "color"), f("align", "Rata", "select", { options: ["left", "center", "right"] })] },
  numeric_input: { name: "Input Setpoint", icon: "TextCursorInput", group: "Kontrol", size: [180, 52],
    props: { tag: "", label: "SETPOINT", data_type: "INT16", decimals: 0, unit: "", font_size: 20, font_family: "JetBrains Mono", color: "#F8FAFC", bg: "#1E293B", align: "right" },
    fields: [TAG, f("label", "Label"), ...NUM_FMT, ...FONT, f("color", "Warna", "color"), f("bg", "Latar", "color"), f("align", "Rata", "select", { options: ["left", "center", "right"] })] },
  slider: { name: "Slider", icon: "SlidersHorizontal", group: "Kontrol", size: [240, 36],
    props: { tag: "", min: 0, max: 100, step: 1, color: "#3B82F6" },
    fields: [TAG, f("min", "Min", "number"), f("max", "Maks", "number"), f("step", "Step", "number"), f("color", "Warna", "color")] },
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
  history: { name: "History Trend", icon: "LineChart", group: "Data", size: [560, 240],
    props: { title: "HISTORY TREND", tags: [], minutes: 30 },
    fields: [f("title", "Judul"), f("tags", "Tag (multi)", "tags"), f("minutes", "Rentang (menit)", "number")] },
  alarm_table: { name: "Alarm Record", icon: "Siren", group: "Data", size: [480, 240],
    props: { title: "ALARM", active_only: false },
    fields: [f("title", "Judul"), f("active_only", "Hanya alarm aktif", "bool")] },
  data_record: { name: "Data Record", icon: "Table", group: "Data", size: [520, 260],
    props: { title: "DATA RECORD", tags: [], rows: 20 },
    fields: [f("title", "Judul"), f("tags", "Tag (multi)", "tags"), f("rows", "Jumlah Baris", "number")] },
};

export const GROUPS = ["Dasar", "Kontrol", "Visual", "Data"];

export function newWidget(type, x, y) {
  const def = WIDGETS[type];
  return { id: crypto.randomUUID(), type, x: Math.round(x), y: Math.round(y), w: def.size[0], h: def.size[1], props: JSON.parse(JSON.stringify(def.props)) };
}
