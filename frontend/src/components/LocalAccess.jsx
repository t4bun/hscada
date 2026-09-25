import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Wifi, Copy } from "lucide-react";
import { api } from "@/lib/api";

export const LocalAccess = () => {
  const [info, setInfo] = useState(null);
  useEffect(() => { api.get("/system/info").then((r) => setInfo(r.data)).catch(() => {}); }, []);
  if (!info || info.mode !== "local") return null;
  const urls = info.urls.length ? info.urls : [info.local_url];
  const copy = (u) => { navigator.clipboard?.writeText(u); toast.success("Alamat disalin"); };
  return (
    <section data-testid="local-access-card" className="border border-emerald-700/50 bg-emerald-950/20 rounded-sm p-5 flex flex-col md:flex-row md:items-center gap-4 hmi-rise">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 grid place-items-center bg-emerald-600/20 text-emerald-400 rounded-sm"><Wifi size={18} /></span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">Mode Lokal · {info.hostname}</p>
          <p className="text-sm text-slate-300">Buka dari PC, tablet, atau HP di jaringan pabrik:</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:ml-auto">
        {urls.map((u, i) => (
          <button key={u} data-testid={`local-url-${i}`} onClick={() => copy(u)} className="h-9 px-3 font-mono text-sm text-emerald-300 bg-[#0B0F17] border border-slate-700 hover:border-emerald-500 rounded-sm flex items-center gap-2 transition-colors">
            {u}<Copy size={12} />
          </button>
        ))}
      </div>
    </section>
  );
};
