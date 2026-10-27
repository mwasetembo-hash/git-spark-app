import { describe, expect, it } from "vitest";
import { analyzeHybrid, directionalOffset, hybridTradeBlock, quoteReturnError } from "./hybrid-engine";
describe("Five-strategy hybrid engine", () => {
  it("requires 100 ticks", () => expect(analyzeHybrid(Array(99).fill(100)).side).toBeNull());
  it("detects rising and falling trend confluence", () => {
    const up = Array.from({ length: 200 }, (_, i) => 100 + i * 0.1);
    expect(analyzeHybrid(up).side).toBe(0);
    expect(analyzeHybrid(up.map((p) => 300 - p)).side).toBe(1);
    expect(analyzeHybrid(up).votes.map((v) => v.name)).toEqual(["Price action", "Trend", "Breakout", "Mean reversion", "Volatility"]);
  });
  it("blocks flat markets", () => expect(analyzeHybrid(Array(200).fill(100)).blockers).toContain("Market is flat or compressed"));
  it("blocks volatility shocks", () => {
    const p = Array.from({ length: 200 }, (_, i) => i < 180 ? 100 + i / 100 : 102 + (i - 180) * 10);
    expect(analyzeHybrid(p).regime).toBe("shock"); expect(analyzeHybrid(p).side).toBeNull();
  });
  it("enforces a 0.5 percent balance stake cap", () => {
    const a = analyzeHybrid(Array.from({ length: 200 }, (_, i) => 100 + i));
    expect(hybridTradeBlock(a, { side: 0, confidence: 0, balance: 100, stake: 1, maxRiskPercent: 0.5 })).toContain("Stake exceeds 0.5% balance risk cap");
    expect(hybridTradeBlock(a, { side: 0, confidence: 0, balance: 100, stake: 0.5, maxRiskPercent: 0.5 })).toEqual([]);
  });
  it("blocks an opposing live direction", () => {
    const a = analyzeHybrid(Array.from({ length: 200 }, (_, i) => i));
    expect(hybridTradeBlock(a, { side: 1, confidence: 0, balance: 10000, stake: 1, maxRiskPercent: 0.5 })).toContain("Hybrid direction does not confirm this order");
  });
});
describe("Lower quote protections", () => {
  it("uses -0.5 for Lower and +0.5 for Higher only in explicit directional mode", () => {
    expect(directionalOffset(0.5, 1, true)).toBe(-0.5); expect(directionalOffset(0.5, 0, true)).toBe(0.5);
    expect(directionalOffset(0.5, 1, false)).toBe(0.5);
  });
  it("blocks no-return and missing payout quotes", () => {
    expect(quoteReturnError({ ask_price: 1, payout: 1 })).not.toBeNull();
    expect(quoteReturnError({ ask_price: 1 })).not.toBeNull();
    expect(quoteReturnError({ ask_price: "1", payout: "1.8" })).toBeNull();
  });
});