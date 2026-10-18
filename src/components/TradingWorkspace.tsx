import { useMemo, useState } from "react";
import { Activity, ArrowDown, ArrowUp, BarChart3, Check, FlaskConical, Layers, Play, ShieldCheck, Square, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTRACTS, digitStats, lastDigit, type Kind, type KindSignal } from "@/lib/contracts";
import { BACKTEST_KINDS, STRATEGIES, backtest, patternSignal, type StrategyId } from "@/lib/trading-workspace";

type Props = {
  prices: number[]; decimals: number; symbol: string; kind: Kind; digit: number; setDigit: (n: number) => void;
  strategy: StrategyId; setStrategy: (s: StrategyId) => void; signal: KindSignal;
  stake: number; ticks: number; minConf: number; sensitivity: number;
  connected: boolean; demo: boolean; busy: boolean; blocked: string | null;
  bulkRunning: boolean; bulkCompleted: number; bulkCount: number; setBulkCount: (n: number) => void;
  bulkDirection: "signal" | "alternate" | "up" | "down"; setBulkDirection: (d: "signal" | "alternate" | "up" | "down") => void;
  startBulk: () => void; stopBulk: () => void;
};
const views = [
  { id: "analysis", label: "Digits Analysis", icon: BarChart3 },
  { id: "strategies", label: "Strategy Lab", icon: Workflow },
  { id: "bulk", label: "Bulk Trading", icon: Layers },
  { id: "backtest", label: "Backtesting", icon: FlaskConical },
] as const;

