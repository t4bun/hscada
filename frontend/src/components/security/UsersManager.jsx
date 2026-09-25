import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { errMsg } from "@/lib/api";

const inputCls = "w-full h-8 bg-[#0B0F17] border border-slate-700 rounded-sm px-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500";
const EMPTY = { username: "", full_name: "", password: "", group_id: "", active: true };

const Editor = ({ init, groups, onSave, onCancel, isNew }) => {
  const [f, setF] = useState({ ...EMPTY, group_id: groups[groups.length - 1]?.id || "", ...init, password: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <tr className="bg-slate-900/80">
      <td className="p-1"><input data-testid="user-form-username" className={inputCls} value={f.username} onChange={set("username")} placeholder="username" /></td>
      <td className="p-1"><input data-testid="user-form-fullname" className={inputCls} value={f.full_name} onChange={set("full_name")} placeholder="nama" /></td>
      <td className="p-1">
        <select data-testid="user-form-group" className={inputCls} value={f.group_id} onChange={set("group_id")}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name} (L{g.level})</option>)}
        </select>
      </td>
      <td className="p-1"><input data-testid="user-form-password" type="password" className={inputCls} value={f.password} onChange={set("password")} placeholder={isNew ? "password" : "kosong = tetap"} /></td>
      <td className="p-1 text-center"><input type="checkbox" className="accent-blue-500" checked={f.active} onChange={set("active")} /></td>
      <td className="p-1 text-right whitespace-nowrap">
        <button data-testid="user-form-save" onClick={() => onSave({ ...f, password: f.password || null })} className="h-7 w-7 inline-grid place-items-center bg-blue-600 hover:bg-blue-700 rounded-sm"><Check size={13} /></button>
        <button onClick={onCancel} className="h-7 w-7 inline-grid place-items-center hover:bg-slate-800 rounded-sm ml-1"><X size={13} /></button>
      </td>
    </tr>
  );
};

export const UsersManager = ({ users, groups, onCreate, onUpdate, onDelete }) => {
  const [edit, setEdit] = useState(null);
  const gname = (id) => groups.find((g) => g.id === id)?.name || "—";
  const run = async (fn) => { try { await fn(); setEdit(null); toast.success("Tersimpan"); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="border border-slate-800 rounded-sm overflow-x-auto" data-testid="users-manager">
      <table className="w-full text-xs">
        <thead className="bg-[#111827] text-[10px] uppercase tracking-wider text-slate-400">
          <tr>{["Username", "Nama", "Group", "Password", "Aktif", ""].map((h) => <th key={h} className="text-left px-2 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {users.map((u, i) => edit === u.id ? (
            <Editor key={u.id} init={u} groups={groups} onCancel={() => setEdit(null)} onSave={(f) => run(() => onUpdate(u.id, f))} />
          ) : (
            <tr key={u.id} data-testid={`user-row-${i}`} className="border-t border-slate-800">
              <td className="px-2 py-2 font-mono text-slate-100">{u.username}</td>
              <td className="px-2 py-2 text-slate-300">{u.full_name}</td>
              <td className="px-2 py-2 text-cyan-300">{gname(u.group_id)}</td>
              <td className="px-2 py-2 text-slate-600">••••••</td>
              <td className="px-2 py-2">{u.active ? <span className="text-emerald-400">Ya</span> : <span className="text-slate-500">Tidak</span>}</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                <button data-testid={`user-edit-${i}`} onClick={() => setEdit(u.id)} className="h-7 w-7 inline-grid place-items-center hover:bg-slate-800 rounded-sm"><Pencil size={12} /></button>
                <button data-testid={`user-delete-${i}`} onClick={() => window.confirm(`Hapus user ${u.username}?`) && run(() => onDelete(u.id))} className="h-7 w-7 inline-grid place-items-center hover:bg-red-900 rounded-sm"><Trash2 size={12} /></button>
              </td>
            </tr>
          ))}
          {edit === "new" && <Editor isNew init={{}} groups={groups} onCancel={() => setEdit(null)} onSave={(f) => run(() => onCreate(f))} />}
          {!users.length && edit !== "new" && <tr><td colSpan={6} className="text-center py-6 text-slate-500">Belum ada user</td></tr>}
        </tbody>
      </table>
      {edit !== "new" && groups.length > 0 && (
        <button data-testid="user-add-btn" onClick={() => setEdit("new")} className="w-full h-9 text-xs flex items-center justify-center gap-1 border-t border-slate-800 text-slate-300 hover:bg-slate-800"><Plus size={13} />Tambah User</button>
      )}
    </div>
  );
};
