import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Pencil, Cpu, ExternalLink, Trash2, LogOut, Layers, Tags, Globe, Activity } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LocalAccess } from "@/components/LocalAccess";

const inputCls = "w-full h-10 bg-[#0B0F17] border border-slate-700 rounded-sm px-3 text-sm text-slate-100 focus:outline-none focus:border-blue-500";

const CreateDialog = ({ open, onOpenChange, onCreated }) => {
  const [f, setF] = useState({ name: "", description: "", width: 1280, height: 720 });
  const submit = async (e) => {
    e.preventDefault();
    try { const { data } = await api.post("/projects", f); onCreated(data); } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100">
        <DialogHeader><DialogTitle className="font-heading">Proyek HMI Baru</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4" data-testid="create-project-form">
          <label className="block space-y-1"><span className="text-xs text-slate-400">Nama Proyek</span><input required data-testid="new-project-name" className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="block space-y-1"><span className="text-xs text-slate-400">Deskripsi</span><input data-testid="new-project-desc" className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="space-y-1">
            <span className="text-xs text-slate-400">Resolusi Layar</span>
            <div className="grid grid-cols-4 gap-1">
              {[[1280, 720], [1920, 1080], [1024, 768], [800, 480]].map(([w, h]) => (
                <button type="button" key={w} onClick={() => setF({ ...f, width: w, height: h })} className={`h-9 text-xs font-mono rounded-sm border ${f.width === w ? "border-blue-500 text-white bg-blue-600/20" : "border-slate-700 text-slate-400"}`}>{w}×{h}</button>
              ))}
            </div>
          </div>
          <button data-testid="create-project-submit" className="w-full h-10 bg-blue-600 hover:bg-blue-700 rounded-sm text-sm font-semibold">Buat Proyek</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Stat = ({ icon: I, v, l }) => (
  <div className="flex items-center gap-1.5 text-xs text-slate-400"><I size={13} className="text-slate-500" /><b className="text-slate-200 font-mono">{v}</b>{l}</div>
);

const ProjectRow = ({ p, i, onDelete }) => (
  <article data-testid={`project-card-${i}`} className="group grid lg:grid-cols-[64px_1fr_auto] gap-6 items-center border border-slate-800 bg-[#111827] hover:border-slate-600 p-6 rounded-sm transition-colors hmi-rise" style={{ animationDelay: `${i * 60}ms` }}>
    <span className="font-mono text-3xl font-bold text-slate-700 group-hover:text-blue-500 transition-colors">{String(i + 1).padStart(2, "0")}</span>
    <div className="space-y-3 min-w-0">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="font-heading text-lg font-bold text-white truncate">{p.name}</h3>
        {p.published ? (
          <span data-testid={`project-live-badge-${i}`} className="text-[10px] font-mono font-bold px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-sm flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />LIVE</span>
        ) : <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-400 rounded-sm">DRAFT</span>}
      </div>
      {p.description && <p className="text-sm text-slate-400">{p.description}</p>}
      <div className="flex flex-wrap gap-5">
        <Stat icon={Layers} v={p.screen_count} l="layar" />
        <Stat icon={Activity} v={p.widget_count} l="widget" />
        <Stat icon={Tags} v={p.tag_count} l="tag" />
        <Stat icon={Globe} v={`${p.width}×${p.height}`} l="" />
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <Link to={`/projects/${p.id}/editor`} data-testid={`open-editor-${i}`} className="h-9 px-4 flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-sm transition-colors"><Pencil size={13} />Editor</Link>
      <Link to={`/projects/${p.id}/config`} data-testid={`open-config-${i}`} className="h-9 px-4 flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-sm transition-colors"><Cpu size={13} />Perangkat & Tag</Link>
      {p.published && <a href={`/view/${p.publish_slug}`} target="_blank" rel="noreferrer" data-testid={`open-app-${i}`} className="h-9 px-3 flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-sm"><ExternalLink size={13} />App</a>}
      <button data-testid={`delete-project-${i}`} onClick={() => onDelete(p)} className="h-9 w-9 grid place-items-center bg-slate-800 hover:bg-red-800 text-slate-400 hover:text-white rounded-sm transition-colors"><Trash2 size={14} /></button>
    </div>
  </article>
);

export default function Projects() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [del, setDel] = useState(null);
  const load = () => api.get("/projects").then((r) => setItems(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);
  const confirmDelete = async () => {
    await api.delete(`/projects/${del.id}`).catch((e) => toast.error(errMsg(e)));
    setDel(null); load(); toast("Proyek dihapus");
  };
  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100">
      <header className="sticky top-0 z-20 h-14 flex items-center px-6 lg:px-10 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md">
        <span className="w-7 h-7 bg-blue-600 grid place-items-center rounded-sm mr-2"><Activity size={15} /></span>
        <span className="font-heading font-black tracking-tight">NUSA<span className="text-blue-400">HMI</span></span>
        <span className="flex-1" />
        <span className="text-xs text-slate-400 mr-4 font-mono" data-testid="current-user-email">{user?.email}</span>
        <button data-testid="logout-btn" onClick={signOut} className="h-8 px-3 text-xs flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-sm"><LogOut size={14} />Keluar</button>
      </header>
      <main className="max-w-6xl mx-auto px-6 lg:px-10 py-14 space-y-10">
        <LocalAccess />
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">Workspace Proyek</p>
            <h1 className="font-heading text-4xl sm:text-5xl font-black tracking-tight">Proyek SCADA</h1>
            <p className="text-slate-400 text-sm max-w-xl">Setiap proyek berisi koneksi PLC, daftar tag, layar HMI, dan web app runtime yang bisa dipublish ke end-client.</p>
          </div>
          <button data-testid="new-project-btn" onClick={() => setOpen(true)} className="h-11 px-5 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-sm font-semibold rounded-sm transition-colors self-start md:self-auto"><Plus size={16} />Proyek Baru</button>
        </div>
        <section className="space-y-3" data-testid="project-list">
          {items === null && <p className="text-slate-500 font-mono text-sm">Memuat...</p>}
          {items?.length === 0 && (
            <div className="border border-dashed border-slate-700 p-16 text-center rounded-sm"><p className="text-slate-400">Belum ada proyek. Buat proyek pertama Anda.</p></div>
          )}
          {items?.map((p, i) => <ProjectRow key={p.id} p={p} i={i} onDelete={setDel} />)}
        </section>
      </main>
      <CreateDialog open={open} onOpenChange={setOpen} onCreated={(p) => { setOpen(false); nav(`/projects/${p.id}/config`); toast.success("Proyek dibuat. Tambahkan perangkat PLC terlebih dahulu."); }} />
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent className="bg-[#111827] border-slate-700 text-slate-100">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus proyek "{del?.name}"?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">Semua layar, perangkat, tag, histori, dan web app yang dipublish akan dihapus permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-slate-700 text-slate-200 hover:bg-slate-800">Batal</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-delete-project" onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
