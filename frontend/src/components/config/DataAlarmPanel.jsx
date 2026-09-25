import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";
import { DATA_TYPES } from "@/lib/format";
import { inputCls, L } from "./DeviceDialog";

const COND_LABEL = { on: "Bit ON", off: "Bit OFF", high: "High Limit (≥)", low: "Low Limit (≤)", equal: "Equivalent (=)", range: "Range (di luar low–high)" };
const Chk = ({ label, checked, onChange, testid }) => (
  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" data-testid={testid} className="accent-blue-500 w-4 h-4" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />{label}</label>
);
const Head = ({ title, sub, onAdd, testid, disabled }) => (
  <div className="flex items-end justify-between">
    <div><h3 className="font-heading font-bold">{title}</h3>{sub && <p className="text-xs text-slate-500">{sub}</p>}</div>
    {onAdd && <button data-testid={testid} disabled={disabled} onClick={onAdd} className="h-8 px-3 flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 rounded-sm disabled:opacity-40"><Plus size={13} />Tambah</button>}
  </div>
);
const Tbl = ({ heads, children }) => (
  <div className="border border-slate-800 rounded-sm overflow-x-auto">
    <table className="w-full text-xs"><thead className="bg-[#111827] text-[10px] uppercase tracking-wider text-slate-400"><tr>{heads.map((h) => <th key={h} className="text-left px-3 py-2">{h}</th>)}</tr></thead><tbody>{children}</tbody></table>
  </div>
);
const Acts = ({ onEdit, onDel, id }) => (
  <td className="px-3 py-1.5 text-right whitespace-nowrap">
    <button data-testid={`${id}-edit`} onClick={onEdit} className="h-7 w-7 inline-grid place-items-center hover:bg-slate-800 rounded-sm"><Pencil size={12} /></button>
    <button data-testid={`${id}-delete`} onClick={onDel} className="h-7 w-7 inline-grid place-items-center hover:bg-red-900 rounded-sm"><Trash2 size={12} /></button>
  </td>
);

const RecordDialog = ({ init, tags, onClose, onSave }) => {
  const [f, setF] = useState(init);
  const [q, setQ] = useState("");
  useEffect(() => setF(init), [init]);
  if (!f) return null;
  const toggle = (id) => setF({ ...f, channels: f.channels.includes(id) ? f.channels.filter((x) => x !== id) : f.channels.length >= 99 ? f.channels : [...f.channels, id] });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-lg" data-testid="record-dialog">
        <DialogHeader><DialogTitle className="font-heading">{f.id ? "Edit" : "Tambah"} Data Record</DialogTitle></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <L label="Nomor (1-100)"><input data-testid="record-number" type="number" min={1} max={100} className={inputCls} value={f.number} onChange={(e) => setF({ ...f, number: Number(e.target.value) })} /></L>
          <L label="Nama"><input data-testid="record-name" className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></L>
          <L label="Interval (detik)"><input data-testid="record-interval" type="number" min={1} className={inputCls} value={f.interval_s} onChange={(e) => setF({ ...f, interval_s: Number(e.target.value) })} /></L>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Channel Address <span data-testid="record-channel-count" className="text-emerald-400">{f.channels.length}/99</span></p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari tag" className="h-7 w-40 bg-[#0B0F17] border border-slate-700 rounded-sm px-2 text-xs" />
        </div>
        <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-sm p-1 hmi-scroll">
          {tags.filter((t) => !q || t.name.toLowerCase().includes(q.toLowerCase())).map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-xs px-2 py-1 hover:bg-slate-800 rounded-sm">
              <input type="checkbox" data-testid={`record-ch-${t.name}`} className="accent-blue-500" checked={f.channels.includes(t.id)} onChange={() => toggle(t.id)} />
              {f.channels.includes(t.id) && <span className="font-mono text-[10px] text-blue-400 w-5">{f.channels.indexOf(t.id) + 1}</span>}
              <span className="flex-1 text-slate-200">{t.name}</span><span className="font-mono text-slate-500">{t.address} · {t.data_type}</span>
            </label>
          ))}
        </div>
        <button data-testid="record-save-btn" onClick={() => onSave(f)} className="h-10 bg-blue-600 hover:bg-blue-700 rounded-sm text-sm font-semibold">Simpan</button>
      </DialogContent>
    </Dialog>
  );
};

