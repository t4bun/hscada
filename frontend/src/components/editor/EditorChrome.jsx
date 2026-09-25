import { Link } from "react-router-dom";
import { ArrowLeft, Undo2, Redo2, Grid3x3, Magnet, ZoomIn, ZoomOut, Save, Play, Rocket, Plus, Cpu, Circle } from "lucide-react";

const TB = ({ onClick, active, disabled, title, children, testid }) => (
  <button
    type="button" title={title} data-testid={testid} onClick={onClick} disabled={disabled}
    className={`h-8 min-w-8 px-2 grid place-items-center rounded-sm transition-colors disabled:opacity-30 ${active ? "bg-blue-600/20 text-blue-400" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
  >
    {children}
  </button>
);
const Sep = () => <span className="w-px h-5 bg-slate-800 mx-1" />;

export const EditorToolbar = ({ project, dirty, saving, grid, snap, zoom, hist, onName, onUndo, onRedo, onGrid, onSnap, onZoom, onSave, onPreview, onPublish }) => (
  <header className="h-12 flex items-center gap-1 px-2 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md shrink-0">
    <Link to="/projects" data-testid="editor-back-link" className="h-8 w-8 grid place-items-center text-slate-400 hover:text-white hover:bg-slate-800 rounded-sm"><ArrowLeft size={16} /></Link>
    <input data-testid="project-name-input" value={project.name} onChange={(e) => onName(e.target.value)} className="bg-transparent font-heading font-bold text-sm text-slate-100 w-52 px-2 h-8 rounded-sm hover:bg-slate-800 focus:bg-slate-800 focus:outline-none" />
    {dirty && <span data-testid="unsaved-indicator" className="text-[10px] font-mono text-amber-400 mr-2">● BELUM DISIMPAN</span>}
    <nav className="flex items-center ml-2 text-xs">
      <span className="px-3 h-8 grid place-items-center border-b-2 border-blue-500 text-white font-semibold">Layar HMI</span>
      <Link to={`/projects/${project.id}/config`} data-testid="nav-config-link" className="px-3 h-8 flex items-center gap-1.5 text-slate-400 hover:text-white"><Cpu size={13} />Perangkat & Tag</Link>
    </nav>
    <div className="flex-1" />
    <TB title="Undo (Ctrl+Z)" testid="undo-btn" onClick={onUndo} disabled={hist.idx <= 0}><Undo2 size={15} /></TB>
    <TB title="Redo (Ctrl+Y)" testid="redo-btn" onClick={onRedo} disabled={hist.idx >= hist.len - 1}><Redo2 size={15} /></TB>
    <Sep />
    <TB title="Grid" testid="grid-toggle" active={grid} onClick={onGrid}><Grid3x3 size={15} /></TB>
    <TB title="Snap ke grid" testid="snap-toggle" active={snap} onClick={onSnap}><Magnet size={15} /></TB>
    <Sep />
    <TB title="Perkecil" testid="zoom-out-btn" onClick={() => onZoom(Math.max(0.25, +(zoom - 0.1).toFixed(2)))}><ZoomOut size={15} /></TB>
    <button data-testid="zoom-reset-btn" onClick={() => onZoom(1)} className="font-mono text-[11px] text-slate-300 w-12 hover:text-white">{Math.round(zoom * 100)}%</button>
    <TB title="Perbesar" testid="zoom-in-btn" onClick={() => onZoom(Math.min(2, +(zoom + 0.1).toFixed(2)))}><ZoomIn size={15} /></TB>
    <Sep />
    <button data-testid="save-btn" onClick={onSave} disabled={saving} className="h-8 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-sm bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors">
      <Save size={14} />{saving ? "Menyimpan..." : "Simpan"}
    </button>
    <button data-testid="preview-btn" onClick={onPreview} className="h-8 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-sm bg-emerald-700 hover:bg-emerald-600 text-white transition-colors">
      <Play size={14} />Preview
    </button>
    <button data-testid="publish-btn" onClick={onPublish} className="h-8 px-3 flex items-center gap-1.5 text-xs font-semibold rounded-sm bg-blue-600 hover:bg-blue-700 text-white transition-colors">
      <Rocket size={14} />{project.published ? "Published" : "Publish"}
    </button>
  </header>
);

export const ScreenTabs = ({ screens, active, onSelect, onAdd }) => (
  <div className="h-9 flex items-end gap-0.5 px-2 border-b border-slate-800 bg-[#0B0F17] shrink-0 overflow-x-auto" data-testid="screen-tabs">
    {screens.map((s, i) => (
      <button
        key={s.id} data-testid={`screen-tab-${i}`} onClick={() => onSelect(s.id)}
        className={`h-8 px-4 text-xs font-medium border border-b-0 rounded-t-sm whitespace-nowrap transition-colors ${s.id === active ? "bg-[#111827] border-slate-700 text-white" : "border-transparent text-slate-500 hover:text-slate-200"}`}
      >
        <span className="font-mono text-[10px] text-slate-500 mr-1.5">{String(i + 1).padStart(2, "0")}</span>{s.name}
      </button>
    ))}
    <button data-testid="add-screen-btn" onClick={onAdd} className="h-8 px-2 text-slate-500 hover:text-white flex items-center gap-1 text-xs"><Plus size={14} />Layar</button>
  </div>
);

const STATUS_CLR = { online: "text-emerald-400", simulasi: "text-cyan-400", offline: "text-red-400", menunggu: "text-slate-500" };

export const StatusBar = ({ devices, live, widgets, tags }) => (
  <footer className="h-7 flex items-center gap-4 px-3 border-t border-slate-800 bg-[#111827] text-[10px] font-mono text-slate-500 shrink-0" data-testid="editor-status-bar">
    <span className={`flex items-center gap-1 ${live.online ? "text-emerald-400" : "text-red-400"}`}><Circle size={7} fill="currentColor" className={live.online ? "animate-pulse" : ""} />{live.online ? "LIVE" : "TERPUTUS"}</span>
    {devices.map((d) => {
      const st = live.snap.devices?.[d.id]?.status || "menunggu";
      return <span key={d.id} className={STATUS_CLR[st]}>{d.name}: {st.toUpperCase()}</span>;
    })}
    <span className="flex-1" />
    <span>{tags} TAG</span>
    <span>{widgets} WIDGET</span>
    <span className={live.snap.active_alarms ? "text-red-400" : ""}>{live.snap.active_alarms || 0} ALARM AKTIF</span>
  </footer>
);
