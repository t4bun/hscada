import { useEffect, useRef, useState } from "react";
import { Lock, Delete } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { api, errMsg } from "@/lib/api";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"];

export const KioskPinDialog = ({ open, onOpenChange, onUnlocked }) => {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setPin(""); setErr(""); } }, [open]);
  const press = (k) => {
    setErr("");
    if (k === "del") setPin((p) => p.slice(0, -1));
    else if (k === "clear") setPin("");
    else setPin((p) => (p.length < 8 ? p + k : p));
  };
  const submit = async () => {
    if (pin.length < 4) return setErr("PIN minimal 4 digit");
    setBusy(true);
    try {
      await api.post("/kiosk/verify", { pin });
      onUnlocked();
    } catch (e) { setErr(errMsg(e)); setPin(""); }
    setBusy(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#111827] border-slate-700 text-slate-100 max-w-xs" data-testid="kiosk-pin-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2"><Lock size={16} />Keluar Mode Kiosk</DialogTitle>
          <DialogDescription className="text-slate-400">Masukkan PIN engineer.</DialogDescription>
        </DialogHeader>
        <div data-testid="kiosk-pin-display" className="h-12 grid place-items-center bg-[#0B0F17] border border-slate-700 rounded-sm font-mono text-2xl tracking-[0.5em] text-white">
          {pin.replace(/./g, "•") || <span className="text-sm tracking-normal text-slate-600">••••</span>}
        </div>
        <input data-testid="kiosk-pin-input" type="password" inputMode="numeric" autoComplete="off" className="sr-only" value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
        {err && <p data-testid="kiosk-pin-error" className="text-xs text-red-400 text-center">{err}</p>}
        <div className="grid grid-cols-3 gap-2">
          {KEYS.map((k) => (
            <button key={k} type="button" data-testid={`kiosk-key-${k}`} onClick={() => press(k)}
              className="h-12 rounded-sm bg-slate-800 hover:bg-slate-700 active:bg-slate-600 font-mono text-lg flex items-center justify-center transition-colors">
              {k === "del" ? <Delete size={18} /> : k === "clear" ? <span className="text-xs">C</span> : k}
            </button>
          ))}
        </div>
        <button data-testid="kiosk-pin-submit" disabled={busy} onClick={submit} className="h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-sm text-sm font-semibold">{busy ? "Memeriksa..." : "Buka Kunci"}</button>
      </DialogContent>
    </Dialog>
  );
};

export const KioskHotspot = ({ onTrigger }) => {
  const t = useRef();
  const start = () => { clearTimeout(t.current); t.current = setTimeout(onTrigger, 3000); };
  const stop = () => clearTimeout(t.current);
  return (
    <div data-testid="kiosk-exit-hotspot" title="Tahan 3 detik untuk keluar kiosk" className="fixed top-0 right-0 w-16 h-16 z-40"
      onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onContextMenu={(e) => e.preventDefault()} />
  );
};