const AlarmDialog = ({ init, tags, screens, lib, onClose, onSave }) => {
  const [f, setF] = useState(init);
  useEffect(() => setF(init), [init]);
  if (!f) return null;
  const bit = f.kind === "bit";
  const set = (k) => (v) => setF({ ...f, [k]: v?.target ? v.target.value : v });
  const num = (k) => (e) => setF({ ...f, [k]: e.target.value === "" ? null : Number(e.target.value) });
  const opts = tags.filter((t) => (t.data_type === "BOOL") === bit);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-lg max-h-[90vh] overflow-y-auto hmi-scroll" data-testid="alarm-dialog">
        <DialogHeader><DialogTitle className="font-heading">{f.id ? "Edit" : "Tambah"} {bit ? "Bit" : "Word"} Alarm</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <L label={bit ? "Bit Address" : "Word Address"}>
            <select data-testid="alarm-tag-select" className={inputCls} value={f.tag_id} onChange={(e) => { const t = tags.find((x) => x.id === e.target.value); setF({ ...f, tag_id: e.target.value, data_format: t?.data_type || f.data_format }); }}>
              <option value="">— pilih —</option>
              {opts.map((t) => <option key={t.id} value={t.id}>{`${t.name} · ${t.address}`}</option>)}
            </select>
          </L>
          <L label="Group Number"><input data-testid="alarm-group" type="number" min={1} className={inputCls} value={f.group} onChange={(e) => setF({ ...f, group: Number(e.target.value) })} /></L>
          {!bit && <L label="Data Format"><select data-testid="alarm-format" className={inputCls} value={f.data_format} onChange={set("data_format")}>{DATA_TYPES.filter((d) => d !== "BOOL").map((d) => <option key={d}>{d}</option>)}</select></L>}
          <L label="Alarm Condition">
            <select data-testid="alarm-condition" className={inputCls} value={f.condition} onChange={set("condition")}>
              {(bit ? ["on", "off"] : ["high", "low", "equal", "range"]).map((c) => <option key={c} value={c}>{COND_LABEL[c]}</option>)}
            </select>
          </L>
          {!bit && (f.condition === "range" ? <>
            <L label="Batas Bawah (low)"><input data-testid="alarm-low" type="number" className={inputCls} value={f.low ?? ""} onChange={num("low")} /></L>
            <L label="Batas Atas (high)"><input data-testid="alarm-high" type="number" className={inputCls} value={f.high ?? ""} onChange={num("high")} /></L>
          </> : <L label="Nilai Limit"><input data-testid="alarm-value" type="number" className={inputCls} value={f.value ?? ""} onChange={num("value")} /></L>)}
        </div>
        <L label={bit ? "Content Alarm" : "Alarm Info"}>
          <div className="space-y-1.5">
            <select data-testid="alarm-library" className={inputCls} value={f.library_id} onChange={set("library_id")}>
              <option value="">Teks manual</option>
              {lib.map((x) => <option key={x.id} value={x.id}>{`Text Library #${x.no}: ${x.text}`}</option>)}
            </select>
            {!f.library_id && <input data-testid="alarm-content" className={inputCls} value={f.content} onChange={set("content")} placeholder="Teks alarm" />}
          </div>
        </L>
        <div className="grid grid-cols-2 gap-2 border border-slate-800 bg-[#0B0F17] p-3 rounded-sm">
          <Chk testid="alarm-record" label="Record alarm (simpan histori)" checked={f.record} onChange={set("record")} />
          <Chk testid="alarm-notsaveoff" label="Not save when alarm OFF" checked={f.not_save_off} onChange={set("not_save_off")} />
          <Chk testid="alarm-beep" label="Beep when alarm ON" checked={f.beep} onChange={set("beep")} />
          {!bit && <Chk testid="alarm-beeponce" label="Beep once" checked={f.beep_once} onChange={set("beep_once")} />}
        </div>
        {bit && (
          <div className="grid grid-cols-2 gap-3 items-end">
            <L label="Alarm Screen (subscreen)">
              <select data-testid="alarm-screen" className={inputCls} value={f.alarm_screen} onChange={set("alarm_screen")}>
                <option value="">— tidak ada —</option>
                {screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </L>
            <div className="pb-2"><Chk testid="alarm-popuponce" label="Pop-up once" checked={f.popup_once} onChange={set("popup_once")} /></div>
          </div>
        )}
        <button data-testid="alarm-save-btn" onClick={() => onSave(f)} className="h-10 bg-blue-600 hover:bg-blue-700 rounded-sm text-sm font-semibold">Simpan</button>
      </DialogContent>
    </Dialog>
  );
};

