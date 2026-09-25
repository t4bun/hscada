import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Pencil, Trash2, Server, LayoutDashboard, Bell } from "lucide-react";
import { DeviceCard } from "@/components/config/DeviceCard";
import { api, errMsg } from "@/lib/api";
import { useLive } from "@/hooks/useLive";
import { formatValue } from "@/lib/format";
import { DeviceDialog } from "@/components/config/DeviceDialog";
import { TagDialog } from "@/components/config/TagDialog";
import { LibraryPanel } from "@/components/config/LibraryPanel";
import { SecurityPanel } from "@/components/config/SecurityPanel";
import { SettingsPanel } from "@/components/config/SettingsPanel";
import { DataAlarmPanel } from "@/components/config/DataAlarmPanel";


export default function ProjectConfig() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [devices, setDevices] = useState([]);
  const [tags, setTags] = useState([]);
  const [protocols, setProtocols] = useState({});
  const [devDlg, setDevDlg] = useState({ open: false, device: null });
  const [tagDlg, setTagDlg] = useState({ open: false, tag: null });
  const [tab, setTab] = useState("devices");
  const [tests, setTests] = useState({});
  const live = useLive(`/projects/${id}/rt`, !!project);

  const load = () => Promise.all([api.get(`/projects/${id}`), api.get(`/projects/${id}/devices`), api.get(`/projects/${id}/tags`), api.get("/meta")])
    .then(([p, d, t, m]) => { setProject(p.data); setDevices(d.data); setTags(t.data); setProtocols(m.data.protocols); })
    .catch((e) => toast.error(errMsg(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const test = async (d) => {
    const t = toast.loading("Menguji koneksi...");
    try {
      const { data } = await api.post(`/devices/${d.id}/test`);
      setTests((s) => ({ ...s, [d.id]: data }));
      toast[data.ok ? "success" : "error"](data.message, { id: t });
    } catch (e) { toast.error(errMsg(e), { id: t }); }
  };
  const delDevice = async (d) => { if (!window.confirm(`Hapus perangkat ${d.name} beserta tag-nya?`)) return; await api.delete(`/devices/${d.id}`); load(); };
  const delTag = async (t) => { if (!window.confirm(`Hapus tag ${t.name}?`)) return; await api.delete(`/tags/${t.id}`); load(); };
  const devName = (did) => devices.find((d) => d.id === did)?.name || "-";

  if (!project) return <div className="h-screen grid place-items-center bg-[#0B0F17] text-slate-500 font-mono text-sm">Memuat...</div>;
  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100">
      <header className="sticky top-0 z-20 h-12 flex items-center gap-2 px-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <Link to="/projects" data-testid="config-back-link" className="h-8 w-8 grid place-items-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-sm"><ArrowLeft size={16} /></Link>
        <span className="font-heading font-bold text-sm">{project.name}</span>
        <nav className="flex items-center ml-4 text-xs">
          <Link to={`/projects/${id}/editor`} data-testid="nav-editor-link" className="px-3 h-8 flex items-center gap-1.5 text-slate-400 hover:text-white"><LayoutDashboard size={13} />Layar HMI</Link>
          {[["devices", "Perangkat & Tag"], ["library", "Library Alamat"], ["data", "Data & Alarm"], ["security", "Keamanan"], ["settings", "Pengaturan"]].map(([k, l]) => (
            <button key={k} data-testid={`config-tab-${k}`} onClick={() => setTab(k)} className={`px-3 h-8 border-b-2 transition-colors ${tab === k ? "border-blue-500 text-white font-semibold" : "border-transparent text-slate-400 hover:text-white"}`}>{l}</button>
          ))}
        </nav>
        <span className="flex-1" />
        <span className={`text-[11px] font-mono flex items-center gap-1 ${live.snap.active_alarms ? "text-red-400" : "text-slate-500"}`}><Bell size={13} />{live.snap.active_alarms || 0} alarm aktif</span>
      </header>
      {tab !== "devices" && (
        <main className="max-w-7xl mx-auto px-6 lg:px-10 py-10">
          {tab === "library" && <LibraryPanel projectId={id} devices={devices} tags={tags} protocols={protocols} onReload={load} onNewTag={(preset) => setTagDlg({ open: true, tag: null, preset })} onEditTag={(t) => setTagDlg({ open: true, tag: t })} />}
          {tab === "data" && <DataAlarmPanel project={project} tags={tags} onSaved={load} />}
          {tab === "security" && <SecurityPanel project={project} />}
          {tab === "settings" && <SettingsPanel project={project} onSaved={load} />}
        </main>
      )}
      {tab === "devices" && <main className="max-w-7xl mx-auto px-6 lg:px-10 py-10 space-y-12">
        <section className="space-y-5">
          <div className="flex items-end justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">Driver & Koneksi</p><h2 className="font-heading text-2xl font-bold mt-1">Perangkat PLC</h2></div>
            <button data-testid="add-device-btn" onClick={() => setDevDlg({ open: true, device: null })} className="h-9 px-4 flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 rounded-sm"><Plus size={14} />Tambah Perangkat</button>
          </div>
          {devices.length === 0 ? (
            <div className="border border-dashed border-slate-700 p-10 text-center rounded-sm text-slate-400 text-sm"><Server className="mx-auto mb-3 text-slate-600" />Belum ada perangkat. Tambahkan PLC (Siemens S7, Omron, Fatek, Wecon, Haiwell, Weintek, Modbus TCP/RTU).</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {devices.map((d, i) => <DeviceCard key={d.id} d={d} i={i} status={live.snap.devices?.[d.id]} test={tests[d.id]} protocols={protocols} onEdit={(x) => setDevDlg({ open: true, device: x })} onDelete={delDevice} onTest={test} />)}
            </div>
          )}
        </section>
        <section className="space-y-5">
          <div className="flex items-end justify-between">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">Tag Database</p><h2 className="font-heading text-2xl font-bold mt-1">Daftar Tag <span className="text-slate-500 font-mono text-base">({tags.length})</span></h2></div>
            <button data-testid="add-tag-btn" disabled={!devices.length} onClick={() => setTagDlg({ open: true, tag: null })} className="h-9 px-4 flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 rounded-sm disabled:opacity-40"><Plus size={14} />Tambah Tag</button>
          </div>
          <div className="border border-slate-800 rounded-sm overflow-x-auto">
            <table className="w-full text-sm" data-testid="tag-table">
              <thead className="bg-[#111827] text-[10px] uppercase tracking-wider text-slate-400">
                <tr>{["Nama", "Perangkat", "Alamat", "Tipe", "Desimal", "Maks. Kar", "Nilai Live", "Alarm", ""].map((h) => <th key={h} className="text-left px-4 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {tags.map((t, i) => (
                  <tr key={t.id} data-testid={`tag-row-${i}`} className="border-t border-slate-800 hover:bg-slate-900/60">
                    <td className="px-4 py-2.5 font-medium text-slate-100">{t.name}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{devName(t.device_id)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-cyan-300">{t.address}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{t.data_type}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{t.decimals}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{t.max_chars}</td>
                    <td className={`px-4 py-2.5 font-mono font-semibold ${live.snap.quality?.[t.id] === "bad" ? "text-amber-400" : "text-emerald-400"}`} data-testid={`tag-live-${i}`}>{formatValue(live.snap.values[t.id], t.data_type, t.decimals)} <span className="text-slate-500 text-xs font-normal">{t.unit}</span>{live.snap.quality?.[t.id] === "bad" && <span data-testid={`tag-bad-${i}`} className="ml-2 text-[9px] px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/40 text-amber-300 rounded-sm">BAD/OFFLINE</span>}</td>
                    <td className="px-4 py-2.5 text-xs">{t.alarm_enabled ? <span className="text-amber-400 font-mono">{t.data_type === "BOOL" ? "BOOL" : ["hh", "h", "l", "ll"].filter((k) => t[k] != null).map((k) => k.toUpperCase()).join("/")}</span> : <span className="text-slate-600">-</span>}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button data-testid={`tag-edit-${i}`} onClick={() => setTagDlg({ open: true, tag: t })} className="h-7 w-7 inline-grid place-items-center hover:bg-slate-800 rounded-sm text-slate-400 hover:text-white"><Pencil size={13} /></button>
                      <button data-testid={`tag-delete-${i}`} onClick={() => delTag(t)} className="h-7 w-7 inline-grid place-items-center hover:bg-red-900 rounded-sm text-slate-400 hover:text-white"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
                {!tags.length && <tr><td colSpan={9} className="text-center py-10 text-slate-500 text-sm">Belum ada tag</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>}
      <DeviceDialog open={devDlg.open} onOpenChange={(o) => setDevDlg({ ...devDlg, open: o })} projectId={id} device={devDlg.device} protocols={protocols} onSaved={() => { setDevDlg({ open: false, device: null }); load(); }} />
      <TagDialog open={tagDlg.open} onOpenChange={(o) => setTagDlg({ ...tagDlg, open: o })} projectId={id} tag={tagDlg.tag} preset={tagDlg.preset} devices={devices} protocols={protocols} onSaved={() => { setTagDlg({ open: false, tag: null }); load(); }} />
    </div>
  );
}
