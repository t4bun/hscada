import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Maximize, Minimize, BellRing, Wifi, WifiOff, MonitorPlay, X } from "lucide-react";
import { api, errMsg, setClientToken } from "@/lib/api";
import { RtContext, useLive, useFonts } from "@/hooks/useLive";
import { ScreenView } from "@/components/widgets/Widget";
import { LoginGate, UserMenu } from "@/components/runtime/ClientAuth";

const useFit = (w, h) => {
  const [s, setS] = useState(1);
  useEffect(() => {
    const on = () => setS(Math.min(window.innerWidth / w, window.innerHeight / h));
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [w, h]);
  return s;
};

const useIdle = (enabled, minutes) => {
  const [idle, setIdle] = useState(false);
  const last = useRef(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const act = () => { last.current = Date.now(); setIdle(false); };
    const evs = ["pointerdown", "pointermove", "keydown", "wheel"];
    evs.forEach((e) => window.addEventListener(e, act));
    const t = setInterval(() => { if (Date.now() - last.current > Math.max(0.1, Number(minutes) || 5) * 60000) setIdle(true); }, 2000);
    return () => { evs.forEach((e) => window.removeEventListener(e, act)); clearInterval(t); };
  }, [enabled, minutes]);
  return idle;
};

const ScreenSaver = ({ name }) => {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black grid place-items-center cursor-pointer" data-testid="screen-saver">
      <div className="text-center hmi-rise">
        <p className="font-mono text-7xl text-slate-300 tabular-nums">{now.toLocaleTimeString("id-ID", { hour12: false })}</p>
        <p className="text-slate-500 mt-3 text-sm tracking-[0.3em] uppercase">{name}</p>
        <p className="text-slate-700 mt-10 text-xs">Sentuh layar untuk melanjutkan</p>
      </div>
    </div>
  );
};

