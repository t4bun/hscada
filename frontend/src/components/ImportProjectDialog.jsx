import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";

export const ImportProjectDialog = ({ open, onOpenChange, onDone }) => {
  const ref = useRef();
  const [file, setFile] = useState(null);
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (!file) return toast.error("Pilih file project (.nhmi)");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("publish", publish ? "true" : "false");
    setBusy(true);
    try {
      const { data } = await api.post("/projects/import", fd);
      toast.success(`Project "${data.name}" diimport${data.published ? " & dipublish" : ""}`);
      setFile(null);
      onOpenChange(false);
      onDone(data);
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-md" data-testid="import-project-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">Import Project</DialogTitle>
          <DialogDescription className="text-slate-400">File .nhmi berisi layar, widget, perangkat, tag, alarm, data record, keamanan, pengaturan, dan gambar/shape (tanpa data histori).</DialogDescription>
        </DialogHeader>
        <button data-testid="import-file-btn" onClick={() => ref.current.click()} className="h-24 border border-dashed border-slate-600 hover:border-blue-500 rounded-sm flex flex-col items-center justify-center gap-1 text-sm text-slate-300 transition-colors">
          <FileUp size={20} />{file ? <span data-testid="import-file-name" className="font-mono text-xs text-emerald-300">{file.name}</span> : "Pilih file .nhmi"}
        </button>
        <input ref={ref} data-testid="import-file-input" type="file" accept=".nhmi,.json" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <div className="flex items-center justify-between border border-slate-800 bg-[#0B0F17] p-3 rounded-sm">
          <div><p className="text-sm">Langsung Publish</p><p className="text-xs text-slate-500">Runtime langsung aktif setelah import.</p></div>
          <Switch data-testid="import-publish-switch" checked={publish} onCheckedChange={setPublish} />
        </div>
        <button data-testid="import-submit-btn" disabled={busy} onClick={run} className="h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-sm text-sm font-semibold">{busy ? "Mengimport..." : "Import Project"}</button>
      </DialogContent>
    </Dialog>
  );
};
