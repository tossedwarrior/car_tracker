import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { fxRates } from "@/db/schema";
import { Rates, syncRates } from "./fx";

const sample = fs.readFileSync(
  path.join(import.meta.dirname, "__fixtures__/boc-fx-2026-10-14_21.json"),
  "utf8",
);

describe("syncRates", () => {
  it("loads two years of rates the first time, then only what's new", async () => {
    const urls: string[] = [];
    const fetch = async (url: string) => {
      urls.push(url);
      return new Response(sample);
    };

    const saved = await syncRates({ fetch, now: new Date("2026-10-22T16:00:00Z") });
    expect(saved).toBe(36); // 6 business days × 6 currencies
    expect(urls[0]).toContain("FXUSDCAD,FXEURCAD,FXGBPCAD,FXCHFCAD,FXJPYCAD,FXAUDCAD");
    expect(urls[0]).toContain("start_date=2024-09-21&end_date=2026-10-22");

    await syncRates({ fetch, now: new Date("2026-10-23T16:00:00Z") });
    expect(urls[1]).toContain("start_date=2026-10-21&end_date=2026-10-23");
    expect((await db.select().from(fxRates))).toHaveLength(36); // no duplicates
  });
});

describe("Rates", () => {
  const rates = new Rates([
    { date: "2026-10-16", base: "USD", rate: 1.4 },
    { date: "2026-10-19", base: "USD", rate: 1.38 },
    { date: "2026-10-19", base: "GBP", rate: 1.85 },
  ]);

  it("converts both ways through CAD", async () => {
    expect(rates.convert(100000, "USD", "CAD")).toBe(138000);
    expect(rates.convert(138000, "CAD", "USD")).toBe(100000);
    expect(rates.convert(100000, "GBP", "USD")).toBe(134058);
    expect(rates.convert(5, "CAD", "CAD")).toBe(5);
  });

  it("uses the rate on the date, or the last one before it", async () => {
    expect(rates.convert(100, "USD", "CAD", "2026-10-16")).toBe(140);
    expect(rates.convert(100, "USD", "CAD", "2026-10-18")).toBe(140); // weekend
    expect(rates.convert(100, "USD", "CAD", "2026-10-19T09:00:00Z")).toBe(138);
    expect(rates.convert(100, "USD", "CAD", "2020-01-01")).toBe(140); // before any: earliest
  });

  it("returns null for a currency it has no rates for", async () => {
    expect(rates.convert(100, "SEK", "CAD")).toBeNull();
    expect(rates.latestDate).toBe("2026-10-19");
  });
});
