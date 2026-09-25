import { useRef, useState } from "react";
import { useRt } from "@/hooks/useLive";

export const pickState = (states = [], v, bit) => {
  if (bit) return states[v ? 1 : 0] || {};
  return states.find((s) => Number(s.value) === Number(v)) || { text: v === undefined ? "--" : String(v), bg: "#1E293B", color: "#94A3B8" };
};

export const useCanOperate = (minLevel = 0) => {
  const { mode, allowOperate, level = 99 } = useRt();
  return mode === "run" && allowOperate && level >= (Number(minLevel) || 0);
};

const shade = (hex, amt) => {
  const n = parseInt((hex || "#334155").replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const c = (s) => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
};

export const Surface = ({ shape, bg, color, pressed, blink, lit, lamp, children, style }) => {
  const radius = { flat: 2, rounded: 10, pill: 9999, bevel3d: 4, circle: 9999, square: 3, led_bar: 3, bezel_round: 9999, bezel_square: 6 }[shape] ?? 4;
  const face = {
    background: lamp ? `radial-gradient(circle at 35% 30%, ${shade(bg, 70)}, ${bg} 55%, ${shade(bg, -40)})` : shape === "bevel3d" ? `linear-gradient(180deg, ${shade(bg, 35)}, ${bg} 55%, ${shade(bg, -25)})` : bg,
    color, borderRadius: radius, transition: "background 150ms, box-shadow 150ms, transform 80ms",
    boxShadow: [
      shape === "bevel3d" && (pressed ? "inset 0 3px 6px rgba(0,0,0,.55)" : "inset 0 2px 0 rgba(255,255,255,.25), inset 0 -3px 0 rgba(0,0,0,.35), 0 2px 5px rgba(0,0,0,.6)"),
      lit && `0 0 14px ${bg}`,
      shape === "led_bar" && "inset 0 -40% 0 rgba(0,0,0,.18)",
    ].filter(Boolean).join(",") || undefined,
    transform: pressed && shape !== "bevel3d" ? "scale(0.97)" : undefined,
    border: shape === "flat" || shape === "rounded" || shape === "pill" ? "1px solid rgba(255,255,255,.12)" : undefined,
    ...style,
  };
  const inner = <div className={`w-full h-full flex items-center justify-center text-center leading-tight overflow-hidden px-1 ${blink ? "hmi-blink" : ""}`} style={face}>{children}</div>;
  if (!shape?.startsWith("bezel")) return inner;
  return (
    <div className="w-full h-full" style={{ padding: "9%", borderRadius: radius, background: "linear-gradient(145deg,#E2E8F0,#64748B 45%,#1E293B)", boxShadow: "0 2px 6px #000a" }}>
      <div className="w-full h-full" style={{ padding: "4%", borderRadius: radius, background: "#0B0F17" }}>{inner}</div>
    </div>
  );
};

const Txt = ({ p, st }) => (
  <span style={{ fontFamily: p.font_family, fontSize: p.font_size, color: st.color, fontWeight: 700 }} className="tracking-wide whitespace-pre-wrap">{st.text}</span>
);

export const BitButton = ({ p }) => {
  const { values, write } = useRt();
  const can = useCanOperate(p.min_level);
  const [pressed, setPressed] = useState(false);
  const timer = useRef();
  const on = !!values[p.read_tag || p.tag];
  const st = pickState(p.states, on, true);
  const hold = p.mode === "momentary" && !(Number(p.pulse_ms) > 0);
  const down = () => { if (!can) return; setPressed(true); if (hold) write(p.tag, true); };
  const up = () => { if (!pressed) return; setPressed(false); if (hold) write(p.tag, false); };
  const click = () => {
    if (!can || !p.tag || hold) return;
    if (p.mode === "set_on") write(p.tag, true);
    if (p.mode === "set_off") write(p.tag, false);
    if (p.mode === "toggle") write(p.tag, !values[p.tag]);
    if (p.mode === "momentary") {
      write(p.tag, true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => write(p.tag, false), Number(p.pulse_ms));
    }
  };
  return (
    <button type="button" data-testid="hmi-bit-button" className="w-full h-full block" onClick={click} onPointerDown={down} onPointerUp={up} onPointerLeave={up} style={{ cursor: can ? "pointer" : "default" }}>
      <Surface shape={p.shape} bg={st.bg} color={st.color} pressed={pressed} blink={st.blink}><Txt p={p} st={st} /></Surface>
    </button>
  );
};

export const WordButton = ({ p }) => {
  const { values, write } = useRt();
  const can = useCanOperate(p.min_level);
  const [pressed, setPressed] = useState(false);
  const cur = Number(values[p.read_tag || p.tag] ?? 0);
  const st = pickState(p.states, cur, false);
  const click = () => {
    if (!can || !p.tag) return;
    const step = Number(p.step) || 1, lo = Number(p.min ?? -Infinity), hi = Number(p.max ?? Infinity);
    if (p.mode === "set_value") write(p.tag, Number(p.value));
    if (p.mode === "increment") write(p.tag, Math.min(hi, cur + step));
    if (p.mode === "decrement") write(p.tag, Math.max(lo, cur - step));
    if (p.mode === "cycle" && p.states?.length) {
      const i = p.states.findIndex((s) => Number(s.value) === cur);
      write(p.tag, Number(p.states[(i + 1) % p.states.length].value));
    }
  };
  return (
    <button type="button" data-testid="hmi-word-button" className="w-full h-full block" onClick={click} onPointerDown={() => can && setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)} style={{ cursor: can ? "pointer" : "default" }}>
      <Surface shape={p.shape} bg={st.bg} color={st.color} pressed={pressed} blink={st.blink}><Txt p={p} st={{ ...st, text: p.caption || st.text }} /></Surface>
    </button>
  );
};

