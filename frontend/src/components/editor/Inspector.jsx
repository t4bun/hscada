import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Trash2, ArrowUpToLine, ArrowDownToLine, Copy, Plus } from "lucide-react";
import { WIDGETS } from "@/components/widgets/registry";
import { BUILTIN_FONTS, DATA_TYPES, TYPE_SPEC, specFor, defaultDecimals } from "@/lib/format";
import { uploadFile, errMsg, assetUrl } from "@/lib/api";

const inputCls = "w-full h-8 bg-[#0B0F17] border border-slate-700 rounded-sm px-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500";
const Row = ({ label, children }) => (
  <label className="block space-y-1">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
    {children}
  </label>
);
const Section = ({ title, children }) => (
  <div className="border-b border-slate-800 p-4 space-y-3">
    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{title}</p>
    {children}
  </div>
);

const ImagePick = ({ value, onChange, testid }) => {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try { onChange((await uploadFile(file)).url); toast.success("Gambar diunggah"); } catch (er) { toast.error(errMsg(er)); }
    setBusy(false);
    e.target.value = "";
  };
  return (
    <div className="space-y-2">
      {value && <img src={assetUrl(value)} alt="" className="w-full h-20 object-contain bg-black/40 border border-slate-800" />}
      <div className="flex gap-1">
        <button type="button" data-testid={testid} onClick={() => ref.current.click()} className="flex-1 h-8 text-xs flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 rounded-sm text-slate-200">
          <Upload size={13} />{busy ? "Mengunggah..." : "Import Gambar"}
        </button>
        {value && <button type="button" onClick={() => onChange("")} className="h-8 px-2 bg-slate-800 hover:bg-red-900 rounded-sm"><Trash2 size={13} /></button>}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden onChange={pick} />
    </div>
  );
};

const Field = ({ f, value, set, ctx, widget }) => {
  const id = `prop-${f.key}`;
  switch (f.type) {
    case "textarea": return <textarea data-testid={id} className={`${inputCls} h-16 py-1`} value={value ?? ""} onChange={(e) => set(e.target.value)} />;
    case "number": return <input data-testid={id} type="number" className={inputCls} value={value ?? ""} onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))} />;
    case "color": return (
      <div className="flex gap-1">
        <input type="color" className="h-8 w-9 bg-transparent border border-slate-700 rounded-sm" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"} onChange={(e) => set(e.target.value)} />
        <input data-testid={id} className={inputCls} value={value ?? ""} onChange={(e) => set(e.target.value)} />
      </div>
    );
    case "bool": return <input data-testid={id} type="checkbox" className="accent-blue-500 w-4 h-4" checked={!!value} onChange={(e) => set(e.target.checked)} />;
    case "select": return (
      <select data-testid={id} className={inputCls} value={value} onChange={(e) => set(e.target.value)}>
        {f.options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return <option key={v} value={v}>{l}</option>; })}
      </select>
    );
    case "font": return (
      <select data-testid={id} className={inputCls} value={value} onChange={(e) => set(e.target.value)} style={{ fontFamily: value }}>
        {[...BUILTIN_FONTS, ...ctx.fonts.map((x) => x.name)].map((n) => <option key={n} value={n} style={{ fontFamily: n }}>{n}</option>)}
      </select>
    );
    case "tag": return (
      <select data-testid={id} className={inputCls} value={value || ""} onChange={(e) => set(e.target.value)}>
        <option value="">— tanpa tag —</option>
        {ctx.tags.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.data_type})</option>)}
      </select>
    );
    case "tags": return (
      <div className="max-h-36 overflow-y-auto border border-slate-700 rounded-sm p-1 space-y-0.5 hmi-scroll">
        {ctx.tags.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-xs text-slate-300 px-1 py-0.5 hover:bg-slate-800 rounded-sm">
            <input type="checkbox" data-testid={`prop-tags-${t.name}`} className="accent-blue-500" checked={(value || []).includes(t.id)}
              onChange={(e) => set(e.target.checked ? [...(value || []), t.id] : (value || []).filter((x) => x !== t.id))} />
            {t.name}
          </label>
        ))}
        {!ctx.tags.length && <p className="text-[11px] text-slate-500 p-1">Belum ada tag</p>}
      </div>
    );
    case "screen": return (
      <select data-testid={id} className={inputCls} value={value || ""} onChange={(e) => set(e.target.value)}>
        <option value="">— pilih layar —</option>
        {ctx.screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    );
    case "image": return <ImagePick value={value} onChange={set} testid={id} />;
    case "datatype": return (
      <select data-testid={id} className={inputCls} value={value} onChange={(e) => set(e.target.value, { decimals: defaultDecimals(e.target.value) })}>
        {DATA_TYPES.map((d) => <option key={d} value={d}>{TYPE_SPEC[d].label}</option>)}
      </select>
    );
    case "decimals": {
      const sp = specFor(widget.props.data_type, value);
      return (
        <div className="space-y-1.5">
          <input data-testid={id} type="number" min={0} max={widget.props.data_type === "FLOAT32" ? 6 : 10} className={inputCls} value={value ?? 0} onChange={(e) => set(Number(e.target.value))} />
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono" data-testid="auto-format-info">
            <span className="bg-slate-800/70 px-1.5 py-1 rounded-sm text-slate-400">Maks. karakter <b className="text-emerald-400" data-testid="auto-max-chars">{sp.maxChars}</b></span>
            <span className="bg-slate-800/70 px-1.5 py-1 rounded-sm text-slate-400">Digit bulat <b className="text-emerald-400">{sp.intDigits}</b></span>
            <span className="col-span-2 bg-slate-800/70 px-1.5 py-1 rounded-sm text-slate-400">Rentang <b className="text-slate-200">{sp.min} … {sp.max}</b></span>
          </div>
        </div>
      );
    }
    default: return <input data-testid={id} className={inputCls} value={value ?? ""} onChange={(e) => set(e.target.value)} />;
  }
};

