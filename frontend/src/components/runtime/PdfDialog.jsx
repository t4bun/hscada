import { useState } from "react";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

const PRESETS = [[60, "1 jam"], [480, "8 jam"], [1440, "24 jam"], [10080, "7 hari"], [0, "Custom"]];
const inputCls = "w-full h-9 bg-[#0B0F17] border border-slate-700 rounded-sm px-2 text-sm text-slate-100";

const FORMATS = [["pdf", "PDF"], ["xlsx", "Excel"], ["csv", "CSV"]];

export const PdfDialog = ({ req, base, onClose }) => {
  const [preset, setPreset] = useState(60);
  const [range, setRange] = useState({ start: "", end: "" });
  const [fmt, setFmt] = useState("pdf");
  const [busy, setBusy] = useState(false);
  const log = req?.kind === "log";
  const no = req?.no;
  const download = async () => {
    if (!preset && (!range.start || !range.end)) return toast.error("Isi waktu mulai & selesai");
    const params = { ...(preset ? { minutes: preset } : { start: new Date(range.start).toISOString(), end: new Date(range.end).toISOString() }), tz: new Date().getTimezoneOffset(), ...(log ? { format: fmt } : {}) };
    setBusy(true);
    try {
      const { data } = await api.get(`${base}/records/${no}/${log ? "log" : "pdf"}`, { params, responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(data);
      a.download = `${log ? "datalog" : "trend"}-record-${no}.${log ? fmt : "pdf"}`;
      a.click();
      toast.success(log ? "Data log berhasil diekspor" : "PDF trend berhasil dibuat");
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-md" data-testid="pdf-dialog">
        <DialogHeader><DialogTitle className="font-heading">{log ? `Export Data Log #${no}` : `Export History Trend #${no} → PDF`}</DialogTitle></DialogHeader>
        <p className="text-xs text-slate-400">{log ? "Tabel data log sesuai rentang waktu. Pilih format file." : "PDF berisi grafik history trend sesuai rentang waktu (tanpa tabel data)."}</p>
        {log && (
          <div className="grid grid-cols-3 gap-1" data-testid="export-format-picker">
            {FORMATS.map(([f, l]) => (
              <button key={f} data-testid={`export-format-${f}`} onClick={() => setFmt(f)} className={`h-9 text-xs rounded-sm border ${fmt === f ? "border-emerald-500 bg-emerald-600/20 text-white" : "border-slate-700 text-slate-400"}`}>{l}</button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-5 gap-1">
          {PRESETS.map(([m, l]) => (
            <button key={m} data-testid={`pdf-range-${m}`} onClick={() => setPreset(m)} className={`h-9 text-xs rounded-sm border ${preset === m ? "border-blue-500 bg-blue-600/20 text-white" : "border-slate-700 text-slate-400"}`}>{l}</button>
          ))}
        </div>
        {!preset && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-slate-400 space-y-1">MULAI<input data-testid="pdf-start" type="datetime-local" className={inputCls} value={range.start} onChange={(e) => setRange({ ...range, start: e.target.value })} /></label>
            <label className="text-[10px] text-slate-400 space-y-1">SELESAI<input data-testid="pdf-end" type="datetime-local" className={inputCls} value={range.end} onChange={(e) => setRange({ ...range, end: e.target.value })} /></label>
          </div>
        )}
        <button data-testid="pdf-download-btn" disabled={busy} onClick={download} className="h-10 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 rounded-sm text-sm font-semibold disabled:opacity-60">
          <FileDown size={16} />{busy ? "Membuat file..." : log ? `Download ${FORMATS.find((x) => x[0] === fmt)[1]}` : "Download PDF"}
        </button>
      </DialogContent>
    </Dialog>
  );
};
