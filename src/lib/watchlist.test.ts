import { describe, expect, it } from "vitest";
import { parseWatchForm } from "./watchlist";

const now = new Date("2026-10-22");
const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("parseWatchForm", () => {
  it("accepts the spec's example and strips commas and $", () => {
    const result = parseWatchForm(
      form({ make: " Ferrari ", model: "458 Italia", yearMin: "2011", yearMax: "2015", maxKm: "40,000", targetPrice: "$250,000", targetCurrency: "CAD", trim: "" }),
      now,
    );
    expect(result).toEqual({
      ok: true,
      values: {
        make: "Ferrari",
        model: "458 Italia",
        yearMin: 2011,
        yearMax: 2015,
        maxKm: 40000,
        trim: null,
        targetPrice: 250000,
        targetCurrency: "CAD",
        notes: null,
      },
    });
  });

  it("uses the first year as the last when only one is given", () => {
    const result = parseWatchForm(form({ make: "Aston Martin", model: "DB11", yearMin: "2019" }), now);
    expect(result.ok && [result.values.yearMin, result.values.yearMax]).toEqual([2019, 2019]);
  });

  it("reports each bad field", () => {
    const result = parseWatchForm(
      form({ make: "", model: "", yearMin: "2015", yearMax: "2011", maxKm: "lots", targetPrice: "0", targetCurrency: "EUR" }),
      now,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(
      ["make", "maxKm", "model", "targetCurrency", "targetPrice", "yearMax"].sort(),
    );
  });

  it("rejects years outside 1950 to next year", () => {
    const result = parseWatchForm(form({ make: "Ferrari", model: "F40", yearMin: "1949", yearMax: "2028" }), now);
    expect(!result.ok && result.errors.yearMin).toBeTruthy();
  });
});
