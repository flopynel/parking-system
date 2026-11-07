import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptParkingStatus, api, backendImageUrl, type BackendParkingStatus } from "@/services/api";

const config = { baseUrl: "https://parking.example.test", apiKey: "", capacity: 5 };
const payload: BackendParkingStatus = {
  esp32Online: true, occupiedSpots: 3, maxCapacity: 5, barrierState: "CLOSED",
  sensor1Active: false, sensor2Active: false,
  stats: { entriesToday: 4, exitsToday: 1, avgStayMinutes: 45, rejectedToday: 1 },
  lastCapture: { imageUrl: "/uploads/last_capture.jpg", plate: "CV 10 PRO", eventType: "ENTRY", timestamp: "2026-11-08T10:30:00Z", confidence: 98.4 },
  activeSpots: [{ spot: 1, plate: "CV 10 PRO", entryAt: 1794133800000 }], sessions: [], whitelist: [],
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Node.js parking contract", () => {
  it("requests the exact status endpoint and returns the backend JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal("fetch", fetchMock);
    expect(await api.getStatus(config)).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith("https://parking.example.test/api/parking/status", expect.any(Object));
  });
  it("uses backend occupancy, capacity, sensors and statistics independently of session rows", () => {
    expect(adaptParkingStatus(payload, config)).toMatchObject({
      occupiedSpots: 3, capacity: 5, barrierOpen: false, sensorEntry: false, sensorExit: false,
      stats: { entriesToday: 4, exitsToday: 1, avgStayMinutes: 45, rejectedToday: 1 }, activeSpots: payload.activeSpots,
      lastEvent: { kind: "entry", at: Date.parse("2026-11-08T10:30:00Z"), confidence: 98.4, plate: "CV 10 PRO" },
    });
  });
  it.each([ ["ENTRY", "entry"], ["EXIT", "exit"], ["REJECTED", "rejected"] ] as const)("maps %s capture events", (eventType, kind) => {
    expect(adaptParkingStatus({ ...payload, lastCapture: { imageUrl: "/uploads/last_capture.jpg", plate: "CV 10 PRO", timestamp: "2026-11-08T10:30:00Z", confidence: 98.4, eventType } }, config).lastEvent?.kind).toBe(kind);
  });
  it("maps OPEN and active sensors", () => {
    expect(adaptParkingStatus({ ...payload, barrierState: "OPEN", sensor1Active: true, sensor2Active: true, lastCapture: null }, config)).toMatchObject({ barrierOpen: true, sensorEntry: true, sensorExit: true, lastEvent: null });
  });
  it("resolves capture paths against the backend and refreshes cache timestamps", () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    expect(backendImageUrl(config.baseUrl, "/uploads/last_capture.jpg", true)).toBe("https://parking.example.test/uploads/last_capture.jpg?t=1000");
    expect(backendImageUrl(config.baseUrl, "/uploads/last_capture.jpg?v=1&t=old", true)).toBe("https://parking.example.test/uploads/last_capture.jpg?v=1&t=2000");
  });
  it("posts OPEN to the barrier", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await api.toggleBarrier(config);
    expect(fetchMock).toHaveBeenCalledWith(`${config.baseUrl}/api/parking/barrier`, expect.objectContaining({ method: "POST", body: '{"action":"OPEN"}' }));
  });
  it("posts exactly the whitelist fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await api.addWhitelist(config, { plate: "CV 10 PRO", owner: "Florin", phone: "123" });
    expect(fetchMock).toHaveBeenCalledWith(`${config.baseUrl}/api/parking/whitelist`, expect.objectContaining({ method: "POST", body: '{"plate":"CV 10 PRO","owner":"Florin","phone":"123"}' }));
  });
  it("deletes the encoded whitelist plate", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await api.removeWhitelist(config, "CV 10 PRO");
    expect(fetchMock).toHaveBeenCalledWith(`${config.baseUrl}/api/parking/whitelist/CV%2010%20PRO`, expect.objectContaining({ method: "DELETE" }));
  });
  it("posts to the session close endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await api.closeSession(config, "s1");
    expect(fetchMock).toHaveBeenCalledWith(`${config.baseUrl}/api/parking/sessions/s1/close`, expect.objectContaining({ method: "POST" }));
  });
});