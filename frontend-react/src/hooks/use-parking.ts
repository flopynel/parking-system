import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import sample from "@/assets/capture-sample.jpg";
import { loadDemoMode, loadDemoState, saveDemoMode, saveDemoState } from "@/services/demo-storage";
import {
  adaptParkingStatus,
  api,
  loadConfig,
  normalizePlate,
  saveConfig,
  type ApiConfig,
  type CaptureEvent,
  type ParkingStatus,
  type Session,
  type WhitelistEntry,
} from "@/services/api";

const VISITOR_PLATES = ["CJ 07 ABC", "IS 44 MKT", "TM 12 DEV", "SB 88 ION", "AG 03 RAZ"];
const UNKNOWN_PLATES = ["BV 99 BAD", "XX 00 NOK", "GL 66 HAX"];

function seed(): ParkingStatus {
  const now = Date.now();
  const min = 60_000;
  const s = (id: string, plate: string, accessType: Session["accessType"], entryAgo: number, exitAgo: number | null, spot: number | null, status: Session["status"]): Session => ({
    id, plate, accessType, entryAt: now - entryAgo * min, exitAt: exitAgo === null ? null : now - exitAgo * min, status, spot, photo: sample, confidence: 92 + Math.random() * 7,
  });
  return {
    capacity: 5,
    barrierOpen: false,
    sensorEntry: false,
    sensorExit: false,
    whitelist: [
      { plate: "CV 10 PRO", owner: "Florin Soare", phone: "+40 722 000 111" },
      { plate: "BV 25 XYZ", owner: "Andreea Pop", phone: "+40 733 222 333" },
      { plate: "B 100 TEST", owner: "Laborator IoT", phone: "+40 744 444 555" },
    ],
    sessions: [
      s("s1", "CV 10 PRO", "whitelist", 14, null, 1, "parked"),
      s("s2", "CJ 07 ABC", "visitor", 47, null, 3, "parked"),
      s("s3", "B 100 TEST", "whitelist", 6, null, 4, "parked"),
      s("s4", "BV 99 BAD", "rejected", 90, null, null, "blocked"),
      s("s5", "BV 25 XYZ", "whitelist", 180, 120, null, "exited"),
    ],
    lastEvent: { kind: "entry", plate: "B 100 TEST", at: now - 6 * min, confidence: 98.4, photo: sample },
  };
}

