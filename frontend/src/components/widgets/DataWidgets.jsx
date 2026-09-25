import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Download, Check } from "lucide-react";
import { useRt, usePolling } from "@/hooks/useLive";
import { api } from "@/lib/api";
import { SERIES_COLORS } from "@/lib/format";

const hhmmss = (t) => new Date(t).toLocaleTimeString("id-ID", { hour12: false });
const pivot = (rows) => {
  const m = new Map();
  rows.forEach((r) => {
    const k = r.ts.slice(0, 19);
    if (!m.has(k)) m.set(k, { t: new Date(r.ts).getTime() });
    m.get(k)[r.tag_id] = r.v;
  });
  return [...m.values()];
};

const Frame = ({ title, right, children }) => (
  <div className="w-full h-full flex flex-col bg-[#0F172A] border border-slate-700/80 rounded-[3px] overflow-hidden">
    <div className="flex items-center justify-between px-3 h-8 border-b border-slate-800 bg-[#111827] shrink-0">
      <span className="text-[11px] font-bold tracking-[0.18em] text-slate-300 uppercase truncate">{title}</span>
      {right}
    </div>
    <div className="flex-1 min-h-0">{children}</div>
  </div>
);

const Chart = ({ data, tags, tagMap, yMin, yMax }) => (
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
      <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
      <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={hhmmss} stroke="#475569" fontSize={10} tick={{ fill: "#64748B" }} />
      <YAxis domain={[yMin === "" || yMin == null ? "auto" : Number(yMin), yMax === "" || yMax == null ? "auto" : Number(yMax)]} stroke="#475569" fontSize={10} tick={{ fill: "#64748B" }} />
      <Tooltip labelFormatter={hhmmss} contentStyle={{ background: "#0B0F17", border: "1px solid #1E293B", fontSize: 11 }} />
      <Legend wrapperStyle={{ fontSize: 10 }} />
      {tags.map((id, i) => (
        <Line key={id} dataKey={id} name={tagMap[id]?.name || "?"} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} strokeWidth={1.8} isAnimationActive={false} connectNulls />
      ))}
    </LineChart>
  </ResponsiveContainer>
);

