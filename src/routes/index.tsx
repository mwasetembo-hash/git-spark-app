import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { DerivClient, computeSignal, fetchAccounts, fetchOtpUrl, type DerivAccount } from "@/lib/deriv";
import { CATALOG, CONTRACTS, digitStats, groupOf, kindSignal, trendStrength, type Inst, type Kind } from "@/lib/contracts";
import { DiagnosePanel } from "@/components/DiagnosePanel";
import { BrainPanel } from "@/components/BrainPanel";
import { CosmicBackground } from "@/components/CosmicBackground";
import type { BrainVerdict } from "@/lib/brain-providers";
import { runsSignal } from "@/lib/runs";
import { Journal } from "@/components/Journal";
import { Profiles } from "@/components/Profiles";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mwase Deriv Hybrid — Only Ups/Downs Trading Terminal" },
      { name: "description", content: "Demo-first Deriv terminal with an Only Ups / Only Downs engine, every contract type, AI analysis, saved profiles and strict loss limits." },
      { property: "og:title", content: "Mwase Deriv Hybrid — Only Ups/Downs Trading Terminal" },
      { property: "og:description", content: "Every Deriv market, contract-specific signals, a ranking scanner and autopilot with risk limits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type Mode = "SIDE_A" | "SIDE_B" | "SIGNAL";
type Trade = { id: number; label: string; stake: number; profit: number | null; symbol: string; time: string };
type ScanRow = { symbol: string; name: string; group: string; trend: number; conf: number; dir: string };
type Unit = "t" | "s" | "m";

const LS = "mwase-deriv-config";
const GROUPS = ["Forex", "Gold & Metals", "Commodities", "Stock Indices", "Crypto", "Derived"];

function Dashboard() {
  const client = useRef<DerivClient | null>(null);
  const [appId, setAppId] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"off" | "connecting" | "on">("off");
  const [error, setError] = useState("");
  const [account, setAccount] = useState<{ loginid: string; currency: string; isVirtual: boolean } | null>(null);
  const [accounts, setAccounts] = useState<DerivAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [instruments, setInstruments] = useState<(Inst & { open?: boolean; pip?: number | undefined })[]>(CATALOG);
  const [symbol, setSymbol] = useState("R_50");
  const [prices, setPrices] = useState<number[]>([]);
  const [kind, setKind] = useState<Kind>("RUNS");
  const [mode, setMode] = useState<Mode>("SIGNAL");
  const [stake, setStake] = useState(1);
  const [duration, setDuration] = useState(5);
  const [unit, setUnit] = useState<Unit>("t");
  const [digit, setDigit] = useState(5);
  const [offset, setOffset] = useState(0.5);
  const [hi, setHi] = useState(0.5);
  const [lo, setLo] = useState(-0.5);
  const [minConf, setMinConf] = useState(60);
  const [sensitivity, setSensitivity] = useState(3);
  const [cooldown, setCooldown] = useState(8);
  const [selectedTick, setSelectedTick] = useState(3);
  const [multiplier, setMultiplier] = useState(100);
  const [growthRate, setGrowthRate] = useState(0.01);
  const [tpAmt, setTpAmt] = useState(1);
  const [slAmt, setSlAmt] = useState(1);
  const [available, setAvailable] = useState<Set<string> | null>(null);
  const lastSettle = useRef(0);
  const lastWaitLog = useRef(0);
  const [maxLoss, setMaxLoss] = useState(20);
  const [takeProfit, setTakeProfit] = useState(10);
  const [maxTrades, setMaxTrades] = useState(50);
  const [maxStake, setMaxStake] = useState(10);
  const [lossStreakStop, setLossStreakStop] = useState(3);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [scan, setScan] = useState<ScanRow[]>([]);
  const [scanning, setScanning] = useState(false);
  const [brain, setBrain] = useState<BrainVerdict | null>(null);
  const [brainGate, setBrainGate] = useState(false);
  const curStake = useRef(1);
  const streak = useRef(0);
  const tickSub = useRef<string | null>(null);

  const addLog = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()} ${m}`, ...l].slice(0, 80));
  const def = CONTRACTS[kind];
  const inst = instruments.find((i) => i.symbol === symbol);
  const decimals = inst?.pip ? Math.max(0, Math.round(-Math.log10(inst.pip))) : 2;

  useEffect(() => {
    try {
      const c = JSON.parse(localStorage.getItem(LS) || "{}");
      if (c.appId) setAppId(c.appId);
      if (c.token) setToken(c.token);
      if (c.accountId) setAccountId(c.accountId);
    } catch {}
  }, []);

  // Digit contracts need ticks
  useEffect(() => {
    if (def.digits) { setUnit("t"); setDuration((d) => Math.min(10, Math.max(1, d))); }
    if (def.ticks) { setUnit("t"); setDuration((d) => Math.min(def.ticks![1], Math.max(def.ticks![0], d))); }
    if (def.single) setMode("SIGNAL");
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const settings = { symbol, kind, mode, stake, duration, unit, digit, offset, hi, lo, minConf, maxLoss, takeProfit, maxTrades, lossStreakStop, sensitivity, cooldown, selectedTick, multiplier, growthRate, tpAmt, slAmt, brainGate };
  const applySettings = (c: Partial<typeof settings>) => {
    const set: Record<string, (v: any) => void> = { symbol: setSymbol, kind: setKind, mode: setMode, stake: setStake, duration: setDuration, unit: setUnit, digit: setDigit, offset: setOffset, hi: setHi, lo: setLo, minConf: setMinConf, maxLoss: setMaxLoss, takeProfit: setTakeProfit, maxTrades: setMaxTrades, lossStreakStop: setLossStreakStop, sensitivity: setSensitivity, cooldown: setCooldown, selectedTick: setSelectedTick, multiplier: setMultiplier, growthRate: setGrowthRate, tpAmt: setTpAmt, slAmt: setSlAmt, brainGate: setBrainGate };
    for (const [k, v] of Object.entries(c)) if (set[k] && v !== undefined) set[k]!(v);
  };

  const net = trades.reduce((s, t) => s + (t.profit ?? 0), 0);
  const settled = trades.filter((t) => t.profit !== null);
  const wins = settled.filter((t) => (t.profit ?? 0) > 0).length;
  const ticksEq = unit === "t" ? duration : unit === "s" ? duration / 2 : duration * 30;
  const sig = kindSignal(kind, prices, decimals, { digit, offset, hi, lo, ticks: ticksEq, sensitivity });
  const runs = kind === "RUNS" ? runsSignal(prices, duration, sensitivity) : null;
  const ctAvailable = (t: string) => !available || available.has(t);
  const base = computeSignal(prices);
  const stats = def.digits ? digitStats(prices, decimals) : null;

  const connect = async () => {
    setError("");
    setStatus("connecting");
    try {
      const id = appId.trim(), tk = token.trim();
      if (!id) throw new Error("Enter your App ID from developers.deriv.com.");
      if (!tk.startsWith("pat_")) throw new Error("Enter a Personal Access Token (starts with pat_) from developers.deriv.com.");
      addLog("Fetching Deriv accounts…");
      const list = (await fetchAccounts(id, tk)).filter((a) => a.status === "active");
      if (!list.length) throw new Error("No active Options accounts found for this token.");
      setAccounts(list);
      const acc = list.find((a) => a.account_id === accountId) ?? list.find((a) => a.account_type === "demo") ?? list[0]!;
      setAccountId(acc.account_id);
      localStorage.setItem(LS, JSON.stringify({ appId: id, token: tk, accountId: acc.account_id }));
      const url = await fetchOtpUrl(id, tk, acc.account_id);
      client.current?.close();
      const c = new DerivClient();
      client.current = c;
      c.onClose = () => { setStatus("off"); setAuto(false); addLog("Disconnected — press Connect to reopen"); };
      await c.connect(url);
      const isVirtual = acc.account_type === "demo";
      setAccount({ loginid: acc.account_id, currency: acc.currency, isVirtual });
      setBalance(Number(acc.balance));
      c.on("balance", (m) => setBalance(Number(m.balance.balance)));
      await c.send({ balance: 1, subscribe: 1 }).catch(() => {});
      try {
        const s = await c.send({ active_symbols: "brief" });
        const live = (s.active_symbols as any[]).map((x) => {
          const sym = x.underlying_symbol ?? x.symbol;
          return { symbol: sym, name: x.underlying_symbol_name ?? x.display_name ?? sym, group: groupOf(sym, String(x.market ?? "")), open: !!(x.exchange_is_open ?? true), pip: Number(x.pip ?? x.pip_size) || undefined };
        });
        if (live.length) setInstruments(live);
      } catch (e: any) { addLog(`Symbols list error: ${e.message} — using built-in list`); }
      c.on("tick", (m) => { if (m.tick?.symbol === undefined || m.tick.symbol === symbolRef.current) setPrices((p) => [...p, Number(m.tick.quote)].slice(-500)); });
      setStatus("on");
      addLog(`Connected ${acc.account_id} (${isVirtual ? "DEMO" : "REAL"})`);
    } catch (e: any) {
      setStatus("off");
      setError(e.message || "Connection failed");
    }
  };

  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  useEffect(() => {
    const c = client.current;
    if (status !== "on" || !c) return;
    (async () => {
      if (tickSub.current) await c.send({ forget: tickSub.current }).catch(() => {});
      tickSub.current = null;
      setPrices([]);
      try {
        const h = await c.send({ ticks_history: symbol, count: 500, end: "latest", style: "ticks" });
        setPrices((h.history.prices as number[]).map(Number));
        const r = await c.send({ ticks: symbol, subscribe: 1 });
        tickSub.current = r.subscription?.id ?? null;
      } catch (e: any) { addLog(`Ticks error on ${symbol}: ${e.message}`); }
      try {
        const cf = await c.send({ contracts_for: symbol });
        const list = (cf.contracts_for?.available ?? []) as any[];
        setAvailable(list.length ? new Set(list.map((x) => String(x.contract_type))) : null);
      } catch { setAvailable(null); }
    })();
  }, [symbol, status]);

  const runScan = async () => {
    const c = client.current;
    if (!c) return;
    setScanning(true);
    const rows: ScanRow[] = [];
    const list = instruments.filter((i) => i.open !== false);
    for (const i of list) {
      try {
        const h = await c.send({ ticks_history: i.symbol, count: 200, end: "latest", style: "ticks" });
        const p = (h.history.prices as number[]).map(Number);
        const s = computeSignal(p);
        rows.push({ symbol: i.symbol, name: i.name, group: i.group, trend: trendStrength(p), conf: s.confidence, dir: s.dir === "CALL" ? "UP" : s.dir === "PUT" ? "DOWN" : "—" });
        setScan([...rows].sort((a, b) => b.conf + b.trend - (a.conf + a.trend)));
      } catch {}
    }
    setScanning(false);
    addLog(`Scan done: ${rows.length} instruments ranked`);
  };

  const placeTrade = useCallback(async (side: 0 | 1, amount: number) => {
    const c = client.current;
    if (!c || !account) return null;
    setBusy(true);
    const ct = def.types[side];
    if (!ctAvailable(ct)) addLog(`Note: ${ct} not listed for ${symbol} — asking Deriv for a quote anyway`);
    const req: Record<string, unknown> = {
      proposal: 1, amount: Number(amount.toFixed(2)), basis: "stake", contract_type: ct,
      currency: account.currency, underlying_symbol: symbol,
    };
    if (!def.open) { req["duration"] = duration; req["duration_unit"] = unit; }
    if (def.extra === "selected_tick") req["selected_tick"] = selectedTick;
    if (def.extra === "multiplier") { req["multiplier"] = multiplier; req["limit_order"] = { take_profit: tpAmt, stop_loss: slAmt }; }
    if (def.extra === "growth_rate") { req["growth_rate"] = growthRate; req["limit_order"] = { take_profit: tpAmt }; }
    const sgn = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
    if (def.barrier === "digit") req["barrier"] = String(digit);
    if (def.barrier === "offset") req["barrier"] = sgn(offset);
    if (def.barrier === "range") { req["barrier"] = sgn(hi); req["barrier2"] = sgn(lo); }
    const label = `${def.sides[side]}${def.barrier === "digit" ? ` ${digit}` : ""}`;
    const isRate = (e: any) => /rate limit|RateLimit/i.test(String(e?.message ?? e?.code ?? e));
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const withBackoff = async <T,>(fn: () => Promise<T>): Promise<T> => {
      for (let i = 0; ; i++) {
        try { return await fn(); } catch (e) {
          if (!isRate(e) || i >= 5) throw e;
          const wait = Math.min(1000 * 2 ** i, 16000) + Math.random() * 300;
          addLog(`Rate limited, retrying in ${(wait / 1000).toFixed(1)}s`);
          await sleep(wait);
        }
      }
    };
    try {
      // Throttle: keep at least 1.2s between order requests
      const g = globalThis as any;
      const gap = Date.now() - (g.__lastOrderAt ?? 0);
      if (gap < 1200) await sleep(1200 - gap);
      g.__lastOrderAt = Date.now();
      // 1) Get a quote to validate the contract. 2) Buy that quote. Fallback: direct buy with parameters.
      const { proposal: _p, ...params } = req;
      let b: any = null;
      let firstErr: any = null;
      try {
        const p = await withBackoff(() => c.send(req));
        const q = p?.proposal;
        if (!q?.id) throw new Error(`No valid quote for ${ct} on ${symbol}`);
        const price = Number(q.ask_price ?? amount);
        addLog(`Quote ${ct}: ask ${price} payout ${q.payout ?? "—"}`);
        b = await withBackoff(() => c.send({ buy: q.id, price: Number((price * 1.05 + 0.01).toFixed(2)) }));
      } catch (e: any) {
        firstErr = e;
        addLog(`Quote route failed (${e.message}) — trying direct order`);
        try {
          b = await withBackoff(() => c.send({ buy: 1, price: Number((amount * 1.05 + 0.01).toFixed(2)), parameters: params }));
        } catch (e2: any) {
          throw new Error(`${ct} on ${symbol} rejected by Deriv: ${e2.message || firstErr?.message}`);
        }
      }
      const id = Number(b?.buy?.contract_id);
      if (!id) throw new Error("Deriv did not confirm the order");
      setTrades((t) => [{ id, label, stake: amount, profit: null, symbol, time: new Date().toLocaleTimeString() }, ...t]);
      addLog(`BUY ${label} ${amount.toFixed(2)} on ${symbol} #${id}`);
      const result = await new Promise<number>((resolve) => {
        let done = false;
        const finish = (v: number) => { if (done) return; done = true; off(); clearInterval(poll); clearTimeout(cap); resolve(v); };
        const check = (poc: any) => { if (poc && Number(poc.contract_id) === id && (poc.is_sold || poc.status === "won" || poc.status === "lost" || poc.is_expired)) finish(Number(poc.profit ?? 0)); };
        const off = c.on("proposal_open_contract", (m) => check(m.proposal_open_contract));
        c.send({ proposal_open_contract: 1, contract_id: id, subscribe: 1 }).then((m) => check(m?.proposal_open_contract)).catch(() => {});
        // Poll every 3s in case the live stream drops; never leave the bot stuck.
        const poll = setInterval(() => { c.send({ proposal_open_contract: 1, contract_id: id }).then((m) => check(m?.proposal_open_contract)).catch(() => {}); }, 3000);
        const cap = setTimeout(() => { addLog(`#${id} still open after 3 min — releasing bot`); finish(0); }, def.open ? 30 * 60_000 : 180_000);
      });
      lastSettle.current = Date.now();
      setTrades((t) => t.map((x) => (x.id === id ? { ...x, profit: result } : x)));
      addLog(`${result > 0 ? "WIN" : "LOSS"} #${id}: ${result.toFixed(2)}`);
      return result;
    } catch (e: any) {
      addLog(`Order error: ${e.message}`);
      setError(e.message);
      return null;
    } finally { setBusy(false); }
  }, [account, duration, unit, symbol, def, digit, offset, hi, lo, selectedTick, multiplier, growthRate, tpAmt, slAmt, available]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!auto || busy || status !== "on") return;
    if (net <= -maxLoss) { setAuto(false); addLog("Stopped: loss limit reached"); return; }
    if (net >= takeProfit) { setAuto(false); addLog("Stopped: profit target reached"); return; }
    if (trades.length >= maxTrades) { setAuto(false); addLog("Stopped: max trades reached"); return; }
    if (streak.current >= lossStreakStop) { setAuto(false); addLog(`Stopped: ${streak.current} losses in a row`); return; }
    if (!account?.isVirtual) { setAuto(false); addLog("Stopped: autopilot runs on DEMO accounts only"); return; }
    if (Date.now() - lastSettle.current < cooldown * 1000) return;
    const wait = (why: string) => { if (Date.now() - lastWaitLog.current > 15000) { lastWaitLog.current = Date.now(); addLog(`Waiting: ${why}`); } };
    if (sig.side === null) return wait(sig.note);
    if (sig.confidence < minConf) return wait(`confidence ${sig.confidence}% below your minimum ${minConf}%`);
    if (brainGate && (!brain || brain.side !== sig.side)) return wait("AI Brain does not agree yet");
    if (mode === "SIDE_A" && sig.side !== 0) return wait(`signal is ${def.sides[1]}, you chose ${def.sides[0]} only`);
    if (mode === "SIDE_B" && sig.side !== 1) return wait(`signal is ${def.sides[0]}, you chose ${def.sides[1]} only`);
    const amt = curStake.current;
    placeTrade(sig.side, amt).then((r) => {
      if (r == null) return;
      streak.current = r > 0 ? 0 : streak.current + 1;
      curStake.current = Math.min(stake, maxStake); // fixed stake — no martingale
    });
  }, [auto, busy, prices.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const startAuto = () => {
    if (!account?.isVirtual) { setError("Autopilot is locked to DEMO accounts. Switch to your demo (VRTC) account to run it."); return; }
    curStake.current = stake;
    streak.current = 0;
    setAuto(true);
    addLog(`Autopilot ON (${def.label})`);
  };

  const last = prices[prices.length - 1];
  const view = prices.slice(-100);
  const min = Math.min(...view), max = Math.max(...view);
  const pts = view.map((p, i) => `${i * 4},${100 - ((p - min) / (max - min || 1)) * 100}`).join(" ");

  const field = "rounded-md border border-input bg-background px-2 py-1.5 font-mono text-sm text-foreground";
  const num = (v: number, set: (n: number) => void, label: string, step = 1) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input type="number" step={step} value={v} onChange={(e) => set(Number(e.target.value))} className={field} />
    </label>
  );

  return (
    <div className="relative isolate min-h-screen font-sans text-foreground">
      <CosmicBackground />
      <header className="glass sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <h1 className="text-glow text-xl font-bold tracking-tight">MWASE <span className="text-primary">DERIV HYBRID</span></h1>
        <div className="hidden flex-1 justify-center gap-4 font-mono text-xs md:flex">
          <span>EQUITY <b>{balance != null ? balance.toFixed(2) : "—"}</b></span>
          <span>P/L <b className={net >= 0 ? "text-up" : "text-down"}>{net.toFixed(2)}</b></span>
          <span>SIGNAL <b className={sig.side === 0 ? "text-up" : sig.side === 1 ? "text-down" : ""}>{sig.side === null ? "WAIT" : def.sides[sig.side]}</b></span>
          <span className={`rounded px-2 ${account?.isVirtual ? "bg-up/20 text-up" : "bg-down/20 text-down"}`}>{account ? (account.isVirtual ? "DEMO-LOCK" : "REAL · AUTO LOCKED") : "OFFLINE"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className={`h-2.5 w-2.5 rounded-full ${status === "on" ? "bg-up" : status === "connecting" ? "bg-primary" : "bg-down"}`} />
          {status === "on" && account ? `${account.loginid} · ${account.isVirtual ? "DEMO" : "REAL"}` : status}
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-3">
        <section className="space-y-3 glass rounded-2xl p-4">
          <h2 className="font-semibold">Deriv connection</h2>
          <label className="block text-xs text-muted-foreground">App ID
            <input value={appId} onChange={(e) => setAppId(e.target.value)} className={`mt-1 w-full ${field}`} />
          </label>
          <label className="block text-xs text-muted-foreground">Personal Access Token (pat_…, needs "trade" scope)
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} className={`mt-1 w-full ${field}`} />
          </label>
          {accounts.length > 0 && (
            <label className="block text-xs text-muted-foreground">Account
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={`mt-1 w-full ${field}`}>
                {accounts.map((a) => <option key={a.account_id} value={a.account_id}>{a.account_id} · {a.account_type.toUpperCase()} · {a.currency}</option>)}
              </select>
            </label>
          )}
          <p className="text-xs text-muted-foreground">Get both from developers.deriv.com. Saved only in this browser. Use a demo token to test.</p>
          <button onClick={connect} disabled={status === "connecting"} className="w-full rounded-md bg-primary py-2 font-semibold text-primary-foreground disabled:opacity-50">
            {status === "on" ? "Reconnect" : status === "connecting" ? "Connecting…" : "Connect"}
          </button>
          {error && <p className="text-sm text-down">{error}</p>}
        </section>

        <section className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
          {[
            ["Balance", balance != null ? `${balance.toFixed(2)} ${account?.currency ?? ""}` : "—"],
            ["Session P/L", net.toFixed(2)],
            ["Win rate", settled.length ? `${Math.round((wins / settled.length) * 100)}%` : "—"],
            ["Trades", `${trades.length}/${maxTrades}`],
          ].map(([k, v]) => (
            <div key={k} className="glass rounded-2xl p-4">
              <div className="text-xs text-muted-foreground">{k}</div>
              <div className={`mt-1 font-mono text-xl font-semibold ${k === "Session P/L" ? (net >= 0 ? "text-up" : "text-down") : ""}`}>{v}</div>
            </div>
          ))}

          <div className="col-span-2 glass rounded-2xl p-4 lg:col-span-4">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className={field}>
                {GROUPS.map((g) => {
                  const items = instruments.filter((i) => i.group === g);
                  return items.length ? (
                    <optgroup key={g} label={`${g} (${items.length})`}>
                      {items.map((i) => <option key={i.symbol} value={i.symbol}>{i.name}{i.open === false ? " (closed)" : ""}</option>)}
                    </optgroup>
                  ) : null;
                })}
              </select>
              <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={field}>
                {(Object.keys(CONTRACTS) as Kind[]).map((k) => <option key={k} value={k}>{CONTRACTS[k].label}</option>)}
              </select>
              <span className="ml-auto font-mono text-lg">{last?.toFixed(decimals) ?? "—"}</span>
            </div>
            <div className="chart-3d"><svg viewBox="0 0 400 100" preserveAspectRatio="none" className="h-48 w-full">
              <defs><linearGradient id="fillg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--up)" stopOpacity="0.35" /><stop offset="100%" stopColor="var(--up)" stopOpacity="0" /></linearGradient></defs>
              {pts && <polygon points={`0,100 ${pts} ${(view.length - 1) * 4},100`} fill="url(#fillg)" />}
              {def.barrier === "offset" && last != null && <line x1="0" x2="400" y1={100 - ((last + offset - min) / (max - min || 1)) * 100} y2={100 - ((last + offset - min) / (max - min || 1)) * 100} stroke="var(--primary)" strokeDasharray="4 3" strokeWidth="0.8" />}
              {def.barrier === "range" && last != null && [hi, lo].map((b) => { const y = 100 - ((last + b - min) / (max - min || 1)) * 100; return <line key={b} x1="0" x2="400" y1={y} y2={y} stroke="var(--primary)" strokeDasharray="4 3" strokeWidth="0.8" />; })}
              <polyline points={pts} fill="none" stroke="var(--up)" strokeWidth="1.5" />
            </svg></div>
            {available && <p className="mt-1 text-xs text-muted-foreground">On this market: {def.types.filter((t, i) => !(def.single && i)).map((t) => <span key={t} className={ctAvailable(t) ? "text-up" : "text-down"}>{t} {ctAvailable(t) ? "✓" : "✗ not offered"} </span>)}</p>}
            {runs && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {runs.parts.map((p) => (
                  <div key={p.name} className="rounded-lg border border-border bg-background/30 p-2 text-xs">
                    <div className="text-muted-foreground">{p.name}</div>
                    <div className={`font-mono font-semibold ${p.bias === 0 ? "text-up" : p.bias === 1 ? "text-down" : ""}`}>{p.bias === 0 ? "▲ " : p.bias === 1 ? "▼ " : ""}{p.value}</div>
                  </div>
                ))}
              </div>
            )}

            {stats && (
              <div className="mt-2 grid grid-cols-10 gap-1 text-center font-mono text-xs">
                {stats.counts.map((c, d) => {
                  const p = stats.total ? (c / stats.total) * 100 : 0;
                  return (
                    <button key={d} onClick={() => setDigit(d)} className={`rounded border py-1 ${d === digit ? "border-primary bg-primary/20" : "border-border"} ${p >= 12 ? "text-up" : p <= 8 ? "text-down" : ""}`}>
                      <div className="font-bold">{d}</div><div>{p.toFixed(0)}%</div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs text-muted-foreground">{def.label} signal</div>
                <div className={`text-2xl font-bold ${sig.side === 0 ? "text-up" : sig.side === 1 ? "text-down" : ""}`}>
                  {sig.side === null ? "WAIT" : def.sides[sig.side]} <span className="font-mono text-base">{sig.confidence}%</span>
                </div>
                <div className="text-xs text-muted-foreground">{sig.note}</div>
                {!def.digits && (
                  <ul className="mt-2 space-y-0.5 text-xs">
                    {base.parts.map((p) => (
                      <li key={p.name} className="flex gap-2">
                        <span className={p.bias === "CALL" ? "text-up" : p.bias === "PUT" ? "text-down" : "text-muted-foreground"}>{p.bias === "CALL" ? "▲" : p.bias === "PUT" ? "▼" : "•"}</span>
                        <span className="text-muted-foreground">{p.name}:</span><span>{p.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-2">
                <button disabled={status !== "on" || busy} onClick={() => placeTrade(0, stake)} className="rounded-md bg-up px-5 py-3 font-bold text-primary-foreground disabled:opacity-40">{def.sides[0]}</button>
                <button hidden={!!def.single} disabled={status !== "on" || busy} onClick={() => placeTrade(1, stake)} className="rounded-md bg-down px-5 py-3 font-bold text-primary-foreground disabled:opacity-40">{def.sides[1]}</button>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3 glass rounded-2xl p-4">
          <h2 className="font-semibold">Trade parameters & risk</h2>
          <div className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1 text-xs">
            {(def.single ? (["SIGNAL"] as Mode[]) : (["SIDE_A", "SIDE_B", "SIGNAL"] as Mode[])).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded py-1.5 ${mode === m ? "bg-primary text-primary-foreground" : ""}`}>
                {m === "SIDE_A" ? `Always ${def.sides[0].replace(/[▲▼] /, "")}` : m === "SIDE_B" ? `Always ${def.sides[1].replace(/[▲▼] /, "")}` : "Auto direction"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {num(stake, setStake, "Stake", 0.01)}
            {!def.open && <div className="flex gap-1">
              <div className="flex-1">{num(duration, (n) => setDuration(def.ticks ? Math.min(def.ticks[1], Math.max(def.ticks[0], Math.round(n))) : n), def.ticks ? `Ticks (${def.ticks[0]}-${def.ticks[1]})` : "Duration")}</div>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Unit
                <select value={unit} disabled={def.digits || !!def.ticks} onChange={(e) => setUnit(e.target.value as Unit)} className={field}>
                  <option value="t">Ticks</option><option value="s">Seconds</option><option value="m">Minutes</option>
                </select>
              </label>
            </div>}
            {def.extra === "selected_tick" && num(selectedTick, (n) => setSelectedTick(Math.max(1, Math.min(5, Math.round(n)))), "Predicted tick (1-5)")}
            {def.extra === "multiplier" && num(multiplier, setMultiplier, "Multiplier (e.g. 100)")}
            {def.extra === "growth_rate" && (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">Growth rate
                <select value={growthRate} onChange={(e) => setGrowthRate(Number(e.target.value))} className={field}>
                  {[0.01, 0.02, 0.03, 0.04, 0.05].map((g) => <option key={g} value={g}>{g * 100}%</option>)}
                </select>
              </label>
            )}
            {def.open && num(tpAmt, setTpAmt, "Take profit (amount)", 0.1)}
            {def.extra === "multiplier" && num(slAmt, setSlAmt, "Stop loss (amount)", 0.1)}
            {kind === "RUNS" && (
              <label className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground">Sensitivity: {["", "Very careful", "Careful", "Balanced", "Sensitive", "Very sensitive"][sensitivity]}
                <input type="range" min={1} max={5} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} />
              </label>
            )}
            {def.barrier === "digit" && num(digit, (n) => setDigit(Math.max(0, Math.min(9, Math.round(n)))), "Prediction digit (0-9)")}
            {def.barrier === "offset" && num(offset, setOffset, "Barrier offset (+/-)", 0.01)}
            {def.barrier === "range" && <>{num(hi, setHi, "High barrier offset (+)", 0.01)}{num(lo, setLo, "Low barrier offset (-)", 0.01)}</>}
            {num(minConf, setMinConf, "Min confidence %")}
            {num(cooldown, setCooldown, "Pause after trade (sec)")}
            {num(maxStake, setMaxStake, "Max stake cap", 0.1)}
            {num(lossStreakStop, setLossStreakStop, "Stop after N losses")}
            {num(maxLoss, setMaxLoss, "Loss limit")}
            {num(takeProfit, setTakeProfit, "Profit target")}
            {num(maxTrades, setMaxTrades, "Max trades")}
          </div>
          {auto ? (
            <button onClick={() => { setAuto(false); addLog("Autopilot OFF"); }} className="w-full rounded-md bg-down py-3 font-bold text-primary-foreground">STOP AUTOPILOT</button>
          ) : (
            <button disabled={status !== "on"} onClick={startAuto} className="w-full rounded-md bg-up py-3 font-bold text-primary-foreground disabled:opacity-40">START AUTOPILOT</button>
          )}
          <p className="text-xs text-muted-foreground">No strategy guarantees profit. Autopilot runs on demo accounts only, uses a fixed stake (no martingale), pauses after each trade, and stops at your loss limit, profit target, trade cap or loss streak.</p>
        </section>

        <section className="glass rounded-2xl p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Market scanner</h2>
            <button disabled={status !== "on" || scanning} onClick={runScan} className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              {scanning ? `Scanning… ${scan.length}` : "Scan all markets"}
            </button>
          </div>
          {status !== "on" && <p className="text-xs text-muted-foreground">Connect to rank all {instruments.length} instruments by trend strength and signal confidence.</p>}
          <div className="max-h-80 overflow-auto">
            <table className="w-full font-mono text-xs">
              <thead className="text-muted-foreground"><tr><th className="text-left">#</th><th className="text-left">Instrument</th><th className="text-left">Group</th><th>Trend</th><th>Conf</th><th>Bias</th><th /></tr></thead>
              <tbody>
                {scan.map((r, i) => (
                  <tr key={r.symbol} className="border-t border-border">
                    <td>{i + 1}</td><td>{r.name}</td><td className="text-muted-foreground">{r.group}</td>
                    <td className="text-center">{r.trend}</td><td className="text-center">{r.conf}%</td>
                    <td className={`text-center font-bold ${r.dir === "UP" ? "text-up" : r.dir === "DOWN" ? "text-down" : ""}`}>{r.dir}</td>
                    <td><button onClick={() => setSymbol(r.symbol)} className="rounded border border-primary px-2 text-primary">Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <Profiles settings={settings} onApply={applySettings} onLog={addLog} />
        <Journal trades={trades} />

        <section className="glass rounded-2xl p-4">
          <h2 className="mb-2 font-semibold">Trade history</h2>
          <div className="max-h-80 space-y-1 overflow-auto font-mono text-xs">
            {trades.length === 0 && <p className="text-muted-foreground">No trades yet.</p>}
            {trades.map((t) => (
              <div key={t.id} className="flex justify-between border-b border-border py-1">
                <span>{t.time} {t.label} {t.symbol}</span>
                <span className={t.profit == null ? "text-muted-foreground" : t.profit > 0 ? "text-up" : "text-down"}>{t.profit == null ? "open" : t.profit.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-2xl p-4 lg:col-span-2">
          <h2 className="mb-2 font-semibold">Activity log</h2>
          <div className="max-h-80 overflow-auto font-mono text-xs text-muted-foreground">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </section>

        <BrainPanel
          sides={def.sides}
          onVerdict={(v) => { setBrain(v); if (v) addLog(`Brain (${v.provider}): ${v.side === null ? "WAIT" : def.sides[v.side]} ${v.confidence}%`); }}
          getSnapshot={() => ({
            symbol, name: inst?.name, marketType: inst?.group, contract: def.label, sideA: def.sides[0], sideB: def.sides[1],
            duration: `${duration}${unit}`, barrier: def.barrier === "digit" ? digit : def.barrier === "offset" ? offset : def.barrier === "range" ? [hi, lo] : null,
            last: prices[prices.length - 1], localSignal: { side: sig.side === null ? "WAIT" : def.sides[sig.side], confidence: sig.confidence, note: sig.note },
            indicators: base.parts.map((p) => `${p.name}: ${p.detail} (${p.bias ?? "neutral"})`),
            digits: stats ? stats.counts : undefined,
            recentTicks: prices.slice(-120).filter((_, i) => i % 2 === 0),
            session: { trades: trades.length, net },
          })}
        />
        <label className="glass flex items-center gap-2 rounded-2xl p-3 text-sm lg:col-span-3">
          <input type="checkbox" checked={brainGate} onChange={(e) => setBrainGate(e.target.checked)} />
          Autopilot only trades when the AI Brain agrees with the chart signal
        </label>
        <DiagnosePanel error={error} log={log} appId={appId} />
      </main>
    </div>
  );
}