const WidgetProps = ({ widget, ctx, onProps, onGeom, onAction }) => {
  const def = WIDGETS[widget.type];
  const p = { ...def.props, ...widget.props };
  const set = (key) => (v, extra = {}) => {
    const patch = { [key]: v, ...extra };
    if (key === "tag" && "data_type" in def.props) {
      const t = ctx.tags.find((x) => x.id === v);
      if (t && t.data_type !== "BOOL") Object.assign(patch, { data_type: t.data_type, decimals: t.decimals, unit: t.unit || p.unit });
    }
    if (key === "tag" && widget.type === "gauge") {
      const t = ctx.tags.find((x) => x.id === v);
      if (t) Object.assign(patch, { decimals: t.decimals, unit: t.unit || p.unit });
    }
    onProps(patch);
  };
  return (
    <>
      <Section title={def.name}>
        <div className="flex gap-1">
          <IconBtn t="Duplikat" testid="widget-duplicate-btn" onClick={() => onAction("duplicate")}><Copy size={14} /></IconBtn>
          <IconBtn t="Ke depan" testid="widget-front-btn" onClick={() => onAction("front")}><ArrowUpToLine size={14} /></IconBtn>
          <IconBtn t="Ke belakang" testid="widget-back-btn" onClick={() => onAction("back")}><ArrowDownToLine size={14} /></IconBtn>
          <IconBtn t="Hapus" testid="widget-delete-btn" danger onClick={() => onAction("delete")}><Trash2 size={14} /></IconBtn>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {["x", "y", "w", "h"].map((k) => (
            <Row key={k} label={k.toUpperCase()}>
              <input data-testid={`geom-${k}`} type="number" className={inputCls} value={Math.round(widget[k])} onChange={(e) => onGeom({ [k]: Number(e.target.value) })} />
            </Row>
          ))}
        </div>
      </Section>
      <Section title="Properti">
        {def.fields.map((f) => (
          <Row key={f.key} label={f.label}><Field f={f} value={p[f.key]} set={set(f.key)} ctx={ctx} widget={{ ...widget, props: p }} /></Row>
        ))}
      </Section>
    </>
  );
};

