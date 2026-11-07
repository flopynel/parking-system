import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useParking } from "@/hooks/use-parking";
import { loadConfig } from "@/services/api";
import { loadDemoState } from "@/services/demo-storage";

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe("Demo persistence", () => {
  it("preserves a new entry and uploaded image across remounts", () => {
    const photo = "data:image/png;base64,dGVzdA==";
    const first = renderHook(useParking);
    act(() => first.result.current.simulateEntry("CJ 77 NEW", photo));
    first.unmount();
    const next = renderHook(useParking);
    expect(next.result.current.state.sessions.find((s) => s.plate === "CJ 77 NEW")).toMatchObject({ status: "parked", photo });
    expect(next.result.current.state.lastEvent?.photo).toBe(photo);
  });
  it("preserves exits across remounts", () => {
    const first = renderHook(useParking);
    act(() => first.result.current.simulateExit());
    const plate = first.result.current.state.lastEvent?.plate;
    first.unmount();
    const next = renderHook(useParking);
    expect(next.result.current.state.sessions.find((s) => s.plate === plate)).toMatchObject({ status: "exited", spot: null });
  });
  it("preserves whitelist additions and removals", async () => {
    const first = renderHook(useParking);
    await act(async () => first.result.current.addWhitelist({ plate: "CJ 77 NEW", owner: "Test", phone: "123" }));
    await act(async () => first.result.current.removeWhitelist("CV 10 PRO"));
    first.unmount();
    const next = renderHook(useParking);
    expect(next.result.current.state.whitelist).toContainEqual({ plate: "CJ 77 NEW", owner: "Test", phone: "123" });
    expect(next.result.current.state.whitelist.some((w) => w.plate === "CV 10 PRO")).toBe(false);
  });
  it("preserves settings and the selected mode", async () => {
    const first = renderHook(useParking);
    act(() => first.result.current.setConfig({ baseUrl: "", apiKey: "", capacity: 7 }));
    act(() => first.result.current.setDemo(false));
    first.unmount();
    const next = renderHook(useParking);
    expect(loadConfig().capacity).toBe(7);
    expect(next.result.current.config.capacity).toBe(7);
    expect(next.result.current.demo).toBe(false);
    await act(async () => { await Promise.resolve(); });
  });
  it("resets demo modifications without resetting settings or mode", async () => {
    const first = renderHook(useParking);
    act(() => first.result.current.setConfig({ baseUrl: "", apiKey: "", capacity: 7 }));
    act(() => first.result.current.simulateEntry("CJ 77 NEW", "data:image/png;base64,dGVzdA=="));
    act(() => first.result.current.resetDemo());
    await waitFor(() => expect(loadDemoState()?.sessions.some((s) => s.plate === "CJ 77 NEW")).toBe(false));
    first.unmount();
    const next = renderHook(useParking);
    expect(next.result.current.state.sessions).toHaveLength(5);
    expect(next.result.current.config.capacity).toBe(7);
    expect(next.result.current.demo).toBe(true);
  });
  it("recovers safely from corrupt stored demo data", () => {
    localStorage.setItem("lpr-demo-state", "not-json");
    const next = renderHook(useParking);
    expect(next.result.current.state.sessions).toHaveLength(5);
  });
});