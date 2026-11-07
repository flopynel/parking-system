import type { ParkingStatus } from "@/services/api";

const DEMO_KEY = "lpr-demo-state";
const MODE_KEY = "lpr-demo-mode";

export function loadDemoState(): ParkingStatus | null {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as ParkingStatus;
    if (!Array.isArray(value.sessions) || !Array.isArray(value.whitelist) || !Number.isFinite(value.capacity)) return null;
    return value;
  } catch {
    return null;
  }
}

export function loadDemoMode(fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(MODE_KEY);
    return value === "true" ? true : value === "false" ? false : fallback;
  } catch {
    return fallback;
  }
}

// Callers report quota/permission failures rather than silently losing photos.
export function saveDemoState(state: ParkingStatus) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(state));
}

export function saveDemoMode(demo: boolean) {
  localStorage.setItem(MODE_KEY, String(demo));
}