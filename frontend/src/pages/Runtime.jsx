import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Maximize, Minimize, BellRing, Wifi, WifiOff, MonitorPlay } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { RtContext, useLive, useFonts } from "@/hooks/useLive";
import { ScreenView } from "@/components/widgets/Widget";

const useFit = (w, h) => {
  const calc = () => Math.min(window.innerWidth / w, window.innerHeight / h);
  const [s, setS] = useState(1);
  useEffect(() => {
    const on = () => setS(calc());
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);
  return s;
};

export default function Runtime({ mode }) {
  const { id, slug } = useParams();
  const [app, setApp] = useState(null);
  const [error, setError] = useState("");
  const [screenId, setScreenId] = useState(null);
  const [fs, setFs] = useState(false);
  const base = mode === "public" ? `/public/${slug}/rt` : `/projects/${id}/rt`;

  useEffect(() => {
    const load = mode === "public"
      ? api.get(`/public/${slug}`).then((r) => r.data)
      : Promise.all([api.get(`/projects/${id}`), api.get(`/projects/${id}/tags`)]).then(([p, t]) => ({ ...p.data, tags: t.data, allow_operate: true }));
    load.then((d) => { setApp(d); setScreenId(d.screens?.[0]?.id); document.title = d.name; }).catch((e) => setError(errMsg(e)));
  }, [mode, id, slug]);

  const live = useLive(base, !!app);
  useFonts(app?.fonts);
  const scale = useFit(app?.width || 1280, app?.height || 720);
  const tagMap = useMemo(() => Object.fromEntries((app?.tags || []).map((t) => [t.id, t])), [app]);
  const rt = useMemo(() => ({
    values: live.snap.values, ts: live.snap.ts, tagMap, mode: "run", allowOperate: !!app?.allow_operate,
    write: live.write, base, gotoScreen: (sid) => sid && setScreenId(sid),
  }), [live.snap, tagMap, app, live.write, base]);

  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  if (error) return (
    <div className="h-screen grid place-items-center bg-[#090D14] text-center p-6" data-testid="runtime-error">
      <div><MonitorPlay className="mx-auto text-slate-600 mb-4" size={40} /><p className="font-heading text-xl text-slate-200">{error}</p><p className="text-sm text-slate-500 mt-2">Hubungi engineer Anda untuk mempublish ulang aplikasi.</p></div>
    </div>
  );
  if (!app) return <div className="h-screen grid place-items-center bg-[#090D14] text-slate-500 font-mono text-sm">Memuat aplikasi...</div>;
  const screen = app.screens.find((s) => s.id === screenId) || app.screens[0];

  return (
    <RtContext.Provider value={rt}>
      <div className="w-screen h-screen bg-[#05070B] overflow-hidden relative grid place-items-center" data-testid="runtime-viewer">
        <div style={{ width: app.width * scale, height: app.height * scale }}>
          <div className="origin-top-left" style={{ transform: `scale(${scale})`, width: app.width, height: app.height }}>
            <ScreenView screen={screen} width={app.width} height={app.height} />
          </div>
        </div>
        <div className="fixed top-2 right-2 flex items-center gap-1 bg-slate-900/70 backdrop-blur-md border border-slate-700/60 rounded-sm px-1.5 py-1 opacity-40 hover:opacity-100 transition-opacity" data-testid="runtime-toolbar">
          {mode === "preview" && <span className="text-[10px] font-mono text-amber-400 px-1">PREVIEW</span>}
          {!app.allow_operate && <span className="text-[10px] font-mono text-slate-400 px-1" data-testid="runtime-readonly-badge">READ-ONLY</span>}
          <select data-testid="runtime-screen-select" value={screen.id} onChange={(e) => setScreenId(e.target.value)} className="bg-transparent text-xs text-slate-200 outline-none">
            {app.screens.map((s) => <option key={s.id} value={s.id} className="bg-slate-900">{s.name}</option>)}
          </select>
          <span data-testid="runtime-alarm-count" className={`flex items-center gap-1 text-[11px] font-mono px-1 ${live.snap.active_alarms ? "text-red-400 animate-pulse" : "text-slate-500"}`}><BellRing size={13} />{live.snap.active_alarms || 0}</span>
          <span data-testid="runtime-conn" className={live.online ? "text-emerald-400 px-1" : "text-red-400 px-1"}>{live.online ? <Wifi size={14} /> : <WifiOff size={14} />}</span>
          <button data-testid="runtime-fullscreen-btn" onClick={() => (fs ? document.exitFullscreen() : document.documentElement.requestFullscreen())} className="text-slate-300 hover:text-white px-1">
            {fs ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>
      </div>
    </RtContext.Provider>
  );
}
