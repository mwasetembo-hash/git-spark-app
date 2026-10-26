import { describe, expect, it } from "vitest";
import { CONTRACTS } from "./contracts";
import { contractSpecErrors, durationSupported, formatBarrier, type ContractSpec } from "./contract-specs";
const tick: ContractSpec = { contract_type: "HIGHER", barriers: 1, min_contract_duration: "5t", max_contract_duration: "10t", expiry_type: "tick" };
const time: ContractSpec = { ...tick, min_contract_duration: "15s", max_contract_duration: "1d", expiry_type: "intraday" };
const opts = { kind: "HIGHER_LOWER" as const, side: 0 as const, duration: 5, unit: "t" as const, digit: 5, offset: 0.16, hi: 0.5, lo: -0.5, decimals: 2 };
describe("New Deriv contract rules", () => {
  it("uses HIGHER/LOWER, never CALL/PUT, for barrier contracts", () => expect(CONTRACTS.HIGHER_LOWER.types).toEqual(["HIGHER", "LOWER"]));
  it("keeps CALL/PUT for Rise/Fall", () => expect(CONTRACTS.RISE_FALL.types).toEqual(["CALL", "PUT"]));
  it("requires at least 5 ticks for the observed 1HZ100V specification", () => { expect(durationSupported(tick, 4, "t")).toBe(false); expect(durationSupported(tick, 5, "t")).toBe(true); });
  it("does not convert tick limits into seconds", () => expect(durationSupported(tick, 5, "s")).toBe(false));
  it("matches one minute to a 15s–1d time specification", () => expect(durationSupported(time, 1, "m")).toBe(true));
  it("blocks before submission when specifications are missing", () => expect(contractSpecErrors(null, opts)).toHaveLength(1));
  it("blocks unsupported contract types", () => expect(contractSpecErrors([{ ...tick, contract_type: "CALL" }], opts)[0]).toContain("not offered"));
  it("rejects nonfinite and subprecision barriers", () => { expect(formatBarrier(Infinity, 2)).toBeNull(); expect(formatBarrier(0.001, 2)).toBeNull(); });
  it("retains +0.16 for either Higher or Lower instead of reversing its sign", () => {
    expect(formatBarrier(0.16, 2)).toBe("+0.16");
    expect(contractSpecErrors([{ ...tick, contract_type: "LOWER" }], { ...opts, side: 1 })).toEqual([]);
  });
});