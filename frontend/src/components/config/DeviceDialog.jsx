import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";

export const inputCls = "w-full h-9 bg-[#0B0F17] border border-slate-700 rounded-sm px-2.5 text-sm text-slate-100 focus:outline-none focus:border-blue-500";
export const L = ({ label, children, hint }) => (
  <label className="block space-y-1">
    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
    {children}
    {hint && <span className="block text-[11px] text-slate-500">{hint}</span>}
  </label>
);

export const ADDRESS_HINT = {
  s7: "Contoh: DB1.DBW0, DB1.DBD4, DB1.DBX0.0, MW10, MD20, M0.0, I0.0, Q0.1, VW100 (S7-200 → DB1)",
  modbus: "Contoh: 40001 (Holding), 30001 (Input Reg), 00001 (Coil), 10001 (DI), 40001.3 (bit), HR0 / C0 (0-based)",
  fins: "Contoh: D100, D100.05, CIO10.0, W5, H3",
};

const EMPTY = { name: "", protocol: "s7_1200_1500", host: "192.168.0.1", port: null, rack: 0, slot: 1, unit_id: 1, word_swap: false, simulate: true };

export const DeviceDialog = ({ open, onOpenChange, projectId, device, protocols, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  useEffect(() => { if (open) setF(device ? { ...EMPTY, ...device } : EMPTY); }, [open, device]);
  const proto = protocols[f.protocol] || {};
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === "number" ? Number(e.target.value) : e.target.value) : e });
  const pickProto = (e) => {
    const p = protocols[e.target.value];
    setF({ ...f, protocol: e.target.value, port: p.port, rack: p.rack ?? f.rack, slot: p.slot ?? f.slot });
  };
  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = { ...f, port: f.port || proto.port };
      const { data } = device ? await api.put(`/devices/${device.id}`, body) : await api.post(`/projects/${projectId}/devices`, body);
      onSaved(data);
      toast.success("Perangkat disimpan");
    } catch (er) { toast.error(errMsg(er)); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-lg">
        <DialogHeader><DialogTitle className="font-heading">{device ? "Edit Perangkat" : "Tambah Perangkat PLC"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4" data-testid="device-form">
          <div className="grid grid-cols-2 gap-3">
            <L label="Nama Perangkat"><input required data-testid="device-name-input" className={inputCls} value={f.name} onChange={set("name")} /></L>
            <L label="Protokol / Merk">
              <select data-testid="device-protocol-select" className={inputCls} value={f.protocol} onChange={pickProto}>
                {Object.entries(protocols).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
            </L>
            <L label="IP Address"><input data-testid="device-host-input" className={inputCls} value={f.host} onChange={set("host")} /></L>
            <L label="Port"><input data-testid="device-port-input" type="number" className={inputCls} value={f.port ?? proto.port ?? ""} onChange={set("port")} /></L>
            {proto.family === "s7" && <>
              <L label="Rack"><input data-testid="device-rack-input" type="number" className={inputCls} value={f.rack} onChange={set("rack")} /></L>
              <L label="Slot"><input data-testid="device-slot-input" type="number" className={inputCls} value={f.slot} onChange={set("slot")} /></L>
            </>}
            {proto.family === "modbus" && <>
              <L label="Unit / Station ID"><input data-testid="device-unit-input" type="number" className={inputCls} value={f.unit_id} onChange={set("unit_id")} /></L>
              <L label="Word Swap (32-bit)"><div className="h-9 flex items-center"><Switch data-testid="device-wordswap-switch" checked={f.word_swap} onCheckedChange={set("word_swap")} /></div></L>
            </>}
          </div>
          <p className="text-[11px] text-slate-500 font-mono bg-[#0B0F17] border border-slate-800 p-2 rounded-sm">{ADDRESS_HINT[proto.family]}</p>
          <div className="flex items-center justify-between border border-slate-800 bg-[#0B0F17] p-3 rounded-sm">
            <div>
              <p className="text-sm font-medium">Mode Simulator</p>
              <p className="text-xs text-slate-500">Nilai tag disimulasikan. Matikan untuk koneksi PLC asli (PLC harus bisa dijangkau dari server).</p>
            </div>
            <Switch data-testid="device-simulate-switch" checked={f.simulate} onCheckedChange={set("simulate")} />
          </div>
          <button data-testid="device-save-btn" className="w-full h-10 bg-blue-600 hover:bg-blue-700 rounded-sm text-sm font-semibold">Simpan Perangkat</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