export const Trend = ({ p }) => {
  const { values, tagMap, base, ts } = useRt();
  const tags = useMemo(() => (p.tags || []).filter((t) => tagMap[t]), [p.tags, tagMap]);
  const [data, setData] = useState([]);
  const win = Math.max(10, Number(p.window) || 120) * 1000;
  useEffect(() => {
    if (!base || !tags.length) return;
    api.get(`${base}/history`, { params: { tags: tags.join(","), minutes: Math.ceil(win / 60000) } }).then(({ data: rows }) => setData(pivot(rows))).catch(() => {});
  }, [base, tags, win]);
  useEffect(() => {
    if (!ts) return;
    const now = Date.now();
    const pt = { t: now };
    tags.forEach((id) => { if (values[id] !== undefined) pt[id] = Number(values[id]); });
    setData((d) => [...d.filter((x) => x.t > now - win), pt]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts]);
  return <Frame title={p.title}>{tags.length ? <Chart data={data} tags={tags} tagMap={tagMap} yMin={p.y_min} yMax={p.y_max} /> : <Empty />}</Frame>;
};

const Empty = () => <div className="h-full grid place-items-center text-xs text-slate-500 font-mono">Pilih tag di panel properti</div>;

const useHistory = (tags, minutes, interval, limit = 3000) => {
  const { base } = useRt();
  const [rows, setRows] = useState([]);
  usePolling(async (alive) => {
    if (!base || !tags.length) return;
    try {
      const { data } = await api.get(`${base}/history`, { params: { tags: tags.join(","), minutes, limit } });
      if (alive()) setRows(pivot(data));
    } catch { /* ignore */ }
  }, [base, tags.join(","), minutes], interval);
  return rows;
};

export const HistoryTrend = ({ p }) => {
  const { tagMap } = useRt();
  const tags = (p.tags || []).filter((t) => tagMap[t]);
  const [range, setRange] = useState(Number(p.minutes) || 30);
  useEffect(() => setRange(Number(p.minutes) || 30), [p.minutes]);
  const rows = useHistory(tags, range, 10000, 5000);
  const right = (
    <div className="flex gap-1">
      {[5, 30, 60, 360, 1440].map((m) => (
        <button key={m} data-testid={`history-range-${m}`} onClick={() => setRange(m)} className={`px-1.5 text-[10px] font-mono rounded-sm ${range === m ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}>
          {m < 60 ? `${m}m` : `${m / 60}j`}
        </button>
      ))}
    </div>
  );
  return <Frame title={p.title} right={right}>{tags.length ? <Chart data={rows} tags={tags} tagMap={tagMap} /> : <Empty />}</Frame>;
};

export const DataRecord = ({ p }) => {
  const { tagMap } = useRt();
  const tags = (p.tags || []).filter((t) => tagMap[t]);
  const n = Math.max(1, Number(p.rows) || 20);
  const rows = useHistory(tags, 1440, 5000, n * Math.max(tags.length, 1)).slice(-n).reverse();
  const csv = () => {
    const head = ["Waktu", ...tags.map((t) => tagMap[t].name)].join(",");
    const body = rows.map((r) => [new Date(r.t).toLocaleString("id-ID"), ...tags.map((t) => r[t] ?? "")].join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: "text/csv" }));
    a.download = "data-record.csv";
    a.click();
  };
  const right = <button data-testid="data-record-export" onClick={csv} className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px] font-mono"><Download size={12} />CSV</button>;
  if (!tags.length) return <Frame title={p.title}><Empty /></Frame>;
  return (
    <Frame title={p.title} right={right}>
      <div className="h-full overflow-auto hmi-scroll">
        <table className="w-full text-[11px] font-mono">
          <thead className="sticky top-0 bg-[#111827] text-slate-400">
            <tr><th className="text-left px-2 py-1 font-semibold">WAKTU</th>{tags.map((t) => <th key={t} className="text-right px-2 py-1 font-semibold">{tagMap[t].name}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t} className="border-t border-slate-800/80 hover:bg-slate-800/40">
                <td className="px-2 py-1 text-slate-400 whitespace-nowrap">{new Date(r.t).toLocaleString("id-ID", { hour12: false })}</td>
                {tags.map((t) => <td key={t} className="px-2 py-1 text-right text-emerald-400">{r[t] === undefined ? "-" : Number(r[t]).toFixed(tagMap[t].decimals || 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
};

const LEVEL_CLS = { HH: "bg-red-600 text-white", LL: "bg-red-600 text-white", H: "bg-amber-500 text-black", L: "bg-amber-500 text-black", ON: "bg-red-500 text-white" };

export const AlarmTable = ({ p }) => {
  const { base, mode, allowOperate } = useRt();
  const [rows, setRows] = useState([]);
  const [bump, setBump] = useState(0);
  usePolling(async (alive) => {
    if (!base) return;
    try {
      const { data } = await api.get(`${base}/alarms`, { params: { active_only: !!p.active_only, limit: 100 } });
      if (alive()) setRows(data);
    } catch { /* ignore */ }
  }, [base, p.active_only, bump], 2000);
  const can = mode === "run" && allowOperate;
  const ack = async (id) => { await api.post(`${base}/alarms/ack`, { alarm_id: id || null }).catch(() => {}); setBump((b) => b + 1); };
  const right = can && <button data-testid="alarm-ack-all" onClick={() => ack()} className="text-[10px] font-mono text-slate-300 hover:text-white border border-slate-600 px-1.5 rounded-sm">ACK SEMUA</button>;
  return (
    <Frame title={p.title} right={right}>
      <div className="h-full overflow-auto hmi-scroll">
        <table className="w-full text-[11px] font-mono">
          <thead className="sticky top-0 bg-[#111827] text-slate-400">
            <tr><th className="text-left px-2 py-1">WAKTU</th><th className="px-1">LVL</th><th className="text-left px-2">PESAN</th><th className="text-right px-2">NILAI</th><th className="px-2">STATUS</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} data-testid="alarm-row" className={`border-t border-slate-800/80 ${a.active && !a.acked ? "hmi-alarm-row" : ""}`}>
                <td className="px-2 py-1 text-slate-400 whitespace-nowrap">{new Date(a.ts_in).toLocaleTimeString("id-ID", { hour12: false })}</td>
                <td className="px-1 text-center"><span className={`px-1 rounded-sm text-[10px] font-bold ${LEVEL_CLS[a.level]}`}>{a.level}</span></td>
                <td className={`px-2 ${a.active ? "text-slate-100" : "text-slate-500"}`}>{a.message}</td>
                <td className="px-2 text-right text-slate-300">{Number(a.value).toFixed(1)}</td>
                <td className="px-2 text-center whitespace-nowrap">
                  {a.acked ? <span className="text-slate-500 inline-flex items-center gap-0.5"><Check size={11} />ACK</span>
                    : can ? <button data-testid="alarm-ack-btn" onClick={() => ack(a.id)} className="text-amber-400 hover:text-amber-300 underline">ACK</button>
                    : <span className="text-amber-400">BARU</span>}
                  {!a.active && <span className="ml-1 text-emerald-500">OK</span>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="text-center text-slate-500 py-6">Tidak ada alarm</td></tr>}
          </tbody>
        </table>
      </div>
    </Frame>
  );
};
