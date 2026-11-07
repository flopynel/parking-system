import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity, ArrowDownToLine, ArrowUpFromLine, Ban, Camera, Car, Clock, Cpu, LogOut, MessageSquare,
  Plus, Radio, Search, Settings, ShieldAlert, Trash2, Upload, Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useParking } from "@/hooks/use-parking";
import { formatDuration, type ApiConfig, type Session } from "@/services/api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Parking & LPR Control Center" },
      { name: "description", content: "Dashboard IoT pentru parcare inteligentă cu ESP32-CAM, recunoaștere numere și barieră automată." },
      { property: "og:title", content: "Smart Parking & LPR Control Center" },
      { property: "og:description", content: "Monitorizare live a locurilor, intrărilor și ieșirilor cu ESP32-CAM." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const fmt = (t: number) =>
  new Date(t).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Plate({ plate, size = "md" }: { plate: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-stretch overflow-hidden rounded border-2 border-plate-foreground bg-plate font-mono font-bold text-plate-foreground",
      size === "lg" ? "text-3xl" : size === "sm" ? "text-xs" : "text-sm")}>
      <span className={cn("flex flex-col items-center justify-end bg-plate-band text-plate px-1 leading-none", size === "lg" ? "px-2 pb-1 text-xs" : "pb-0.5 text-[8px]")}>RO</span>
      <span className={cn("tracking-wider", size === "lg" ? "px-4 py-1" : "px-2 py-0.5")}>{plate}</span>
    </span>
  );
}

function Pill({ tone, children }: { tone: "success" | "warning" | "destructive" | "info" | "muted"; children: React.ReactNode }) {
  const map = {
    success: "bg-success/15 text-success border-success/40",
    warning: "bg-warning/15 text-warning border-warning/40",
    destructive: "bg-destructive/15 text-destructive border-destructive/40",
    info: "bg-info/15 text-info border-info/40",
    muted: "bg-muted text-muted-foreground border-border",
  };
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", map[tone])}>{children}</span>;
}

