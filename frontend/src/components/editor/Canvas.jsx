import { useRef, useState } from "react";
import { WidgetView } from "@/components/widgets/Widget";
import { newWidget } from "@/components/widgets/registry";
import { assetUrl } from "@/lib/api";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HPOS = {
  nw: "-left-1 -top-1 cursor-nwse-resize", n: "left-1/2 -translate-x-1/2 -top-1 cursor-ns-resize", ne: "-right-1 -top-1 cursor-nesw-resize",
  e: "-right-1 top-1/2 -translate-y-1/2 cursor-ew-resize", se: "-right-1 -bottom-1 cursor-nwse-resize", s: "left-1/2 -translate-x-1/2 -bottom-1 cursor-ns-resize",
  sw: "-left-1 -bottom-1 cursor-nesw-resize", w: "-left-1 top-1/2 -translate-y-1/2 cursor-ew-resize",
};

const groupOf = (widgets, w) => (w.group ? [...widgets.filter((x) => x.group === w.group && x.id !== w.id).map((x) => x.id), w.id] : [w.id]);

const Frame = ({ w, state, single, onStart }) => (
  <div
    data-testid={`canvas-widget-${w.type}`}
    data-selected={state ? "true" : "false"}
    onPointerDown={(e) => onStart(e, w)}
    className={`absolute cursor-move ${state === "ref" ? "outline outline-2 outline-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] z-[5]" : state ? "outline outline-1 outline-dashed outline-sky-400 z-[4]" : "hover:outline hover:outline-1 hover:outline-blue-400/60"}`}
    style={{ left: w.x, top: w.y, width: w.w, height: w.h }}
  >
    <div className="w-full h-full pointer-events-none"><WidgetView w={w} /></div>
    {single && HANDLES.map((d) => (
      <span key={d} onPointerDown={(e) => onStart(e, w, d)} className={`absolute w-2.5 h-2.5 bg-white border border-blue-600 ${HPOS[d]}`} />
    ))}
    {state === "ref" && (
      <span className="absolute -top-5 left-0 text-[10px] font-mono bg-blue-600 text-white px-1 whitespace-nowrap pointer-events-none">
        {Math.round(w.x)},{Math.round(w.y)} · {Math.round(w.w)}×{Math.round(w.h)}{w.group ? " · GRUP" : ""}
      </span>
    )}
  </div>
);

export const Canvas = ({ screen, width, height, zoom, grid, snap, selected, onSelect, onChange, onCommit, onAdd }) => {
  const ref = useRef();
  const [box, setBox] = useState(null);
  const snapTo = (v) => (snap ? Math.round(v / 10) * 10 : Math.round(v));
  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [(e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom];
  };

  const track = (move, up) => {
    const u = (ev) => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", u); up(ev); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", u);
  };

  const start = (e, w, dir) => {
    e.stopPropagation();
    e.preventDefault();
    const members = groupOf(screen.widgets, w);
    if (e.shiftKey && !dir) {
      onSelect(selected.includes(w.id) ? selected.filter((id) => !members.includes(id)) : [...selected.filter((id) => !members.includes(id)), ...members]);
      return;
    }
    const ids = selected.includes(w.id) ? [...selected.filter((id) => id !== w.id), w.id] : members;
    onSelect(ids);
    const orig = screen.widgets.filter((x) => ids.includes(x.id));
    const o = { ...w };
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    track((ev) => {
      const dx = (ev.clientX - sx) / zoom, dy = (ev.clientY - sy) / zoom;
      if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
      if (!dir) {
        const ddx = snapTo(o.x + dx) - o.x, ddy = snapTo(o.y + dy) - o.y;
        onChange(Object.fromEntries(orig.map((x) => [x.id, { x: x.x + ddx, y: x.y + ddy }])));
        return;
      }
      let { x, y, w: W, h: H } = o;
      if (dir.includes("e")) W = Math.max(8, snapTo(o.w + dx));
      if (dir.includes("s")) H = Math.max(4, snapTo(o.h + dy));
      if (dir.includes("w")) { const nx = snapTo(o.x + dx); W = Math.max(8, o.w + o.x - nx); x = o.x + o.w - W; }
      if (dir.includes("n")) { const ny = snapTo(o.y + dy); H = Math.max(4, o.h + o.y - ny); y = o.y + o.h - H; }
      onChange({ [w.id]: { x, y, w: W, h: H } });
    }, () => moved && onCommit());
  };

  const marquee = (e) => {
    e.stopPropagation();
    const [x0, y0] = pos(e);
    const add = e.shiftKey ? selected : [];
    let b = { x0, y0, x1: x0, y1: y0 };
    setBox(b);
    track((ev) => { const [x1, y1] = pos(ev); b = { x0, y0, x1, y1 }; setBox(b); }, () => {
      setBox(null);
      const [l, r, t, btm] = [Math.min(b.x0, b.x1), Math.max(b.x0, b.x1), Math.min(b.y0, b.y1), Math.max(b.y0, b.y1)];
      if (r - l < 3 && btm - t < 3) return onSelect(add);
      const hit = screen.widgets.filter((w) => w.x < r && w.x + w.w > l && w.y < btm && w.y + w.h > t);
      const ids = [...new Set(hit.flatMap((w) => groupOf(screen.widgets, w)))];
      onSelect([...add.filter((id) => !ids.includes(id)), ...ids]);
    });
  };

  const drop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("hmi/widget");
    if (!type) return;
    const [x, y] = pos(e);
    onAdd(newWidget(type, snapTo(x), snapTo(y)));
  };
  const last = selected[selected.length - 1];
  return (
    <div style={{ width: width * zoom, height: height * zoom }} className="shrink-0">
      <div
        ref={ref}
        data-testid="hmi-canvas"
        onPointerDown={marquee}
        onDragOver={(e) => e.preventDefault()}
        onDrop={drop}
        className="relative origin-top-left shadow-[0_0_0_1px_#1E293B,0_20px_60px_#000a]"
        style={{
          width, height, transform: `scale(${zoom})`, background: screen.bg_color,
          backgroundImage: screen.bg_image ? `url(${assetUrl(screen.bg_image)})` : undefined, backgroundSize: "cover",
        }}
      >
        {grid && <div className="absolute inset-0 pointer-events-none hmi-grid" />}
        {screen.widgets.map((w) => (
          <Frame key={w.id} w={w} onStart={start} single={selected.length === 1 && w.id === last}
            state={w.id === last ? "ref" : selected.includes(w.id) ? "sel" : null} />
        ))}
        {box && (
          <div data-testid="marquee-box" className="absolute border border-sky-400 bg-sky-400/10 pointer-events-none"
            style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }} />
        )}
      </div>
    </div>
  );
};
