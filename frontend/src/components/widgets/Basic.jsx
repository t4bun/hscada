import { useRt } from "@/hooks/useLive";
import { assetUrl } from "@/lib/api";

const isOn = (values, tag) => !!(tag && values?.[tag]);

export const Label = ({ p }) => (
  <div
    className="w-full h-full flex items-center whitespace-pre-wrap overflow-hidden px-1"
    style={{
      fontFamily: p.font_family, fontSize: p.font_size, color: p.color, background: p.bg,
      fontWeight: p.bold ? 700 : 400, fontStyle: p.italic ? "italic" : "normal",
      justifyContent: { left: "flex-start", center: "center", right: "flex-end" }[p.align], textAlign: p.align,
    }}
  >
    {p.text}
  </div>
);

export const Rect = ({ p }) => {
  const { values } = useRt();
  return (
    <div
      className="w-full h-full"
      style={{
        background: isOn(values, p.tag) ? p.on_fill : p.fill, border: `${p.stroke_width}px solid ${p.stroke}`,
        borderRadius: p.radius, opacity: p.opacity, transition: "background-color 200ms",
      }}
    />
  );
};

export const CircleShape = ({ p }) => {
  const { values } = useRt();
  return (
    <div
      className="w-full h-full rounded-full"
      style={{
        background: isOn(values, p.tag) ? p.on_fill : p.fill, border: `${p.stroke_width}px solid ${p.stroke}`,
        opacity: p.opacity, transition: "background-color 200ms",
        boxShadow: isOn(values, p.tag) ? `0 0 18px ${p.on_fill}88` : "none",
      }}
    />
  );
};

export const Line = ({ p, w }) => {
  const { values } = useRt();
  const vertical = w.h > w.w;
  const flowing = p.flow && (!p.tag || isOn(values, p.tag));
  const sw = Math.max(1, Number(p.stroke_width) || 1);
  const [x1, y1, x2, y2] = vertical ? [w.w / 2, 0, w.w / 2, w.h] : [0, w.h / 2, w.w, w.h / 2];
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${w.w} ${w.h}`} preserveAspectRatio="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={p.stroke} strokeWidth={sw} strokeDasharray={p.dashed ? `${sw * 2} ${sw}` : undefined} />
      {flowing && (
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={p.flow_color} strokeWidth={sw * 0.5} strokeDasharray={`${sw * 1.5} ${sw * 1.5}`} className="hmi-flow" />
      )}
    </svg>
  );
};

export const ImageW = ({ p }) =>
  p.src ? (
    <img src={assetUrl(p.src)} alt="" draggable={false} className="w-full h-full select-none" style={{ objectFit: p.fit, opacity: p.opacity, borderRadius: p.radius }} />
  ) : (
    <div className="w-full h-full grid place-items-center border border-dashed border-slate-600 text-slate-500 text-xs font-mono">GAMBAR</div>
  );
