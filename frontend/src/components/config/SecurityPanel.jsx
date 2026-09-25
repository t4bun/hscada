import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Save, Trash2, ShieldCheck } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { UsersManager } from "@/components/security/UsersManager";

const inputCls = "h-8 bg-[#0B0F17] border border-slate-700 rounded-sm px-2 text-xs text-slate-100";

const GroupRow = ({ g, i, screens, onSave, onDelete }) => {
  const [f, setF] = useState(g);
  useEffect(() => setF(g), [g]);
  const chk = (k) => <input type="checkbox" data-testid={`group-${k}-${i}`} className="accent-blue-500" checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />;
  return (
    <tr className="border-t border-slate-800 align-top" data-testid={`group-row-${i}`}>
      <td className="p-2"><input data-testid={`group-name-${i}`} className={`${inputCls} w-36`} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></td>
      <td className="p-2"><input data-testid={`group-level-${i}`} type="number" className={`${inputCls} w-16`} value={f.level} onChange={(e) => setF({ ...f, level: Number(e.target.value) })} /></td>
      <td className="p-2 text-center">{chk("can_operate")}</td>
      <td className="p-2 text-center">{chk("can_ack")}</td>
      <td className="p-2 text-center">{chk("can_manage_users")}</td>
      <td className="p-2">
        <div className="flex flex-wrap gap-1 max-w-xs">
          {screens.map((s) => {
            const on = (f.screens || []).includes(s.id);
            return <button key={s.id} type="button" onClick={() => setF({ ...f, screens: on ? f.screens.filter((x) => x !== s.id) : [...(f.screens || []), s.id] })}
              className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${on ? "border-blue-500 bg-blue-600/20 text-white" : "border-slate-700 text-slate-500"}`}>{s.name}</button>;
          })}
        </div>
        <p className="text-[10px] text-slate-600 mt-1">{f.screens?.length ? "Hanya layar terpilih" : "Semua layar"}</p>
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <button data-testid={`group-save-${i}`} onClick={() => onSave(f)} className="h-7 w-7 inline-grid place-items-center bg-slate-800 hover:bg-blue-600 rounded-sm"><Save size={12} /></button>
        <button data-testid={`group-delete-${i}`} onClick={() => onDelete(g)} className="h-7 w-7 inline-grid place-items-center hover:bg-red-900 rounded-sm ml-1"><Trash2 size={12} /></button>
      </td>
    </tr>
  );
};

export const SecurityPanel = ({ project }) => {
  const [data, setData] = useState({ groups: [], users: [] });
  const base = `/projects/${project.id}/security`;
  const load = () => api.get(base).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [project.id]);
  const run = async (fn, msg) => { try { await fn(); if (msg) toast.success(msg); await load(); } catch (e) { toast.error(errMsg(e)); } };
  const wrap = (fn) => async (...a) => { await fn(...a); await load(); };
  const enabled = project.settings?.security_enabled;
  return (
    <div className="space-y-8" data-testid="security-panel">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">Security</p><h2 className="font-heading text-2xl font-bold mt-1">Login Klien & Group Akses</h2></div>
      <div className={`flex items-center gap-3 border p-4 rounded-sm text-sm ${enabled ? "border-emerald-700 bg-emerald-900/10 text-emerald-300" : "border-amber-700 bg-amber-900/10 text-amber-300"}`} data-testid="security-status">
        <ShieldCheck size={18} />
        {enabled ? "Login klien AKTIF — web app yang dipublish meminta username & password." : "Login klien NONAKTIF. Aktifkan di tab Pengaturan → Security agar web app meminta login."}
      </div>
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h3 className="font-heading font-bold">Group & Hak Akses</h3>
          <button data-testid="add-group-btn" onClick={() => run(() => api.post(`${base}/groups`, { name: "Group Baru", level: 0, screens: [] }), "Group ditambahkan")} className="h-8 px-3 flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 rounded-sm"><Plus size={13} />Group</button>
        </div>
        <p className="text-xs text-slate-500">Level lebih tinggi = hak lebih tinggi. Widget dengan "Level Keamanan Min." hanya bisa dioperasikan group dengan level ≥ nilai tersebut. User dengan hak "Kelola User" dapat mengganti passwordnya sendiri dan mengelola user pada group di bawah levelnya.</p>
        <div className="border border-slate-800 rounded-sm overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#111827] text-[10px] uppercase tracking-wider text-slate-400">
              <tr>{["Nama Group", "Level", "Operasi", "ACK Alarm", "Kelola User", "Akses Layar", ""].map((h) => <th key={h} className="text-left px-2 py-2 font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.groups.map((g, i) => (
                <GroupRow key={g.id} g={g} i={i} screens={project.screens}
                  onSave={(f) => run(() => api.put(`${base}/groups/${g.id}`, f), "Group disimpan")}
                  onDelete={(x) => window.confirm(`Hapus group ${x.name}?`) && run(() => api.delete(`${base}/groups/${x.id}`), "Group dihapus")} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="font-heading font-bold">User Klien</h3>
        <UsersManager users={data.users} groups={data.groups}
          onCreate={wrap((f) => api.post(`${base}/users`, f))} onUpdate={wrap((id, f) => api.put(`${base}/users/${id}`, f))} onDelete={wrap((id) => api.delete(`${base}/users/${id}`))} />
      </section>
    </div>
  );
};
