import { useEffect, useState } from "react";
import { useRt } from "@/hooks/useLive";
import { formatValue, specFor } from "@/lib/format";
import { useCanOperate as useCanOp } from "./MultiState";

const useCanOperate = (minLevel) => useCanOp(minLevel);

export const ButtonW = ({ p }) => {
  const { values, write, gotoScreen } = useRt();
  const can = useCanOperate(p.min_level);
  const on = p.tag && !!values[p.tag];
  const click = () => {
    if (!can && p.action !== "goto") return;
    if (p.action === "goto") return gotoScreen?.(p.screen_id);
    if (!p.tag) return;
    if (p.action === "toggle") write(p.tag, !values[p.tag]);
    if (p.action === "set_on") write(p.tag, true);
    if (p.action === "set_off") write(p.tag, false);
    if (p.action === "set_value") write(p.tag, Number(p.value));
  };
  const mom = (v) => can && p.action === "momentary" && p.tag && write(p.tag, v);
  return (
    <button
      type="button"
      data-testid="hmi-button"
      onClick={click}
      onPointerDown={() => mom(true)}
      onPointerUp={() => mom(false)}
      onPointerLeave={() => p.action === "momentary" && on && mom(false)}
      className="w-full h-full font-bold tracking-wider uppercase border border-white/10 hmi-press"
      style={{ background: on ? p.on_bg : p.bg, color: p.color, fontSize: p.font_size, fontFamily: p.font_family, borderRadius: p.radius }}
    >
      {p.text}
    </button>
  );
};

export const SwitchW = ({ p }) => {
  const { values, write } = useRt();
  const can = useCanOperate(p.min_level);
  const on = !!values[p.tag];
  return (
    <button type="button" data-testid="hmi-switch" onClick={() => can && p.tag && write(p.tag, !on)} className="w-full h-full flex items-center gap-2 px-1">
      <span className="relative h-[70%] aspect-[1.8] rounded-full border border-white/10" style={{ background: on ? p.on_color : "#334155", transition: "background-color 150ms" }}>
        <span className="absolute top-[8%] h-[84%] aspect-square rounded-full bg-white shadow" style={{ left: on ? "calc(100% - 92%/1.8 - 4%)" : "4%", transition: "left 150ms" }} />
      </span>
      <span className="font-mono text-xs font-bold text-slate-200">{on ? p.on_label : p.off_label}</span>
    </button>
  );
};

export const Lamp = ({ p }) => {
  const { values } = useRt();
  const on = !!values[p.tag];
  const size = "min(100%, 100cqh)";
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1" style={{ containerType: "size" }}>
      <div
        className={on && p.blink ? "hmi-blink" : ""}
        style={{
          width: p.label ? "72cqmin" : "92cqmin", height: p.label ? "72cqmin" : "92cqmin", maxWidth: size,
          background: on ? `radial-gradient(circle at 35% 30%, #ffffffaa, ${p.on_color} 45%)` : p.off_color,
          borderRadius: p.shape === "circle" ? "9999px" : 4, border: "2px solid #0B0F17", outline: "1px solid #475569",
          boxShadow: on ? `0 0 16px ${p.on_color}` : "inset 0 2px 6px #0008",
        }}
      />
      {p.label && <span className="font-mono text-[10px] font-bold tracking-wider text-slate-400 leading-none">{p.label}</span>}
    </div>
  );
};

const NumBox = ({ p, children }) => (
  <div className="w-full h-full flex flex-col justify-center px-2 border border-slate-700/80" style={{ background: p.bg, borderRadius: 3 }}>
    {p.label && <span className="text-[10px] font-semibold tracking-widest text-slate-400 leading-tight uppercase">{p.label}</span>}
    {children}
  </div>
);

export const Numeric = ({ p }) => {
  const { values } = useRt();
  const txt = formatValue(values[p.tag], p.data_type, p.decimals);
  return (
    <NumBox p={p}>
      <div className="flex items-baseline gap-1 w-full" style={{ justifyContent: { left: "flex-start", center: "center", right: "flex-end" }[p.align] }}>
        <span data-testid="hmi-numeric-value" style={{ fontFamily: p.font_family, fontSize: p.font_size, color: p.color }} className="font-semibold tabular-nums leading-none">{txt}</span>
        {p.unit && <span className="text-xs text-slate-400">{p.unit}</span>}
      </div>
    </NumBox>
  );
};

export const NumericInput = ({ p }) => {
  const { values, write } = useRt();
  const can = useCanOperate(p.min_level);
  const sp = specFor(p.data_type, p.decimals);
  const cur = formatValue(values[p.tag], p.data_type, p.decimals);
  const [draft, setDraft] = useState(null);
  useEffect(() => setDraft(null), [p.tag]);
  const submit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (Number.isNaN(n)) return setDraft(null);
    write(p.tag, Math.min(sp.max, Math.max(sp.min, Number(n.toFixed(sp.decimals)))));
    setDraft(null);
  };
  return (
    <NumBox p={p}>
      <div className="flex items-baseline gap-1">
        <input
          data-testid="hmi-numeric-input"
          disabled={!can}
          value={draft ?? cur}
          maxLength={sp.maxChars}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9.-]/g, ""))}
          onBlur={submit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-full bg-transparent outline-none tabular-nums font-semibold leading-none border-b border-dashed border-slate-500 focus:border-blue-500 disabled:cursor-default"
          style={{ fontFamily: p.font_family, fontSize: p.font_size, color: p.color, textAlign: p.align }}
        />
        {p.unit && <span className="text-xs text-slate-400">{p.unit}</span>}
      </div>
    </NumBox>
  );
};

export const SliderW = ({ p }) => {
  const { values, write } = useRt();
  const can = useCanOperate(p.min_level);
  const v = Number(values[p.tag] ?? p.min);
  const [local, setLocal] = useState(null);
  return (
    <div className="w-full h-full flex items-center gap-2">
      <input
        type="range"
        data-testid="hmi-slider"
        disabled={!can}
        min={p.min} max={p.max} step={p.step}
        value={local ?? v}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={() => { if (local !== null) { write(p.tag, local); setLocal(null); } }}
        onKeyUp={() => { if (local !== null) { write(p.tag, local); setLocal(null); } }}
        className="hmi-range flex-1"
        style={{ accentColor: p.color }}
      />
      <span className="font-mono text-xs text-slate-300 w-10 text-right">{Number(local ?? v).toFixed(0)}</span>
    </div>
  );
};