const NEW_DEF = (kind) => ({ kind, tag_id: "", group: 1, condition: kind === "bit" ? "on" : "high", value: null, low: null, high: null, data_format: kind === "bit" ? "BOOL" : "INT16", content: "", library_id: "", record: true, not_save_off: false, beep: false, beep_once: false, alarm_screen: "", popup_once: true });

export const DataAlarmPanel = ({ project, tags, onSaved }) => {
  const pid = project.id;
  const [recs, setRecs] = useState([]);
  const [defs, setDefs] = useState([]);
  const [recDlg, setRecDlg] = useState(null);
  const [defDlg, setDefDlg] = useState(null);
  const [lib, setLib] = useState(project.text_library || []);
  const tagName = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, `${t.name} (${t.address})`])), [tags]);
  const load = () => Promise.all([api.get(`/projects/${pid}/records`), api.get(`/projects/${pid}/alarm-defs`)]).then(([r, d]) => { setRecs(r.data); setDefs(d.data); }).catch((e) => toast.error(errMsg(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [pid]);
  const run = async (fn, close) => { try { await fn(); toast.success("Tersimpan"); close?.(); load(); } catch (e) { toast.error(errMsg(e)); } };
  const saveRec = (f) => run(() => (f.id ? api.put(`/projects/${pid}/records/${f.id}`, f) : api.post(`/projects/${pid}/records`, f)), () => setRecDlg(null));
  const saveDef = (f) => run(() => (f.id ? api.put(`/projects/${pid}/alarm-defs/${f.id}`, f) : api.post(`/projects/${pid}/alarm-defs`, f)), () => setDefDlg(null));
  const nextNo = () => { for (let i = 1; i <= 100; i++) if (!recs.some((r) => r.number === i)) return i; return 100; };
  const saveLib = () => run(async () => { await api.put(`/projects/${pid}`, { text_library: lib }); onSaved(); });
  const content = (d) => lib.find((x) => x.id === d.library_id)?.text || d.content;
  const defRows = (kind) => defs.filter((d) => d.kind === kind);

  return (
    <div className="space-y-10" data-testid="data-alarm-panel">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">Data & Alarm</p><h2 className="font-heading text-2xl font-bold mt-1">Data Records, Bit Alarm & Word Alarm</h2></div>
      <section className="space-y-3">
        <Head title={`Data Records (${recs.length}/100)`} sub="Satu data record menyimpan hingga 99 channel address. Dipakai oleh History Trend, tabel Data Record, dan Export PDF." testid="add-record-btn" disabled={recs.length >= 100}
          onAdd={() => setRecDlg({ number: nextNo(), name: "", interval_s: 5, channels: [], enabled: true })} />
        <Tbl heads={["No", "Nama", "Interval", "Channel", ""]}>
          {recs.map((r, i) => (
            <tr key={r.id} className="border-t border-slate-800" data-testid={`record-row-${i}`}>
              <td className="px-3 py-1.5 font-mono text-blue-400">#{r.number}</td><td className="px-3 text-slate-100">{r.name}</td><td className="px-3 font-mono">{r.interval_s}s</td>
              <td className="px-3 text-slate-400">{r.channels.length} ch · {r.channels.slice(0, 3).map((c) => tagName[c]?.split(" ")[0]).join(", ")}{r.channels.length > 3 ? "…" : ""}</td>
              <Acts id={`record-${i}`} onEdit={() => setRecDlg(r)} onDel={() => window.confirm(`Hapus data record #${r.number}?`) && run(() => api.delete(`/projects/${pid}/records/${r.id}`))} />
            </tr>
          ))}
        </Tbl>
      </section>
      {["bit", "word"].map((kind) => (
        <section key={kind} className="space-y-3">
          <Head title={kind === "bit" ? "Bit Alarm" : "Word Alarm"} testid={`add-${kind}-alarm-btn`} onAdd={() => setDefDlg(NEW_DEF(kind))} />
          <Tbl heads={["Address", "Group", "Kondisi", "Content", "Opsi", ""]}>
            {defRows(kind).map((d, i) => (
              <tr key={d.id} className="border-t border-slate-800" data-testid={`${kind}-alarm-row-${i}`}>
                <td className="px-3 py-1.5 text-slate-100">{tagName[d.tag_id] || "?"}</td><td className="px-3 font-mono">{d.group}</td>
                <td className="px-3 text-amber-400">{COND_LABEL[d.condition]}{kind === "word" && (d.condition === "range" ? ` ${d.low}–${d.high}` : ` ${d.value}`)}</td>
                <td className="px-3 text-slate-300">{content(d)}</td>
                <td className="px-3 text-[10px] font-mono text-slate-500">{[d.record && "REC", d.not_save_off && "NO-OFF", d.beep && (d.beep_once ? "BEEP1" : "BEEP"), d.alarm_screen && (d.popup_once ? "POPUP1" : "POPUP")].filter(Boolean).join(" · ")}</td>
                <Acts id={`${kind}-alarm-${i}`} onEdit={() => setDefDlg(d)} onDel={() => window.confirm("Hapus alarm ini?") && run(() => api.delete(`/projects/${pid}/alarm-defs/${d.id}`))} />
              </tr>
            ))}
          </Tbl>
        </section>
      ))}
      <section className="space-y-3">
        <Head title="Text Library" sub="Teks yang bisa dipilih sebagai content alarm." />
        <div className="space-y-1.5 max-w-2xl">
          {lib.map((x, i) => (
            <div key={x.id} className="flex gap-2 items-center">
              <span className="font-mono text-xs text-slate-500 w-8">#{x.no}</span>
              <input data-testid={`lib-text-${i}`} className={inputCls} value={x.text} onChange={(e) => setLib(lib.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} />
              <button onClick={() => setLib(lib.filter((_, j) => j !== i))} className="h-9 w-9 grid place-items-center hover:bg-red-900 rounded-sm"><Trash2 size={13} /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <button data-testid="lib-add-btn" onClick={() => setLib([...lib, { id: crypto.randomUUID(), no: Math.max(0, ...lib.map((x) => x.no)) + 1, text: "" }])} className="h-8 px-3 flex items-center gap-1 text-xs bg-slate-800 hover:bg-slate-700 rounded-sm"><Plus size={13} />Teks</button>
            <button data-testid="lib-save-btn" onClick={saveLib} className="h-8 px-3 flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 rounded-sm"><Save size={13} />Simpan Library</button>
          </div>
        </div>
      </section>
      <RecordDialog init={recDlg} tags={tags} onClose={() => setRecDlg(null)} onSave={saveRec} />
      <AlarmDialog init={defDlg} tags={tags} screens={project.screens} lib={lib} onClose={() => setDefDlg(null)} onSave={saveDef} />
    </div>
  );
};
