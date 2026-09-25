import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { LayoutTemplate, Rocket, Plus, Download, Trash2, Upload } from "lucide-react";
import { api, errMsg } from "@/lib/api";

const download = async (url, name) => {
  const { data } = await api.get(url, { responseType: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(data);
  a.download = name;
  a.click();
};

const TemplateCard = ({ t, i, onUse, onExport, onDelete }) => (
  <article data-testid={`template-card-${i}`} className="border border-slate-800 bg-[#111827] hover:border-slate-600 p-5 rounded-sm space-y-3 transition-colors">
    <div className="flex items-start gap-3">
      <span className="w-9 h-9 shrink-0 grid place-items-center bg-violet-600/20 text-violet-300 rounded-sm"><LayoutTemplate size={16} /></span>
      <div className="min-w-0">
        <p data-testid={`template-name-${i}`} className="font-heading font-bold text-white truncate">{t.name}</p>
        <p className="text-[11px] text-slate-500 font-mono">{t.screens} layar · {t.devices} perangkat · {t.tags} tag</p>
      </div>
    </div>
    {t.description && <p className="text-xs text-slate-400 line-clamp-2">{t.description}</p>}
    <div className="flex flex-wrap gap-1.5">
      <button data-testid={`template-use-${i}`} onClick={() => onUse(t, false)} className="h-8 px-3 text-xs flex items-center gap-1 bg-blue-600 hover:bg-blue-700 rounded-sm"><Plus size={13} />Buat Project</button>
      <button data-testid={`template-use-publish-${i}`} onClick={() => onUse(t, true)} className="h-8 px-3 text-xs flex items-center gap-1 bg-emerald-700 hover:bg-emerald-600 rounded-sm"><Rocket size={13} />Buat & Publish</button>
      <button data-testid={`template-export-${i}`} title="Export .tbn" onClick={() => onExport(t)} className="h-8 w-8 grid place-items-center bg-slate-800 hover:bg-slate-700 rounded-sm"><Download size={13} /></button>
      <button data-testid={`template-delete-${i}`} title="Hapus template" onClick={() => onDelete(t)} className="h-8 w-8 grid place-items-center bg-slate-800 hover:bg-red-800 rounded-sm"><Trash2 size={13} /></button>
    </div>
  </article>
);

export const saveAsTemplate = async (p, onDone) => {
  const name = window.prompt("Nama template:", `${p.name} (Template)`);
  if (!name?.trim()) return;
  const t = toast.loading("Menyimpan template...");
  try {
    await api.post(`/projects/${p.id}/template`, { name: name.trim(), description: `Dari project ${p.name}` });
    toast.success("Template disimpan", { id: t });
    onDone?.();
  } catch (e) { toast.error(errMsg(e), { id: t }); }
};

export const TemplatesSection = ({ reloadKey, onCreated }) => {
  const [items, setItems] = useState([]);
  const ref = useRef();
  const load = useCallback(() => api.get("/templates").then((r) => setItems(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load, reloadKey]);
  const use = async (t, publish) => {
    const id = toast.loading("Membuat project dari template...");
    try {
      const { data } = await api.post(`/templates/${t.id}/create`, { publish });
      toast.success(`Project "${data.name}" dibuat${data.published ? " & dipublish" : ""}`, { id });
      onCreated();
    } catch (e) { toast.error(errMsg(e), { id }); }
  };
  const del = async (t) => {
    if (!window.confirm(`Hapus template "${t.name}"?`)) return;
    try { await api.delete(`/templates/${t.id}`); load(); } catch (e) { toast.error(errMsg(e)); }
  };
  const exp = (t) => download(`/templates/${t.id}/export`, `template-${t.name.replace(/[^\w-]+/g, "_")}.tbn`).catch((e) => toast.error(errMsg(e)));
  const imp = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try { await api.post("/templates/import", fd); toast.success("Template diimport"); load(); } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <section className="space-y-3" data-testid="templates-section">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-violet-300">Template Project</p>
          <p className="text-xs text-slate-500">Buat instalasi pabrik baru dengan satu klik.</p>
        </div>
        <button data-testid="template-import-btn" onClick={() => ref.current.click()} className="h-8 px-3 text-xs flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 rounded-sm"><Upload size={13} />Import Template (.tbn)</button>
        <input ref={ref} type="file" accept=".tbn,.nhmi,.json" hidden onChange={imp} data-testid="template-import-input" />
      </div>
      {items.length === 0
        ? <p data-testid="templates-empty" className="text-xs text-slate-500 border border-dashed border-slate-800 rounded-sm p-4">Belum ada template. Klik "Template" pada kartu project untuk menyimpannya sebagai template.</p>
        : <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{items.map((t, i) => <TemplateCard key={t.id} t={t} i={i} onUse={use} onExport={exp} onDelete={del} />)}</div>}
    </section>
  );
};
