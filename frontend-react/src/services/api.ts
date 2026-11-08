// Modular REST API layer for an external Node.js/Express + MySQL / PHP backend.
// All functions throw on network errors so callers can fall back to mock state.

export type AccessType = "whitelist" | "visitor" | "rejected";
export type SessionStatus = "parked" | "exited" | "blocked";

export interface Session {
  id: string;
  plate: string;
  accessType: AccessType;
  entryAt: number;
  exitAt: number | null;
  status: SessionStatus;
  spot: number | null;
  photo: string;
  confidence: number;
}

export interface WhitelistEntry {
  plate: string;
  owner: string;
  phone: string;
}

export interface ParkingStatus {
  capacity: number;
  barrierOpen: boolean;
  sensorEntry: boolean;
  sensorExit: boolean;
  sessions: Session[];
  whitelist: WhitelistEntry[];
  lastEvent: CaptureEvent | null;
  occupiedSpots?: number;
  activeSpots?: ActiveSpot[];
  stats?: ParkingStats;
}

// Array rows retain the existing session/whitelist contract. Active map rows
// need only the spot number, plate, and entry time used by the dashboard.
export interface ActiveSpot {
  spot: number;
  plate: string;
  entryAt: number;
}

export interface ParkingStats {
  entriesToday: number;
  exitsToday: number;
  avgStayMinutes: number;
  rejectedToday: number;
}

export interface BackendParkingStatus {
  esp32Online: boolean;
  occupiedSpots: number;
  maxCapacity: number;
  barrierState: "CLOSED" | "OPEN";
  sensor1Active: boolean;
  sensor2Active: boolean;
  stats: ParkingStats;
  lastCapture: {
    imageUrl: string;
    plate: string;
    eventType: "ENTRY" | "EXIT" | "REJECTED";
    timestamp: string;
    confidence: number;
  } | null;
  activeSpots: ActiveSpot[];
  sessions: Session[];
  whitelist: WhitelistEntry[];
}

export function backendImageUrl(baseUrl: string, imageUrl: string, bustCache = false) {
  if (!imageUrl || /^(data:|blob:)/.test(imageUrl)) return imageUrl;
  const url = new URL(imageUrl, `${baseUrl.replace(/\/$/, "")}/`);
  if (bustCache) url.searchParams.set("t", String(Date.now()));
  return url.href;
}

export function adaptParkingStatus(data: BackendParkingStatus, config: ApiConfig): ParkingStatus {
  const capture = data.lastCapture;
  const kinds = { ENTRY: "entry", EXIT: "exit", REJECTED: "rejected" } as const;
  return {
    capacity: data.maxCapacity,
    occupiedSpots: data.occupiedSpots,
    barrierOpen: data.barrierState === "OPEN",
    sensorEntry: data.sensor1Active,
    sensorExit: data.sensor2Active,
    stats: data.stats,
    activeSpots: data.activeSpots,
    sessions: data.sessions.map((session) => ({ ...session, photo: backendImageUrl(config.baseUrl, session.photo) })),
    whitelist: data.whitelist,
    lastEvent: capture ? {
      kind: kinds[capture.eventType], plate: capture.plate,
      at: Date.parse(capture.timestamp), confidence: capture.confidence,
      // The backend already versions the image per capture (?t=<capture time>); only force a
      // cache-buster when it doesn't, otherwise the photo would be re-downloaded on every poll.
      photo: backendImageUrl(config.baseUrl, capture.imageUrl, !/[?&]t=/.test(capture.imageUrl)),
    } : null,
  };
}

export type CaptureKind = "entry" | "exit" | "rejected";
export interface CaptureEvent {
  kind: CaptureKind;
  plate: string;
  at: number;
  confidence: number;
  photo: string;
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  capacity: number;
}

const CONFIG_KEY = "lpr-config";

export function loadConfig(): ApiConfig {
  const fallback: ApiConfig = {
    baseUrl: (import.meta.env["VITE_API_BASE_URL"] as string) || "",
    apiKey: "",
    capacity: 5,
  };
  if (typeof window === "undefined") return fallback;
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}") };
  } catch {
    return fallback;
  }
}

export function saveConfig(cfg: ApiConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

async function request<T>(cfg: ApiConfig, path: string, init?: RequestInit): Promise<T> {
  if (!cfg.baseUrl) throw new Error("API URL neconfigurat");
  const res = await fetch(cfg.baseUrl.replace(/\/$/, "") + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(cfg.apiKey ? { "X-API-Key": cfg.apiKey } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getStatus: (c: ApiConfig) => request<BackendParkingStatus>(c, "/api/parking/status"),
  toggleBarrier: (c: ApiConfig) => request<{ ok: boolean }>(c, "/api/parking/barrier", { method: "POST", body: JSON.stringify({ action: "OPEN" }) }),
  closeSession: (c: ApiConfig, id: string) =>
    request<{ ok: boolean }>(c, `/api/parking/sessions/${encodeURIComponent(id)}/close`, { method: "POST" }),
  notifySms: (c: ApiConfig, id: string) =>
    request<{ ok: boolean }>(c, `/api/parking/sessions/${id}/notify`, { method: "POST" }),
  addWhitelist: (c: ApiConfig, e: WhitelistEntry) =>
    request<{ ok: boolean }>(c, "/api/parking/whitelist", { method: "POST", body: JSON.stringify(e) }),
  removeWhitelist: (c: ApiConfig, plate: string) =>
    request<{ ok: boolean }>(c, `/api/parking/whitelist/${encodeURIComponent(plate)}`, { method: "DELETE" }),
};

export function normalizePlate(p: string) {
  return p.toUpperCase().replace(/\s+/g, " ").trim();
}

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m} min ${sec}s` : `${m} min ${sec}s`;
}
