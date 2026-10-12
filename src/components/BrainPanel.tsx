import { useEffect, useRef, useState } from "react";
import { FOREX_KEYS, MODEL_PRESETS, PROVIDERS, type BrainVerdict, type ProviderId } from "@/lib/brain-providers";

const LS = "mwase-brain-config";

export function BrainPanel({ getSnapshot, onVerdict, sides }: { getSnapshot: () => unknown; onVerdict: (v: BrainVerdict | null) => void; sides: [string, string] }) {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [models, setModels] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<ProviderId | "auto">("auto");
  const [server, setServer] = useState<Record<string, boolean>>({});
  const [auto, setAuto] = useState(false);
  const [every, setEvery] = useState(60);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<BrainVerdict | null>(null);
  const [fail, setFail] = useState("");
  const [open, setOpen] = useState(false);
  const snapRef = useRef(getSnapshot);
  snapRef.current = getSnapshot;

  useEffect(() => {
    try { const c = JSON.parse(localStorage.getItem(LS) || "{}"); setKeys(c.keys ?? {}); setModels(c.models ?? {}); if (c.provider) setProvider(c.provider); } catch {}
    fetch("/api/brain").then((r) => r.json()).then((j) => setServer(j.configured ?? {})).catch(() => {});
  }, []);
  const save = (k = keys, m = models, p = provider) => localStorage.setItem(LS, JSON.stringify({ keys: k, models: m, provider: p }));

  async function analyze() {
    if (busy) return;
    setBusy(true); setFail("");
    try {
      const res = await fetch("/api/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshot: snapRef.current(), provider, keys, models }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `Error ${res.status}`);
      const text: string = j.text;
      const s = /SIGNAL:\s*(SIDE_A|SIDE_B|WAIT)/i.exec(text)?.[1]?.toUpperCase();
      const c = Number(/CONFIDENCE:\s*(\d+)/i.exec(text)?.[1] ?? 0);
      const v: BrainVerdict = { side: s === "SIDE_A" ? 0 : s === "SIDE_B" ? 1 : null, confidence: c, text, provider: j.provider };
      setOut(v); onVerdict(v);
    } catch (e: any) { setFail(e.message); onVerdict(null); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!auto) return;
    analyze();
    const t = setInterval(analyze, Math.max(30, every) * 1000);
    return () => clearInterval(t);
  }, [auto, every]); // eslint-disable-line react-hooks/exhaustive-deps

  const field = "rounded-md border border-input bg-background/60 px-2 py-1.5 font-mono text-xs text-foreground";
  const active = PROVIDERS.filter((p) => server[p.id] || keys[p.env]);

  return (
    <section className="glass space-y-3 rounded-2xl p-4 lg:col-span-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold"><span className="text-primary">◉</span> AI Brain</h2>
        <span className="text-xs text-muted-foreground">{active.length} AI engine{active.length === 1 ? "" : "s"} ready: {active.map((p) => p.label).join(", ") || "none"}</span>
        <button onClick={() => setOpen(!open)} className="ml-auto rounded-md border border-border px-3 py-1.5 text-xs">{open ? "Hide" : "Configure"} keys</button>
      </div>

      {open && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.filter((p) => p.id !== "lovable").map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-background/30 p-2 text-xs">
              <div className="mb-1 flex justify-between"><b>{p.label}</b><span className={server[p.id] ? "text-up" : keys[p.env] ? "text-primary" : "text-muted-foreground"}>{server[p.id] ? "saved securely" : keys[p.env] ? "manual key" : "not set"}</span></div>
              <input type="password" placeholder={server[p.id] ? "Using saved key" : p.env} value={keys[p.env] ?? ""} onChange={(e) => { const k = { ...keys, [p.env]: e.target.value }; setKeys(k); save(k); }} className={`mb-1 w-full ${field}`} />
              <input list={`models-${p.id}`} placeholder={`Model (default ${p.model})`} value={models[p.id] ?? ""} onChange={(e) => { const m = { ...models, [p.id]: e.target.value }; setModels(m); save(keys, m); }} className={`w-full ${field}`} />
              <datalist id={`models-${p.id}`}>{(MODEL_PRESETS[p.id] ?? []).map((m) => <option key={m} value={m} />)}</datalist>
            </div>
          ))}
          {FOREX_KEYS.map((f) => (
            <div key={f} className="rounded-lg border border-border bg-background/30 p-2 text-xs">
              <div className="mb-1 flex justify-between"><b>{f.replace(/_/g, " ")}</b><span className={server[f] ? "text-up" : keys[f] ? "text-primary" : "text-muted-foreground"}>{server[f] ? "saved securely" : keys[f] ? "manual key" : "not set"}</span></div>
              <input type="password" placeholder={server[f] ? "Using saved key" : f} value={keys[f] ?? ""} onChange={(e) => { const k = { ...keys, [f]: e.target.value }; setKeys(k); save(k); }} className={`w-full ${field}`} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">Securely saved keys are used first. Keys typed here are a manual fallback, stored only in this browser.</p>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 text-xs">
        <label className="flex flex-col gap-1 text-muted-foreground">Engine
          <select value={provider} onChange={(e) => { const p = e.target.value as ProviderId | "auto"; setProvider(p); save(keys, models, p); }} className={field}>
            <option value="auto">Auto (try each until one works)</option>
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label} · {models[p.id] || p.model}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-muted-foreground">Every (sec)
          <input type="number" min={30} value={every} onChange={(e) => setEvery(Number(e.target.value))} className={`w-20 ${field}`} />
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-analyze chart</label>
        <button onClick={analyze} disabled={busy} className="rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Thinking…" : "Analyze now"}</button>
      </div>

      {fail && <pre className="whitespace-pre-wrap text-xs text-down">{fail}</pre>}
      {out && (
        <div className="rounded-lg bg-background/40 p-3 text-sm">
          <div className={`mb-1 text-xl font-bold ${out.side === 0 ? "text-up" : out.side === 1 ? "text-down" : ""}`}>
            {out.side === null ? "WAIT" : sides[out.side]} <span className="font-mono text-base">{out.confidence}%</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">via {out.provider}</span>
          </div>
          <div className="whitespace-pre-wrap text-xs text-muted-foreground">{out.text.replace(/^SIGNAL:.*\n?|^CONFIDENCE:.*\n?/gim, "").trim()}</div>
        </div>
      )}
    </section>
  );
}
