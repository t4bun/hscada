import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { inputCls } from "./DeviceDialog";

export const SerialPortPicker = ({ value, onChange }) => {
  const [ports, setPorts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const scan = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/system/serial-ports");
      setPorts(data);
      setErr(false);
      if (!value && data[0]) onChange(data[0].device);
    } catch { setErr(true); }
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { scan(); }, []);
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <input data-testid="device-serial-input" list="serial-port-list" className={`${inputCls} font-mono`} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="COM3" />
        <button type="button" data-testid="device-serial-scan-btn" title="Deteksi ulang port" onClick={scan} className="h-9 w-9 shrink-0 grid place-items-center bg-slate-800 hover:bg-slate-700 rounded-sm">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <datalist id="serial-port-list">{ports.map((p) => <option key={p.device} value={p.device}>{p.description}</option>)}</datalist>
      <span data-testid="device-serial-detected" className="block text-[11px] text-slate-500">
        {err ? "Gagal membaca daftar port" : ports.length ? `${ports.length} port terdeteksi: ${ports.map((p) => `${p.device}${p.description && p.description !== "n/a" ? ` (${p.description})` : ""}`).join(", ")}` : "Belum ada port terdeteksi — colok konverter USB lalu klik deteksi ulang"}
      </span>
    </div>
  );
};
