import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Server, RefreshCw, Shuffle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";

const inputCls = "w-full h-9 bg-[#0B0F17] border border-slate-700 rounded-sm px-2 text-sm text-slate-100 font-mono focus:outline-none focus:border-blue-500";
const Lbl = ({ t, hint, children }) => (
  <label className="block space-y-1">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
  </label>
);
const rnd = () => `eng-${Math.random().toString(36).slice(2, 8)}`;
const seg = () => window.location.pathname.split("/")[1] || "";

export const ServerSettingsDialog = ({ open, onOpenChange, projects }) => {
  const [s, setS] = useState(null);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setRes(null); api.get("/system/settings").then((r) => setS(r.data)).catch((e) => toast.error(errMsg(e))); } }, [open]);
  if (!s) return null;
  const set = (k) => (v) => setS({ ...s, [k]: v?.target ? v.target.value : v });
  const local = s.mode === "local";
  const published = projects.filter((p) => p.published);
  const sfx = Number(s.http_port) === 80 ? "" : `:${s.http_port}`;
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/system/settings", { ...s, http_port: Number(s.http_port) });
      setRes(data);
      toast.success("Pengaturan server disimpan");
      const want = data.hide_engineer ? data.engineer_path : "";
      const cur = seg() === "projects" ? "" : seg();
      if (!data.restart_required && want !== cur) {
        toast.info("Mengalihkan ke alamat engineer baru...");
        setTimeout(() => { window.location.href = want ? `/${want}/projects` : "/projects"; }, 1500);
      }
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const restart = async () => {
    try {
      await api.post("/system/restart");
      toast.info("Layanan direstart, tunggu sebentar...");
      const path = res.hide_engineer ? `/${res.engineer_path}/projects` : "/projects";
      setTimeout(() => { window.location.href = `${window.location.protocol}//${window.location.hostname}:${res.http_port}${path}`; }, 7000);
    } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="server-settings-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2"><Server size={18} />Pengaturan Server & Alamat Lokal</DialogTitle>
          <DialogDescription className="text-slate-400">Atur alamat operator, halaman engineer rahasia, nama jaringan, dan port.</DialogDescription>
        </DialogHeader>
        {!local && <p data-testid="server-cloud-note" className="text-[11px] text-amber-200/90 bg-amber-500/5 border border-amber-500/30 p-2 rounded-sm">Mode cloud: nama .local, domain, dan port hanya berlaku di versi lokal (PC pabrik). Path engineer dan project default tetap berlaku.</p>}
        <section className="space-y-3 border border-slate-800 rounded-sm p-4">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-sm">Sembunyikan Halaman Engineer</p><p className="text-xs text-slate-500">Operator yang membuka alamat utama langsung melihat runtime. Project manager hanya lewat path rahasia.</p></div>
            <Switch data-testid="server-hide-switch" checked={!!s.hide_engineer} onCheckedChange={(v) => setS({ ...s, hide_engineer: v, engineer_path: s.engineer_path || rnd() })} />
          </div>
          {s.hide_engineer && (
            <Lbl t="Path Rahasia Engineer" hint={`Halaman engineer: ${window.location.origin}/${s.engineer_path || "..."}/projects — simpan alamat ini!`}>
              <div className="flex gap-1">
                <input data-testid="server-engineer-path" className={inputCls} value={s.engineer_path} onChange={(e) => set("engineer_path")(e.target.value.toLowerCase())} />
                <button type="button" data-testid="server-path-random" title="Acak" onClick={() => set("engineer_path")(rnd())} className="h-9 w-9 shrink-0 grid place-items-center bg-slate-800 hover:bg-slate-700 rounded-sm"><Shuffle size={14} /></button>
              </div>
            </Lbl>
          )}
          <Lbl t="Project Default di Alamat Utama" hint="Runtime project ini tampil saat operator membuka alamat utama.">
            <select data-testid="server-default-project" className={inputCls} value={s.default_slug} onChange={set("default_slug")}>
              <option value="">— tidak ada —</option>
              {published.map((p) => <option key={p.id} value={p.publish_slug}>{p.name}</option>)}
            </select>
          </Lbl>
        </section>
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-slate-800 rounded-sm p-4">
          <Lbl t="Nama .local (mDNS)" hint={s.mdns_name ? `http://${s.mdns_name}.local${sfx}` : "Otomatis di Windows/iPhone/Android"}>
            <input data-testid="server-mdns-input" className={inputCls} placeholder="scada-pabrik" value={s.mdns_name} onChange={set("mdns_name")} />
          </Lbl>
          <Lbl t="Domain Custom" hint={s.custom_domain ? `http://${s.custom_domain}${sfx}` : "Perlu DNS router"}>
            <input data-testid="server-domain-input" className={inputCls} placeholder="scada.pabrik" value={s.custom_domain} onChange={set("custom_domain")} />
          </Lbl>
          <Lbl t="Port HTTP" hint={`Berjalan di port ${s.running_port}`}>
            <input data-testid="server-port-input" type="number" min={1} max={65535} className={inputCls} value={s.http_port} onChange={(e) => set("http_port")(e.target.value)} />
          </Lbl>
          {s.custom_domain && (
            <p data-testid="server-dns-guide" className="md:col-span-3 text-[11px] text-slate-400 bg-[#0B0F17] border border-slate-800 p-2 rounded-sm">
              Agar <b className="text-slate-200">{s.custom_domain}</b> bisa dibuka dari HP/PC lain: di router/DNS pabrik tambahkan record <span className="font-mono text-cyan-300">{s.custom_domain} → {s.lan_ips?.[0] || "IP PC server"}</span>. File hosts PC server diisi otomatis.
            </p>
          )}
        </section>
        {res && (
          <div data-testid="server-save-result" className="space-y-2 text-xs">
            {res.urls?.length > 0 && <div className="flex flex-wrap gap-1.5">{res.urls.map((u) => <span key={u} className="font-mono px-2 py-1 bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 rounded-sm">{u}</span>)}</div>}
            {res.notes?.map((n) => <p key={n} className="text-slate-400">{n}</p>)}
            {res.restart_required && (
              <button data-testid="server-restart-btn" onClick={restart} className="h-9 px-4 flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 rounded-sm font-semibold"><RefreshCw size={14} />Restart Layanan (port {res.http_port})</button>
            )}
          </div>
        )}
        <button data-testid="server-save-btn" disabled={busy} onClick={save} className="h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-sm text-sm font-semibold">{busy ? "Menyimpan..." : "Simpan Pengaturan Server"}</button>
      </DialogContent>
    </Dialog>
  );
};
