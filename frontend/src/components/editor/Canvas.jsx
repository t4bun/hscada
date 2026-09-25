import { useRef } from "react";
import { WidgetView } from "@/components/widgets/Widget";
import { newWidget } from "@/components/widgets/registry";
import { assetUrl } from "@/lib/api";

const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const HPOS = {
  nw: "-left-1 -top-1 cursor-nwse-resize", n: "left-1/2 -translate-x-1/2 -top-1 cursor-ns-resize", ne: "-right-1 -top-1 cursor-nesw-resize",
  e: "-right-1 top-1/2 -translate-y-1/2 cursor-ew-resize", se: "-right-1 -bottom-1 cursor-nwse-resize", s: "left-1/2 -translate-x-1/2 -bottom-1 cursor-ns-resize",
  sw: "-left-1 -bottom-1 cursor-nesw-resize", w: "-left-1 top-1/2 -translate-y-1/2 cursor-ew-resize",
};

const Frame = ({ w, selected, zoom, snapTo, onSelect, onChange, onCommit }) => {
  const start = (e, dir) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect(w.id);
    const sx = e.clientX, sy = e.clientY, o = { ...w };
    let moved = false;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / zoom, dy = (ev.clientY - sy) / zoom;
      if (Math.abs(dx) + Math.abs(dy) > 1) moved = true;
      let { x, y, w: W, h: H } = o;
      if (!dir) { x = snapTo(o.x + dx); y = snapTo(o.y + dy); }
      else {
        if (dir.includes("e")) W = Math.max(8, snapTo(o.w + dx));
        if (dir.includes("s")) H = Math.max(4, snapTo(o.h + dy));
        if (dir.includes("w")) { const nx = snapTo(o.x + dx); W = Math.max(8, o.w + o.x - nx); x = o.x + o.w - W; }
        if (dir.includes("n")) { const ny = snapTo(o.y + dy); H = Math.max(4, o.h + o.y - ny); y = o.y + o.h - H; }
      }
      onChange(w.id, { x, y, w: W, h: H });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) onCommit();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      data-testid={`canvas-widget-${w.type}`}
      onPointerDown={(e) => start(e)}
      className={`absolute group cursor-move ${selected ? "outline outline-2 outline-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)] z-[5]" : "hover:outline hover:outline-1 hover:outline-blue-400/60"}`}
      style={{ left: w.x, top: w.y, width: w.w, height: w.h }}
    >
      <div className="w-full h-full pointer-events-none"><WidgetView w={w} /></div>
      {selected && HANDLES.map((d) => (
        <span key={d} onPointerDown={(e) => start(e, d)} className={`absolute w-2.5 h-2.5 bg-white border border-blue-600 ${HPOS[d]}`} />
      ))}
      {selected && (
        <span className="absolute -top-5 left-0 text-[10px] font-mono bg-blue-600 text-white px-1 whitespace-nowrap pointer-events-none">
          {Math.round(w.x)},{Math.round(w.y)} · {Math.round(w.w)}×{Math.round(w.h)}
        </span>
      )}
    </div>
  );
};

export const Canvas = ({ screen, width, height, zoom, grid, snap, selectedId, onSelect, onChange, onCommit, onAdd }) => {
  const ref = useRef();
  const snapTo = (v) => (snap ? Math.round(v / 10) * 10 : Math.round(v));
  const drop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("hmi/widget");
    if (!type) return;
    const r = ref.current.getBoundingClientRect();
    onAdd(newWidget(type, snapTo((e.clientX - r.left) / zoom), snapTo((e.clientY - r.top) / zoom)));
  };
  return (
    <div style={{ width: width * zoom, height: height * zoom }} className="shrink-0">
      <div
        ref={ref}
        data-testid="hmi-canvas"
        onPointerDown={() => onSelect(null)}
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
          <Frame key={w.id} w={w} zoom={zoom} snapTo={snapTo} selected={w.id === selectedId} onSelect={onSelect} onChange={onChange} onCommit={onCommit} />
        ))}
      </div>
    </div>
  );
};
