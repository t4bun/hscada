import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, assetUrl, errMsg } from "@/lib/api";

export const RtContext = createContext({ values: {}, tagMap: {}, mode: "edit" });
export const useRt = () => useContext(RtContext);

export function useLive(base, enabled = true, interval = 1000) {
  const [snap, setSnap] = useState({ values: {}, devices: {}, ts: null, active_alarms: 0 });
  const [online, setOnline] = useState(true);
  const timer = useRef();

  useEffect(() => {
    if (!enabled || !base) return;
    let alive = true;
    const tick = async () => {
      try {
        const { data } = await api.get(`${base}/values`);
        if (alive) { setSnap(data); setOnline(true); }
      } catch {
        if (alive) setOnline(false);
      }
      if (alive) timer.current = setTimeout(tick, interval);
    };
    tick();
    return () => { alive = false; clearTimeout(timer.current); };
  }, [base, enabled, interval]);

  const write = useCallback(async (tagId, value) => {
    if (!tagId) return;
    setSnap((s) => ({ ...s, values: { ...s.values, [tagId]: value } }));
    try {
      await api.post(`${base}/write`, { tag_id: tagId, value });
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, [base]);

  return { snap, online, write };
}

export function useFonts(fonts) {
  const key = useMemo(() => JSON.stringify(fonts || []), [fonts]);
  useEffect(() => {
    (fonts || []).forEach((f) => {
      if (!f?.name || !f?.url) return;
      if ([...document.fonts].some((x) => x.family === f.name)) return;
      const ff = new FontFace(f.name, `url(${assetUrl(f.url)})`);
      ff.load().then((l) => document.fonts.add(l)).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

export function usePolling(fn, deps, interval) {
  useEffect(() => {
    let alive = true;
    let t;
    const run = async () => {
      await fn(() => alive);
      if (alive && interval) t = setTimeout(run, interval);
    };
    run();
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

const recCache = {};
export function useRecords(base, bump = 0) {
  const [recs, setRecs] = useState([]);
  useEffect(() => {
    if (!base) return;
    if (!recCache[base] || bump) recCache[base] = api.get(`${base}/records`).then((r) => r.data).catch(() => []);
    recCache[base].then(setRecs);
  }, [base, bump]);
  return recs;
}
