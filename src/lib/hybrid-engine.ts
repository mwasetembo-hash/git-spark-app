import { ema } from "./deriv";
import type { KindSignal } from "./contracts";

export type HybridVote = { name: string; side: 0 | 1 | null; strength: number; weight: number; reason: string };
export type HybridAnalysis = KindSignal & { votes: HybridVote[]; regime: "warming" | "quiet" | "trend" | "range" | "shock"; agreement: number; blockers: string[]; volatilityRatio: number };
const average = (p: number[]) => p.length ? p.reduce((s, v) => s + v, 0) / p.length : 0;
const deviation = (p: number[]) => { const m = average(p); return Math.sqrt(average(p.map((v) => (v - m) ** 2))); };

/** Tick-based analysis, not time candles or calibrated probabilities. */
export function analyzeHybrid(prices: number[]): HybridAnalysis {
  const empty: HybridAnalysis = { side: null, confidence: 0, note: "Collecting 100 valid ticks", votes: [], regime: "warming", agreement: 0, blockers: ["At least 100 finite ticks required"], volatilityRatio: 0 };
  if (prices.length < 100 || prices.some((v) => !Number.isFinite(v))) return empty;
  const p = prices.slice(-200), last = p.at(-1) ?? 0, prev = p.at(-2) ?? last;
  const moves = p.slice(1).map((v, i) => v - (p[i] ?? v));
  const normal = average(moves.slice(0, -20).map(Math.abs));
  const recent = average(moves.slice(-20).map(Math.abs));
  const ratio = normal > 0 ? recent / normal : 0;
  const e9 = ema(p, 9), e21 = ema(p, 21), e50 = ema(p, 50);
  const trend: 0 | 1 | null = e9 > e21 && e21 > e50 ? 0 : e9 < e21 && e21 < e50 ? 1 : null;
  const spread = normal > 0 ? Math.abs(e9 - e50) / normal : 0;
  const regime: HybridAnalysis["regime"] = normal === 0 || ratio < 0.35 ? "quiet" : ratio > 3 ? "shock" : trend !== null && spread >= 3 ? "trend" : "range";
  const chunks = [p.slice(-20, -10), p.slice(-10)];
  const a = chunks[0] ?? [], b = chunks[1] ?? [];
  const structure: 0 | 1 | null = Math.max(...b) > Math.max(...a) && Math.min(...b) > Math.min(...a) && last > prev ? 0
    : Math.max(...b) < Math.max(...a) && Math.min(...b) < Math.min(...a) && last < prev ? 1 : null;
  const reference = p.slice(-41, -1), upper = Math.max(...reference), lower = Math.min(...reference);
  const breakout: 0 | 1 | null = last > upper && last > prev ? 0 : last < lower && last < prev ? 1 : null;
  const window = p.slice(-21, -1), mean = average(window), sd = deviation(window);
  const z = sd > 0 ? (prev - mean) / sd : 0;
  const reversion: 0 | 1 | null = regime === "range" && z < -1.5 && last > prev ? 0 : regime === "range" && z > 1.5 && last < prev ? 1 : null;
  const momentum = average(moves.slice(-5));
  const volatility: 0 | 1 | null = ratio >= 0.7 && ratio <= 2.5 && Math.abs(momentum) > normal * 0.3 ? momentum > 0 ? 0 : 1 : null;
  const votes: HybridVote[] = [
    { name: "Price action", side: structure, strength: structure === null ? 0 : 1, weight: 1.2, reason: structure === 0 ? "Higher highs and higher lows; rising close" : structure === 1 ? "Lower highs and lower lows; falling close" : "Mixed 10-tick swing structure" },
    { name: "Trend", side: trend, strength: Math.min(1, spread / 5), weight: regime === "trend" ? 1.5 : 0.7, reason: `EMA 9/21/50 ${trend === 0 ? "bullish" : trend === 1 ? "bearish" : "mixed"}; spread ${spread.toFixed(1)}× mean move` },
    { name: "Breakout", side: breakout, strength: breakout === null ? 0 : 1, weight: 1.1, reason: breakout === null ? "Inside previous 40-tick range" : `New ${breakout === 0 ? "high" : "low"} beyond prior 40 ticks` },
    { name: "Mean reversion", side: reversion, strength: reversion === null ? 0 : 1, weight: regime === "range" ? 1.4 : 0.3, reason: regime !== "range" ? "Disabled outside range regime" : `Deviation ${z.toFixed(2)}σ; ${reversion === null ? "no rejection" : "rejection toward mean"}` },
    { name: "Volatility", side: volatility, strength: volatility === null ? 0 : Math.min(1, Math.abs(momentum) / (normal || 1)), weight: 1, reason: `Recent moves ${ratio.toFixed(2)}× baseline; ${volatility === null ? "no directional expansion" : "directional momentum"}` },
  ];
  const score = (side: 0 | 1) => votes.filter((v) => v.side === side).reduce((s, v) => s + v.weight * v.strength, 0);
  const up = score(0), down = score(1), candidate: 0 | 1 | null = up > down ? 0 : down > up ? 1 : null;
  const agreement = candidate === null ? 0 : votes.filter((v) => v.side === candidate && v.strength >= 0.3).length;
  const total = votes.reduce((s, v) => s + v.weight, 0);
  const confidence = candidate === null ? 0 : Math.round(Math.min(95, Math.max(up, down) / total * 100));
  const blockers: string[] = [];
  if (regime === "quiet") blockers.push("Market is flat or compressed");
  if (regime === "shock") blockers.push("Volatility shock exceeds 3× baseline");
  if (agreement < 2) blockers.push("Fewer than two strategy confirmations");
  if (Math.abs(up - down) < 0.6) blockers.push("Conflicting directional votes");
  const side = blockers.length ? null : candidate;
  return { side, confidence, votes, regime, agreement, blockers, volatilityRatio: ratio, note: side === null ? blockers.join(" · ") : `${agreement}/5 strategy confirmations · ${regime} regime` };
}

export function hybridTradeBlock(a: HybridAnalysis, input: { side: 0 | 1; confidence: number; balance: number | null; stake: number; maxRiskPercent: number; quotePayout?: number; quotePrice?: number }): string[] {
  const errors = [...a.blockers];
  if (a.side !== input.side) errors.push("Hybrid direction does not confirm this order");
  if (a.confidence < input.confidence) errors.push(`Hybrid score ${a.confidence}% below ${input.confidence}%`);
  if (input.balance === null || !Number.isFinite(input.balance) || input.balance <= 0) errors.push("Balance is unavailable");
  else if (input.stake > input.balance * input.maxRiskPercent / 100) errors.push(`Stake exceeds ${input.maxRiskPercent}% balance risk cap`);
  if (input.quotePayout !== undefined && input.quotePrice !== undefined && (!Number.isFinite(input.quotePayout) || input.quotePayout <= input.quotePrice)) errors.push("Quote offers no positive net return");
  return [...new Set(errors)];
}

/** Directional auto-offset mode is explicit; manual signed offsets stay unchanged. */
export function directionalOffset(magnitude: number, side: 0 | 1, automatic: boolean): number {
  return automatic ? Math.abs(magnitude) * (side === 0 ? 1 : -1) : magnitude;
}
export function quoteReturnError(quote: { ask_price?: unknown; payout?: unknown }): string | null {
  const price = Number(quote.ask_price), payout = Number(quote.payout);
  return !Number.isFinite(price) || price <= 0 || !Number.isFinite(payout) || payout <= price ? "Quote offers no positive net return. Adjust the barrier or duration and request a new quote; no order was submitted." : null;
}