// Only Ups / Only Downs (RUNHIGH / RUNLOW) direction engine.
// Combines tick velocity, acceleration, Kalman-smoothed slope, current run length,
// volatility squeeze and the market's own historical run-continuation rate.
// The output is an estimate from past ticks, never a guarantee.

export type RunsSignal = {
  side: 0 | 1 | null; // 0 = Only Ups (RUNHIGH), 1 = Only Downs (RUNLOW)
  confidence: number;
  note: string;
  parts: { name: string; value: string; bias: 0 | 1 | null }[];
  probUp: number; // historical chance that `ticks` more strict ups follow
  probDown: number;
};

/** Simple 1D Kalman filter; returns smoothed series. */
export function kalman(values: number[], q = 1e-3, r = 1e-2) {
  if (!values.length) return [];
  let x = values[0]!, p = 1;
  const out = [x];
  for (let i = 1; i < values.length; i++) {
    p += q;
    const k = p / (p + r);
    x += k * (values[i]! - x);
    p *= 1 - k;
    out.push(x);
  }
  return out;
}

/** Length of the current strict run at the end: +n for n ups, -n for n downs, 0 if last move flat. */
export function currentRun(prices: number[]) {
  let n = 0;
  for (let i = prices.length - 1; i > 0; i--) {
    const d = prices[i]! - prices[i - 1]!;
    if (d > 0 && n >= 0) n++;
    else if (d < 0 && n <= 0) n--;
    else break;
  }
  return n;
}

/**
 * Empirical probability that, after `k` consecutive strict moves in a direction,
 * the next `ticks` moves are also strict in that direction.
 */
export function runContinuation(prices: number[], k: number, ticks: number, up: boolean) {
  const d = prices.slice(1).map((p, i) => Math.sign(p - prices[i]!));
  const want = up ? 1 : -1;
  let seen = 0, hit = 0;
  for (let i = k; i + ticks <= d.length; i++) {
    let ok = true;
    for (let j = i - k; j < i; j++) if (d[j] !== want) { ok = false; break; }
    if (!ok) continue;
    seen++;
    let cont = true;
    for (let j = i; j < i + ticks; j++) if (d[j] !== want) { cont = false; break; }
    if (cont) hit++;
  }
  // Laplace smoothing toward the naive (0.5^ticks) baseline
  const prior = Math.pow(0.5, ticks);
  return (hit + prior * 4) / (seen + 4);
}

/** Sensitivity 1 (conservative) .. 5 (very sensitive). */
export function runsSignal(prices: number[], ticks: number, sensitivity = 3): RunsSignal {
  const empty: RunsSignal = { side: null, confidence: 0, note: "Collecting ticks…", parts: [], probUp: 0, probDown: 0 };
  if (prices.length < 80) return empty;
  const s = Math.max(1, Math.min(5, Math.round(sensitivity)));
  const recent = prices.slice(-400);
  const diffs = recent.slice(1).map((p, i) => p - recent[i]!);
  const absMean = diffs.reduce((a, b) => a + Math.abs(b), 0) / diffs.length || 1e-9;

  const v = (recent.at(-1)! - recent.at(-4)!) / 3 / absMean; // normalised velocity
  const vPrev = (recent.at(-4)! - recent.at(-7)!) / 3 / absMean;
  const a = v - vPrev;
  const sm = kalman(recent.slice(-40));
  const slope = (sm.at(-1)! - sm.at(-6)!) / 5 / absMean;
  const run = currentRun(recent);

  const w20 = recent.slice(-20), w100 = recent.slice(-100);
  const range20 = Math.max(...w20) - Math.min(...w20);
  const range100 = Math.max(...w100) - Math.min(...w100) || 1e-9;
  const squeeze = range20 / range100 < 0.12;

  const k = Math.max(1, Math.min(3, Math.abs(run)));
  const probUp = runContinuation(recent, k, ticks, true);
  const probDown = runContinuation(recent, k, ticks, false);

  const parts: RunsSignal["parts"] = [
    { name: "Velocity", value: v.toFixed(2), bias: v > 0.2 ? 0 : v < -0.2 ? 1 : null },
    { name: "Acceleration", value: a.toFixed(2), bias: a > 0 ? 0 : a < 0 ? 1 : null },
    { name: "Kalman slope", value: slope.toFixed(2), bias: slope > 0.1 ? 0 : slope < -0.1 ? 1 : null },
    { name: "Current run", value: run > 0 ? `${run} up` : run < 0 ? `${-run} down` : "flat", bias: run >= 2 ? 0 : run <= -2 ? 1 : null },
    { name: "Squeeze", value: squeeze ? "tight — wait" : "normal", bias: null },
    { name: `Hist. ${ticks}-tick run`, value: `▲${(probUp * 100).toFixed(1)}% ▼${(probDown * 100).toFixed(1)}%`, bias: probUp > probDown ? 0 : probDown > probUp ? 1 : null },
  ];

  if (squeeze) return { side: null, confidence: 0, note: "Volatility squeeze — runs break easily, waiting", parts, probUp, probDown };

  const minRun = s >= 4 ? 1 : 2; // sensitive modes act on a single tick
  const up = parts.filter((p) => p.bias === 0).length;
  const dn = parts.filter((p) => p.bias === 1).length;
  const need = 6 - s >= 4 ? 4 : 6 - s < 2 ? 2 : 6 - s; // s1-2:4, s3:3, s4:2, s5:2
  let side: 0 | 1 | null = null;
  if (up >= need && up > dn && run >= minRun && a >= 0) side = 0;
  else if (dn >= need && dn > up && run <= -minRun && a <= 0) side = 1;

  const agree = Math.max(up, dn) / parts.length;
  const prob = side === 0 ? probUp : side === 1 ? probDown : Math.max(probUp, probDown);
  const baseline = Math.pow(0.5, ticks);
  const edge = Math.min(1, prob / (baseline * 2)); // 1 = twice the coin-flip chance
  const confidence = side === null ? Math.round(agree * 40) : Math.round(Math.min(99, 35 + agree * 35 + edge * 30));
  const note = side === null
    ? `No clean run (${up}▲/${dn}▼ agree, need ${need})`
    : `${side === 0 ? "Only Ups" : "Only Downs"}: ${Math.max(up, dn)}/${parts.length} agree, hist. ${(prob * 100).toFixed(1)}% vs ${(baseline * 100).toFixed(1)}% coin-flip`;
  return { side, confidence, note, parts, probUp, probDown };
}
