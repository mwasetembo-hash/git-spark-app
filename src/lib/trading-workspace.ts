import { computeSignal, ema } from "./deriv";
import { kindSignal, lastDigit, type Kind, type KindSignal } from "./contracts";

export type StrategyId = "hybrid" | "trend-pattern" | "breakout-retest" | "fib-pullback";
export const STRATEGIES: { id: StrategyId; name: string; checks: string[] }[] = [
  { id: "hybrid", name: "Hybrid confluence", checks: ["Contract-specific signal", "Trend and momentum", "Market regime"] },
  { id: "trend-pattern", name: "Trend-Confirmed Pattern", checks: ["EMA 9 / 21 / 50 alignment", "Three strict directional ticks", "Trend agreement"] },
  { id: "breakout-retest", name: "Trendline Breakout-Retest", checks: ["Previous 30-tick range", "Break in the last 10 ticks", "Retest and directional close"] },
  { id: "fib-pullback", name: "Fib Pullback + Support", checks: ["60-tick swing", "38.2–61.8% retracement", "EMA trend and reversal"] },
];

export type HybridAutopilotConfig = {
  name: string;
  accountMode: "demo" | "real";
  fixedStake: number;
  maxLoss: number;
  profitTarget: number;
  maxTrades: number;
  maxLosses: number;
  minConfidence: number;
  minHistoricalTicks: number;
  sensitivity: number;
  cooldownMs: number;
  maxConcurrentOrders: number;
  requireQuoteLock: boolean;
  requireSettlementConfirmation: boolean;
  stopOnUnresolved: boolean;
  bulkDirection: "signal" | "alternate" | "up" | "down";
};

export const DEFAULT_HYBRID_AUTOPILOT: HybridAutopilotConfig = {
  name: "Mwase Jaguar Hybrid Bot",
  accountMode: "demo",
  fixedStake: 1,
  maxLoss: 20,
  profitTarget: 10,
  maxTrades: 50,
  maxLosses: 3,
  minConfidence: 70,
  minHistoricalTicks: 60,
  sensitivity: 3,
  cooldownMs: 2000,
  maxConcurrentOrders: 1,
  requireQuoteLock: true,
  requireSettlementConfirmation: true,
  stopOnUnresolved: true,
  bulkDirection: "signal",
};

export function normalizeHybridAutopilotConfig(input: Partial<HybridAutopilotConfig> = {}): HybridAutopilotConfig {
  const base = { ...DEFAULT_HYBRID_AUTOPILOT, ...input };
  return {
    ...base,
    fixedStake: Number.isFinite(base.fixedStake) && base.fixedStake > 0 ? base.fixedStake : DEFAULT_HYBRID_AUTOPILOT.fixedStake,
    maxLoss: Number.isFinite(base.maxLoss) && base.maxLoss > 0 ? base.maxLoss : DEFAULT_HYBRID_AUTOPILOT.maxLoss,
    profitTarget: Number.isFinite(base.profitTarget) && base.profitTarget > 0 ? base.profitTarget : DEFAULT_HYBRID_AUTOPILOT.profitTarget,
    maxTrades: Number.isFinite(base.maxTrades) && base.maxTrades > 0 ? base.maxTrades : DEFAULT_HYBRID_AUTOPILOT.maxTrades,
    maxLosses: Number.isFinite(base.maxLosses) && base.maxLosses > 0 ? base.maxLosses : DEFAULT_HYBRID_AUTOPILOT.maxLosses,
    minConfidence: Number.isFinite(base.minConfidence) && base.minConfidence >= 0 ? base.minConfidence : DEFAULT_HYBRID_AUTOPILOT.minConfidence,
    minHistoricalTicks: Number.isFinite(base.minHistoricalTicks) && base.minHistoricalTicks > 0 ? base.minHistoricalTicks : DEFAULT_HYBRID_AUTOPILOT.minHistoricalTicks,
    sensitivity: Number.isFinite(base.sensitivity) && base.sensitivity >= 1 ? base.sensitivity : DEFAULT_HYBRID_AUTOPILOT.sensitivity,
    cooldownMs: Number.isFinite(base.cooldownMs) && base.cooldownMs >= 0 ? base.cooldownMs : DEFAULT_HYBRID_AUTOPILOT.cooldownMs,
    maxConcurrentOrders: Number.isFinite(base.maxConcurrentOrders) && base.maxConcurrentOrders >= 1 ? base.maxConcurrentOrders : DEFAULT_HYBRID_AUTOPILOT.maxConcurrentOrders,
  };
}

