import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eraser, HardDrive } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";
import { inputCls, L } from "./DeviceDialog";

const fmtBytes = (b) => (b >= 1 << 30 ? `${(b / (1 << 30)).toFixed(2)} GB` : b >= 1 << 20 ? `${(b / (1 << 20)).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const fmtTime = (t) => (t ? new Date(t).toLocaleString("id-ID") : "-");

const Stat = ({ label, value, testid }) => (
  <div className="bg-[#0B0F17] border border-slate-800 rounded-sm px-3 py-2">
    <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
    <p data-testid={testid} className="font-mono text-sm text-slate-200 mt-0.5">{value}</p>
  </div>
);

const KINDS = {
  record: { api: "records", tid: "", noun: "sampel data record", desc: "Sampel data record" },
  alarm: { api: "alarms", tid: "alarm-", noun: "riwayat alarm (yang sudah tidak aktif)", desc: "Riwayat alarm yang sudah selesai (OFF)" },
};

export const RetentionCard = ({ projectId, s, set, saveSettings, kind = "record" }) => {
  const K = KINDS[kind];
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.get(`/projects/${projectId}/${K.api}/storage`).then((r) => setInfo(r.data)).catch(() => {}), [projectId]);
  useEffect(() => { load(); }, [load]);
  const on = s[`${kind}_retention_enabled`] !== false;
  const cleanNow = async () => {
    if (!window.confirm(`Hapus semua ${K.noun} yang lebih lama dari ${s[`${kind}_retention_days`]} hari?`)) return;
    setBusy(true);
    try {
      await saveSettings(true);
      const { data } = await api.post(`/projects/${projectId}/${K.api}/cleanup`);
      toast.success(`${data.deleted} sampel lama dihapus`);
      load();
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  const last = info?.last_cleanup;
  return (
    <div className="space-y-4" data-testid={`${K.tid}retention-card`}>
      <div className="flex items-center justify-between gap-4">
        <div><p className="text-sm">Hapus Otomatis Data Lama</p><p className="text-xs text-slate-500">{K.desc} yang lebih lama dari batas hari dihapus otomatis setiap jam agar disk PC pabrik tidak penuh.</p></div>
        <Switch data-testid={`${K.tid}settings-retention-switch`} checked={on} onCheckedChange={set(`${kind}_retention_enabled`)} />
      </div>
      {on && (
        <L label="Simpan data selama (hari)" hint="1–3650 hari. Contoh: 30 = simpan 1 bulan terakhir.">
          <input data-testid={`${K.tid}settings-retention-days`} type="number" min={1} max={3650} className={inputCls} value={s[`${kind}_retention_days`] ?? 90} onChange={(e) => set(`${kind}_retention_days`)(Math.min(3650, Math.max(1, Number(e.target.value) || 1)))} />
        </L>
      )}
      {info && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2" data-testid={`${K.tid}retention-stats`}>
          <Stat label="Jumlah sampel" value={info.samples.toLocaleString("id-ID")} testid={`${K.tid}retention-samples`} />
          <Stat label="Perkiraan ukuran" value={fmtBytes(info.est_bytes)} testid={`${K.tid}retention-size`} />
          <Stat label="Data tertua" value={fmtTime(info.oldest)} testid={`${K.tid}retention-oldest`} />
          <Stat label="Data terbaru" value={fmtTime(info.newest)} testid={`${K.tid}retention-newest`} />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p data-testid={`${K.tid}retention-last-cleanup`} className="text-xs text-slate-500 flex items-center gap-1.5"><HardDrive size={12} />
          {last ? `Pembersihan terakhir ${fmtTime(last.at)} · ${last.deleted} sampel dihapus` : "Belum ada pembersihan"}
        </p>
        {on && (
          <button data-testid={`${K.tid}retention-clean-now-btn`} disabled={busy} onClick={cleanNow} className="h-8 px-3 text-xs flex items-center gap-1.5 bg-slate-800 hover:bg-red-800 disabled:opacity-50 rounded-sm transition-colors">
            <Eraser size={13} />{busy ? "Membersihkan..." : "Bersihkan Sekarang"}
          </button>
        )}
      </div>
    </div>
  );
};
