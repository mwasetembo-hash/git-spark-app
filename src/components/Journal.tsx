type Trade = { id: number; profit: number | null };

export function Journal({ trades }: { trades: Trade[] }) {
  const done = [...trades].reverse().filter((t) => t.profit !== null).map((t) => t.profit as number);
  let eq = 0, peak = 0, dd = 0, cur = 0, bestW = 0, bestL = 0;
  const curve = done.map((p) => {
    eq += p; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq);
    cur = p > 0 ? (cur > 0 ? cur + 1 : 1) : cur < 0 ? cur - 1 : -1;
    bestW = Math.max(bestW, cur); bestL = Math.min(bestL, cur);
    return eq;
  });
  const gw = done.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const gl = -done.filter((p) => p < 0).reduce((a, b) => a + b, 0);
  const min = Math.min(0, ...curve), max = Math.max(0, ...curve);
  const pts = curve.map((v, i) => `${(i / Math.max(1, curve.length - 1)) * 400},${100 - ((v - min) / (max - min || 1)) * 100}`).join(" ");
  const stats: [string, string][] = [
    ["Win rate", done.length ? `${Math.round((done.filter((p) => p > 0).length / done.length) * 100)}%` : "—"],
    ["Profit factor", gl ? (gw / gl).toFixed(2) : gw ? "∞" : "—"],
    ["Max drawdown", dd.toFixed(2)],
    ["Best / worst streak", `${bestW}W / ${-bestL}L`],
  ];
  return (
    <section className="glass rounded-2xl p-4">
      <h2 className="mb-2 font-semibold">Performance journal</h2>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {stats.map(([k, v]) => <div key={k} className="rounded-lg border border-border p-2"><div className="text-muted-foreground">{k}</div><div className="font-mono font-semibold">{v}</div></div>)}
      </div>
      <svg viewBox="0 0 400 100" preserveAspectRatio="none" className="mt-3 h-24 w-full">
        {curve.length > 1 ? <polyline points={pts} fill="none" stroke={eq >= 0 ? "var(--up)" : "var(--down)"} strokeWidth="1.5" /> : <text x="200" y="55" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.5">Equity curve appears after trades settle</text>}
      </svg>
    </section>
  );
}