const Subscreen = ({ screen, onClose }) => (
  <div className="absolute inset-0 z-20 grid place-items-center bg-black/50" data-testid="subscreen-overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="shadow-[0_20px_60px_#000] border border-slate-600 hmi-rise">
      <div className="h-7 flex items-center justify-between px-2 bg-[#1E293B] text-xs font-semibold text-slate-200">
        <span>{screen.name}</span>
        <button data-testid="subscreen-close-btn" onClick={onClose} className="hover:text-white"><X size={14} /></button>
      </div>
      <ScreenView screen={screen} width={screen.popup_width || 480} height={screen.popup_height || 320} />
    </div>
  </div>
);

export default function Runtime({ mode }) {
  const { id, slug } = useParams();
  const tokenKey = `hmi_client_${slug}`;
  const [app, setApp] = useState(null);
  const [needLogin, setNeedLogin] = useState(null);
  const [error, setError] = useState("");
  const [screenId, setScreenId] = useState(null);
  const [subId, setSubId] = useState(null);
  const [fs, setFs] = useState(false);
  const base = mode === "public" ? `/public/${slug}/rt` : `/projects/${id}/rt`;

  const load = useCallback(() => {
    if (mode === "public") setClientToken(localStorage.getItem(tokenKey));
    const req = mode === "public"
      ? api.get(`/public/${slug}`).then((r) => r.data)
      : Promise.all([api.get(`/projects/${id}`), api.get(`/projects/${id}/tags`)]).then(([p, t]) => ({ ...p.data, tags: t.data, allow_operate: true }));
    req.then((d) => {
      document.title = d.name;
      if (d.requires_login) { setNeedLogin(d.name); setApp(null); return; }
      setNeedLogin(null);
      const allowed = (sid) => !d.session || !d.session.group.screens?.length || d.session.group.screens.includes(sid);
      const init = d.settings?.initial_screen;
      const first = d.screens.find((s) => s.id === init && allowed(s.id)) || d.screens.find((s) => s.type !== "popup" && allowed(s.id)) || d.screens[0];
      setApp(d); setScreenId(first?.id); setSubId(null);
    }).catch((e) => setError(errMsg(e)));
  }, [mode, id, slug, tokenKey]);
  useEffect(() => { load(); }, [load]);

  const live = useLive(base, !!app);
  useFonts(app?.fonts);
  const scale = useFit(app?.width || 1280, app?.height || 720);
  const idle = useIdle(!!app?.settings?.screen_saver_enabled, app?.settings?.screen_saver_minutes);
  const session = app?.session;
  const group = session?.group;

  const nav = useMemo(() => {
    if (!app) return {};
    const allowed = (sid) => !group || !group.screens?.length || group.screens.includes(sid);
    const guard = (sid, fn) => {
      if (!app.screens.some((s) => s.id === sid)) return;
      if (!allowed(sid)) return toast.error("Akses layar ditolak untuk group Anda");
      fn();
    };
    const mains = app.screens.filter((s) => s.type !== "popup" && allowed(s.id));
    const step = (d) => setScreenId((cur) => {
      const i = mains.findIndex((s) => s.id === cur);
      return mains.length ? mains[(i + d + mains.length) % mains.length].id : cur;
    });
    return {
      openScreen: (sid) => guard(sid, () => { setScreenId(sid); setSubId(null); }),
      openSub: (sid) => guard(sid, () => setSubId(sid)),
      closeSub: () => setSubId(null),
      prevScreen: () => { setSubId(null); step(-1); },
      nextScreen: () => { setSubId(null); step(1); },
      allowed, mains,
    };
  }, [app, group]);

  const tagMap = useMemo(() => Object.fromEntries((app?.tags || []).map((t) => [t.id, t])), [app]);
  const rt = useMemo(() => ({
    values: live.snap.values, ts: live.snap.ts, tagMap, mode: "run",
    allowOperate: !!app?.allow_operate && (!group || group.can_operate), canAck: !group || group.can_ack,
    level: group ? group.level : 99, write: live.write, base, gotoScreen: nav.openScreen, ...nav,
  }), [live.snap, tagMap, app, group, live.write, base, nav]);

  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const loginOk = (token) => { localStorage.setItem(tokenKey, token); load(); };
  const logout = () => { localStorage.removeItem(tokenKey); setClientToken(null); load(); };

  if (error) return (
    <div className="h-screen grid place-items-center bg-[#090D14] text-center p-6" data-testid="runtime-error">
      <div><MonitorPlay className="mx-auto text-slate-600 mb-4" size={40} /><p className="font-heading text-xl text-slate-200">{error}</p><p className="text-sm text-slate-500 mt-2">Hubungi engineer Anda untuk mempublish ulang aplikasi.</p></div>
    </div>
  );
  if (needLogin) return <LoginGate slug={slug} name={needLogin} onLoggedIn={loginOk} />;
  if (!app) return <div className="h-screen grid place-items-center bg-[#090D14] text-slate-500 font-mono text-sm">Memuat aplikasi...</div>;
  const screen = app.screens.find((s) => s.id === screenId) || app.screens[0];
  const sub = app.screens.find((s) => s.id === subId);

  return (
    <RtContext.Provider value={rt}>
      <div className="w-screen h-screen bg-[#05070B] overflow-hidden relative grid place-items-center" data-testid="runtime-viewer">
        <div style={{ width: app.width * scale, height: app.height * scale }}>
          <div className="origin-top-left relative" style={{ transform: `scale(${scale})`, width: app.width, height: app.height }}>
            <ScreenView screen={screen} width={app.width} height={app.height} />
            {sub && <Subscreen screen={sub} onClose={() => setSubId(null)} />}
          </div>
        </div>
        <div className="fixed top-2 right-2 flex items-center gap-1 bg-slate-900/70 backdrop-blur-md border border-slate-700/60 rounded-sm px-1.5 py-1 opacity-50 hover:opacity-100 transition-opacity z-30" data-testid="runtime-toolbar">
          {mode === "preview" && <span className="text-[10px] font-mono text-amber-400 px-1">PREVIEW</span>}
          {!rt.allowOperate && <span className="text-[10px] font-mono text-slate-400 px-1" data-testid="runtime-readonly-badge">READ-ONLY</span>}
          <select data-testid="runtime-screen-select" value={screen.id} onChange={(e) => nav.openScreen(e.target.value)} className="bg-transparent text-xs text-slate-200 outline-none">
            {nav.mains.map((s) => <option key={s.id} value={s.id} className="bg-slate-900">{s.name}</option>)}
          </select>
          <span data-testid="runtime-alarm-count" className={`flex items-center gap-1 text-[11px] font-mono px-1 ${live.snap.active_alarms ? "text-red-400 animate-pulse" : "text-slate-500"}`}><BellRing size={13} />{live.snap.active_alarms || 0}</span>
          <span data-testid="runtime-conn" className={live.online ? "text-emerald-400 px-1" : "text-red-400 px-1"}>{live.online ? <Wifi size={14} /> : <WifiOff size={14} />}</span>
          {session && <UserMenu slug={slug} session={session} onLogout={logout} />}
          <button data-testid="runtime-fullscreen-btn" onClick={() => (fs ? document.exitFullscreen() : document.documentElement.requestFullscreen())} className="text-slate-300 hover:text-white px-1">
            {fs ? <Minimize size={14} /> : <Maximize size={14} />}
          </button>
        </div>
        {idle && <ScreenSaver name={app.name} />}
      </div>
    </RtContext.Provider>
  );
}
