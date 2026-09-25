import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Download, Plus, Search, FolderTree } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { ADDRESS_MAP } from "@/lib/address";

const CATS = [["Bit", "BOOL"], ["Word", "INT16 / UINT16"], ["DWord", "INT32 / UINT32"], ["Float", "FLOAT32"]];
const sel = "h-9 bg-[#0B0F17] border border-slate-700 rounded-sm px-2 text-sm text-slate-100";

export const LibraryPanel = ({ projectId, devices, tags, protocols, onReload, onNewTag, onEditTag }) => {
  const [devId, setDevId] = useState(devices[0]?.id || "");
  const [q, setQ] = useState("");
  const [result, setResult] = useState(null);
  const fileRef = useRef();
  const dev = devices.find((d) => d.id === devId);
  const family = protocols[dev?.protocol]?.family;
  const filtered = useMemo(() => tags.filter((t) => !q || `${t.name} ${t.address}`.toLowerCase().includes(q.toLowerCase())), [tags, q]);
  const devName = (id) => devices.find((d) => d.id === id)?.name || "-";

  const doImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !devId) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("device_id", devId);
    try {
      const { data } = await api.post(`/projects/${projectId}/tags/import`, fd);
      setResult(data);
      toast.success(`${data.created} tag diimport, ${data.skipped.length} dilewati`);
      onReload();
    } catch (er) { toast.error(errMsg(er)); }
    e.target.value = "";
  };
  const doExport = async () => {
    const { data } = await api.get(`/projects/${projectId}/tags/export`, { responseType: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(data);
    a.download = "tags.csv";
    a.click();
  };

  return (
    <div className="space-y-8" data-testid="library-panel">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">Address Library</p><h2 className="font-heading text-2xl font-bold mt-1">Mapping & Library Alamat</h2></div>
        <div className="flex flex-wrap gap-2 items-center">
          <select data-testid="library-device-select" className={sel} value={devId} onChange={(e) => setDevId(e.target.value)}>
            {devices.map((d) => <option key={d.id} value={d.id}>{`${d.name} · ${protocols[d.protocol]?.label || ""}`}</option>)}
          </select>
          <button data-testid="library-import-btn" disabled={!devId} onClick={() => fileRef.current.click()} className="h-9 px-3 flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 rounded-sm disabled:opacity-40"><Upload size={14} />Import Tag (TIA Portal .xlsx / CSV)</button>
          <button data-testid="library-export-btn" onClick={doExport} className="h-9 px-3 flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 rounded-sm"><Download size={14} />Export CSV</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xlsm,.txt" hidden onChange={doImport} />
        </div>
      </div>
      <p className="text-xs text-slate-500 max-w-3xl">Import dari TIA Portal: buka <b className="text-slate-300">PLC tags → tabel tag → Export</b> (file .xlsx berkolom Name, Data Type, Logical Address, Comment). CSV cukup punya kolom <span className="font-mono">Name, Address</span>; tipe data otomatis dari alamat bila kosong.</p>
      {result && (
        <div data-testid="import-result" className="border border-slate-800 bg-[#111827] p-4 rounded-sm text-xs space-y-1">
          <p className="text-slate-200">Hasil import: <b className="text-emerald-400">{result.created}</b> dibuat dari {result.total} baris, <b className="text-amber-400">{result.skipped.length}</b> dilewati.</p>
          {result.skipped.slice(0, 8).map((s) => <p key={s.name} className="font-mono text-slate-500">• {s.name}: {s.reason}</p>)}
        </div>
      )}
      <div className="grid lg:grid-cols-[1fr_1.3fr] gap-6">
        <section className="border border-slate-800 rounded-sm bg-[#111827]">
          <p className="px-4 py-3 border-b border-slate-800 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Mapping Alamat {dev ? `· ${protocols[dev.protocol]?.label}` : ""}</p>
          <table className="w-full text-xs" data-testid="address-map-table">
            <thead className="text-[10px] uppercase text-slate-500"><tr>{["Area", "Format", "Tipe Auto", ""].map((h) => <th key={h} className="text-left px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {(ADDRESS_MAP[family] || []).map(([area, fmt, dt, ex], i) => (
                <tr key={area} className="border-t border-slate-800">
                  <td className="px-3 py-2 text-slate-200">{area}</td>
                  <td className="px-3 py-2 font-mono text-cyan-300">{fmt}</td>
                  <td className="px-3 py-2 font-mono text-emerald-400">{dt}</td>
                  <td className="px-3 py-2 text-right"><button data-testid={`map-add-${i}`} onClick={() => onNewTag({ device_id: devId, address: ex, data_type: dt })} className="h-7 px-2 inline-flex items-center gap-1 bg-slate-800 hover:bg-blue-600 rounded-sm"><Plus size={12} />Tag</button></td>
                </tr>
              ))}
              {!dev && <tr><td colSpan={4} className="text-center text-slate-500 py-6">Tambahkan perangkat dulu</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="border border-slate-800 rounded-sm bg-[#111827]">
          <div className="px-4 py-2.5 border-b border-slate-800 flex items-center gap-2">
            <FolderTree size={14} className="text-slate-500" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 flex-1">Library Tag per Tipe Data</p>
            <div className="relative"><Search size={12} className="absolute left-2 top-2.5 text-slate-500" /><input data-testid="library-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari tag / alamat" className="h-8 pl-7 pr-2 w-48 bg-[#0B0F17] border border-slate-700 rounded-sm text-xs" /></div>
          </div>
          <div className="max-h-[520px] overflow-y-auto hmi-scroll">
            {CATS.map(([cat, types]) => {
              const list = filtered.filter((t) => t.category === cat);
              return (
                <details key={cat} open className="border-b border-slate-800" data-testid={`library-cat-${cat}`}>
                  <summary className="px-4 py-2 cursor-pointer text-xs font-semibold text-slate-200 flex items-center gap-2 select-none">
                    {cat} <span className="font-mono text-[10px] text-slate-500">{types}</span><span className="ml-auto font-mono text-[10px] bg-slate-800 px-1.5 rounded-sm">{list.length}</span>
                  </summary>
                  {list.map((t) => (
                    <button key={t.id} onClick={() => onEditTag(t)} className="w-full grid grid-cols-[1fr_1fr_auto] gap-2 px-6 py-1.5 text-left text-xs hover:bg-slate-800/60">
                      <span className="text-slate-100 truncate">{t.name}</span><span className="font-mono text-cyan-300 truncate">{t.address}</span><span className="text-slate-500 text-[10px]">{devName(t.device_id)} · {t.data_type}</span>
                    </button>
                  ))}
                </details>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
