import { computeSignal, ema } from "./deriv";
import { kindSignal, lastDigit, type Kind, type KindSignal } from "./contracts";

export type StrategyId = "hybrid" | "elite-hybrid" | "trend-pattern" | "breakout-retest" | "fib-pullback";
export const STRATEGIES: { id: StrategyId; name: string; checks: string[] }[] = [
  { id: "hybrid", name: "Hybrid confluence", checks: ["Contract-specific signal", "Trend and momentum", "Market regime"] },
  { id: "elite-hybrid", name: "Elite multi-factor hybrid", checks: ["Trend and liquidity alignment", "BOS / CHOCH structure", "Breakout-retest and Fibonacci filter"] },
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

export type AutopilotProfilePreset = "conservative" | "balanced" | "aggressive";

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

export const AUTOPILOT_PRESETS: Record<AutopilotProfilePreset, HybridAutopilotConfig> = {
  conservative: {
    ...DEFAULT_HYBRID_AUTOPILOT,
    name: "Conservative Recovery Bot",
    fixedStake: 0.35,
    maxLoss: 8,
    profitTarget: 6,
    maxTrades: 25,
    maxLosses: 2,
    minConfidence: 75,
    cooldownMs: 3500,
    maxConcurrentOrders: 1,
    bulkDirection: "signal",
  },
  balanced: {
    ...DEFAULT_HYBRID_AUTOPILOT,
    name: "Balanced Hybrid Bot",
    fixedStake: 1,
    maxLoss: 15,
    profitTarget: 10,
    maxTrades: 40,
    maxLosses: 3,
    minConfidence: 70,
    cooldownMs: 2500,
    maxConcurrentOrders: 1,
    bulkDirection: "signal",
  },
  aggressive: {
    ...DEFAULT_HYBRID_AUTOPILOT,
    name: "Aggressive Growth Bot",
    fixedStake: 2,
    maxLoss: 20,
    profitTarget: 14,
    maxTrades: 60,
    maxLosses: 4,
    minConfidence: 65,
    cooldownMs: 1800,
    maxConcurrentOrders: 1,
    bulkDirection: "signal",
  },
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

export function hybridAutopilotPresetSummary(config: Partial<HybridAutopilotConfig>) {
  const cfg = normalizeHybridAutopilotConfig(config);
  return `${cfg.name} · stake ${cfg.fixedStake} · min conf ${cfg.minConfidence}% · cooldown ${(cfg.cooldownMs / 1000).toFixed(1)}s · max loss ${cfg.maxLoss} · target ${cfg.profitTarget}`;
}

export type CompositeSignal = {
  side: 0 | 1 | null;
  confidence: number;
  note: string;
  reasons: string[];
  score: number;
};

export type MultiStrategyConfig = {
  minBullishScore: number;
  minBearishScore: number;
  requiredConfluence: number;
  trendWeight: number;
  liquidityWeight: number;
  breakoutWeight: number;
  fibWeight: number;
  structureWeight: number;
};

export const DEFAULT_MULTI_STRATEGY: MultiStrategyConfig = {
  minBullishScore: 55,
  minBearishScore: 55,
  requiredConfluence: 12,
  trendWeight: 20,
  liquidityWeight: 18,
  breakoutWeight: 20,
  fibWeight: 16,
  structureWeight: 14,
};

export type PatternFamily = "chart" | "candlestick" | "market-structure" | "smc" | "harmonic" | "indicator" | "combination";
export type PatternDefinition = {
  id: string;
  family: PatternFamily;
  name: string;
  longName: string;
  bullishBias: "bullish" | "bearish" | "neutral";
  summary: string;
};

export const PATTERN_LIBRARY: PatternDefinition[] = [
  { id: "head-and-shoulders", family: "chart", name: "Head & Shoulders", longName: "Head and Shoulders", bullishBias: "bearish", summary: "Three-peak reversal structure with neckline break confirmation." },
  { id: "inverse-head-and-shoulders", family: "chart", name: "Inverse H&S", longName: "Inverse Head and Shoulders", bullishBias: "bullish", summary: "Three-trough bullish reversal structure with neckline break." },
  { id: "double-top", family: "chart", name: "Double Top", longName: "Double Top", bullishBias: "bearish", summary: "Two failed swing highs near resistance." },
  { id: "double-bottom", family: "chart", name: "Double Bottom", longName: "Double Bottom", bullishBias: "bullish", summary: "Two failed swing lows near support." },
  { id: "triple-top", family: "chart", name: "Triple Top", longName: "Triple Top", bullishBias: "bearish", summary: "Three failed highs increase reversal probability." },
  { id: "triple-bottom", family: "chart", name: "Triple Bottom", longName: "Triple Bottom", bullishBias: "bullish", summary: "Three failed lows increase reversal probability." },
  { id: "ascending-triangle", family: "chart", name: "Ascending Triangle", longName: "Ascending Triangle", bullishBias: "bullish", summary: "Higher lows compress into flat resistance." },
  { id: "descending-triangle", family: "chart", name: "Descending Triangle", longName: "Descending Triangle", bullishBias: "bearish", summary: "Lower highs compress into flat support." },
  { id: "symmetrical-triangle", family: "chart", name: "Symmetrical Triangle", longName: "Symmetrical Triangle", bullishBias: "neutral", summary: "Compression before breakout in either direction." },
  { id: "bull-flag", family: "chart", name: "Bull Flag", longName: "Bull Flag", bullishBias: "bullish", summary: "Strong impulse followed by short consolidation." },
  { id: "bear-flag", family: "chart", name: "Bear Flag", longName: "Bear Flag", bullishBias: "bearish", summary: "Strong decline followed by short consolidation." },
  { id: "bull-pennant", family: "chart", name: "Bull Pennant", longName: "Bull Pennant", bullishBias: "bullish", summary: "Consolidation after an impulsive move." },
  { id: "bear-pennant", family: "chart", name: "Bear Pennant", longName: "Bear Pennant", bullishBias: "bearish", summary: "Consolidation after a strong directional move." },
  { id: "rising-wedge", family: "chart", name: "Rising Wedge", longName: "Rising Wedge", bullishBias: "bearish", summary: "Price compresses upward before reversal risk." },
  { id: "falling-wedge", family: "chart", name: "Falling Wedge", longName: "Falling Wedge", bullishBias: "bullish", summary: "Price compresses downward before upside risk." },
  { id: "rectangle-range", family: "chart", name: "Rectangle / Range", longName: "Rectangle or Range", bullishBias: "neutral", summary: "Range bounce or breakout between support and resistance." },
  { id: "cup-and-handle", family: "chart", name: "Cup & Handle", longName: "Cup and Handle", bullishBias: "bullish", summary: "Rounded base with brief tightening before continuation." },
  { id: "inverted-cup-and-handle", family: "chart", name: "Inverted Cup & Handle", longName: "Inverted Cup and Handle", bullishBias: "bearish", summary: "Rounded top with brief tightening before downward continuation." },
  { id: "rounding-bottom", family: "chart", name: "Rounding Bottom", longName: "Rounding Bottom", bullishBias: "bullish", summary: "Long gradual reversal from bearish to bullish pressure." },
  { id: "rounding-top", family: "chart", name: "Rounding Top", longName: "Rounding Top", bullishBias: "bearish", summary: "Gradual transition from bullish to bearish pressure." },
  { id: "broadening-formation", family: "chart", name: "Broadening Formation", longName: "Broadening Formation", bullishBias: "neutral", summary: "Volatility expands and structure widens." },
  { id: "ascending-broadening-wedge", family: "chart", name: "Ascending Broadening Wedge", longName: "Ascending Broadening Wedge", bullishBias: "bearish", summary: "Expanding uptrend with reversal risk." },
  { id: "descending-broadening-wedge", family: "chart", name: "Descending Broadening Wedge", longName: "Descending Broadening Wedge", bullishBias: "bullish", summary: "Expanding downtrend with reversal risk." },
  { id: "diamond-top", family: "chart", name: "Diamond Top", longName: "Diamond Top", bullishBias: "bearish", summary: "Broadening structure loses momentum at the top." },
  { id: "diamond-bottom", family: "chart", name: "Diamond Bottom", longName: "Diamond Bottom", bullishBias: "bullish", summary: "Broadening structure loses momentum at the bottom." },
  { id: "megaphone-pattern", family: "chart", name: "Megaphone", longName: "Megaphone Pattern", bullishBias: "neutral", summary: "Trend line widening indicates volatility expansion." },
  { id: "measured-move", family: "chart", name: "Measured Move", longName: "Measured Move", bullishBias: "neutral", summary: "Projected move based on prior impulse length." },
  { id: "ab-cd", family: "harmonic", name: "AB=CD", longName: "AB=CD", bullishBias: "neutral", summary: "Two related legs with equal swing lengths." },
  { id: "gartley", family: "harmonic", name: "Gartley", longName: "Gartley", bullishBias: "neutral", summary: "Classic harmonic structure using Fibonacci ratios." },
  { id: "bat", family: "harmonic", name: "Bat", longName: "Bat", bullishBias: "neutral", summary: "Deeper retracement harmonic pattern." },
  { id: "butterfly", family: "harmonic", name: "Butterfly", longName: "Butterfly", bullishBias: "neutral", summary: "Extended harmonic reversal pattern." },
  { id: "crab", family: "harmonic", name: "Crab", longName: "Crab", bullishBias: "neutral", summary: "Deep extended harmonic reversal form." },
  { id: "deep-crab", family: "harmonic", name: "Deep Crab", longName: "Deep Crab", bullishBias: "neutral", summary: "More extreme extension than a standard crab pattern." },
  { id: "shark", family: "harmonic", name: "Shark", longName: "Shark", bullishBias: "neutral", summary: "Five-point harmonic pattern with deep retracement." },
  { id: "cypher", family: "harmonic", name: "Cypher", longName: "Cypher", bullishBias: "neutral", summary: "Harmonic pattern with distinctive C-point extension." },
  { id: "three-drives", family: "harmonic", name: "Three Drives", longName: "Three Drives", bullishBias: "neutral", summary: "Three directional pushes before reversal or continuation." },
  { id: "hammer", family: "candlestick", name: "Hammer", longName: "Hammer", bullishBias: "bullish", summary: "Lower-price rejection with short body and long wick." },
  { id: "inverted-hammer", family: "candlestick", name: "Inverted Hammer", longName: "Inverted Hammer", bullishBias: "bullish", summary: "Upper-price rejection near support." },
  { id: "bullish-engulfing", family: "candlestick", name: "Bullish Engulfing", longName: "Bullish Engulfing", bullishBias: "bullish", summary: "Large bullish candle overwhelms prior bearish one." },
  { id: "morning-star", family: "candlestick", name: "Morning Star", longName: "Morning Star", bullishBias: "bullish", summary: "Three-candle reversal pattern with a bearish gap." },
  { id: "three-white-soldiers", family: "candlestick", name: "Three White Soldiers", longName: "Three White Soldiers", bullishBias: "bullish", summary: "Three strong bullish candles in sequence." },
  { id: "piercing-line", family: "candlestick", name: "Piercing Line", longName: "Piercing Line", bullishBias: "bullish", summary: "Bullish candle closes deeply into prior bearish body." },
  { id: "tweezer-bottom", family: "candlestick", name: "Tweezer Bottom", longName: "Tweezer Bottom", bullishBias: "bullish", summary: "Two candles reject similar lows." },
  { id: "bullish-harami", family: "candlestick", name: "Bullish Harami", longName: "Bullish Harami", bullishBias: "bullish", summary: "Small bullish candle inside larger bearish body." },
  { id: "shooting-star", family: "candlestick", name: "Shooting Star", longName: "Shooting Star", bullishBias: "bearish", summary: "Upper-price rejection after an advance." },
  { id: "hanging-man", family: "candlestick", name: "Hanging Man", longName: "Hanging Man", bullishBias: "bearish", summary: "Possible bearish reversal after an uptrend." },
  { id: "bearish-engulfing", family: "candlestick", name: "Bearish Engulfing", longName: "Bearish Engulfing", bullishBias: "bearish", summary: "Large bearish candle overwhelms prior bullish one." },
  { id: "evening-star", family: "candlestick", name: "Evening Star", longName: "Evening Star", bullishBias: "bearish", summary: "Three-candle reversal pattern with bullish gap." },
  { id: "three-black-crows", family: "candlestick", name: "Three Black Crows", longName: "Three Black Crows", bullishBias: "bearish", summary: "Three strong bearish candles in sequence." },
  { id: "dark-cloud-cover", family: "candlestick", name: "Dark Cloud Cover", longName: "Dark Cloud Cover", bullishBias: "bearish", summary: "Bearish candle closes deeply into prior bullish body." },
  { id: "tweezer-top", family: "candlestick", name: "Tweezer Top", longName: "Tweezer Top", bullishBias: "bearish", summary: "Two candles reject similar highs." },
  { id: "bearish-harami", family: "candlestick", name: "Bearish Harami", longName: "Bearish Harami", bullishBias: "bearish", summary: "Small bearish candle inside larger bullish body." },
  { id: "doji", family: "candlestick", name: "Doji", longName: "Doji", bullishBias: "neutral", summary: "Indecision candle with little net movement." },
  { id: "long-legged-doji", family: "candlestick", name: "Long-Legged Doji", longName: "Long-Legged Doji", bullishBias: "neutral", summary: "Large intraday range and balanced close." },
  { id: "dragonfly-doji", family: "candlestick", name: "Dragonfly Doji", longName: "Dragonfly Doji", bullishBias: "bullish", summary: "Long lower wick suggests rejection of lower prices." },
  { id: "gravestone-doji", family: "candlestick", name: "Gravestone Doji", longName: "Gravestone Doji", bullishBias: "bearish", summary: "Long upper wick suggests rejection of higher prices." },
  { id: "spinning-top", family: "candlestick", name: "Spinning Top", longName: "Spinning Top", bullishBias: "neutral", summary: "Indecision candle with a small body." },
  { id: "marubozu", family: "candlestick", name: "Marubozu", longName: "Marubozu", bullishBias: "neutral", summary: "Strong directional candle with little wick." },
  { id: "higher-highs-higher-lows", family: "market-structure", name: "HH / HL", longName: "Higher Highs and Higher Lows", bullishBias: "bullish", summary: "Structural uptrend confirmation." },
  { id: "lower-highs-lower-lows", family: "market-structure", name: "LH / LL", longName: "Lower Highs and Lower Lows", bullishBias: "bearish", summary: "Structural downtrend confirmation." },
  { id: "bos", family: "market-structure", name: "BOS", longName: "Break of Structure", bullishBias: "neutral", summary: "Price breaks prior swing in trend direction." },
  { id: "choch", family: "market-structure", name: "CHOCH", longName: "Change of Character", bullishBias: "neutral", summary: "Market behavior shifts before a trend change." },
  { id: "mss", family: "market-structure", name: "MSS", longName: "Market Structure Shift", bullishBias: "neutral", summary: "Structural break with likely trend rotation." },
  { id: "support-resistance", family: "market-structure", name: "Support / Resistance", longName: "Support and Resistance", bullishBias: "neutral", summary: "Areas where price repeatedly reacts." },
  { id: "trendline-break", family: "market-structure", name: "Trendline Break", longName: "Trendline Break", bullishBias: "neutral", summary: "Break of a directional trendline." },
  { id: "trendline-retest", family: "market-structure", name: "Trendline Retest", longName: "Trendline Retest", bullishBias: "neutral", summary: "Price returns to a broken trendline." },
  { id: "breakout-and-retest", family: "market-structure", name: "Breakout + Retest", longName: "Breakout and Retest", bullishBias: "neutral", summary: "Break and pullback into the prior level." },
  { id: "false-breakout", family: "market-structure", name: "False Breakout", longName: "False Breakout", bullishBias: "neutral", summary: "Break fails and price quickly re-enters the range." },
  { id: "pullback", family: "market-structure", name: "Pullback", longName: "Pullback or Retracement", bullishBias: "neutral", summary: "Temporary move against the main trend." },
  { id: "range-expansion", family: "market-structure", name: "Range Expansion", longName: "Range Expansion", bullishBias: "neutral", summary: "Volatility expands beyond range limits." },
  { id: "compression", family: "market-structure", name: "Compression", longName: "Compression", bullishBias: "neutral", summary: "Volatility shrinks before a major move." },
  { id: "rejection-wick", family: "market-structure", name: "Rejection Wick", longName: "Rejection Wick", bullishBias: "neutral", summary: "Strong wick rejects a key level." },
  { id: "impulsive-move", family: "market-structure", name: "Impulsive Move", longName: "Impulsive Move and Correction", bullishBias: "neutral", summary: "Sharp directional move followed by a pullback." },
  { id: "liquidity-sweep", family: "smc", name: "Liquidity Sweep", longName: "Liquidity Sweep", bullishBias: "neutral", summary: "Price sweeps highs or lows before reversing." },
  { id: "fair-value-gap", family: "smc", name: "FVG", longName: "Fair Value Gap", bullishBias: "neutral", summary: "Three-candle imbalance used for retracement expectations." },
  { id: "order-block", family: "smc", name: "Order Block", longName: "Order Block", bullishBias: "neutral", summary: "Zone associated with strong directional continuation." },
  { id: "breaker-block", family: "smc", name: "Breaker Block", longName: "Breaker Block", bullishBias: "neutral", summary: "Block formed after a structural break." },
  { id: "mitigation-block", family: "smc", name: "Mitigation Block", longName: "Mitigation Block", bullishBias: "neutral", summary: "A prior area that may be revisited." },
  { id: "premium-discount-equilibrium", family: "smc", name: "Premium / Discount", longName: "Premium, Discount and Equilibrium", bullishBias: "neutral", summary: "Price range segmentation for value analysis." },
  { id: "buy-side-liquidity", family: "smc", name: "BSL", longName: "Buy-side Liquidity", bullishBias: "bullish", summary: "Liquidity captured above prior highs or ranges." },
  { id: "sell-side-liquidity", family: "smc", name: "SSL", longName: "Sell-side Liquidity", bullishBias: "bearish", summary: "Liquidity captured below prior lows or ranges." },
  { id: "equal-highs-lows", family: "smc", name: "EQH / EQL", longName: "Equal highs and equal lows", bullishBias: "neutral", summary: "Zone with repeated equal-price reactions." },
  { id: "inducement", family: "smc", name: "Inducement", longName: "Inducement", bullishBias: "neutral", summary: "False move used to trap traders before the actual direction." },
  { id: "displacement", family: "smc", name: "Displacement", longName: "Displacement", bullishBias: "neutral", summary: "Strong directional thrust causing a trend shift." },
  { id: "liquidity-grab", family: "smc", name: "Liquidity Grab", longName: "Liquidity Grab", bullishBias: "neutral", summary: "Sweep of prior highs/lows before a reversal." },
  { id: "consequent-encroachment", family: "smc", name: "Consequent Encroachment", longName: "Consequent Encroachment", bullishBias: "neutral", summary: "Gap midpoint or fair-value gap reversion zone." },
  { id: "optimal-trade-entry", family: "smc", name: "OTE", longName: "Optimal Trade Entry", bullishBias: "neutral", summary: "Fibonacci retracement zone used for execution." },
  { id: "rejection-block", family: "smc", name: "Rejection Block", longName: "Rejection Block", bullishBias: "neutral", summary: "Zone where price rejected a prior move." },
  { id: "balanced-price-range", family: "smc", name: "BPR", longName: "Balanced Price Range", bullishBias: "neutral", summary: "Consolidation zone used for range expansion." },
  { id: "session-liquidity", family: "smc", name: "Session Liquidity", longName: "Session Highs and Lows", bullishBias: "neutral", summary: "Liquidity from session extremes and prior-day ranges." },
  { id: "asian-range-breakout", family: "combination", name: "Asian Range Breakout", longName: "Asian Range Breakout", bullishBias: "neutral", summary: "Breakout after the Asia session range." },
  { id: "london-breakout", family: "combination", name: "London Breakout", longName: "London Session Breakout", bullishBias: "neutral", summary: "High-volatility session breakout beyond prior extremes." },
  { id: "new-york-breakout", family: "combination", name: "New York Breakout", longName: "New York Session Breakout", bullishBias: "neutral", summary: "Momentum from the New York session after London flow." },
  { id: "momentum-scalping", family: "combination", name: "Momentum Scalping", longName: "Momentum Scalping", bullishBias: "neutral", summary: "Fast trend-following entries after short consolidation." },
  { id: "divergence-trading", family: "indicator", name: "Divergence", longName: "Divergence Trading", bullishBias: "neutral", summary: "Price and indicator disagree about momentum direction." },
  { id: "supply-demand", family: "combination", name: "Supply / Demand", longName: "Supply and Demand Zone Trading", bullishBias: "neutral", summary: "Re-entries into previously validated zones." },
  { id: "fvg-trend-confirmation", family: "combination", name: "FVG + Trend", longName: "FVG retracement with trend confirmation", bullishBias: "neutral", summary: "Fair value gap retest aligned with trend." },
  { id: "order-block-retest", family: "combination", name: "Order Block Retest", longName: "Order Block retest with BOS confirmation", bullishBias: "neutral", summary: "Retest of a valid block with structure confirmation." },
  { id: "multi-timeframe-alignment", family: "combination", name: "Multi-Timeframe Alignment", longName: "Multi-Timeframe Trend Alignment", bullishBias: "neutral", summary: "Higher-timeframe directional context supports lower-timeframe entries." },
  { id: "news-breakout", family: "combination", name: "News Breakout", longName: "News Event Breakout", bullishBias: "neutral", summary: "High-volatility breakout after economic release." },
  { id: "mean-reversion", family: "combination", name: "Mean Reversion", longName: "Mean Reversion", bullishBias: "neutral", summary: "Price rotates back to the average after expansion." },
  { id: "elliott-wave", family: "combination", name: "Elliott Wave", longName: "Elliott Wave", bullishBias: "neutral", summary: "Wave-based directional framework for price structure." },
  { id: "wyckoff", family: "combination", name: "Wyckoff", longName: "Wyckoff Accumulation / Distribution", bullishBias: "neutral", summary: "Accumulation or distribution phases before expansion." },
  { id: "opening-range-breakout", family: "combination", name: "Opening Range Breakout", longName: "Opening Range Breakout", bullishBias: "neutral", summary: "Break after the market opening range is established." },
  { id: "volatility-expansion", family: "combination", name: "Volatility Expansion", longName: "Volatility Expansion", bullishBias: "neutral", summary: "Expansion after consolidation or compression." },
];

export function getPatternById(id: string): PatternDefinition | undefined {
  return PATTERN_LIBRARY.find((p) => p.id === id);
}

export function patternSummary(prices: number[]): string[] {
  if (prices.length < 60) return ["Collecting data for pattern analysis"];
  const last = prices.at(-1) ?? 0;
  const prev = prices.at(-2) ?? last;
  const shortEma = ema(prices, 9);
  const midEma = ema(prices, 21);
  const longEma = ema(prices, 50);
  const swing = prices.slice(-60);
  const swingHigh = Math.max(...swing);
  const swingLow = Math.min(...swing);
  const trendBias = shortEma > midEma && midEma > longEma ? "bullish" : shortEma < midEma && midEma < longEma ? "bearish" : "neutral";
  const trends: string[] = [];
  if (trendBias === "bullish") trends.push("Bullish trend structure");
  if (trendBias === "bearish") trends.push("Bearish trend structure");
  if (last > swingHigh * 0.997 && last > prev) trends.push("Liquidity test above recent highs");
  if (last < swingLow * 1.003 && last < prev) trends.push("Liquidity test below recent lows");
  if (last > prev) trends.push("Short-term upward pressure");
  if (last < prev) trends.push("Short-term downward pressure");
  return trends.slice(0, 6);
}

export function eliteHybridSignal(prices: number[], config: Partial<MultiStrategyConfig> = {}): CompositeSignal {
  const cfg = { ...DEFAULT_MULTI_STRATEGY, ...config };
  if (prices.length < 60) return { side: null, confidence: 0, note: "Collecting 60 ticks for elite hybrid analysis", reasons: [], score: 0 };

  const last = prices.at(-1) ?? 0;
  const prev = prices.at(-2) ?? last;
  const shortEma = ema(prices, 9);
  const midEma = ema(prices, 21);
  const longEma = ema(prices, 50);
  const trendBias = shortEma > midEma && midEma > longEma ? 0 : shortEma < midEma && midEma < longEma ? 1 : null;

  let bullishScore = 0;
  let bearishScore = 0;
  const reasons: string[] = [];

  if (trendBias === 0) {
    bullishScore += cfg.trendWeight;
    reasons.push("Bullish EMA stack");
  } else if (trendBias === 1) {
    bearishScore += cfg.trendWeight;
    reasons.push("Bearish EMA stack");
  }

  const lastSwing = prices.slice(-60);
  const swingHigh = Math.max(...lastSwing);
  const swingLow = Math.min(...lastSwing);
  const bullishLiquidity = last > swingHigh * 0.997 && last > prev;
  const bearishLiquidity = last < swingLow * 1.003 && last < prev;
  if (bullishLiquidity) {
    bullishScore += cfg.liquidityWeight;
    reasons.push("Buyer liquidity preserved above prior highs");
  }
  if (bearishLiquidity) {
    bearishScore += cfg.liquidityWeight;
    reasons.push("Seller liquidity preserved below prior lows");
  }

  const range = prices.slice(-40);
  const upper = Math.max(...range.slice(0, -10));
  const lower = Math.min(...range.slice(0, -10));
  const breakoutBull = last > upper && prev <= upper;
  const breakoutBear = last < lower && prev >= lower;
  if (breakoutBull) {
    bullishScore += cfg.breakoutWeight;
    reasons.push("Bullish breakout and range expansion");
  }
  if (breakoutBear) {
    bearishScore += cfg.breakoutWeight;
    reasons.push("Bearish breakdown and range expansion");
  }

  const swingRange = swingHigh - swingLow;
  if (swingRange > 0) {
    const retraceBull = (swingHigh - last) / swingRange;
    const retraceBear = (last - swingLow) / swingRange;
    if (retraceBull >= 0.382 && retraceBull <= 0.618 && last > prev) {
      bullishScore += cfg.fibWeight;
      reasons.push("Bullish Fibonacci pullback within 38.2–61.8%");
    }
    if (retraceBear >= 0.382 && retraceBear <= 0.618 && last < prev) {
      bearishScore += cfg.fibWeight;
      reasons.push("Bearish Fibonacci pullback within 38.2–61.8%");
    }
  }

  const fifth = prices.at(-5) ?? last;
  const structureBull = last > fifth && last > Math.max(...prices.slice(-20, -5)) && last > prev;
  const structureBear = last < fifth && last < Math.min(...prices.slice(-20, -5)) && last < prev;
  if (structureBull) {
    bullishScore += cfg.structureWeight;
    reasons.push("Bullish structure with higher highs and higher lows");
  }
  if (structureBear) {
    bearishScore += cfg.structureWeight;
    reasons.push("Bearish structure with lower highs and lower lows");
  }

  const bullishConfluence = bullishScore - bearishScore;
  const bearishConfluence = bearishScore - bullishScore;
  const side: 0 | 1 | null = bullishScore >= cfg.minBullishScore && bullishConfluence >= cfg.requiredConfluence ? 0 : bearishScore >= cfg.minBearishScore && bearishConfluence >= cfg.requiredConfluence ? 1 : null;

  const confidence = side === 0 ? Math.min(99, 50 + bullishConfluence * 2.2) : side === 1 ? Math.min(99, 50 + bearishConfluence * 2.2) : 0;
  const note = side === 0 ? "Elite hybrid bullish confluence: trend + structure + breakout + pullback alignment" : side === 1 ? "Elite hybrid bearish confluence: trend + structure + breakdown + pullback alignment" : "Waiting for multi-factor confluence";

  return { side, confidence: Math.round(confidence), note, reasons: reasons.slice(0, 6), score: side === 0 ? bullishScore : side === 1 ? bearishScore : 0 };
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
  if (id === "hybrid" || id === "elite-hybrid") {
    const s = id === "elite-hybrid" ? eliteHybridSignal(prices) : computeSignal(prices);
    const side = typeof s === "object" && "side" in s ? s.side : s.dir === "CALL" ? 0 : s.dir === "PUT" ? 1 : null;
    return { side, confidence: s.confidence, note: s.note };
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
