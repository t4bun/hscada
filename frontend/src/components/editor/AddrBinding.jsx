import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { DATA_TYPES } from "@/lib/format";

const inputCls = "w-full h-8 bg-[#0B0F17] border border-slate-700 rounded-sm px-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500";

const TagSelect = ({ value, onChange, tags, testid }) => (
  <select data-testid={testid} className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)}>
    <option value="">— pilih tag —</option>
    {tags.map((t) => <option key={t.id} value={t.id}>{`${t.name} · ${t.address}`}</option>)}
  </select>
);

const Direct = ({ side, p, bit, ctx, onBound }) => {
  const [dev, setDev] = useState(p[`${side}_dev`] || ctx.devices?.[0]?.id || "");
  const [addr, setAddr] = useState(p[`${side}_addr`] || "");
  const [dt, setDt] = useState(bit ? "BOOL" : p[`${side}_type`] || "INT16");
  const [err, setErr] = useState("");
  useEffect(() => { setAddr(p[`${side}_addr`] || ""); }, [p, side]);
  const apply = async (d = dev, a = addr, t = dt) => {
    if (!d || !a.trim()) return;
    try {
      const { data } = await api.post(`/projects/${ctx.projectId}/tags/ensure`, { device_id: d, address: a.trim(), data_type: t });
      setErr("");
      ctx.onTagCreated?.(data);
      onBound(data.id, { [`${side}_dev`]: d, [`${side}_addr`]: a.trim(), [`${side}_type`]: t });
    } catch (e) { setErr(errMsg(e)); }
  };
  const bound = ctx.tags.find((t) => t.id === p[side === "w" ? "tag" : "read_tag"]);
  return (
    <div className="space-y-1">
      <select data-testid={`addr-${side}-device`} className={inputCls} value={dev} onChange={(e) => { setDev(e.target.value); apply(e.target.value); }}>
        {!ctx.devices?.length && <option value="">— belum ada perangkat —</option>}
        {(ctx.devices || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <div className="flex gap-1">
        <input data-testid={`addr-${side}-address`} className={`${inputCls} font-mono`} placeholder={bit ? "M0.0 / DB1.DBX0.0 / 00001" : "DB1.DBW2 / 40001 / D100"} value={addr}
          onChange={(e) => setAddr(e.target.value)} onBlur={() => apply()} onKeyDown={(e) => e.key === "Enter" && apply()} />
        {!bit && (
          <select data-testid={`addr-${side}-type`} className={`${inputCls} w-24`} value={dt} onChange={(e) => { setDt(e.target.value); apply(dev, addr, e.target.value); }}>
            {DATA_TYPES.filter((x) => x !== "BOOL").map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
      </div>
      {err ? <p data-testid={`addr-${side}-error`} className="text-[10px] text-red-400">{err}</p>
        : bound && <p data-testid={`addr-${side}-bound`} className="text-[10px] font-mono text-emerald-400">Terhubung: {bound.address} ({bound.data_type})</p>}
    </div>
  );
};

const Target = ({ side, p, set, ctx, bit }) => {
  const key = side === "w" ? "tag" : "read_tag";
  const bind = (id, extra = {}) => (side === "w" ? set(id, extra) : set(p.tag, { read_tag: id, ...extra }));
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{side === "w" ? "Alamat Tulis" : "Alamat Baca"}</p>
      {p.addr_mode === "direct"
        ? <Direct side={side} p={p} bit={bit} ctx={ctx} onBound={bind} />
        : <TagSelect testid={`addr-${side}-tag`} value={p[key]} tags={ctx.tags} onChange={(v) => bind(v)} />}
    </div>
  );
};

export const AddrBinding = ({ p, set, ctx, bit }) => {
  const sep = p.use_read ?? !!p.read_tag;
  return (
    <div className="space-y-2.5 bg-[#0B0F17]/60 border border-slate-800 rounded-sm p-2" data-testid="addr-binding">
      <div className="grid grid-cols-2 gap-1">
        {[["tag", "Tag Library"], ["direct", "Alamat Langsung"]].map(([m, l]) => (
          <button key={m} type="button" data-testid={`addr-mode-${m}`} onClick={() => set(p.tag, { addr_mode: m })}
            className={`h-7 text-[11px] rounded-sm border transition-colors ${(p.addr_mode || "tag") === m ? "border-blue-500 bg-blue-600/20 text-white" : "border-slate-700 text-slate-400"}`}>{l}</button>
        ))}
      </div>
      <Target side="w" p={p} set={set} ctx={ctx} bit={bit} />
      <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
        <input type="checkbox" data-testid="addr-separate-read" className="accent-blue-500" checked={sep}
          onChange={(e) => set(p.tag, e.target.checked ? { use_read: true } : { use_read: false, read_tag: "", r_dev: "", r_addr: "" })} />
        Aktifkan alamat baca terpisah
      </label>
      {sep ? <Target side="r" p={p} set={set} ctx={ctx} bit={bit} /> : <p className="text-[10px] text-slate-500">Alamat baca otomatis sama dengan alamat tulis.</p>}
    </div>
  );
};
