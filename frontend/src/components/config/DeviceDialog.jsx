import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { api, errMsg } from "@/lib/api";
import { SerialPortPicker } from "./SerialPortPicker";

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
  internal: "Memori SCADA: LB0 (bit), LW0 (word 16-bit), LW10 + tipe 32-bit (2 word)",
  wecon: "Contoh: D100 (word), D100.3 (bit), M10, S0, T5, C3, X7 / Y10 (oktal), TD5 / CD3 (nilai timer/counter)",
  hostlink: "Contoh: D100, D100.05, CIO10.3, H5, LR2, AR10",
  fatek: "Contoh: R100, D10 (register), R20.3 (bit register), M0, X0, Y5, S10, T3, C2",
  opcua: 'Contoh: "Motor1".Start, "DB_Tank".Level, "Tag_Level", "DB_Data".Arr[3] atau NodeId ns=3;s="Motor1"."Start"',
};

const NOTES = {
  s7: "Syarat PLC: aktifkan PUT/GET (Protection & Security) dan nonaktifkan 'Optimized block access' pada DB yang dibaca.",
  opcua: "Syarat PLC: aktifkan OPC UA server (S7-1500 / S7-1200 FW V4.4+, bisa butuh lisensi runtime OPC UA). Namespace DB Siemens biasanya 3.",
  fins: "Pastikan IP & node FINS PLC sesuai. Untuk UDP, node 0 = otomatis dari oktet terakhir IP.",
  hostlink: "Default Omron Host Link: 9600 baud, 7 data bit, Even, 2 stop bit. Unit No sesuai setting PLC.",
  fatek: "Default Fatek: port Ethernet 500, serial 9600 7E1. Station No sesuai setting PLC.",
  wecon: "Alamat Wecon (D/M/X/Y/S/T/C) dipetakan otomatis ke Modbus. X/Y memakai penomoran oktal.",
  modbus: "Serial: pilih COM port konverter USB-RS485/232/422 dan samakan baudrate/parity dengan perangkat.",
};
const UNIT_LABEL = { modbus: "Slave ID", wecon: "Slave ID", hostlink: "Unit No", fatek: "Station No" };
const SERIAL_DEFAULT = { hostlink: { databits: 7, parity: "E", stopbits: 2 }, fatek: { databits: 7, parity: "E", stopbits: 1 } };

