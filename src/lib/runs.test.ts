import { describe, expect, it } from "vitest";
import { currentRun, runContinuation, runsSignal } from "./runs";

describe("Only Ups / Only Downs engine", () => {
  it("counts the current strict run", () => {
    expect(currentRun([1, 2, 3, 4])).toBe(3);
    expect(currentRun([5, 4, 3])).toBe(-2);
    expect(currentRun([1, 2, 2])).toBe(0); // equal tick breaks a run
  });

  it("measures run continuation from history", () => {
    const ups = Array.from({ length: 200 }, (_, i) => i);
    expect(runContinuation(ups, 2, 3, true)).toBeGreaterThan(0.9);
    expect(runContinuation(ups, 2, 3, false)).toBeLessThan(0.2);
  });

  it("waits until enough ticks are collected", () => {
    expect(runsSignal([1, 2, 3], 5).side).toBeNull();
  });

  it("detects Only Ups on a clean rising market and Only Downs on a falling one", () => {
    const rise = Array.from({ length: 300 }, (_, i) => 100 + i * 0.1 + (i % 7 === 0 ? -0.15 : 0));
    expect(runsSignal(rise, 2, 3).side).toBe(0);
    const fall = rise.map((p) => 200 - p);
    expect(runsSignal(fall, 2, 3).side).toBe(1);
  });
});
