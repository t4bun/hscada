import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";
import { DATA_TYPES, TYPE_SPEC, specFor, defaultDecimals } from "@/lib/format";
import { inferType } from "@/lib/address";
import { inputCls, L, ADDRESS_HINT } from "./DeviceDialog";

const EMPTY = {
  name: "", device_id: "", address: "", data_type: "INT16", decimals: 0, unit: "", description: "",
  sim_mode: "sine", sim_min: 0, sim_max: 100, sim_period: 30, alarm_enabled: false, hh: null, h: null, l: null, ll: null,
  alarm_on_true: true, alarm_message: "", log_enabled: true, writable: true,
};
const H = ({ children }) => <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 pt-2">{children}</p>;

export const TagDialog = ({ open, onOpenChange, projectId, tag, preset, devices, protocols, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  const touched = useRef(false);
  useEffect(() => {
    if (!open) return;
    touched.current = !!tag || !!preset?.data_type;
    setF(tag ? { ...EMPTY, ...tag } : { ...EMPTY, device_id: devices[0]?.id || "", ...(preset || {}), decimals: defaultDecimals(preset?.data_type || "INT16") });
  }, [open, tag, preset, devices]);
  const dev = devices.find((d) => d.id === f.device_id);
  const family = protocols[dev?.protocol]?.family;
  const sp = specFor(f.data_type, f.decimals);
  const isBool = f.data_type === "BOOL";
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const num = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value === "" ? null : Number(e.target.value) }));
  const typePatch = (dt, s) => ({ data_type: dt, decimals: defaultDecimals(dt), sim_mode: dt === "BOOL" || dt === "STRING" ? "static" : s.sim_mode === "toggle" || s.sim_mode === "static" ? "sine" : s.sim_mode });
  const pickType = (e) => { touched.current = true; const dt = e.target.value; setF((s) => ({ ...s, ...typePatch(dt, s) })); };
  const setAddress = (e) => {
    const address = e.target.value;
    setF((s) => {
      const dt = inferType(family, address);
      return touched.current || !dt || dt === s.data_type ? { ...s, address } : { ...s, address, ...typePatch(dt, s) };
    });
  };
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = tag ? await api.put(`/tags/${tag.id}`, f) : await api.post(`/projects/${projectId}/tags`, f);
      onSaved(data);
      toast.success("Tag disimpan");
    } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-2xl max-h-[90vh] overflow-y-auto hmi-scroll">
        <DialogHeader><DialogTitle className="font-heading">{tag ? "Edit Tag" : "Tambah Tag"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3" data-testid="tag-form">
          <div className="grid grid-cols-2 gap-3">
            <L label="Nama Tag"><input required data-testid="tag-name-input" className={inputCls} value={f.name} onChange={set("name")} /></L>
            <L label="Perangkat">
              <select data-testid="tag-device-select" className={inputCls} value={f.device_id} onChange={set("device_id")}>
                {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </L>
            <div className="col-span-2">
              <L label="Alamat PLC" hint={`${ADDRESS_HINT[family] || ""} · Tipe data otomatis dari alamat`}><input required data-testid="tag-address-input" className={`${inputCls} font-mono`} value={f.address} onChange={setAddress} /></L>
            </div>
            <L label="Tipe Data">
              <select data-testid="tag-datatype-select" className={inputCls} value={f.data_type} onChange={pickType}>
                {DATA_TYPES.map((d) => <option key={d} value={d}>{TYPE_SPEC[d].label}</option>)}
              </select>
            </L>
            <L label={f.data_type === "STRING" ? "Panjang (karakter)" : "Titik Desimal"}>
              {f.data_type === "STRING"
                ? <input data-testid="tag-length-input" type="number" min={1} max={256} className={inputCls} value={f.length ?? 16} onChange={(e) => setF({ ...f, length: Math.min(256, Math.max(1, Number(e.target.value) || 1)) })} />
                : <input data-testid="tag-decimals-input" type="number" min={0} disabled={isBool} className={inputCls} value={f.decimals} onChange={(e) => setF({ ...f, decimals: Number(e.target.value) })} />}
            </L>
            <div className="col-span-2 grid grid-cols-3 gap-2 text-xs font-mono" data-testid="tag-auto-format">
              <div className="bg-[#0B0F17] border border-slate-800 p-2 rounded-sm"><p className="text-[10px] text-slate-500">MAKS. KARAKTER (AUTO)</p><p className="text-emerald-400 text-lg font-bold" data-testid="tag-max-chars">{sp.maxChars}</p></div>
              <div className="bg-[#0B0F17] border border-slate-800 p-2 rounded-sm"><p className="text-[10px] text-slate-500">FORMAT</p><p className="text-slate-200 text-lg font-bold" data-testid="tag-format-mask">{isBool ? "0/1" : `${TYPE_SPEC[f.data_type].signed ? "-" : ""}${"#".repeat(sp.intDigits)}${sp.decimals ? "." + "#".repeat(sp.decimals) : ""}`}</p></div>
              <div className="bg-[#0B0F17] border border-slate-800 p-2 rounded-sm"><p className="text-[10px] text-slate-500">RENTANG NILAI</p><p className="text-slate-200 text-[11px] font-bold mt-1 break-all">{sp.min} … {sp.max}</p></div>
            </div>
            <L label="Satuan"><input data-testid="tag-unit-input" className={inputCls} value={f.unit} onChange={set("unit")} /></L>
            <div className="flex gap-6 items-end pb-1">
              <label className="flex items-center gap-2 text-xs text-slate-300"><Switch data-testid="tag-writable-switch" checked={f.writable} onCheckedChange={set("writable")} />Bisa ditulis</label>
              <label className="flex items-center gap-2 text-xs text-slate-300"><Switch data-testid="tag-log-switch" checked={f.log_enabled} onCheckedChange={set("log_enabled")} />Logging histori</label>
            </div>
          </div>

          <H>Simulator</H>
          <div className="grid grid-cols-4 gap-3">
            <L label="Mode">
              <select data-testid="tag-sim-mode" className={inputCls} value={f.sim_mode} onChange={set("sim_mode")}>
                {(isBool ? [["static", "Statis (manual)"], ["toggle", "Toggle periodik"], ["random", "Acak"]] : [["sine", "Sinus"], ["ramp", "Ramp"], ["random", "Acak (random walk)"], ["static", "Statis (setpoint)"]]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </L>
            {!isBool && <><L label="Min"><input type="number" className={inputCls} value={f.sim_min} onChange={num("sim_min")} /></L><L label="Maks"><input type="number" className={inputCls} value={f.sim_max} onChange={num("sim_max")} /></L></>}
            <L label="Periode (detik)"><input type="number" className={inputCls} value={f.sim_period} onChange={num("sim_period")} /></L>
          </div>

          <H>Alarm</H>
          <label className="flex items-center gap-2 text-xs text-slate-300"><Switch data-testid="tag-alarm-switch" checked={f.alarm_enabled} onCheckedChange={set("alarm_enabled")} />Aktifkan alarm</label>
          {f.alarm_enabled && (
            <div className="grid grid-cols-4 gap-3">
              {isBool ? (
                <L label="Alarm saat"><select className={inputCls} value={f.alarm_on_true ? "1" : "0"} onChange={(e) => setF({ ...f, alarm_on_true: e.target.value === "1" })}><option value="1">ON (1)</option><option value="0">OFF (0)</option></select></L>
              ) : ["hh", "h", "l", "ll"].map((k) => (
                <L key={k} label={k.toUpperCase()}><input data-testid={`tag-alarm-${k}`} type="number" className={inputCls} value={f[k] ?? ""} onChange={num(k)} /></L>
              ))}
              <div className="col-span-4"><L label="Pesan Alarm (opsional)"><input data-testid="tag-alarm-message" className={inputCls} value={f.alarm_message} onChange={set("alarm_message")} /></L></div>
            </div>
          )}
          <button data-testid="tag-save-btn" className="w-full h-10 bg-blue-600 hover:bg-blue-700 rounded-sm text-sm font-semibold mt-2">Simpan Tag</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
