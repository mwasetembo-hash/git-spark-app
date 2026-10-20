import { useEffect, useState } from "react";
import { AUTOPILOT_PRESETS, hybridAutopilotPresetSummary, type HybridAutopilotConfig } from "@/lib/trading-workspace";

const LS = "mwase-profiles";
type S = Record<string, unknown>;

type ProfilesProps = {
  settings: S;
  onApply: (s: any) => void;
  onLog: (m: string) => void;
  onApplyPreset?: (preset: keyof typeof AUTOPILOT_PRESETS) => void;
  activeConfig?: Partial<HybridAutopilotConfig>;
  profileName?: string;
};

export function Profiles({ settings, onApply, onLog, onApplyPreset, activeConfig, profileName = "custom" }: ProfilesProps) {
  const [profiles, setProfiles] = useState<Record<string, S>>({});
  const [name, setName] = useState("");
  const presetNames = Object.keys(AUTOPILOT_PRESETS) as (keyof typeof AUTOPILOT_PRESETS)[];

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
    <section className="glass space-y-3 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Autopilot profiles</h2>
        <span className="rounded border border-primary/60 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">{profileName}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {presetNames.map((preset) => (
          <button
            key={preset}
            onClick={() => onApplyPreset?.(preset)}
            className="rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="rounded-md border border-primary/30 bg-primary/5 px-2 py-2 font-mono text-[10px] text-primary">
        {activeConfig ? hybridAutopilotPresetSummary(activeConfig) : "Custom bot configuration"}
      </div>

      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Profile name" className={`flex-1 ${field}`} />
        <button
          disabled={!name.trim()}
          onClick={() => {
            store({ ...profiles, [name.trim()]: settings });
            onLog(`Saved profile "${name.trim()}"`);
            setName("");
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          Save
        </button>
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