export function useParking() {
  const [config, setConfigState] = useState<ApiConfig>({ baseUrl: "", apiKey: "", capacity: 5 });
  const [demo, setDemo] = useState(true);
  const [online, setOnline] = useState(false);
  const [state, setState] = useState<ParkingStatus>(seed);
  const [liveState, setLiveState] = useState<ParkingStatus>({ capacity: 5, barrierOpen: false, sensorEntry: false, sensorExit: false, sessions: [], whitelist: [], lastEvent: null });
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const barrierTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setMounted(true);
    const c = loadConfig();
    setNow(Date.now());
    setConfigState(c);
    setState((s) => ({ ...(loadDemoState() ?? s), capacity: c.capacity }));
    setDemo(loadDemoMode(!c.baseUrl));
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try { saveDemoState(state); } catch { toast.error("Datele demo nu pot fi salvate — spațiu insuficient sau stocare blocată. Reduceți dimensiunea pozei test."); }
  }, [mounted, state]);

  useEffect(() => {
    if (!mounted) return;
    try { saveDemoMode(demo); } catch { toast.error("Modul selectat nu poate fi salvat"); }
  }, [mounted, demo]);

  useEffect(() => () => clearTimeout(barrierTimer.current), []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll real backend every 1s when not in demo mode (skips a tick if the previous request is still running)
  useEffect(() => {
    if (!mounted || demo) { setOnline(false); return; }
    let alive = true;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await api.getStatus(config);
        if (alive) { setLiveState(adaptParkingStatus(data, config)); setOnline(data.esp32Online); }
      } catch {
        if (alive) setOnline(false);
      } finally {
        inFlight = false;
      }
    };
    poll();
    const t = setInterval(poll, 1000);
    return () => { alive = false; clearInterval(t); };
  }, [mounted, demo, config]);

  const pulseBarrier = useCallback((sensor: "sensorEntry" | "sensorExit") => {
    setState((s) => ({ ...s, barrierOpen: true, [sensor]: true }));
    clearTimeout(barrierTimer.current);
    barrierTimer.current = setTimeout(() => {
      setState((s) => ({ ...s, barrierOpen: false, sensorEntry: false, sensorExit: false }));
    }, 4000);
  }, []);

  const setConfig = (c: ApiConfig) => {
    try { saveConfig(c); } catch { toast.error("Configurarea nu poate fi salvată"); return; }
    setConfigState(c);
    setState((s) => ({ ...s, capacity: c.capacity }));
    toast.success("Configurare salvată");
  };

  const simulateEntry = (plateIn?: string, photo: string = sample) => {
    if (!demo) return;
    const wl0 = state.whitelist.map((w) => w.plate);
    const pick = plateIn || (Math.random() < 0.5 && wl0.length ? wl0[Math.floor(Math.random() * wl0.length)] : VISITOR_PLATES[Math.floor(Math.random() * VISITOR_PLATES.length)]);
    const id = crypto.randomUUID();
    setState((s) => {
      const parked = s.sessions.filter((x) => x.status === "parked");
      const wl = s.whitelist.map((w) => w.plate);
      const plate = normalizePlate(pick ?? "");
      const confidence = 90 + Math.random() * 9.5;
      if (parked.some((p) => p.plate === plate)) {
        toast.warning(`${plate} este deja în parcare`);
        return s;
      }
      const taken = new Set(parked.map((p) => p.spot));
      const spot = Array.from({ length: s.capacity }, (_, i) => i + 1).find((n) => !taken.has(n));
      if (!spot) {
        toast.error("Parcare plină — acces respins");
        const ev: CaptureEvent = { kind: "rejected", plate, at: Date.now(), confidence, photo };
        return { ...s, lastEvent: ev, sessions: [{ id: crypto.randomUUID(), plate, accessType: "rejected", entryAt: Date.now(), exitAt: null, status: "blocked", spot: null, photo, confidence }, ...s.sessions] };
      }
      const accessType = wl.includes(plate) ? "whitelist" : "visitor";
      toast.success(`Intrare detectată: ${plate} → Locul ${spot}`);
      pulseBarrier("sensorEntry");
      return {
        ...s,
        lastEvent: { kind: "entry", plate, at: Date.now(), confidence, photo },
        sessions: [{ id, plate, accessType, entryAt: Date.now(), exitAt: null, status: "parked", spot, photo, confidence }, ...s.sessions],
      };
    });
  };

  const simulateExit = () => {
    if (!demo) return;
    const parked = state.sessions.filter((x) => x.status === "parked");
    if (!parked.length) { toast.info("Nicio mașină în parcare"); return; }
    const target = parked[Math.floor(Math.random() * parked.length)];
    if (!target) return;
    toast.success(`Ieșire confirmată: ${target.plate}`);
    pulseBarrier("sensorExit");
    setState((s) => {
      return {
        ...s,
        lastEvent: { kind: "exit", plate: target.plate, at: Date.now(), confidence: 93 + Math.random() * 6, photo: target.photo },
        sessions: s.sessions.map((x) => (x.id === target.id ? { ...x, status: "exited", exitAt: Date.now(), spot: null } : x)),
      };
    });
  };

  const simulateUnknown = () => {
    if (!demo) return;
    const plate = UNKNOWN_PLATES[Math.floor(Math.random() * UNKNOWN_PLATES.length)];
    if (!plate) return;
    const confidence = 85 + Math.random() * 10;
    toast.error(`Acces respins: ${plate}`);
    setState((s) => ({
      ...s,
      lastEvent: { kind: "rejected", plate, at: Date.now(), confidence, photo: sample },
      sessions: [{ id: crypto.randomUUID(), plate, accessType: "rejected", entryAt: Date.now(), exitAt: null, status: "blocked", spot: null, photo: sample, confidence }, ...s.sessions],
    }));
  };

  const toggleBarrier = async () => {
    if (!demo) {
      try { await api.toggleBarrier(config); toast.success("Comandă trimisă barierei"); } catch { toast.error("Backend indisponibil"); }
      return;
    }
    setState((s) => ({ ...s, barrierOpen: !s.barrierOpen }));
    toast.info("Barieră acționată manual");
  };

  const closeSession = async (id: string) => {
    if (!demo) { try { await api.closeSession(config, id); toast.success("Sesiune închisă manual"); } catch { toast.error("Backend indisponibil"); } return; }
    setState((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === id ? { ...x, status: "exited", exitAt: Date.now(), spot: null } : x)) }));
    toast.success("Sesiune închisă manual");
  };

  const notifySms = async (id: string) => {
    if (!demo) { try { await api.notifySms(config, id); } catch { toast.error("Webhook SMS indisponibil"); return; } }
    toast.success("Notificare SMS trimisă");
  };

  const addWhitelist = async (e: WhitelistEntry) => {
    const entry = { ...e, plate: normalizePlate(e.plate) };
    if ((demo ? state : liveState).whitelist.some((w) => w.plate === entry.plate)) { toast.warning("Numărul există deja"); return; }
    if (!demo) { try { await api.addWhitelist(config, entry); toast.success(`${entry.plate} adăugat în whitelist`); } catch { toast.error("Backend indisponibil"); } return; }
    setState((s) => ({ ...s, whitelist: [...s.whitelist, entry] }));
    toast.success(`${entry.plate} adăugat în whitelist`);
  };

  const removeWhitelist = async (plate: string) => {
    if (!demo) { try { await api.removeWhitelist(config, plate); toast.info(`${plate} eliminat`); } catch { toast.error("Backend indisponibil"); } return; }
    setState((s) => ({ ...s, whitelist: s.whitelist.filter((w) => w.plate !== plate) }));
    toast.info(`${plate} eliminat`);
  };

  const resetDemo = () => {
    clearTimeout(barrierTimer.current);
    const fresh = { ...seed(), capacity: config.capacity };
    try { saveDemoState(fresh); } catch { toast.error("Datele demo nu pot fi salvate"); return; }
    setState(fresh);
    toast.success("Datele demo au fost resetate");
  };

  return {
    mounted, state: demo ? state : liveState, now, demo, setDemo, online, config, setConfig, resetDemo,
    simulateEntry, simulateExit, simulateUnknown, toggleBarrier, closeSession, notifySms, addWhitelist, removeWhitelist,
  };
}
