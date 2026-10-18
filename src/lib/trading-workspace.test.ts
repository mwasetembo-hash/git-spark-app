import { describe, expect, it } from "vitest";
import { automationBlock, backtest, bulkSide, patternSignal, type ExecutionLimits } from "./trading-workspace";

const ready: ExecutionLimits = { connected: true, demo: true, halted: false, net: 0, maxLoss: 20, target: 10, trades: 0, maxTrades: 50, losses: 0, maxLosses: 3, unresolved: false };
describe("Demo execution protection", () => {
  it("rejects real accounts", () => expect(automationBlock({ ...ready, demo: false })).toContain("demo account"));
  it("blocks at the 20 loss limit", () => expect(automationBlock({ ...ready, net: -20 })).toContain("loss limit"));
  it("blocks at the 10 profit target", () => expect(automationBlock({ ...ready, net: 10 })).toContain("profit target"));
  it("blocks at 50 trades", () => expect(automationBlock({ ...ready, trades: 50 })).toContain("Maximum trades"));
  it("blocks at 3 consecutive losses", () => expect(automationBlock({ ...ready, losses: 3 })).toContain("Consecutive loss"));
  it("blocks emergency stops", () => expect(automationBlock({ ...ready, halted: true })).toContain("Emergency stop"));
  it("never starts another order with unresolved exposure", () => expect(automationBlock({ ...ready, unresolved: true })).toContain("awaiting confirmation"));
  it("alternates the two sides in sequence", () => {
    expect([0, 1, 2, 3].map((i) => bulkSide("alternate", i, null))).toEqual([0, 1, 0, 1]);
    expect(bulkSide("signal", 0, null)).toBeNull();
  });
});
describe("Transparent local strategy analysis", () => {
  it("requires 60 historical ticks", () => expect(patternSignal("trend-pattern", [1, 2, 3]).side).toBeNull());
  it("detects both trend-confirmed directions", () => {
    expect(patternSignal("trend-pattern", Array.from({ length: 100 }, (_, i) => i)).side).toBe(0);
    expect(patternSignal("trend-pattern", Array.from({ length: 100 }, (_, i) => 100 - i)).side).toBe(1);
  });
  it("paper trades use fixed stake and never exceed available future ticks", () => {
    const p = Array.from({ length: 200 }, (_, i) => 100 + i / 10);
    const r = backtest(p, { kind: "RISE_FALL", ticks: 5, digit: 5, decimals: 2, stake: 1, payout: 80, minConf: 0, sensitivity: 3 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((t) => t.tick + 5 < p.length)).toBe(true);
    expect(r.every((t) => t.profit === 0.8 || t.profit === -1)).toBe(true);
  });
});