import { PlugZap, Pencil, Trash2, RotateCw } from "lucide-react";

export const STATUS = {
  online: { label: "Terhubung", dot: "bg-emerald-500", text: "text-emerald-400", bar: "border-l-emerald-500" },
  reconnecting: { label: "Menyambung ulang", dot: "bg-amber-400", text: "text-amber-300", bar: "border-l-amber-400" },
  error: { label: "Error", dot: "bg-red-500", text: "text-red-400", bar: "border-l-red-500" },
  simulasi: { label: "Simulasi", dot: "bg-cyan-500", text: "text-cyan-400", bar: "border-l-cyan-500" },
  internal: { label: "Internal", dot: "bg-violet-500", text: "text-violet-300", bar: "border-l-violet-500" },
  menunggu: { label: "Menunggu", dot: "bg-slate-500", text: "text-slate-400", bar: "border-l-slate-600" },
};
const UNIT_FAMILIES = ["modbus", "wecon", "hostlink", "fatek"];

const endpoint = (d, p) => {
  const unit = UNIT_FAMILIES.includes(p?.family) ? ` · ID ${d.unit_id}` : "";
  if (p?.serial) return `${d.serial_port || "COM?"} · ${d.baudrate} ${d.databits}${d.parity}${d.stopbits} · ${d.serial_mode || "RS485"}${unit}`;
  if (p?.family === "opcua") return d.opc_endpoint || `opc.tcp://${d.host}:${d.port}`;
  if (p?.family === "internal") return "Memori internal SCADA";
  return `${d.host}:${d.port}${p?.family === "s7" ? ` · R${d.rack}/S${d.slot}` : ""}${p?.udp ? " · UDP" : ""}${unit}`;
};

const Stat = ({ label, value, testid }) => (
  <div>
    <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
    <p data-testid={testid} className="font-mono text-xs text-slate-200">{value ?? "-"}</p>
  </div>
);

const Stats = ({ x, i }) => (
  <div data-testid={`device-stats-${i}`} className="grid grid-cols-4 gap-2 border-t border-slate-800 pt-2">
    <Stat label="Baca OK" value={x.ok} testid={`device-stat-ok-${i}`} />
    <Stat label="Gagal" value={x.fail} testid={`device-stat-fail-${i}`} />
    <Stat label="Respon" value={x.rtt_ms != null ? `${x.rtt_ms} ms` : null} testid={`device-stat-rtt-${i}`} />
    <Stat label="Rata-rata" value={x.avg_ms != null ? `${x.avg_ms} ms` : null} testid={`device-stat-avg-${i}`} />
  </div>
);

export const DeviceCard = ({ d, i, status, protocols, test, onEdit, onDelete, onTest }) => {
  const st = STATUS[status?.status] ? status.status : "menunggu";
  const s = STATUS[st];
  const p = protocols[d.protocol];
  return (
    <div data-testid={`device-card-${i}`} className={`border border-slate-800 border-l-4 ${s.bar} bg-[#111827] p-5 rounded-sm space-y-3 hmi-rise`} style={{ animationDelay: `${i * 50}ms` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><p className="font-heading font-bold text-white truncate">{d.name}</p><p className="text-xs text-slate-400">{p?.label}</p></div>
        <span data-testid={`device-status-${i}`} data-status={st} className={`shrink-0 text-[11px] font-mono font-bold uppercase flex items-center gap-1.5 ${s.text}`}>
          <span className={`w-3 h-3 rounded-full ${s.dot} ${st === "online" || st === "reconnecting" ? "animate-pulse" : ""}`} />{s.label}
        </span>
      </div>
      <p data-testid={`device-endpoint-${i}`} className="font-mono text-xs text-slate-300 break-all">{endpoint(d, p)}</p>
      {status?.error && <p data-testid={`device-error-${i}`} className={`text-[11px] font-mono break-words ${st === "reconnecting" ? "text-amber-300" : "text-red-400"}`}>{status.error}</p>}
      {st === "reconnecting" && <p data-testid={`device-retry-${i}`} className="text-[11px] text-slate-400 flex items-center gap-1"><RotateCw size={11} className="animate-spin" />Mencoba lagi tiap {status.retry_in}s · percobaan ke-{status.stats?.attempts}</p>}
      {status?.stats && <Stats x={status.stats} i={i} />}
      {test && <p data-testid={`device-test-result-${i}`} className={`text-[11px] font-mono break-words ${test.ok ? "text-emerald-400" : "text-red-400"}`}>{test.ok ? "TES OK: " : "TES GAGAL: "}{test.message}</p>}
      <div className="flex gap-1.5 pt-1">
        <button data-testid={`device-test-${i}`} onClick={() => onTest(d)} className="h-8 px-3 text-xs flex items-center gap-1 bg-slate-800 hover:bg-slate-700 rounded-sm"><PlugZap size={13} />Test Koneksi</button>
        <button data-testid={`device-edit-${i}`} onClick={() => onEdit(d)} className="h-8 w-8 grid place-items-center bg-slate-800 hover:bg-slate-700 rounded-sm"><Pencil size={13} /></button>
        <button data-testid={`device-delete-${i}`} onClick={() => onDelete(d)} className="h-8 w-8 grid place-items-center bg-slate-800 hover:bg-red-800 rounded-sm"><Trash2 size={13} /></button>
      </div>
    </div>
  );
};
