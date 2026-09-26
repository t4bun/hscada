import { useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const SPAN_MS = { min: 60000, hour: 3600000, day: 86400000 };
export const toLocalInput = (ms) => new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };

export function useChartPrefs(key, defaults) {
  const [ov, setOv] = useState(() => read(key));
  useEffect(() => setOv(read(key)), [key]);
  const save = (v) => { setOv(v); localStorage.setItem(key, JSON.stringify(v)); };
  const reset = () => { setOv(null); localStorage.removeItem(key); };
  return [ov ? { ...defaults, ...ov } : defaults, save, reset, !!ov];
}

const field = "w-full h-8 px-2 bg-[#0B0F17] border border-slate-700 rounded-sm text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500";

export const ChartSettings = ({ prefs, onApply, onReset, custom, showStart, maxMs, testid }) => {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(prefs);
  const [err, setErr] = useState("");
  const onOpen = (o) => { if (o) { setF(prefs); setErr(""); } setOpen(o); };
  const apply = () => {
    const v = Number(f.span_value);
    if (!Number.isFinite(v) || v <= 0) return setErr("Span harus angka > 0");
    if (maxMs && v * SPAN_MS[f.span_unit] > maxMs) return setErr(`Span maksimal ${maxMs / SPAN_MS.day} hari`);
    if (showStart && f.start === "" ) return setErr("Isi tanggal & jam mulai");
    onApply({ ...f, span_value: v });
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <button data-testid={`${testid}-settings-btn`} title="Kustomisasi chart" className="relative p-1 rounded-sm text-slate-400 hover:text-white hover:bg-slate-800">
          <Settings2 size={13} />
          {custom && <span data-testid={`${testid}-custom-indicator`} className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-amber-400" />}
        </button>
      </PopoverTrigger>
      <PopoverContent data-testid={`${testid}-settings-panel`} align="end" className="w-64 p-3 bg-[#111827] border-slate-700 text-slate-200 space-y-3">
        <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-slate-400">Kustomisasi Chart</div>
        <div className="space-y-1">
          <label className="text-[11px] text-slate-400">Span waktu</label>
          <div className="flex gap-2">
            <input data-testid={`${testid}-span-value`} type="number" min="0.1" step="any" value={f.span_value} onChange={(e) => setF({ ...f, span_value: e.target.value })} className={field} />
            <select data-testid={`${testid}-span-unit`} value={f.span_unit} onChange={(e) => setF({ ...f, span_unit: e.target.value })} className={`${field} w-24`}>
              <option value="min">min</option><option value="hour">hour</option><option value="day">day</option>
            </select>
          </div>
        </div>
        {showStart && (
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400">Waktu mulai</label>
            <div className="flex gap-1">
              <button data-testid={`${testid}-start-latest`} onClick={() => setF({ ...f, start: null })} className={`flex-1 h-7 text-[11px] rounded-sm border ${f.start === null ? "bg-blue-600 border-blue-500 text-white" : "border-slate-700 text-slate-400"}`}>Latest (Live)</button>
              <button data-testid={`${testid}-start-custom`} onClick={() => setF({ ...f, start: f.start ?? Date.now() - Number(f.span_value || 1) * SPAN_MS[f.span_unit] })} className={`flex-1 h-7 text-[11px] rounded-sm border ${f.start !== null ? "bg-blue-600 border-blue-500 text-white" : "border-slate-700 text-slate-400"}`}>Tanggal & jam</button>
            </div>
            {f.start !== null && <input data-testid={`${testid}-start-datetime`} type="datetime-local" value={f.start === "" ? "" : toLocalInput(f.start)} onChange={(e) => setF({ ...f, start: e.target.value ? new Date(e.target.value).getTime() : "" })} className={field} />}
          </div>
        )}
        {err && <div data-testid={`${testid}-settings-error`} className="text-[11px] text-red-400">{err}</div>}
        <div className="flex gap-2 pt-1">
          <button data-testid={`${testid}-settings-reset`} onClick={() => { onReset(); setOpen(false); }} className="flex-1 h-8 text-xs rounded-sm border border-slate-700 text-slate-300 hover:bg-slate-800">Reset default</button>
          <button data-testid={`${testid}-settings-apply`} onClick={apply} className="flex-1 h-8 text-xs rounded-sm bg-blue-600 text-white hover:bg-blue-500">Terapkan</button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
