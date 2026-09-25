import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";
import { inputCls, L } from "./DeviceDialog";

const Card = ({ title, children }) => (
  <section className="border border-slate-800 bg-[#111827] rounded-sm p-6 space-y-4">
    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{title}</p>
    {children}
  </section>
);

export const SettingsPanel = ({ project, onSaved }) => {
  const [s, setS] = useState(project.settings);
  const set = (k) => (v) => setS({ ...s, [k]: v?.target ? v.target.value : v });
  const save = async () => {
    try { await api.put(`/projects/${project.id}`, { settings: s }); toast.success("Pengaturan disimpan"); onSaved(); } catch (e) { toast.error(errMsg(e)); }
  };
  return (
    <div className="space-y-6 max-w-3xl" data-testid="settings-panel">
      <div className="flex items-end justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400">Project Settings</p><h2 className="font-heading text-2xl font-bold mt-1">Pengaturan Proyek SCADA</h2></div>
        <button data-testid="settings-save-btn" onClick={save} className="h-9 px-4 flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 rounded-sm"><Save size={14} />Simpan</button>
      </div>
      <Card title="Komunikasi">
        <L label="Byte Order Default (data 32-bit)" hint="ABCD = Big Endian (Siemens), CDAB = Word Swap (Omron/umum Modbus), BADC = Byte Swap, DCBA = Little Endian. Bisa di-override per perangkat.">
          <select data-testid="settings-byteorder" className={inputCls} value={s.byte_order} onChange={set("byte_order")}>
            {["ABCD", "CDAB", "BADC", "DCBA"].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </L>
      </Card>
      <Card title="Tampilan Runtime">
        <L label="Initial Screen (layar pertama saat app dibuka)">
          <select data-testid="settings-initial-screen" className={inputCls} value={s.initial_screen} onChange={set("initial_screen")}>
            <option value="">Layar pertama</option>
            {project.screens.filter((x) => x.type !== "popup").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </L>
        <div className="flex items-center justify-between">
          <div><p className="text-sm">Enable Screen Saver</p><p className="text-xs text-slate-500">Layar gelap dengan jam setelah tidak ada aktivitas.</p></div>
          <Switch data-testid="settings-screensaver-switch" checked={!!s.screen_saver_enabled} onCheckedChange={set("screen_saver_enabled")} />
        </div>
        {s.screen_saver_enabled && (
          <L label="Timeout (menit)"><input data-testid="settings-screensaver-minutes" type="number" min={1} className={inputCls} value={s.screen_saver_minutes} onChange={(e) => set("screen_saver_minutes")(Number(e.target.value))} /></L>
        )}
      </Card>
      <Card title="Security">
        <div className="flex items-center justify-between">
          <div><p className="text-sm">Wajib Login Klien</p><p className="text-xs text-slate-500">Web app yang dipublish meminta username/password sesuai group (atur di tab Keamanan). Default user: admin / admin123.</p></div>
          <Switch data-testid="settings-security-switch" checked={!!s.security_enabled} onCheckedChange={set("security_enabled")} />
        </div>
      </Card>
    </div>
  );
};
