import * as Icons from "lucide-react";
import { WIDGETS, GROUPS } from "@/components/widgets/registry";

export const Palette = ({ onAdd }) => (
  <aside className="w-60 border-r border-slate-800 bg-[#111827] flex flex-col shrink-0 overflow-y-auto hmi-scroll" data-testid="widget-palette">
    <div className="px-4 pt-4 pb-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Komponen</p>
      <p className="text-[11px] text-slate-500 mt-1">Seret ke kanvas atau klik untuk menambah</p>
    </div>
    {GROUPS.map((g) => (
      <div key={g} className="px-3 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 py-2 border-b border-slate-800 mb-2">{g}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {Object.entries(WIDGETS).filter(([, d]) => d.group === g && !d.hidden).map(([type, d]) => {
            const I = Icons[d.icon] || Icons.Box;
            return (
              <button
                key={type}
                draggable
                data-testid={`palette-item-${type}`}
                onDragStart={(e) => e.dataTransfer.setData("hmi/widget", type)}
                onClick={() => onAdd(type)}
                className="flex flex-col items-center gap-1.5 py-2.5 px-1 bg-[#0B0F17] border border-slate-800 hover:border-blue-500 hover:bg-slate-800/60 rounded-sm text-slate-300 cursor-grab active:cursor-grabbing transition-colors"
              >
                <I size={18} strokeWidth={1.6} className="text-blue-400" />
                <span className="text-[10px] leading-tight text-center">{d.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </aside>
);
