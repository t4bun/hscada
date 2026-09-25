import { useRt } from "@/hooks/useLive";

const pct = (v, min, max) => Math.max(0, Math.min(1, (Number(v) - Number(min)) / ((Number(max) - Number(min)) || 1)));
const fmt = (v, d = 1) => (v === undefined || v === null ? "--" : Number(v).toFixed(d));

export const Gauge = ({ p }) => {
  const { values } = useRt();
  const v = values[p.tag];
  const f = pct(v ?? p.min, p.min, p.max);
  const R = 80, C = 100, start = 135, sweep = 270;
  const pt = (deg, r = R) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (a0, a1, r = R) => {
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const color = v >= p.danger ? "#EF4444" : v >= p.warn ? "#F59E0B" : p.color;
  const wf = start + sweep * pct(p.warn, p.min, p.max), df = start + sweep * pct(p.danger, p.min, p.max);
  const [nx, ny] = pt(start + sweep * f, 62);
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full">
      <path d={arc(start, start + sweep)} stroke="#1E293B" strokeWidth="14" fill="none" strokeLinecap="butt" />
      <path d={arc(wf, df, 94)} stroke="#F59E0B" strokeWidth="4" fill="none" />
      <path d={arc(df, start + sweep, 94)} stroke="#EF4444" strokeWidth="4" fill="none" />
      {f > 0.002 && <path d={arc(start, start + sweep * f)} stroke={color} strokeWidth="14" fill="none" style={{ transition: "stroke 200ms" }} />}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const [x, y] = pt(start + sweep * t, 66);
        return <text key={t} x={x} y={y} fill="#64748B" fontSize="9" textAnchor="middle" dominantBaseline="middle" fontFamily="JetBrains Mono">{fmt(p.min + (p.max - p.min) * t, 0)}</text>;
      })}
      <line x1={C} y1={C} x2={nx} y2={ny} stroke="#F8FAFC" strokeWidth="3" strokeLinecap="round" style={{ transition: "all 600ms ease-out" }} />
      <circle cx={C} cy={C} r="6" fill="#F8FAFC" />
      <text x={C} y={138} fill={color} fontSize="24" fontWeight="700" textAnchor="middle" fontFamily="JetBrains Mono" data-testid="hmi-gauge-value">{fmt(v, p.decimals)}</text>
      <text x={C} y={156} fill="#94A3B8" fontSize="10" textAnchor="middle" fontFamily="IBM Plex Sans">{p.unit}</text>
      <text x={C} y={186} fill="#94A3B8" fontSize="11" fontWeight="600" textAnchor="middle" letterSpacing="2" fontFamily="IBM Plex Sans">{p.label}</text>
    </svg>
  );
};

export const Bar = ({ p }) => {
  const { values } = useRt();
  const v = values[p.tag];
  const f = pct(v ?? p.min, p.min, p.max) * 100;
  const vert = p.orientation === "vertical";
  return (
    <div className="relative w-full h-full border border-slate-700 overflow-hidden" style={{ background: p.bg, borderRadius: 2 }}>
      <div
        className="absolute left-0 bottom-0"
        style={{ background: p.color, width: vert ? "100%" : `${f}%`, height: vert ? `${f}%` : "100%", transition: "width 600ms, height 600ms" }}
      />
      {[25, 50, 75].map((t) => (
        <div key={t} className="absolute bg-slate-500/40" style={vert ? { left: 0, width: "30%", bottom: `${t}%`, height: 1 } : { top: 0, height: "30%", left: `${t}%`, width: 1 }} />
      ))}
      {p.show_value && (
        <span className="absolute inset-0 grid place-items-center font-mono text-[11px] font-bold text-white drop-shadow">{fmt(v, 1)}</span>
      )}
    </div>
  );
};

export const Tank = ({ p }) => {
  const { values } = useRt();
  const v = values[p.tag];
  const f = pct(v ?? p.min, p.min, p.max);
  const top = 20 + 150 * (1 - f);
  return (
    <svg viewBox="0 0 120 200" className="w-full h-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`tg-${p.color}`} x1="0" x2="1">
          <stop offset="0" stopColor={p.color} stopOpacity="0.75" />
          <stop offset="0.5" stopColor={p.color} />
          <stop offset="1" stopColor={p.color} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <rect x="10" y="12" width="100" height="166" rx="14" fill="#0F172A" stroke="#475569" strokeWidth="2" />
      <rect x="12" y={top} width="96" height={176 - top} rx="10" fill={`url(#tg-${p.color})`} style={{ transition: "y 700ms, height 700ms" }} />
      {[0.25, 0.5, 0.75].map((t) => <line key={t} x1="100" x2="110" y1={20 + 150 * t} y2={20 + 150 * t} stroke="#94A3B8" strokeWidth="1" />)}
      {p.show_value && (
        <text x="60" y="100" textAnchor="middle" fill="#F8FAFC" fontSize="18" fontWeight="700" fontFamily="JetBrains Mono" data-testid="hmi-tank-value">{fmt(v, 1)}</text>
      )}
      <text x="60" y="196" textAnchor="middle" fill="#94A3B8" fontSize="10" fontWeight="600" letterSpacing="1.5" fontFamily="IBM Plex Sans">{p.label}</text>
    </svg>
  );
};
