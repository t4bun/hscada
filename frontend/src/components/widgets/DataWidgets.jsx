import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Area, Brush } from "recharts";
import { Download, Check } from "lucide-react";
import { useRt, usePolling } from "@/hooks/useLive";
import { api } from "@/lib/api";
import { SERIES_COLORS } from "@/lib/format";
import { ChartSettings, useChartPrefs, SPAN_MS, toLocalInput } from "./ChartSettings";

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

const Chart = ({ data, tags, tagMap, yMin, yMax, fmt = hhmmss }) => (
  <ResponsiveContainer width="100%" height="100%" minWidth={50} minHeight={50}>
    <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
      <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" />
      <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={fmt} stroke="#475569" fontSize={10} tick={{ fill: "#64748B" }} />
      <YAxis domain={[yMin === "" || yMin == null ? "auto" : Number(yMin), yMax === "" || yMax == null ? "auto" : Number(yMax)]} stroke="#475569" fontSize={10} tick={{ fill: "#64748B" }} />
      <Tooltip labelFormatter={hhmmss} contentStyle={{ background: "#0B0F17", border: "1px solid #1E293B", fontSize: 11 }} />
      <Legend wrapperStyle={{ fontSize: 10 }} />
      {tags.map((id, i) => (
        <Line key={id} dataKey={id} name={tagMap[id]?.name || "?"} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} strokeWidth={1.8} isAnimationActive={false} connectNulls />
      ))}
    </LineChart>
  </ResponsiveContainer>
);