export function hybridAutopilotGate(
  signal: KindSignal | null,
  limits: ExecutionLimits,
  config: Partial<HybridAutopilotConfig> = {},
  context: { quoteLocked?: boolean; settlementResolved?: boolean; pendingOrders?: number } = {},
): { allow: boolean; side: 0 | 1 | null; reasons: string[]; config: HybridAutopilotConfig } {
  const normalized = normalizeHybridAutopilotConfig(config);
  const reasons: string[] = [];
  const side = signal?.side ?? null;

  if (!limits.connected) reasons.push("Connect to Deriv");
  if (!limits.demo) reasons.push("Automated orders require a demo account");
  if (limits.halted) reasons.push("Emergency stop is engaged");
  if (limits.unresolved) reasons.push("An order is still open or awaiting confirmation");
  if (context.quoteLocked === false) reasons.push("Quote lock missing before execution");
  if (context.settlementResolved === false) reasons.push("Settlement confirmation required before next order");
  if (typeof context.pendingOrders === "number" && context.pendingOrders >= normalized.maxConcurrentOrders) reasons.push("Maximum concurrent orders reached");
  if (side === null) reasons.push("No valid signal side available");
  if (signal && signal.confidence < normalized.minConfidence) reasons.push(`Signal confidence below ${normalized.minConfidence}%`);
  if (limits.net <= -normalized.maxLoss) reasons.push("Session loss limit reached");
  if (limits.net >= normalized.profitTarget) reasons.push("Session profit target reached");
  if (limits.trades >= normalized.maxTrades) reasons.push("Maximum trades reached");
  if (limits.losses >= normalized.maxLosses) reasons.push("Consecutive loss limit reached");
  if (normalized.requireQuoteLock && context.quoteLocked === false) reasons.push("Quote-first safety gate blocked execution");
  if (normalized.requireSettlementConfirmation && context.settlementResolved === false) reasons.push("Settlement-gated execution blocked the next order");
  if (normalized.stopOnUnresolved && limits.unresolved) reasons.push("Autopilot stopped because unresolved exposure remains");

  return {
    allow: reasons.length === 0,
    side,
    reasons,
    config: normalized,
  };
}

/** Transparent local implementations; not proprietary algorithms from reference sites. */
export function patternSignal(id: StrategyId, prices: number[]): KindSignal {
  const wait = (note: string): KindSignal => ({ side: null, confidence: 0, note });
  if (prices.length < 60) return wait("Collecting 60 ticks");
  if (id === "hybrid") {
    const s = computeSignal(prices);
    return { side: s.dir === "CALL" ? 0 : s.dir === "PUT" ? 1 : null, confidence: s.confidence, note: s.note };
  }
  const last = prices.at(-1) ?? 0, previous = prices.at(-2) ?? last;
  const e9 = ema(prices, 9), e21 = ema(prices, 21), e50 = ema(prices, 50);
  const trend = e9 > e21 && e21 > e50 ? 0 : e9 < e21 && e21 < e50 ? 1 : null;
  if (id === "trend-pattern") {
    const p = prices.slice(-4);
    const up = p.slice(1).every((v, i) => v > (p[i] ?? v));
    const down = p.slice(1).every((v, i) => v < (p[i] ?? v));
    return trend === 0 && up ? { side: 0, confidence: 75, note: "Bullish EMA stack + three rising ticks" }
      : trend === 1 && down ? { side: 1, confidence: 75, note: "Bearish EMA stack + three falling ticks" }
      : wait("Waiting for EMA and strict-tick agreement");
  }
  const moves = prices.slice(-31).slice(1).map((v, i) => Math.abs(v - (prices.slice(-31)[i] ?? v)));
  const tolerance = (moves.reduce((s, v) => s + v, 0) / moves.length) * 2;
  if (id === "breakout-retest") {
    const range = prices.slice(-40, -10), recent = prices.slice(-10);
    const upper = Math.max(...range), lower = Math.min(...range);
    if (recent.some((v) => v > upper + tolerance) && Math.abs(previous - upper) <= tolerance && last > previous && last >= upper)
      return { side: 0, confidence: 70, note: "Range breakout retested at resistance → support" };
    if (recent.some((v) => v < lower - tolerance) && Math.abs(previous - lower) <= tolerance && last < previous && last <= lower)
      return { side: 1, confidence: 70, note: "Range breakdown retested at support → resistance" };
    return wait("Waiting for a breakout, retest and rejection");
  }
  const swing = prices.slice(-60, -4), low = Math.min(...swing), high = Math.max(...swing), width = high - low;
  if (width <= 0 || trend === null) return wait("No directional swing");
  const retracement = trend === 0 ? (high - previous) / width : (previous - low) / width;
  if (retracement >= 0.382 && retracement <= 0.618 && (trend === 0 ? last > previous : last < previous))
    return { side: trend, confidence: 68, note: `${(retracement * 100).toFixed(1)}% swing retracement with directional rejection` };
  return wait("Waiting for a 38.2–61.8% pullback and rejection");
}

