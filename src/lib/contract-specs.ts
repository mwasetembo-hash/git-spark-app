import { CONTRACTS, type Kind } from "./contracts";

export type DurationUnit = "t" | "s" | "m" | "h" | "d";
export type ContractSpec = { contract_type: string; contract_category?: string; barriers?: number; barrier?: string | null; high_barrier?: string | null; low_barrier?: string | null; expiry_type?: string; min_contract_duration: string; max_contract_duration: string; underlying_symbol?: string };
const scale: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
function bound(value: string) {
  const m = /^(\d+)([tsmhd])$/.exec(value);
  if (!m) return null;
  const unit = m[2] ?? "";
  return { ticks: unit === "t", amount: Number(m[1]) * (unit === "t" ? 1 : scale[unit] ?? 0) };
}
export function durationSupported(row: ContractSpec, duration: number, unit: DurationUnit, open = false) {
  if (open) return row.expiry_type === "no_expiry" || row.min_contract_duration === "0";
  if (!Number.isInteger(duration) || duration < 1) return false;
  const min = bound(row.min_contract_duration), max = bound(row.max_contract_duration);
  if (!min || !max || min.ticks !== (unit === "t") || max.ticks !== (unit === "t")) return false;
  const value = duration * (unit === "t" ? 1 : scale[unit] ?? 0);
  return value >= min.amount && value <= max.amount;
}
export function formatBarrier(value: number, decimals: number, relative = true): string | null {
  if (!Number.isFinite(value) || decimals < 0 || decimals > 12) return null;
  const number = value.toFixed(decimals);
  if (Number(number) === 0) return null;
  const text = relative && value > 0 ? `+${number}` : number;
  return text.length <= 20 && /^[+-]?\d+(\.\d+)?$/.test(text) ? text : null;
}
export function contractSpecErrors(rows: ContractSpec[] | null, options: { kind: Kind; side: 0 | 1; duration: number; unit: DurationUnit; digit: number; offset: number; hi: number; lo: number; decimals: number }): string[] {
  if (!rows) return ["Contract specifications are loading or unavailable"];
  const { kind, side, duration, unit, digit, offset, hi, lo, decimals } = options;
  const def = CONTRACTS[kind], type = def.types[side];
  const matching = rows.filter((r) => r.contract_type === type);
  if (!matching.length) return [`${type} is not offered on this instrument`];
  const valid = matching.filter((r) => durationSupported(r, duration, unit, def.open));
  if (!valid.length) return [`${type}: supported durations ${matching.map((r) => `${r.min_contract_duration}–${r.max_contract_duration}`).join(", ")}`];
  const errors: string[] = [];
  if (def.barrier === "digit" && (!Number.isInteger(digit) || digit < 0 || digit > 9)) errors.push("Prediction digit must be an integer from 0 to 9");
  if (def.barrier === "offset") {
    if (!formatBarrier(offset, decimals)) errors.push(`Barrier must be nonzero at ${decimals}-decimal precision`);
    if (!valid.some((r) => r.barriers === undefined || r.barriers === 1)) errors.push("This contract does not support one price barrier");
  }
  if (def.barrier === "range") {
    if (!formatBarrier(hi, decimals) || !formatBarrier(lo, decimals) || !(hi > lo)) errors.push("Upper barrier must exceed lower barrier; both must be valid nonzero offsets");
    if (!valid.some((r) => r.barriers === undefined || r.barriers === 2)) errors.push("This contract does not support two barriers");
  }
  return errors;
}