export function TradingWorkspace(p: Props) {
  const [tab, setTab] = useState<(typeof views)[number]["id"]>("analysis");
  const [window, setWindow] = useState(200);
  const [payout, setPayout] = useState(80);
  const [tested, setTested] = useState(false);
  const [paperKind, setPaperKind] = useState<Kind>("RUNS");
  const [paperTicks, setPaperTicks] = useState(2);
  const stats = digitStats(p.prices, p.decimals, window);
  const pct = (n: number) => stats.total ? (n / stats.total * 100) : 0;
  const most = stats.counts.indexOf(Math.max(...stats.counts)), least = stats.counts.indexOf(Math.min(...stats.counts));
  const even = stats.counts.filter((_, d) => d % 2 === 0).reduce((a, b) => a + b, 0);
  const over = stats.counts.filter((_, d) => d > p.digit).reduce((a, b) => a + b, 0);
  const under = stats.counts.filter((_, d) => d < p.digit).reduce((a, b) => a + b, 0);
  const results = useMemo(() => tested ? backtest(p.prices, { kind: paperKind, ticks: paperTicks, digit: p.digit, decimals: p.decimals, stake: p.stake, payout, minConf: p.minConf, sensitivity: p.sensitivity }) : [], [tested, p.prices, paperKind, paperTicks, p.digit, p.decimals, p.stake, payout, p.minConf, p.sensitivity]);
  const field = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground";
  const wins = results.filter((r) => r.won).length;
  const peak = Math.max(0, ...results.map((r) => r.equity)), low = Math.min(0, ...results.map((r) => r.equity));
  const curve = [0, ...results.map((r) => r.equity)].map((e, i) => `${i / Math.max(1, results.length) * 600},${120 - (e - low) / (peak - low || 1) * 100}`).join(" ");
  return (
    <section className="workspace-band min-w-0 lg:col-span-3" aria-label="Trading analysis workspace">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div><div className="mb-1 flex items-center gap-2 text-xs text-primary"><Activity className="size-3.5" /> MARKET INTELLIGENCE</div><h2 className="text-xl font-semibold">Analysis & execution hub</h2></div>
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground"><span className={`size-2 rounded-full ${p.connected ? "bg-up" : "bg-muted-foreground"}`} />{p.symbol} · {p.prices.length} TICKS · {p.connected ? "LIVE" : "OFFLINE"}</div>
      </div>
      <div role="tablist" aria-label="Analysis tools" className="flex gap-1 overflow-x-auto border-b border-border py-2">
        {views.map(({ id, label, icon: Icon }) => <Button key={id} role="tab" aria-selected={tab === id} aria-controls={`workspace-${id}`} id={`tab-${id}`} variant={tab === id ? "secondary" : "ghost"} className={tab === id ? "text-primary" : "text-muted-foreground"} onClick={() => setTab(id)}><Icon />{label}</Button>)}
      </div>
      <div role="tabpanel" id={`workspace-${tab}`} aria-labelledby={`tab-${tab}`} className="py-5">
        {tab === "analysis" && <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Last-digit distribution</h3><label className="flex items-center gap-2 text-xs text-muted-foreground">Sample<select aria-label="Digit sample size" className={field} value={window} onChange={(e) => setWindow(Number(e.target.value))}>{[50, 100, 200, 500].map((n) => <option key={n} value={n}>{n} ticks</option>)}</select></label></div>
          <div className="digit-distribution grid grid-cols-10 gap-1 sm:gap-3">
            {stats.counts.map((count, d) => <Button key={d} variant="ghost" aria-label={`Select digit ${d}`} aria-pressed={p.digit === d} onClick={() => p.setDigit(d)} className={`h-auto min-w-0 flex-col gap-2 px-0 py-2 ${p.digit === d ? "bg-primary/10 ring-1 ring-primary" : ""}`}>
              <span className="text-[10px] font-mono sm:text-xs">{pct(count).toFixed(1)}%</span>
              <svg viewBox="0 0 24 90" className="h-24 w-full sm:h-32" aria-hidden="true"><rect x="4" y="0" width="16" height="90" rx="2" fill="var(--muted)" /><rect x="4" y={90 - Math.min(90, pct(count) * 4.5)} width="16" height={Math.min(90, pct(count) * 4.5)} rx="2" fill={d === most ? "var(--up)" : d === least ? "var(--down)" : "var(--primary)"} /></svg>
              <span className="font-mono text-lg font-semibold">{d}</span>
            </Button>)}
          </div>
          <div className="my-5 grid gap-4 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-4">{[["Even / Odd", `${pct(even).toFixed(1)}% / ${pct(stats.total - even).toFixed(1)}%`], [`Over / Under ${p.digit}`, `${pct(over).toFixed(1)}% / ${pct(under).toFixed(1)}%`], ["Most / least frequent", stats.total ? `${most} / ${least}` : "—"], ["Matches / Differs", `${pct(stats.counts[p.digit] ?? 0).toFixed(1)}% / ${(stats.total ? 100 - pct(stats.counts[p.digit] ?? 0) : 0).toFixed(1)}%`]].map(([label, value]) => <div key={label}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-mono text-lg">{value}</div></div>)}</div>
          <div className="flex flex-wrap items-center gap-1.5"><span className="mr-2 text-xs text-muted-foreground">Recent digits</span>{p.prices.slice(-30).map((v, i) => { const d = lastDigit(v, p.decimals); return <span key={i} className={`flex size-7 items-center justify-center rounded border border-border font-mono text-xs ${d % 2 === 0 ? "text-up" : "text-down"}`}>{d}</span>; })}{!stats.total && <span className="text-xs text-muted-foreground">Awaiting live market data</span>}</div>
          <p className="mt-4 text-xs text-muted-foreground">Historical frequencies are not forecasts. Deriv’s quote determines payout and availability.</p>
        </>}
        {tab === "strategies" && <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Signal forge</h3><span className="text-xs text-muted-foreground">Transparent local rules · no recovery staking</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{STRATEGIES.map((s) => { const result = patternSignal(s.id, p.prices); return <article key={s.id} className={`min-w-0 rounded-lg border p-4 ${p.strategy === s.id ? "border-primary bg-primary/5" : "border-border bg-card/40"}`}>
            <div className="mb-3 flex items-center justify-between"><Workflow className="size-5 text-primary" />{p.strategy === s.id && <Check className="size-4 text-up" />}</div><h4 className="min-h-12 font-semibold">{s.name}</h4>
            <ul className="my-3 min-h-24 space-y-2 text-xs text-muted-foreground">{s.checks.map((c) => <li key={c}>{c}</li>)}</ul>
            <div className={`mb-2 font-mono text-sm ${result.side === 0 ? "text-up" : result.side === 1 ? "text-down" : "text-muted-foreground"}`}>{result.side === null ? "WAIT" : result.side === 0 ? "UP" : "DOWN"} · {result.confidence}%</div>
            <p className="mb-4 min-h-16 text-xs text-muted-foreground">{result.note}</p>
            <Button variant={p.strategy === s.id ? "secondary" : "outline"} className="w-full" onClick={() => p.setStrategy(s.id)} disabled={p.bulkRunning || p.busy}>{p.strategy === s.id ? <Check /> : <Play />}{p.strategy === s.id ? "Selected" : "Select strategy"}</Button>
          </article>; })}</div>
          <p className="mt-4 text-xs text-muted-foreground">Pattern strategies filter the contract signal; Only Ups / Only Downs still requires strict run confirmation.</p>
        </>}
        {tab === "bulk" && <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
          <div><div className="mb-4 flex items-center gap-2"><ShieldCheck className="size-5 text-up" /><h3 className="font-semibold">Demo bulk execution</h3><span className="text-xs text-up">FIXED STAKE</span></div>
            <div className="grid grid-cols-2 gap-4"><label className="space-y-1 text-xs text-muted-foreground">Contracts<input type="number" aria-label="Bulk contract count" min={1} max={50} value={p.bulkCount} disabled={p.bulkRunning} onChange={(e) => p.setBulkCount(Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 1))))} className={field} /></label>
              <label className="space-y-1 text-xs text-muted-foreground">Direction<select aria-label="Bulk direction" className={field} value={p.bulkDirection} disabled={p.bulkRunning} onChange={(e) => p.setBulkDirection(e.target.value as Props["bulkDirection"])}><option value="signal">Auto signal</option><option value="alternate">Alternate sides</option><option value="up">Side A</option><option value="down">Side B</option></select></label>
            </div>
            <div className="my-4 flex flex-wrap gap-2">{[1, 2, 9].map((n) => <Button key={n} variant="outline" size="sm" disabled={p.bulkRunning} onClick={() => p.setBulkCount(n)}><Layers />{n}×</Button>)}</div>
            <Button className="w-full" variant={p.bulkRunning ? "destructive" : "default"} disabled={!p.bulkRunning && (!!p.blocked || p.busy)} onClick={p.bulkRunning ? p.stopBulk : p.startBulk}>{p.bulkRunning ? <Square /> : <Play />}{p.bulkRunning ? "Stop bulk session" : "Start demo bulk session"}</Button>
            {p.blocked && <p role="status" className="mt-3 text-xs text-down">{p.blocked}</p>}
          </div>
          <div className="space-y-3 font-mono text-sm">{[["Market", p.symbol], ["Contract", CONTRACTS[p.kind].label], ["Fixed stake", p.stake.toFixed(2)], ["Maximum batch exposure", (p.stake * p.bulkCount).toFixed(2)], ["Completed", `${p.bulkCompleted} / ${p.bulkCount}`], ["Execution", p.bulkRunning ? "RUNNING" : "IDLE"]].map(([k, v]) => <div key={k} className="flex justify-between gap-4 border-b border-border py-2"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>)}
            <p className="text-xs text-muted-foreground">Orders run one at a time, after settlement and cooldown. Stop cancels future orders, not purchased contracts.</p>
          </div>
        </div>}
        {tab === "backtest" && <>
          <div className="mb-4 flex items-center gap-2"><FlaskConical className="size-5 text-primary" /><h3 className="font-semibold">Historical tick replay</h3><span className="text-xs text-muted-foreground">PAPER ONLY</span></div>
          <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="space-y-1 text-xs text-muted-foreground">Contract<select aria-label="Backtest contract" className={field} value={paperKind} onChange={(e) => { setPaperKind(e.target.value as Kind); setTested(false); }}>{BACKTEST_KINDS.map((k) => <option key={k} value={k}>{CONTRACTS[k].label}</option>)}</select></label><label className="space-y-1 text-xs text-muted-foreground">Duration (ticks)<input aria-label="Backtest ticks" type="number" min={paperKind === "RUNS" ? 2 : 1} max={paperKind === "RUNS" ? 5 : 10} value={paperTicks} onChange={(e) => { setPaperTicks(Math.max(paperKind === "RUNS" ? 2 : 1, Math.min(paperKind === "RUNS" ? 5 : 10, Number(e.target.value) || 2))); setTested(false); }} className={field} /></label><label className="space-y-1 text-xs text-muted-foreground">Assumed net payout (%)<input aria-label="Assumed payout" type="number" min={1} value={payout} onChange={(e) => { setPayout(Math.max(1, Number(e.target.value) || 80)); setTested(false); }} className={field} /></label><Button disabled={p.prices.length < 65} onClick={() => setTested(true)}><Play />Run paper replay</Button></div>
          <div className="my-5 grid grid-cols-3 gap-4 border-y border-border py-4">{[["Paper trades", results.length], ["Win rate", results.length ? `${(wins / results.length * 100).toFixed(1)}%` : "—"], ["Paper P/L", (results.at(-1)?.equity ?? 0).toFixed(2)]].map(([k, v]) => <div key={k}><div className="text-xs text-muted-foreground">{k}</div><div className="mt-1 font-mono text-xl">{v}</div></div>)}</div>
          {results.length > 0 ? <><svg viewBox="0 0 600 130" preserveAspectRatio="none" role="img" aria-label="Paper equity curve" className="h-36 w-full"><polyline points={curve} stroke="var(--up)" strokeWidth="2" fill="none" /></svg><div className="max-h-48 overflow-auto"><table className="w-full text-left font-mono text-xs"><thead className="text-muted-foreground"><tr><th className="py-2">Entry tick</th><th>Side</th><th>Outcome</th><th>P/L</th></tr></thead><tbody>{results.map((r) => <tr key={r.tick} className="border-t border-border"><td className="py-2">{r.tick}</td><td>{r.side === 0 ? <ArrowUp className="size-3 text-up" /> : <ArrowDown className="size-3 text-down" />}</td><td>{r.won ? "WIN" : "LOSS"}</td><td className={r.profit > 0 ? "text-up" : "text-down"}>{r.profit.toFixed(2)}</td></tr>)}</tbody></table></div></> : <p className="py-6 text-sm text-muted-foreground">{p.prices.length < 65 ? "Connect to load historical ticks." : tested ? "No qualifying entries in this sample." : "No replay run yet."}</p>}
          <p className="mt-4 text-xs text-muted-foreground">Uses available historical ticks, fixed stake and your minimum confidence. Assumed payout excludes real quotes, fees and latency; past results do not predict returns.</p>
        </>}
      </div>
    </section>
  );
}