function Panel({ title, icon: Icon, children, action, className }: { title: string; icon: React.ElementType; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border bg-card p-5", className)}>
      <header className="mb-4 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function Dashboard() {
  const p = useParking();
  const { state, now } = p;
  if (!p.mounted) return <div className="min-h-screen bg-background" />;
  const parked = state.sessions.filter((s) => s.status === "parked");
  const occupied = state.occupiedSpots ?? parked.length;
  const activeSpots = state.activeSpots ?? parked;
  const full = occupied >= state.capacity;
  const pct = state.capacity > 0 ? Math.min(100, (occupied / state.capacity) * 100) : 0;

  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const today = state.sessions.filter((s) => s.entryAt >= todayStart);
  const exited = state.sessions.filter((s) => s.exitAt && s.exitAt >= todayStart);
  const avg = exited.length ? exited.reduce((a, s) => a + ((s.exitAt ?? s.entryAt) - s.entryAt), 0) / exited.length : 0;
  const stats = state.stats ?? {
    entriesToday: today.filter((s) => s.status !== "blocked").length,
    exitsToday: exited.length, avgStayMinutes: Math.round(avg / 60000),
    rejectedToday: today.filter((s) => s.status === "blocked").length,
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-header-border bg-header text-header-foreground">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Cpu className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-tight">Smart Parking & LPR Control Center</h1>
              <p className="text-xs text-header-muted">ESP32-CAM · HC-SR04 ×2 · SG90 · OLED 0.91"</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {p.demo ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-header-foreground"><Radio className="h-3 w-3 pulse-dot" /> Mod Simulare</span>
            ) : p.online ? (
              <Pill tone="success"><Wifi className="h-3 w-3" /> ESP32-CAM: Online</Pill>
            ) : (
              <Pill tone="destructive"><WifiOff className="h-3 w-3" /> ESP32-CAM: Offline</Pill>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={p.demo} onCheckedChange={p.setDemo} /> Mod Demo / Simulator IoT
            </label>
            <SettingsDialog config={p.config} onSave={p.setConfig} onResetDemo={p.resetDemo} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {/* KPI */}
        <div className="grid gap-5 md:grid-cols-3">
          <Panel title="Grad de Ocupare" icon={Car}>
            <div className="flex items-end justify-between">
              <div>
                <div className="font-mono text-4xl font-bold">{occupied} <span className="text-muted-foreground">/ {state.capacity}</span></div>
                <div className="text-sm text-muted-foreground">Locuri Ocupate</div>
              </div>
              <Pill tone={full ? "destructive" : "success"}>{full ? "PLIN" : `${Math.max(0, state.capacity - occupied)} Libere`}</Pill>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full transition-all", full ? "bg-destructive" : pct >= 60 ? "bg-warning" : "bg-success")} style={{ width: `${pct}%` }} />
            </div>
          </Panel>

          <Panel title="Stare Barieră & Senzori" icon={Activity}>
            <div className="space-y-2 text-sm">
              <Row label="Barieră">{state.barrierOpen ? <Pill tone="warning">Ridicată (90°)</Pill> : <Pill tone="muted">Închisă</Pill>}</Row>
              <Row label="Senzor 1 (Intrare)">{state.sensorEntry ? <Pill tone="warning">Vehicul detectat</Pill> : <Pill tone="success">Liber</Pill>}</Row>
              <Row label="Senzor 2 (Ieșire)">{state.sensorExit ? <Pill tone="warning">Vehicul detectat</Pill> : <Pill tone="success">Liber</Pill>}</Row>
            </div>
            <Button variant="outline" className="mt-4 w-full" onClick={p.toggleBarrier}>Acționează Bariera Manual</Button>
          </Panel>

          <Panel title="Statistici Azi" icon={Clock}>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Intrări azi" value={stats.entriesToday} />
              <Stat label="Ieșiri" value={stats.exitsToday} />
              <Stat label="Timp mediu" value={`${stats.avgStayMinutes} min`} />
              <Stat label="Acces respins" value={stats.rejectedToday} tone="destructive" />
            </div>
          </Panel>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <CameraPanel p={p} />
            <Panel title="Hartă Parcare Activă" icon={Car}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: state.capacity }, (_, i) => i + 1).map((n) => {
                  const s = activeSpots.find((x) => x.spot === n);
                  return (
                    <div key={n} className={cn("relative flex min-h-36 flex-col rounded-md border-2 border-dashed p-3",
                      s ? "border-destructive/50 bg-destructive/10" : "border-success/40 bg-success/5")}>
                      <div className="text-xs font-semibold uppercase text-muted-foreground">Locul {n}</div>
                      {s ? (
                        <div className="mt-2 flex flex-1 flex-col items-center gap-2 text-center">
                          <Car className="h-7 w-7 text-destructive" />
                          <Plate plate={s.plate} size="sm" />
                          <div className="text-[11px] text-muted-foreground">Intrat: {new Date(s.entryAt).toLocaleTimeString("ro-RO")}</div>
                          <div className="font-mono text-[11px]">În parcare de: {formatDuration(now - s.entryAt)}</div>
                        </div>
                      ) : (
                        <div className="flex flex-1 items-center justify-center text-sm font-semibold text-success">LIBER</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
          <WhitelistPanel p={p} />
        </div>

        <HistoryTable p={p} />
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-muted-foreground">{label}</span>{children}</div>;
}
function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "destructive" }) {
  return (
    <div className="rounded-md bg-muted/60 p-2.5">
      <div className={cn("font-mono text-xl font-bold", tone === "destructive" && "text-destructive")}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

type P = ReturnType<typeof useParking>;

function CameraPanel({ p }: { p: P }) {
  const ev = p.state.lastEvent;
  const fileRef = useRef<HTMLInputElement>(null);
  const [plate, setPlate] = useState("");
  const badge = ev?.kind === "entry" ? <Pill tone="success"><ArrowDownToLine className="h-3 w-3" /> INTRARE DETECTATĂ</Pill>
    : ev?.kind === "exit" ? <Pill tone="info"><ArrowUpFromLine className="h-3 w-3" /> IEȘIRE CONFIRMATĂ</Pill>
    : ev ? <Pill tone="destructive"><Ban className="h-3 w-3" /> ACCES RESPINS - NEAUTORIZAT</Pill> : null;

  return (
    <Panel title="Flux Live Cameră LPR" icon={Camera} action={<span className="font-mono text-xs text-muted-foreground">last_capture.jpg</span>}>
      <div className="grid gap-5 md:grid-cols-5">
        <div className="relative overflow-hidden rounded-md border md:col-span-3">
          {ev ? <img src={ev.photo} alt={`Captură ${ev.plate}`} width={1024} height={768} className="aspect-[4/3] w-full object-cover" /> : <div className="aspect-[4/3]" />}
          <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-background/80 px-2 py-0.5 font-mono text-xs"><span className="h-2 w-2 rounded-full bg-destructive pulse-dot" /> REC</span>
        </div>
        <div className="flex flex-col gap-4 md:col-span-2">
          {ev && (
            <>
              <div>{badge}</div>
              <Plate plate={ev.plate} size="lg" />
              <div className="space-y-1 text-sm">
                <Row label="Captură">{fmt(ev.at)}</Row>
                <Row label="Încredere OCR"><span className="font-mono font-bold text-primary">{ev.confidence.toFixed(1)}%</span></Row>
              </div>
            </>
          )}
          {p.demo && <div className="mt-auto space-y-2 border-t pt-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Încarcă Poză Test / Simulează Captură ESP32</div>
            <Input placeholder="Nr. pentru poza test (ex: CV 10 PRO)" value={plate} onChange={(e) => setPlate(e.target.value)} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                const reader = new FileReader();
                reader.onload = () => {
                  if (typeof reader.result === "string") { p.simulateEntry(plate || undefined, reader.result); setPlate(""); }
                };
                reader.onerror = () => toast.error("Poza test nu poate fi citită");
                reader.readAsDataURL(f);
              }
              e.target.value = "";
            }} />
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" /> Poză test</Button>
              <Button size="sm" onClick={() => { p.simulateEntry(plate || undefined); setPlate(""); }}><ArrowDownToLine className="h-4 w-4" /> Intrare</Button>
              <Button size="sm" variant="secondary" onClick={p.simulateExit}><ArrowUpFromLine className="h-4 w-4" /> Ieșire</Button>
              <Button size="sm" variant="destructive" onClick={p.simulateUnknown}><ShieldAlert className="h-4 w-4" /> Necunoscut</Button>
            </div>
          </div>}
        </div>
      </div>
    </Panel>
  );
}

function WhitelistPanel({ p }: { p: P }) {
  const [f, setF] = useState({ plate: "", owner: "", phone: "" });
  return (
    <Panel title="Numere Autorizate (Whitelist)" icon={ShieldAlert}>
      <ul className="space-y-2">
        {p.state.whitelist.map((w) => (
          <li key={w.plate} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 p-2.5">
            <div className="min-w-0 space-y-1">
              <Plate plate={w.plate} size="sm" />
              <div className="truncate text-xs text-muted-foreground">{w.owner} · {w.phone}</div>
            </div>
            <Button size="icon" variant="ghost" aria-label={`Șterge ${w.plate}`} onClick={() => p.removeWhitelist(w.plate)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </li>
        ))}
      </ul>
      <form className="mt-4 space-y-2 border-t pt-4" onSubmit={(e) => {
        e.preventDefault();
        if (!f.plate.trim()) return;
        p.addWhitelist(f);
        setF({ plate: "", owner: "", phone: "" });
      }}>
        <div className="text-xs font-semibold uppercase text-muted-foreground">Adaugă număr</div>
        <Input placeholder="Nr. înmatriculare" value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} />
        <Input placeholder="Proprietar" value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} />
        <Input placeholder="Telefon (SMS)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Button type="submit" className="w-full"><Plus className="h-4 w-4" /> Adaugă în Whitelist</Button>
      </form>
    </Panel>
  );
}

const FILTERS = [
  { k: "all", l: "Toate" }, { k: "parked", l: "În Parcare" }, { k: "exited", l: "Ieșite" }, { k: "blocked", l: "Respinse" },
] as const;

function HistoryTable({ p }: { p: P }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["k"]>("all");
  const rows = useMemo(() => p.state.sessions.filter((s) =>
    (filter === "all" || s.status === filter) && s.plate.replace(/\s/g, "").includes(q.toUpperCase().replace(/\s/g, ""))), [p.state.sessions, q, filter]);

  const access = (s: Session) => s.accessType === "whitelist" ? <Pill tone="success">Autorizat Whitelist</Pill>
    : s.accessType === "visitor" ? <Pill tone="warning">Vizitator</Pill> : <Pill tone="destructive">Respins</Pill>;
  const status = (s: Session) => s.status === "parked" ? <Pill tone="success">În Parcare</Pill>
    : s.status === "exited" ? <Pill tone="muted">Ieșit</Pill> : <Pill tone="destructive">Acces Blocat</Pill>;

  return (
    <Panel title="Jurnal Intrări și Ieșiri" icon={Clock} action={
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 w-48 pl-8" placeholder="Caută număr..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex rounded-md border p-0.5">
          {FILTERS.map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k)} className={cn("rounded px-2.5 py-1 text-xs font-medium", filter === f.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>{f.l}</button>
          ))}
        </div>
      </div>
    }>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Foto</TableHead><TableHead>Nr. Înmatriculare</TableHead><TableHead>Tip Acces</TableHead>
              <TableHead>Ora Intrării</TableHead><TableHead>Ora Ieșirii</TableHead><TableHead>Durată Staționare</TableHead>
              <TableHead>Stare Curentă</TableHead><TableHead className="text-right">Acțiuni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell><img src={s.photo} alt="" loading="lazy" width={64} height={48} className="h-10 w-14 rounded object-cover" /></TableCell>
                <TableCell><Plate plate={s.plate} size="sm" /></TableCell>
                <TableCell>{access(s)}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">{fmt(s.entryAt)}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">{s.exitAt ? fmt(s.exitAt) : "—"}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">
                  {s.status === "blocked" ? "—" : formatDuration((s.exitAt ?? p.now) - s.entryAt)}
                </TableCell>
                <TableCell>{status(s)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {s.status === "parked" && <Button size="sm" variant="outline" onClick={() => p.closeSession(s.id)}><LogOut className="h-3.5 w-3.5" /> Închide</Button>}
                    <Button size="icon" variant="ghost" aria-label="Trimite SMS" onClick={() => p.notifySms(s.id)}><MessageSquare className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nicio înregistrare</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

function SettingsDialog({ config, onSave, onResetDemo }: { config: ApiConfig; onSave: (c: ApiConfig) => void; onResetDemo: () => void }) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState(config);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setC(config); }}>
      <DialogTrigger asChild><Button size="icon" aria-label="Setări"><Settings className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Configurare Backend</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>URL API Backend (VITE_API_BASE_URL)</Label><Input placeholder="http://192.168.1.10:3000" value={c.baseUrl} onChange={(e) => setC({ ...c, baseUrl: e.target.value })} /></div>
          <div className="space-y-1"><Label>Cheie API</Label><Input type="password" value={c.apiKey} onChange={(e) => setC({ ...c, apiKey: e.target.value })} /></div>
          <div className="space-y-1"><Label>Capacitate maximă parcare</Label><Input type="number" min={1} max={50} value={c.capacity} onChange={(e) => setC({ ...c, capacity: Math.max(1, Number(e.target.value) || 5) })} /></div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="outline" onClick={onResetDemo}><Trash2 className="h-4 w-4" /> Resetează Date Demo</Button>
          <Button onClick={() => { onSave(c); setOpen(false); }}>Salvează</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
