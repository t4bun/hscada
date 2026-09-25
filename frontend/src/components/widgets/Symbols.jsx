import { useRt } from "@/hooks/useLive";
import { pickState } from "./MultiState";

const Pump = ({ c, run }) => (
  <>
    <rect x="58" y="14" width="30" height="16" fill="#475569" stroke="#0B0F17" strokeWidth="2" />
    <rect x="18" y="82" width="64" height="10" rx="2" fill="#334155" />
    <circle cx="50" cy="52" r="32" fill={c} stroke="#0B0F17" strokeWidth="3" />
    <g className={run ? "hmi-spin" : ""} style={{ transformOrigin: "50px 52px" }}>
      {[0, 120, 240].map((a) => <path key={a} d="M50 52 L50 28 Q60 34 56 50 Z" fill="#0B0F17" opacity=".55" transform={`rotate(${a} 50 52)`} />)}
    </g>
    <circle cx="50" cy="52" r="6" fill="#E2E8F0" />
  </>
);

const Valve = ({ c }) => (
  <>
    <rect x="44" y="8" width="12" height="10" fill="#94A3B8" />
    <rect x="30" y="4" width="40" height="8" rx="2" fill={c} stroke="#0B0F17" strokeWidth="2" />
    <line x1="50" y1="18" x2="50" y2="52" stroke="#94A3B8" strokeWidth="5" />
    <path d="M8 32 L50 56 L8 80 Z M92 32 L50 56 L92 80 Z" fill={c} stroke="#0B0F17" strokeWidth="3" strokeLinejoin="round" />
    <circle cx="50" cy="56" r="5" fill="#0B0F17" />
  </>
);

const Motor = ({ c, run }) => (
  <>
    <rect x="14" y="80" width="12" height="10" fill="#334155" /><rect x="62" y="80" width="12" height="10" fill="#334155" />
    <rect x="6" y="30" width="16" height="44" rx="3" fill="#475569" stroke="#0B0F17" strokeWidth="2" />
    <rect x="20" y="24" width="60" height="56" rx="6" fill={c} stroke="#0B0F17" strokeWidth="3" />
    {[34, 44, 54, 64].map((y) => <line key={y} x1="26" x2="74" y1={y} y2={y} stroke="#0B0F17" strokeOpacity=".35" strokeWidth="2" />)}
    <rect x="80" y="46" width="14" height="10" fill="#94A3B8" className={run ? "hmi-blink" : ""} />
  </>
);

const Conveyor = ({ c, run }) => (
  <>
    <rect x="4" y="36" width="92" height="28" rx="14" fill={c} stroke="#0B0F17" strokeWidth="3" />
    <line x1="14" y1="38" x2="86" y2="38" stroke="#0B0F17" strokeWidth="3" strokeDasharray="6 5" className={run ? "hmi-belt" : ""} />
    <line x1="14" y1="62" x2="86" y2="62" stroke="#0B0F17" strokeWidth="3" strokeDasharray="6 5" className={run ? "hmi-belt-rev" : ""} />
    {[18, 50, 82].map((x) => (
      <g key={x} className={run ? "hmi-spin" : ""} style={{ transformOrigin: `${x}px 50px` }}>
        <circle cx={x} cy="50" r="9" fill="#1E293B" stroke="#E2E8F0" strokeWidth="2" /><line x1={x - 7} y1="50" x2={x + 7} y2="50" stroke="#E2E8F0" strokeWidth="2" />
      </g>
    ))}
    <line x1="18" y1="64" x2="12" y2="94" stroke="#475569" strokeWidth="4" /><line x1="82" y1="64" x2="88" y2="94" stroke="#475569" strokeWidth="4" />
  </>
);

const Fan = ({ c, run }) => (
  <>
    <circle cx="50" cy="50" r="44" fill="#1E293B" stroke={c} strokeWidth="6" />
    <g className={run ? "hmi-spin-fast" : ""} style={{ transformOrigin: "50px 50px" }}>
      {[0, 90, 180, 270].map((a) => <ellipse key={a} cx="50" cy="28" rx="10" ry="20" fill={c} transform={`rotate(${a} 50 50)`} />)}
    </g>
    <circle cx="50" cy="50" r="7" fill="#E2E8F0" />
  </>
);

const SYMBOLS = { pump: Pump, valve: Valve, motor: Motor, conveyor: Conveyor, fan: Fan };

export const SymbolW = ({ p }) => {
  const { values } = useRt();
  const v = values[p.tag];
  const bit = p.tag_mode !== "word";
  const st = pickState(p.states, bit ? !!v : v, bit);
  const idx = bit ? (v ? 1 : 0) : (p.states || []).findIndex((s) => Number(s.value) === Number(v));
  const S = SYMBOLS[p.symbol] || Pump;
  return (
    <div className="w-full h-full flex flex-col items-center" data-testid={`hmi-symbol-${p.symbol}`}>
      <svg viewBox="0 0 100 100" className={`flex-1 w-full min-h-0 ${st.blink ? "hmi-blink" : ""}`}>
        <S c={st.bg || "#64748B"} run={p.animate && idx > 0} />
      </svg>
      {p.show_label && <span className="text-[10px] font-mono font-bold tracking-wider leading-none mt-0.5" style={{ color: st.color || "#94A3B8" }}>{p.label || st.text}</span>}
    </div>
  );
};