const Sel = ({ label, value, onChange, opts, testid }) => (
  <L label={label}>
    <select data-testid={testid} className={inputCls} value={value} onChange={onChange}>
      {opts.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
    </select>
  </L>
);
const Num = ({ label, k, f, set, testid, hint }) => (
  <L label={label} hint={hint}><input data-testid={testid} type="number" className={inputCls} value={f[k] ?? ""} onChange={set(k)} /></L>
);
const Txt = ({ label, k, f, set, testid, placeholder, type = "text", className = "" }) => (
  <div className={className}><L label={label}><input data-testid={testid} type={type} className={`${inputCls} font-mono`} value={f[k] ?? ""} onChange={set(k)} placeholder={placeholder} /></L></div>
);

const SerialFields = ({ f, setF, set, n }) => (<>
  <L label="COM / Serial Port"><SerialPortPicker value={f.serial_port} onChange={(v) => setF((s) => ({ ...s, serial_port: v }))} /></L>
  <Sel label="Mode Serial" testid="device-serial-mode-select" value={f.serial_mode} onChange={set("serial_mode")} opts={["RS485", "RS232", "RS422"]} />
  <Sel label="Baudrate" testid="device-baud-select" value={f.baudrate} onChange={n("baudrate")} opts={[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]} />
  <Sel label="Data Bits" testid="device-databits-select" value={f.databits} onChange={n("databits")} opts={[7, 8]} />
  <Sel label="Parity" testid="device-parity-select" value={f.parity} onChange={set("parity")} opts={[["N", "None"], ["E", "Even"], ["O", "Odd"]]} />
  <Sel label="Stop Bits" testid="device-stopbits-select" value={f.stopbits} onChange={n("stopbits")} opts={[1, 2]} />
</>);

const OpcFields = ({ f, set }) => (<>
  <Txt className="col-span-2" label="Endpoint OPC UA (opsional)" k="opc_endpoint" f={f} set={set} testid="device-opc-endpoint-input" placeholder={`opc.tcp://${f.host || "192.168.0.1"}:${f.port || 4840}`} />
  <Num label="Namespace Index" k="opc_namespace" f={f} set={set} testid="device-opc-ns-input" />
  <span />
  <Txt label="Username (opsional)" k="opc_user" f={f} set={set} testid="device-opc-user-input" />
  <Txt label="Password" k="opc_password" f={f} set={set} testid="device-opc-password-input" type="password" />
</>);

const EMPTY = {
  name: "", protocol: "s7_1200_1500", host: "192.168.0.1", port: null, rack: 0, slot: 1, unit_id: 1, word_swap: false, simulate: true, byte_order: "",
  serial_port: "", serial_mode: "RS485", baudrate: 9600, databits: 8, parity: "N", stopbits: 1, reconnect_s: 5, timeout_ms: 1000,
  opc_namespace: 3, opc_endpoint: "", opc_user: "", opc_password: "", fins_src_node: 0, fins_dst_node: 0, local_tsap: "", remote_tsap: "",
};

export const DeviceDialog = ({ open, onOpenChange, projectId, device, protocols, onSaved }) => {
  const [f, setF] = useState(EMPTY);
  useEffect(() => { if (open) setF(device ? { ...EMPTY, ...device } : EMPTY); }, [open, device]);
  const proto = protocols[f.protocol] || {};
  const fam = proto.family;
  const set = (k) => (e) => { const v = e?.target ? (e.target.type === "number" ? Number(e.target.value) : e.target.value) : e; setF((s) => ({ ...s, [k]: v })); };
  const n = (k) => (e) => { const v = Number(e.target.value); setF((s) => ({ ...s, [k]: v })); };
  const pickProto = (e) => {
    const key = e.target.value;
    const p = protocols[key];
    const ser = p.serial ? { baudrate: 9600, databits: 8, parity: "N", stopbits: 1, ...(SERIAL_DEFAULT[p.family] || {}) } : {};
    setF((s) => ({ ...s, ...ser, protocol: key, port: p.port, rack: p.rack ?? s.rack, slot: p.slot ?? s.slot, byte_order: ["fins", "hostlink", "fatek"].includes(p.family) ? "CDAB" : "", simulate: p.family === "internal" ? false : s.simulate }));
  };
  const net = !proto.serial && fam !== "internal";
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
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-heading">{device ? "Edit Perangkat" : "Tambah Perangkat PLC"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4" data-testid="device-form">
          <div className="grid grid-cols-2 gap-3">
            <L label="Nama Perangkat"><input required data-testid="device-name-input" className={inputCls} value={f.name} onChange={set("name")} /></L>
            <L label="Protokol / Merk">
              <select data-testid="device-protocol-select" className={inputCls} value={f.protocol} onChange={pickProto}>
                {Object.entries(protocols).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
            </L>
            {proto.serial && <SerialFields f={f} setF={setF} set={set} n={n} />}
            {net && <>
              <L label="IP Address"><input data-testid="device-host-input" className={inputCls} value={f.host} onChange={set("host")} /></L>
              <L label="Port"><input data-testid="device-port-input" type="number" className={inputCls} value={f.port ?? proto.port ?? ""} onChange={set("port")} /></L>
            </>}
            {fam === "opcua" && <OpcFields f={f} set={set} />}
            {proto.tsap && <>
              <Txt label="Local TSAP (hex, opsional)" k="local_tsap" f={f} set={set} testid="device-local-tsap-input" placeholder="10.00" />
              <Txt label="Remote TSAP (hex, opsional)" k="remote_tsap" f={f} set={set} testid="device-remote-tsap-input" placeholder="10.01" />
            </>}
            {proto.udp && <>
              <Num label="Node Sumber (PC)" k="fins_src_node" f={f} set={set} testid="device-fins-src-input" hint="0 = otomatis" />
              <Num label="Node Tujuan (PLC)" k="fins_dst_node" f={f} set={set} testid="device-fins-dst-input" hint="0 = oktet terakhir IP PLC" />
            </>}
            {UNIT_LABEL[fam] && <Num label={UNIT_LABEL[fam]} k="unit_id" f={f} set={set} testid="device-unit-input" />}
            {fam !== "internal" && fam !== "opcua" && (
              <L label="Byte Order (32-bit)">
                <select data-testid="device-byteorder-select" className={inputCls} value={f.byte_order} onChange={set("byte_order")}>
                  <option value="">Ikuti pengaturan proyek</option>
                  {["ABCD", "CDAB", "BADC", "DCBA"].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </L>
            )}
            {fam === "s7" && <>
              <Num label="Rack" k="rack" f={f} set={set} testid="device-rack-input" />
              <Num label="Slot" k="slot" f={f} set={set} testid="device-slot-input" />
            </>}
            {fam !== "internal" && <>
              <Num label="Interval Reconnect (detik)" k="reconnect_s" f={f} set={set} testid="device-reconnect-input" />
              <Num label="Timeout (ms)" k="timeout_ms" f={f} set={set} testid="device-timeout-input" />
            </>}
          </div>
          {NOTES[fam] && <p data-testid="device-proto-note" className="text-[11px] text-amber-200/90 bg-amber-500/5 border border-amber-500/30 p-2 rounded-sm">{NOTES[fam]}</p>}
          <p className="text-[11px] text-slate-500 font-mono bg-[#0B0F17] border border-slate-800 p-2 rounded-sm">{ADDRESS_HINT[fam]}</p>
          {fam !== "internal" && (<div className="flex items-center justify-between border border-slate-800 bg-[#0B0F17] p-3 rounded-sm">
            <div>
              <p className="text-sm font-medium">Mode Simulator</p>
              <p className="text-xs text-slate-500">Nilai tag disimulasikan. Matikan untuk koneksi PLC asli (jalankan versi lokal di PC pabrik).</p>
            </div>
            <Switch data-testid="device-simulate-switch" checked={f.simulate} onCheckedChange={set("simulate")} />
          </div>)}
          <button data-testid="device-save-btn" className="w-full h-10 bg-blue-600 hover:bg-blue-700 rounded-sm text-sm font-semibold">Simpan Perangkat</button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
