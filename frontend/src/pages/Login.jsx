import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Activity, Cpu, Radio } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const HERO = "https://images.pexels.com/photos/37769419/pexels-photo-37769419.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";
const inputCls = "w-full h-11 bg-[#0B0F17] border border-slate-700 rounded-sm px-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500 transition-colors";

export default function Login() {
  const { user, signIn } = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/projects" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const { data } = await api.post(tab === "login" ? "/auth/login" : "/auth/register", form);
      signIn(data);
      nav("/projects");
    } catch (er) { setErr(errMsg(er)); }
    setBusy(false);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-screen bg-[#0B0F17] grid lg:grid-cols-[1.15fr_1fr]">
      <div className="relative hidden lg:block overflow-hidden">
        <img src={HERO} alt="Control room" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-[#0B0F17]/60" />
        <div className="absolute inset-0 hmi-dots opacity-40" />
        <div className="relative h-full flex flex-col justify-between p-12">
          <div className="flex items-center gap-2 text-slate-200">
            <span className="w-8 h-8 bg-blue-600 grid place-items-center rounded-sm"><Activity size={17} /></span>
            <span className="font-heading font-black tracking-tight text-lg">NUSA<span className="text-blue-400">HMI</span></span>
          </div>
          <div className="max-w-lg space-y-6 hmi-rise">
            <h1 className="font-heading text-4xl sm:text-5xl font-black text-white leading-[1.05] tracking-tight">Rancang layar SCADA Anda. Deploy ke klien dalam satu klik.</h1>
            <p className="text-slate-300 text-base leading-relaxed">Editor HMI drag & drop dengan driver Siemens S7, Omron FINS, dan Modbus TCP untuk Wecon, Haiwell, Weintek.</p>
            <div className="flex flex-wrap gap-2">
              {["S7-1200/1500", "S7-200", "Omron", "Wecon", "Haiwell", "Weintek"].map((p) => (
                <span key={p} className="text-[11px] font-mono px-2 py-1 border border-slate-600 bg-slate-900/60 text-slate-300 rounded-sm">{p}</span>
              ))}
            </div>
          </div>
          <div className="flex gap-8 text-xs font-mono text-slate-400">
            <span className="flex items-center gap-2"><Cpu size={14} className="text-emerald-400" />8 PROTOKOL</span>
            <span className="flex items-center gap-2"><Radio size={14} className="text-cyan-400" />LIVE 1s POLLING</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6 hmi-rise" data-testid="auth-form">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400 mb-2">Engineering Workspace</p>
            <h2 className="font-heading text-2xl font-bold text-white">{tab === "login" ? "Masuk ke Builder" : "Buat Akun Engineer"}</h2>
          </div>
          <div className="grid grid-cols-2 border border-slate-800 rounded-sm p-0.5">
            {[["login", "Masuk"], ["register", "Daftar"]].map(([k, l]) => (
              <button type="button" key={k} data-testid={`auth-tab-${k}`} onClick={() => { setTab(k); setErr(""); }}
                className={`h-9 text-sm rounded-sm transition-colors ${tab === k ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300"}`}>{l}</button>
            ))}
          </div>
          {tab === "register" && (
            <label className="block space-y-1.5"><span className="text-xs text-slate-400">Nama</span><input data-testid="auth-name-input" className={inputCls} value={form.name} onChange={set("name")} /></label>
          )}
          <label className="block space-y-1.5"><span className="text-xs text-slate-400">Email</span><input data-testid="auth-email-input" type="email" required className={inputCls} value={form.email} onChange={set("email")} /></label>
          <label className="block space-y-1.5"><span className="text-xs text-slate-400">Password</span><input data-testid="auth-password-input" type="password" required minLength={6} className={inputCls} value={form.password} onChange={set("password")} /></label>
          {err && <p data-testid="auth-error" className="text-sm text-red-400 border-l-2 border-red-500 pl-3">{err}</p>}
          <button data-testid="auth-submit-btn" disabled={busy} className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-sm transition-colors disabled:opacity-60">
            {busy ? "Memproses..." : tab === "login" ? "Masuk" : "Daftar & Mulai"}
          </button>
          <p className="text-xs text-slate-500">Akun baru otomatis mendapat proyek demo "Pengolahan Air" dengan simulator PLC.</p>
        </form>
      </div>
    </div>
  );
}
