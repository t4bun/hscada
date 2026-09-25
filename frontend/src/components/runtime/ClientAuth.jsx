import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, UserCircle2, KeyRound, Users, LogOut } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { api, errMsg } from "@/lib/api";
import { UsersManager } from "@/components/security/UsersManager";

const inputCls = "w-full h-11 bg-[#0B0F17] border border-slate-700 rounded-sm px-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500";

export const LoginGate = ({ slug, name, onLoggedIn }) => {
  const [f, setF] = useState({ username: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { const { data } = await api.post(`/public/${slug}/auth/login`, f); onLoggedIn(data.token); } catch (er) { setErr(errMsg(er)); }
    setBusy(false);
  };
  return (
    <div className="h-screen grid place-items-center bg-[#05070B] hmi-dots p-6" data-testid="client-login">
      <form onSubmit={submit} className="w-full max-w-sm bg-[#111827] border border-slate-800 p-8 rounded-sm space-y-5 hmi-rise">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 grid place-items-center bg-blue-600 rounded-sm"><Lock size={18} /></span>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">Operator Login</p><h1 className="font-heading font-bold text-lg text-white">{name}</h1></div>
        </div>
        <input data-testid="client-username-input" className={inputCls} placeholder="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} required />
        <input data-testid="client-password-input" type="password" className={inputCls} placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        {err && <p data-testid="client-login-error" className="text-sm text-red-400 border-l-2 border-red-500 pl-3">{err}</p>}
        <button data-testid="client-login-btn" disabled={busy} className="w-full h-11 bg-blue-600 hover:bg-blue-700 rounded-sm text-sm font-semibold text-white disabled:opacity-60">{busy ? "Memproses..." : "Masuk"}</button>
      </form>
    </div>
  );
};

const PasswordDialog = ({ open, onOpenChange, slug }) => {
  const [f, setF] = useState({ old_password: "", new_password: "", confirm: "" });
  const submit = async (e) => {
    e.preventDefault();
    if (f.new_password !== f.confirm) return toast.error("Konfirmasi password tidak cocok");
    try { await api.post(`/public/${slug}/auth/password`, f); toast.success("Password diganti"); onOpenChange(false); setF({ old_password: "", new_password: "", confirm: "" }); } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-sm">
        <DialogHeader><DialogTitle className="font-heading">Ganti Password</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3" data-testid="change-password-form">
          {[["old_password", "Password lama"], ["new_password", "Password baru"], ["confirm", "Ulangi password baru"]].map(([k, l]) => (
            <input key={k} data-testid={`pw-${k}`} type="password" required minLength={k === "old_password" ? 1 : 4} placeholder={l} className={inputCls} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          ))}
          <button data-testid="pw-submit" className="w-full h-10 bg-blue-600 hover:bg-blue-700 rounded-sm text-sm font-semibold">Simpan</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const ManageDialog = ({ open, onOpenChange, slug }) => {
  const [data, setData] = useState({ users: [], groups: [] });
  const base = `/public/${slug}/auth/users`;
  const load = () => api.get(base).then((r) => setData(r.data)).catch((e) => toast.error(errMsg(e)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) load(); }, [open]);
  const wrap = (fn) => async (...a) => { await fn(...a); await load(); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-3xl">
        <DialogHeader><DialogTitle className="font-heading">Kelola User (group di bawah level Anda)</DialogTitle></DialogHeader>
        <UsersManager users={data.users} groups={data.groups}
          onCreate={wrap((f) => api.post(base, f))} onUpdate={wrap((id, f) => api.put(`${base}/${id}`, f))} onDelete={wrap((id) => api.delete(`${base}/${id}`))} />
      </DialogContent>
    </Dialog>
  );
};

export const UserMenu = ({ slug, session, onLogout }) => {
  const [pw, setPw] = useState(false);
  const [mg, setMg] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger data-testid="runtime-user-menu" className="flex items-center gap-1 text-[11px] font-mono text-slate-200 px-1 outline-none">
          <UserCircle2 size={14} />{session.user.username}<span className="text-cyan-400">·{session.group.name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-[#111827] border-slate-700 text-slate-200">
          <DropdownMenuLabel className="text-[10px] text-slate-500">Level {session.group.level} · {session.group.can_operate ? "Operasi" : "Monitor"}</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-slate-800" />
          <DropdownMenuItem data-testid="menu-change-password" onClick={() => setPw(true)}><KeyRound size={13} className="mr-2" />Ganti Password</DropdownMenuItem>
          {session.group.can_manage_users && <DropdownMenuItem data-testid="menu-manage-users" onClick={() => setMg(true)}><Users size={13} className="mr-2" />Kelola User</DropdownMenuItem>}
          <DropdownMenuItem data-testid="menu-logout" onClick={onLogout}><LogOut size={13} className="mr-2" />Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PasswordDialog open={pw} onOpenChange={setPw} slug={slug} />
      {session.group.can_manage_users && <ManageDialog open={mg} onOpenChange={setMg} slug={slug} />}
    </>
  );
};