export const Trend = ({ p, w }) => {
  const { values, tagMap, base, ts } = useRt();
  const tags = useMemo(() => (p.tags || []).filter((t) => tagMap[t]), [p.tags, tagMap]);
  const [data, setData] = useState([]);
  const defSec = Math.max(10, Number(p.window) || 120);
  const [prefs, save, reset, custom] = useChartPrefs(`scada-chart:${base}:${w?.id}`, { span_value: Math.max(1, Math.round(defSec / 60)), span_unit: "min" });
  const win = custom ? Number(prefs.span_value) * SPAN_MS[prefs.span_unit] : defSec * 1000;
  useEffect(() => {
    if (!base || !tags.length) return;
    api.get(`${base}/history`, { params: { tags: tags.join(","), minutes: Math.ceil(win / 60000), limit: 20000 } }).then(({ data: rows }) => setData(pivot(rows))).catch(() => {});
  }, [base, tags, win]);
  useEffect(() => {
    if (!ts) return;
    const now = Date.now();
    const pt = { t: now };
    tags.forEach((id) => { if (values[id] !== undefined) pt[id] = Number(values[id]); });
    setData((d) => [...d.filter((x) => x.t > now - win), pt].slice(-20000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ts]);
  const fmt = win > SPAN_MS.day ? (t) => fmtTs(t, "DD/MM", "HH:mm") : hhmmss;
  const right = <ChartSettings testid="trend" prefs={prefs} onApply={save} onReset={reset} custom={custom} maxMs={7 * SPAN_MS.day} />;
  return <Frame title={p.title} right={right}>{tags.length ? <Chart data={data} tags={tags} tagMap={tagMap} yMin={p.y_min} yMax={p.y_max} fmt={fmt} /> : <Empty />}</Frame>;
};

const Empty = () => <div className="h-full grid place-items-center text-xs text-slate-500 font-mono">Pilih tag di panel properti</div>;

const pad = (n) => String(n).padStart(2, "0");
export const fmtTs = (t, df = "DD/MM", tf = "HH:mm:ss") => {
  const d = new Date(t);
  const date = { none: "", "DD/MM": `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, "DD/MM/YY": `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`,
    "MM/DD": `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`, "YYYY-MM-DD": `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }[df] ?? "";
  const time = { none: "", "HH:mm": `${pad(d.getHours())}:${pad(d.getMinutes())}`, "HH:mm:ss": `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` }[tf] ?? "";
  return [date, time].filter(Boolean).join(" ");
};
const flat = (rows) => rows.map((r) => ({ t: new Date(r.ts).getTime(), ...r.v }));

export const HistoryTrend = ({ p, w }) => {
  const { base, records } = useRt();
  const rec = (records || []).find((r) => r.number === Number(p.record_no));
  const defSpan = { span_value: Math.max(1, Number(p.span_value) || 30), span_unit: SPAN_MS[p.span_unit] ? p.span_unit : "min" };
  const defStart = useMemo(() => (p.start_option === "custom" ? Date.now() - defSpan.span_value * SPAN_MS[defSpan.span_unit] : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.start_option, defSpan.span_value, defSpan.span_unit]);
  const [prefs, save, reset, custom] = useChartPrefs(`scada-chart:${base}:${w?.id}`, { ...defSpan, start: defStart });
  const span = Number(prefs.span_value) * SPAN_MS[prefs.span_unit];
  const start = prefs.start;
  const setStart = (fn) => save({ ...prefs, start: typeof fn === "function" ? fn(start) : fn });
  const [rows, setRows] = useState([]);
  usePolling(async (alive) => {
    if (!base || !rec) return;
    const end = start === null ? Date.now() : start + span;
    const s = start === null ? end - span : start;
    try {
      const { data } = await api.get(`${base}/records/${rec.number}/samples`, { params: { start: new Date(s).toISOString(), end: new Date(end).toISOString(), limit: 20000 } });
      if (alive()) setRows(flat(data));
    } catch { /* ignore */ }
  }, [base, rec?.number, start, span], start === null ? 5000 : 0);
  const lines = (rec?.channels || []).map((c, i) => ({ tag_id: c.tag_id, name: c.name, enabled: true, type: "line", width: 2, color: SERIES_COLORS[i % SERIES_COLORS.length], ...(p.lines || []).find((l) => l.tag_id === c.tag_id) })).filter((l) => l.enabled);
  const shift = (d) => setStart((s) => (s === null ? Date.now() - span : s) + d * span);
  const btn = "px-1.5 text-[10px] font-mono rounded-sm text-slate-400 hover:text-white";
  const right = (
    <div className="flex items-center gap-1">
      <button data-testid="history-prev" onClick={() => shift(-1)} className={btn}>◀</button>
      {start !== null && <input data-testid="history-start-input" type="datetime-local" value={toLocalInput(start)} onChange={(e) => e.target.value && setStart(new Date(e.target.value).getTime())} className="bg-transparent text-[10px] text-slate-300 font-mono w-36" />}
      <button data-testid="history-next" onClick={() => shift(1)} className={btn}>▶</button>
      <button data-testid="history-now" onClick={() => setStart(null)} className={`${btn} ${start === null ? "bg-blue-600 text-white" : ""}`}>NOW</button>
      <span data-testid="history-span-label" className="text-[10px] font-mono text-slate-500">{prefs.span_value} {prefs.span_unit}</span>
      <ChartSettings testid="history" prefs={prefs} onApply={save} onReset={reset} custom={custom} showStart />
    </div>
  );
  if (!rec) return <Frame title={p.title}><div className="h-full grid place-items-center text-xs text-slate-500 font-mono">Data record #{p.record_no} belum dibuat</div></Frame>;
  const dom = (v) => (v === "" || v == null ? "auto" : Number(v));
  return (
    <div className="w-full h-full" style={{ opacity: Number(p.opacity) || 1 }}>
      <Frame title={`${p.title} · #${rec.number}`} right={right}>
        <div className="w-full h-full" style={{ background: p.bg }}>
          <ResponsiveContainer width="100%" height="100%" minWidth={50} minHeight={50}>
            <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={p.grid_color} />
              <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickCount={(Number(p.x_grids) || 6) + 1} tickFormatter={(t) => fmtTs(t, p.date_format, p.time_format)} stroke="#475569" fontSize={10} tick={{ fill: "#64748B" }} />
              <YAxis domain={[dom(p.y_min), dom(p.y_max)]} allowDataOverflow tickCount={(Number(p.y_grids) || 5) + 1} stroke="#475569" fontSize={10} tick={{ fill: "#64748B" }} />
              <Tooltip labelFormatter={(t) => fmtTs(t, "DD/MM/YY", "HH:mm:ss")} contentStyle={{ background: "#0B0F17", border: "1px solid #1E293B", fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {lines.map((l) => l.type === "area"
                ? <Area key={l.tag_id} dataKey={l.tag_id} name={l.name} stroke={l.color} fill={l.color} fillOpacity={0.2} strokeWidth={Number(l.width) || 2} isAnimationActive={false} connectNulls />
                : <Line key={l.tag_id} dataKey={l.tag_id} name={l.name} type={l.type === "step" ? "stepAfter" : "linear"} stroke={l.color} strokeWidth={Number(l.width) || 2} strokeDasharray={l.type === "dashed" ? "6 4" : undefined} dot={false} isAnimationActive={false} connectNulls />)}
              {p.show_slider && rows.length > 1 && <Brush dataKey="t" height={16} stroke="#3B82F6" fill="#0B0F17" tickFormatter={(t) => fmtTs(t, "none", "HH:mm")} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Frame>
    </div>
  );
};

export const DataRecord = ({ p }) => {
  const { base, records } = useRt();
  const rec = (records || []).find((r) => r.number === Number(p.record_no));
  const n = Math.max(1, Number(p.rows) || 20);
  const [rows, setRows] = useState([]);
  usePolling(async (alive) => {
    if (!base || !rec) return;
    try {
      const { data } = await api.get(`${base}/records/${rec.number}/samples`, { params: { minutes: 10080, limit: n } });
      if (alive()) setRows(flat(data).reverse());
    } catch { /* ignore */ }
  }, [base, rec?.number, n], 5000);
  if (!rec) return <Frame title={p.title}><div className="h-full grid place-items-center text-xs text-slate-500 font-mono">Data record #{p.record_no} belum dibuat</div></Frame>;
  const ch = rec.channels;
  const csv = () => {
    const head = ["Waktu", ...ch.map((c) => c.name)].join(",");
    const body = rows.map((r) => [new Date(r.t).toLocaleString("id-ID"), ...ch.map((c) => r[c.tag_id] ?? "")].join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`${head}\n${body}`], { type: "text/csv" }));
    a.download = `data-record-${rec.number}.csv`;
    a.click();
  };
  const right = <button data-testid="data-record-export" onClick={csv} className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px] font-mono"><Download size={12} />CSV</button>;
  return (
    <Frame title={`${p.title} · #${rec.number}`} right={right}>
      <div className="h-full overflow-auto hmi-scroll">
        <table className="w-full text-[11px] font-mono">
          <thead className="sticky top-0 bg-[#111827] text-slate-400">
            <tr><th className="text-left px-2 py-1 font-semibold">WAKTU</th>{ch.map((c) => <th key={c.tag_id} className="text-right px-2 py-1 font-semibold whitespace-nowrap">{c.name}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t} className="border-t border-slate-800/80 hover:bg-slate-800/40">
                <td className="px-2 py-1 text-slate-400 whitespace-nowrap">{new Date(r.t).toLocaleString("id-ID", { hour12: false })}</td>
                {ch.map((c) => <td key={c.tag_id} className="px-2 py-1 text-right text-emerald-400">{r[c.tag_id] === undefined ? "-" : Number(r[c.tag_id]).toFixed(c.decimals || 0)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
};

const LEVEL_CLS = { HH: "bg-red-600 text-white", LL: "bg-red-600 text-white", H: "bg-amber-500 text-black", L: "bg-amber-500 text-black", ON: "bg-red-500 text-white", BIT: "bg-red-500 text-white", HI: "bg-red-600 text-white", LO: "bg-amber-500 text-black", EQ: "bg-sky-500 text-black", RNG: "bg-fuchsia-600 text-white" };

export const AlarmTable = ({ p }) => {
  const { base, mode, allowOperate, canAck } = useRt();
  const [rows, setRows] = useState([]);
  const [bump, setBump] = useState(0);
  usePolling(async (alive) => {
    if (!base) return;
    try {
      const { data } = await api.get(`${base}/alarms`, { params: { active_only: !!p.active_only, limit: 100 } });
      if (alive()) setRows(Number(p.group_no) ? data.filter((a) => Number(a.group ?? 1) === Number(p.group_no)) : data);
    } catch { /* ignore */ }
  }, [base, p.active_only, p.group_no, bump], 2000);
  const can = mode === "run" && (canAck ?? allowOperate);
  const ack = async (id) => { await api.post(`${base}/alarms/ack`, { alarm_id: id || null }).catch(() => {}); setBump((b) => b + 1); };
  const right = can && <button data-testid="alarm-ack-all" onClick={() => ack()} className="text-[10px] font-mono text-slate-300 hover:text-white border border-slate-600 px-1.5 rounded-sm">ACK SEMUA</button>;
  return (
    <Frame title={p.title} right={right}>
      <div className="h-full overflow-auto hmi-scroll">
        <table className="w-full text-[11px] font-mono">
          <thead className="sticky top-0 bg-[#111827] text-slate-400">
            <tr><th className="text-left px-2 py-1">WAKTU</th><th className="px-1">GRP</th><th className="px-1">LVL</th><th className="text-left px-2">PESAN</th><th className="text-right px-2">NILAI</th><th className="px-2">STATUS</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} data-testid="alarm-row" className={`border-t border-slate-800/80 ${a.active && !a.acked ? "hmi-alarm-row" : ""}`}>
                <td className="px-2 py-1 text-slate-400 whitespace-nowrap">{new Date(a.ts_in).toLocaleTimeString("id-ID", { hour12: false })}</td>
                <td className="px-1 text-center text-slate-500">{a.group ?? "-"}</td>
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
            {!rows.length && <tr><td colSpan={6} className="text-center text-slate-500 py-6">Tidak ada alarm</td></tr>}
          </tbody>
        </table>
      </div>
    </Frame>
  );
};