export type ExecutionLimits = { connected: boolean; demo: boolean; halted: boolean; net: number; maxLoss: number; target: number; trades: number; maxTrades: number; losses: number; maxLosses: number; unresolved: boolean; };
export function automationBlock(s: ExecutionLimits): string | null {
  if (!s.connected) return "Connect to Deriv";
  if (!s.demo) return "Automated orders require a demo account";
  if (s.halted) return "Emergency stop is engaged";
  if (s.unresolved) return "An order is still open or awaiting confirmation";
  if (![s.maxLoss, s.target, s.maxTrades, s.maxLosses].every((n) => Number.isFinite(n) && n > 0)) return "Risk limits must be positive";
  if (s.net <= -s.maxLoss) return "Session loss limit reached";
  if (s.net >= s.target) return "Session profit target reached";
  if (s.trades >= s.maxTrades) return "Maximum trades reached";
  if (s.losses >= s.maxLosses) return "Consecutive loss limit reached";
  return null;
}

export function bulkSide(direction: "signal" | "alternate" | "up" | "down", completed: number, signal: 0 | 1 | null): 0 | 1 | null {
  return direction === "signal" ? signal : direction === "alternate" ? completed % 2 === 0 ? 0 : 1 : direction === "up" ? 0 : 1;
}

export const BACKTEST_KINDS: Kind[] = ["RUNS", "RISE_FALL", "EVEN_ODD", "OVER_UNDER", "MATCH_DIFF"];
export type PaperTrade = { tick: number; side: 0 | 1; won: boolean; profit: number; equity: number };
export function backtest(prices: number[], options: { kind: Kind; ticks: number; digit: number; decimals: number; stake: number; payout: number; minConf: number; sensitivity: number }): PaperTrade[] {
  const { kind, ticks, digit, decimals, stake, payout, minConf, sensitivity } = options;
  if (!BACKTEST_KINDS.includes(kind) || !Number.isInteger(ticks) || ticks < 1 || !Number.isFinite(stake) || stake <= 0 || !Number.isFinite(payout) || payout <= 0) return [];
  const results: PaperTrade[] = [];
  let equity = 0;
  for (let i = 60; i + ticks < prices.length; i += ticks + 1) {
    const signal = kindSignal(kind, prices.slice(0, i + 1), decimals, { digit, offset: 0, hi: 0, lo: 0, ticks, sensitivity });
    if (signal.side === null || signal.confidence < minConf) continue;
    const start = prices[i] ?? 0, end = prices[i + ticks] ?? start;
    const d = lastDigit(end, decimals), side = signal.side;
    let won = false;
    if (kind === "RUNS") won = prices.slice(i + 1, i + ticks + 1).every((v, n) => side === 0 ? v > (prices[i + n] ?? v) : v < (prices[i + n] ?? v));
    if (kind === "RISE_FALL") won = side === 0 ? end > start : end < start;
    if (kind === "EVEN_ODD") won = side === 0 ? d % 2 === 0 : d % 2 === 1;
    if (kind === "OVER_UNDER") won = side === 0 ? d > digit : d < digit;
    if (kind === "MATCH_DIFF") won = side === 0 ? d === digit : d !== digit;
    const profit = won ? stake * payout / 100 : -stake;
    equity += profit;
    results.push({ tick: i, side, won, profit, equity });
  }
  return results;
}
