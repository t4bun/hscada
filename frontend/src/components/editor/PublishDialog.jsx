import { useState } from "react";
import { toast } from "sonner";
import { Copy, ExternalLink, Globe, Rocket } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";

export const PublishDialog = ({ open, onOpenChange, project, beforePublish, onUpdated }) => {
  const [operate, setOperate] = useState(project.allow_operate ?? true);
  const [busy, setBusy] = useState(false);
  const url = project.publish_slug ? `${window.location.origin}/view/${project.publish_slug}` : "";
  const publish = async () => {
    setBusy(true);
    try {
      await beforePublish();
      const { data } = await api.post(`/projects/${project.id}/publish`, { allow_operate: operate });
      onUpdated(data);
      toast.success("Web app berhasil dipublish");
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const unpublish = async () => {
    const { data } = await api.post(`/projects/${project.id}/unpublish`);
    onUpdated(data);
    toast("Web app dinonaktifkan");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-lg" data-testid="publish-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2"><Rocket size={18} className="text-blue-400" />Deploy Web App</DialogTitle>
          <DialogDescription className="text-slate-400">Publish membuat snapshot layar saat ini menjadi aplikasi runtime yang bisa dibuka end-client lewat browser (PC, tablet, HP).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between border border-slate-800 bg-[#0B0F17] p-3 rounded-sm">
            <div>
              <p className="text-sm font-medium">Izinkan operasi (write)</p>
              <p className="text-xs text-slate-500">Client dapat menekan tombol & mengubah setpoint. Nonaktifkan untuk mode monitoring saja.</p>
            </div>
            <Switch data-testid="publish-operate-switch" checked={operate} onCheckedChange={setOperate} />
          </div>
          {project.published && url && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</p>
              <div className="flex gap-1">
                <input readOnly value={url} data-testid="publish-url" className="flex-1 h-9 bg-[#0B0F17] border border-slate-700 rounded-sm px-2 text-xs font-mono text-slate-200" />
                <Button size="icon" variant="secondary" data-testid="publish-copy-btn" onClick={() => { navigator.clipboard.writeText(url); toast.success("URL disalin"); }}><Copy size={14} /></Button>
                <Button size="icon" variant="secondary" data-testid="publish-open-btn" onClick={() => window.open(url, "_blank")}><ExternalLink size={14} /></Button>
              </div>
              {project.published_at && <p className="text-[11px] text-slate-500">Terakhir publish: {new Date(project.published_at).toLocaleString("id-ID")}</p>}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <Button data-testid="publish-confirm-btn" disabled={busy} onClick={publish} className="flex-1 bg-blue-600 hover:bg-blue-700 rounded-sm">
              <Globe size={15} className="mr-1.5" />{busy ? "Memproses..." : project.published ? "Publish Ulang (Update)" : "Publish Sekarang"}
            </Button>
            {project.published && <Button data-testid="unpublish-btn" variant="outline" onClick={unpublish} className="rounded-sm border-slate-700 bg-transparent hover:bg-red-900/40 text-slate-200">Nonaktifkan</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
