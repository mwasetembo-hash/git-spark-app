import { useEffect, useState } from "react";

const LS = "mwase-profiles";
type S = Record<string, unknown>;

export function Profiles({ settings, onApply, onLog }: { settings: S; onApply: (s: any) => void; onLog: (m: string) => void }) {
  const [profiles, setProfiles] = useState<Record<string, S>>({});
  const [name, setName] = useState("");
  useEffect(() => { try { setProfiles(JSON.parse(localStorage.getItem(LS) || "{}")); } catch {} }, []);
  const store = (p: Record<string, S>) => { setProfiles(p); localStorage.setItem(LS, JSON.stringify(p)); };
  const field = "rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground";

  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ current: settings, profiles }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mwase-settings.json"; a.click();
  };
  const importFile = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      if (j.profiles) store({ ...profiles, ...j.profiles });
      if (j.current) onApply(j.current);
      onLog("Settings imported");
    } catch { onLog("Import failed: not a valid settings file"); }
  };

  return (
    <section className="glass space-y-2 rounded-2xl p-4">
      <h2 className="font-semibold">Saved settings</h2>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Profile name" className={`flex-1 ${field}`} />
        <button disabled={!name.trim()} onClick={() => { store({ ...profiles, [name.trim()]: settings }); onLog(`Saved profile "${name.trim()}"`); setName(""); }} className="rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40">Save</button>
      </div>
      <div className="space-y-1">
        {Object.keys(profiles).length === 0 && <p className="text-xs text-muted-foreground">No saved profiles yet.</p>}
        {Object.entries(profiles).map(([n, p]) => (
          <div key={n} className="flex items-center gap-2 text-xs">
            <span className="flex-1 truncate">{n}</span>
            <button onClick={() => { onApply(p); onLog(`Loaded profile "${n}"`); }} className="rounded border border-primary px-2 text-primary">Load</button>
            <button onClick={() => { const c = { ...profiles }; delete c[n]; store(c); }} className="rounded border border-border px-2">Delete</button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 text-xs">
        <button onClick={exportAll} className="rounded-md border border-border px-3 py-1.5">Export file</button>
        <label className="cursor-pointer rounded-md border border-border px-3 py-1.5">Import file<input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
      </div>
    </section>
  );
}
