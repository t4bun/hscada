import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { uploadFile, errMsg, assetUrl } from "@/lib/api";

export const ShapePick = ({ value, set, ctx }) => {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const shapes = ctx.shapes || [];
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const up = await uploadFile(file);
      ctx.addShape?.({ name: file.name.replace(/\.[^.]+$/, ""), url: up.url });
      set(up.url, { appearance: "image" });
      toast.success("Shape ditambahkan ke library project");
    } catch (er) { toast.error(errMsg(er)); }
    setBusy(false);
  };
  return (
    <div className="space-y-2" data-testid="shape-picker">
      {shapes.length > 0 && (
        <div className="grid grid-cols-4 gap-1 max-h-32 overflow-y-auto hmi-scroll">
          {shapes.map((s, i) => (
            <button key={s.url} type="button" title={s.name} data-testid={`shape-lib-${i}`} onClick={() => set(s.url, { appearance: "image" })}
              className={`aspect-square bg-black/40 border rounded-sm p-1 ${value === s.url ? "border-blue-500" : "border-slate-800 hover:border-slate-600"}`}>
              <img src={assetUrl(s.url)} alt={s.name} className="w-full h-full object-contain" />
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <button type="button" data-testid="shape-import-btn" onClick={() => ref.current.click()} className="flex-1 h-8 text-xs flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 rounded-sm text-slate-200">
          <Upload size={13} />{busy ? "Mengunggah..." : "Import Shape"}
        </button>
        {value && <button type="button" data-testid="shape-clear-btn" onClick={() => set("")} className="h-8 px-2 bg-slate-800 hover:bg-red-900 rounded-sm"><X size={13} /></button>}
      </div>
      <p className="text-[10px] text-slate-500">{shapes.length} shape di library project · PNG/SVG transparan disarankan</p>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden onChange={pick} />
    </div>
  );
};
