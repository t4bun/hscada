import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { RtContext, useLive, useFonts, useRecords } from "@/hooks/useLive";
import { newWidget } from "@/components/widgets/registry";
import { Canvas } from "@/components/editor/Canvas";
import { Palette } from "@/components/editor/Palette";
import { Inspector } from "@/components/editor/Inspector";
import { PublishDialog } from "@/components/editor/PublishDialog";
import { EditorToolbar, ScreenTabs, StatusBar } from "@/components/editor/EditorChrome";

const snapOf = (p) => JSON.stringify({ screens: p.screens, width: p.width, height: p.height, fonts: p.fonts });

export default function Editor() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [tags, setTags] = useState([]);
  const [devices, setDevices] = useState([]);
  const [screenId, setScreenId] = useState(null);
  const [sel, setSel] = useState([]);
  const [zoom, setZoom] = useState(0.75);
  const [grid, setGrid] = useState(true);
  const [snap, setSnap] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [histState, setHistState] = useState({ idx: 0, len: 1 });
  const hist = useRef({ stack: [], idx: -1 });
  const projRef = useRef(null);
  const clip = useRef(null);
  projRef.current = project;

  const base = `/projects/${id}/rt`;
  const live = useLive(base, !!project);
  const records = useRecords(base, project ? 1 : 0);
  useFonts(project?.fonts);

  useEffect(() => {
    Promise.all([api.get(`/projects/${id}`), api.get(`/projects/${id}/tags`), api.get(`/projects/${id}/devices`)])
      .then(([p, t, d]) => {
        setProject(p.data); setTags(t.data); setDevices(d.data); setScreenId(p.data.screens[0]?.id);
        hist.current = { stack: [snapOf(p.data)], idx: 0 };
      })
      .catch((e) => toast.error(errMsg(e)));
  }, [id]);

  const pushHist = useCallback(() => {
    const h = hist.current, s = snapOf(projRef.current);
    if (h.stack[h.idx] === s) return;
    h.stack = [...h.stack.slice(0, h.idx + 1), s].slice(-60);
    h.idx = h.stack.length - 1;
    setHistState({ idx: h.idx, len: h.stack.length });
  }, []);

  const mutate = useCallback((fn, commit = true) => {
    setProject((p) => ({ ...p, ...fn(p) }));
    setDirty(true);
    if (commit) setTimeout(pushHist, 0);
  }, [pushHist]);

  const travel = (d) => {
    const h = hist.current, n = h.idx + d;
    if (n < 0 || n >= h.stack.length) return;
    h.idx = n;
    setProject((p) => ({ ...p, ...JSON.parse(h.stack[n]) }));
    setHistState({ idx: n, len: h.stack.length });
    setDirty(true);
  };

  const screen = project?.screens.find((s) => s.id === screenId) || project?.screens[0];
  const selWidgets = screen?.widgets.filter((w) => sel.includes(w.id)) || [];
  const widget = sel.length === 1 ? selWidgets[0] : null;
  const setWidgets = (fn, commit = true) =>
    mutate((p) => ({ screens: p.screens.map((s) => (s.id === screen.id ? { ...s, widgets: fn(s.widgets) } : s)) }), commit);
  const updateWidget = (wid, patch, commit = true) => setWidgets((ws) => ws.map((w) => (w.id === wid ? { ...w, ...patch } : w)), commit);
  const updateMany = (map, commit = true) => setWidgets((ws) => ws.map((w) => (map[w.id] ? { ...w, ...map[w.id] } : w)), commit);
  const addMany = (list) => { setWidgets((ws) => [...ws, ...list]); setSel(list.map((w) => w.id)); };
  const addWidget = (w) => addMany([w]);
  const addType = (type) => addWidget(newWidget(type, project.width / 2 - 80, project.height / 2 - 40));
  const cloneList = (list, off = 20) => {
    const gmap = {};
    return JSON.parse(JSON.stringify(list)).map((w) => ({
      ...w, id: crypto.randomUUID(), x: w.x + off, y: w.y + off,
      group: w.group ? (gmap[w.group] ||= crypto.randomUUID()) : undefined,
    }));
  };

  const action = (a) => {
    if (!selWidgets.length) return;
    if (a === "delete") { setWidgets((ws) => ws.filter((x) => !sel.includes(x.id))); setSel([]); }
    if (a === "duplicate") addMany(cloneList(selWidgets));
    if (a === "front") setWidgets((ws) => [...ws.filter((x) => !sel.includes(x.id)), ...selWidgets]);
    if (a === "back") setWidgets((ws) => [...selWidgets, ...ws.filter((x) => !sel.includes(x.id))]);
  };

  const align = (k) => {
    const ref = selWidgets.find((w) => w.id === sel[sel.length - 1]);
    if (!ref) return;
    const map = {};
    const put = (w, patch) => { map[w.id] = { ...(map[w.id] || {}), ...patch }; };
    if (k === "group" || k === "ungroup") {
      const g = k === "group" ? crypto.randomUUID() : undefined;
      selWidgets.forEach((w) => put(w, { group: g }));
      toast(k === "group" ? `${selWidgets.length} widget digrupkan` : "Grup dilepas");
    } else if (k === "dist_h" || k === "dist_v") {
      const [pos, size] = k === "dist_h" ? ["x", "w"] : ["y", "h"];
      const s = [...selWidgets].sort((a, b) => a[pos] - b[pos]);
      if (s.length < 3) return toast("Pilih minimal 3 widget untuk distribusi");
      const gap = (s[s.length - 1][pos] + s[s.length - 1][size] - s[0][pos] - s.reduce((t, w) => t + w[size], 0)) / (s.length - 1);
      let cur = s[0][pos];
      s.forEach((w) => { put(w, { [pos]: Math.round(cur) }); cur += w[size] + gap; });
    } else {
      selWidgets.forEach((w) => {
        const f = {
          left: { x: ref.x }, right: { x: ref.x + ref.w - w.w }, hcenter: { x: Math.round(ref.x + ref.w / 2 - w.w / 2) },
          top: { y: ref.y }, bottom: { y: ref.y + ref.h - w.h }, vcenter: { y: Math.round(ref.y + ref.h / 2 - w.h / 2) },
          same_w: { w: ref.w }, same_h: { h: ref.h }, same_size: { w: ref.w, h: ref.h },
        }[k];
        if (f) put(w, f);
      });
    }
    updateMany(map);
  };

  const save = async () => {
    const p = projRef.current;
    setSaving(true);
    try {
      await api.put(`/projects/${id}`, { name: p.name, width: p.width, height: p.height, screens: p.screens, fonts: p.fonts || [] });
      setDirty(false);
      toast.success("Proyek disimpan");
    } catch (e) { toast.error(errMsg(e)); throw e; } finally { setSaving(false); }
  };

  const addScreen = () => {
    const s = { id: crypto.randomUUID(), name: `Layar ${project.screens.length + 1}`, bg_color: "#0B0F17", bg_image: "", widgets: [] };
    mutate((p) => ({ screens: [...p.screens, s] }));
    setScreenId(s.id); setSel([]);
  };
  const deleteScreen = () => {
    const rest = project.screens.filter((s) => s.id !== screen.id);
    mutate(() => ({ screens: rest }));
    setScreenId(rest[0].id); setSel([]);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || !projRef.current) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save().catch(() => {}); return; }
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); travel(e.shiftKey ? 1 : -1); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); travel(1); return; }
      if (mod && e.key.toLowerCase() === "v" && clip.current) { e.preventDefault(); addMany(cloneList(JSON.parse(clip.current))); return; }
      if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSel(screen.widgets.map((w) => w.id)); return; }
      if (!selWidgets.length) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); action("delete"); }
      else if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); action("duplicate"); }
      else if (mod && e.key.toLowerCase() === "g") { e.preventDefault(); align(e.shiftKey ? "ungroup" : "group"); }
      else if (mod && e.key.toLowerCase() === "c") { clip.current = JSON.stringify(selWidgets); }
      else if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const st = e.shiftKey ? 10 : 1;
        const d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
        updateMany(Object.fromEntries(selWidgets.map((w) => [w.id, { x: w.x + d[0], y: w.y + d[1] }])));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const tagMap = useMemo(() => Object.fromEntries(tags.map((t) => [t.id, t])), [tags]);
  const rt = useMemo(() => ({ values: live.snap.values, ts: live.snap.ts, tagMap, mode: "edit", allowOperate: false, write: live.write, base, records, gotoScreen: () => {} }), [live.snap, tagMap, live.write, base, records]);

  if (!project) return <div className="h-screen grid place-items-center bg-[#0B0F17] text-slate-500 font-mono text-sm">Memuat editor...</div>;

  return (
    <RtContext.Provider value={rt}>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0B0F17] text-slate-200" data-testid="hmi-editor">
        <EditorToolbar
          project={project} dirty={dirty} saving={saving} grid={grid} snap={snap} zoom={zoom} hist={histState}
          onName={(name) => mutate(() => ({ name }), false)} onUndo={() => travel(-1)} onRedo={() => travel(1)}
          onGrid={() => setGrid(!grid)} onSnap={() => setSnap(!snap)} onZoom={setZoom}
          onSave={() => save().catch(() => {})}
          onPreview={async () => { const w = window.open("about:blank", "_blank"); await save().catch(() => {}); if (w) w.location = `/preview/${id}`; }}
          onPublish={() => setPublishOpen(true)}
        />
        <ScreenTabs screens={project.screens} active={screen.id} onSelect={(sid) => { setScreenId(sid); setSel([]); }} onAdd={addScreen} />
        <div className="flex flex-1 min-h-0">
          <Palette onAdd={addType} />
          <main className="flex-1 overflow-auto bg-[#090D14] hmi-scroll hmi-dots p-10 flex" onPointerDown={() => setSel([])}>
            <div className="m-auto">
              <Canvas
                screen={screen} zoom={zoom} grid={grid} snap={snap}
                width={screen.type === "popup" ? screen.popup_width || 480 : project.width}
                height={screen.type === "popup" ? screen.popup_height || 320 : project.height}
                selected={sel} onSelect={setSel} onAdd={addWidget}
                onChange={(map) => updateMany(map, false)} onCommit={() => setTimeout(pushHist, 0)}
              />
            </div>
          </main>
          <Inspector
            widget={widget} screen={screen} project={project}
            multi={sel.length > 1 ? { count: sel.length, grouped: selWidgets.some((w) => w.group), onAlign: align } : null}
            ctx={{ tags, records, screens: project.screens, fonts: project.fonts || [] }}
            onProps={(patch) => updateWidget(widget.id, { props: { ...widget.props, ...patch } })}
            onGeom={(patch) => updateWidget(widget.id, patch)}
            onAction={action}
            onScreen={(patch) => mutate((p) => ({ screens: p.screens.map((s) => (s.id === screen.id ? { ...s, ...patch } : s)) }))}
            onProject={(patch) => mutate(() => patch)}
            onDeleteScreen={deleteScreen} canDelete={project.screens.length > 1}
          />
        </div>
        <StatusBar devices={devices} live={live} widgets={screen.widgets.length} tags={tags.length} />
        <PublishDialog
          open={publishOpen} onOpenChange={setPublishOpen} project={project} beforePublish={save}
          onUpdated={(d) => setProject((p) => ({ ...p, ...d }))}
        />
      </div>
    </RtContext.Provider>
  );
}