const LampBody = ({ p, st, lit }) => (
  <div className="w-full h-full" data-testid="hmi-lamp">
    <Surface shape={p.shape} bg={st.bg} color={st.color} blink={st.blink} lit={lit} lamp={p.shape !== "led_bar"}>
      {p.show_text && <Txt p={p} st={st} />}
    </Surface>
  </div>
);

export const BitLamp = ({ p }) => {
  const { values } = useRt();
  const on = !!values[p.tag];
  return <LampBody p={p} st={pickState(p.states, on, true)} lit={on} />;
};

export const WordLamp = ({ p }) => {
  const { values } = useRt();
  const v = values[p.tag];
  const idx = (p.states || []).findIndex((s) => Number(s.value) === Number(v));
  return <LampBody p={p} st={pickState(p.states, v, false)} lit={idx > 0} />;
};

export const CHAR_LEN = { BOOL: 1, INT16: 2, UINT16: 2, INT32: 4, UINT32: 4, FLOAT32: 4 };

export const CharDisplay = ({ p }) => {
  const { values, tagMap } = useRt();
  const v = values[p.tag];
  let text = "";
  if (p.mode === "message") text = pickState(p.states, v, false).text;
  else if (v !== undefined) {
    const size = CHAR_LEN[tagMap[p.tag]?.data_type] || 2;
    let n = Math.round(Number(v));
    if (n < 0) n += 2 ** (size * 8);
    for (let i = size - 1; i >= 0; i--) {
      const b = Math.floor(n / 2 ** (i * 8)) % 256;
      text += b >= 32 && b < 127 ? String.fromCharCode(b) : "";
    }
  }
  return (
    <div className="w-full h-full flex flex-col justify-center px-2 border border-slate-700/80 rounded-[3px] overflow-hidden" style={{ background: p.bg }}>
      {p.label && <span className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase leading-tight">{p.label}</span>}
      <span data-testid="hmi-char-display" className="whitespace-nowrap overflow-hidden" style={{ fontFamily: p.font_family, fontSize: p.font_size, color: p.color, textAlign: p.align }}>{text || "\u00A0"}</span>
    </div>
  );
};

export const FuncButton = ({ p }) => {
  const rt = useRt();
  const can = rt.mode === "run" && (rt.level ?? 99) >= (Number(p.min_level) || 0);
  const [pressed, setPressed] = useState(false);
  const click = () => {
    if (!can) return;
    ({ open_screen: () => rt.openScreen?.(p.screen_id), open_subscreen: () => rt.openSub?.(p.screen_id), previous: () => rt.prevScreen?.(), next: () => rt.nextScreen?.(), close_subscreen: () => rt.closeSub?.() })[p.action]?.();
  };
  return (
    <button type="button" data-testid="hmi-func-button" className="w-full h-full block" onClick={click} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}>
      <Surface shape={p.shape} bg={p.bg} color={p.color} pressed={pressed}><Txt p={p} st={{ text: p.text, color: p.color }} /></Surface>
    </button>
  );
};