const IconBtn = ({ t, onClick, children, danger, testid }) => (
  <button type="button" title={t} data-testid={testid} onClick={onClick} className={`h-8 flex-1 grid place-items-center rounded-sm bg-slate-800 text-slate-300 ${danger ? "hover:bg-red-700" : "hover:bg-slate-700"} transition-colors`}>{children}</button>
);

const ScreenProps = ({ screen, project, onScreen, onProject, onDeleteScreen, canDelete }) => {
  const fontRef = useRef();
  const addFont = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const r = await uploadFile(file);
      const name = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9 _-]/g, "");
      onProject({ fonts: [...(project.fonts || []), { name, url: r.url }] });
      toast.success(`Font "${name}" ditambahkan`);
    } catch (er) { toast.error(errMsg(er)); }
    e.target.value = "";
  };
  return (
    <>
      <Section title="Layar">
        <Row label="Nama Layar"><input data-testid="screen-name-input" className={inputCls} value={screen.name} onChange={(e) => onScreen({ name: e.target.value })} /></Row>
        <Row label="Warna Latar">
          <Field f={{ key: "bg_color", type: "color" }} value={screen.bg_color} set={(v) => onScreen({ bg_color: v })} ctx={{}} />
        </Row>
        <Row label="Gambar Latar"><ImagePick value={screen.bg_image} onChange={(v) => onScreen({ bg_image: v })} testid="screen-bg-upload" /></Row>
        {canDelete && (
          <button data-testid="screen-delete-btn" onClick={onDeleteScreen} className="w-full h-8 text-xs flex items-center justify-center gap-1 bg-slate-800 hover:bg-red-800 rounded-sm text-slate-200"><Trash2 size={13} />Hapus Layar</button>
        )}
      </Section>
      <Section title="Kanvas Proyek">
        <div className="grid grid-cols-2 gap-2">
          <Row label="Lebar"><input data-testid="canvas-width-input" type="number" className={inputCls} value={project.width} onChange={(e) => onProject({ width: Number(e.target.value) })} /></Row>
          <Row label="Tinggi"><input data-testid="canvas-height-input" type="number" className={inputCls} value={project.height} onChange={(e) => onProject({ height: Number(e.target.value) })} /></Row>
        </div>
        <div className="flex flex-wrap gap-1">
          {[[1280, 720], [1920, 1080], [1024, 768], [800, 480]].map(([w, h]) => (
            <button key={w} onClick={() => onProject({ width: w, height: h })} className="text-[10px] font-mono px-1.5 py-1 bg-slate-800 hover:bg-slate-700 rounded-sm text-slate-300">{w}×{h}</button>
          ))}
        </div>
      </Section>
      <Section title="Font Kustom">
        {(project.fonts || []).map((f, i) => (
          <div key={f.url} className="flex items-center justify-between text-xs text-slate-300 bg-slate-800/60 px-2 py-1.5 rounded-sm">
            <span style={{ fontFamily: f.name }}>{f.name}</span>
            <button onClick={() => onProject({ fonts: project.fonts.filter((_, j) => j !== i) })} className="text-slate-500 hover:text-red-400"><Trash2 size={12} /></button>
          </div>
        ))}
        <button data-testid="font-import-btn" onClick={() => fontRef.current.click()} className="w-full h-8 text-xs flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 rounded-sm text-slate-200"><Plus size={13} />Import Font (.ttf/.otf/.woff)</button>
        <input ref={fontRef} type="file" accept=".ttf,.otf,.woff,.woff2" hidden onChange={addFont} />
      </Section>
    </>
  );
};

export const Inspector = (props) => (
  <aside className="w-80 border-l border-slate-800 bg-[#111827] shrink-0 overflow-y-auto hmi-scroll" data-testid="property-inspector">
    {props.widget ? <WidgetProps {...props} /> : <ScreenProps {...props} />}
  </aside>
);
