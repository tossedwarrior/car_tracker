import { describe, expect, it } from "vitest";
import { fixtureContext } from "@/test/fixtures";
import { buildSearchUrl, CITIES, marketcheck, normalize } from "./marketcheck";
import { BudgetExceededError, SourceError } from "./types";

const query = { make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015, maxKm: 40000 };
const allCities = [
  { fixture: "marketcheck/toronto.json" },
  { fixture: "marketcheck/montreal.json" },
  { fixture: "marketcheck/vancouver.json" },
  { fixture: "marketcheck/calgary-page1.json" },
];

describe("buildSearchUrl", () => {
  it("searches Canada within 100 miles of the city, without echoing the key", () => {
    const url = new URL(buildSearchUrl(query, CITIES[0], 0, "secret"));
    expect(url.origin + url.pathname).toBe("https://api.marketcheck.com/v2/search/car/active");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      api_key: "secret",
      append_api_key: "false",
      country: "ca",
      latitude: "43.6532",
      longitude: "-79.3832",
      radius: "100",
      make: "Ferrari",
      model: "458 Italia",
      year_range: "2011-2015",
      miles_range: "0-24854",
      rows: "50",
      start: "0",
      sort_by: "first_seen",
      sort_order: "desc",
    });
  });
});

describe("normalize", () => {
  it("maps a Canadian dealer listing into the shared shape in CAD and km", () => {
    const l = normalize({
      id: "mc-1",
      vin: "ZFF67NFA0D0190001",
      heading: "2013 Ferrari 458 Italia Base",
      price: 329900,
      miles: 14000,
      vdp_url: "https://dealer.example.ca/x",
      seller_type: "dealer",
      first_seen_at_source_date: "2025-09-15T01:33:20Z",
      dealer: { name: "Sample Exotics Toronto", city: "Toronto", state: "ON" },
      build: { year: 2013, make: "Ferrari", model: "458 Italia", trim: "Base" },
    });
    expect(l).toEqual({
      source: "marketcheck",
      sourceListingId: "mc-1",
      vin: "ZFF67NFA0D0190001",
      title: "2013 Ferrari 458 Italia Base",
      make: "Ferrari",
      model: "458 Italia",
      year: 2013,
      trim: "Base",
      km: 22531,
      price: 329900,
      currency: "CAD",
      sellerType: "dealer",
      sellerName: "Sample Exotics Toronto",
      location: "Toronto, ON",
      country: "CA",
      url: "https://dealer.example.ca/x",
      listedAt: "2025-09-15T01:33:20Z",
    });
  });

  it("maps private sellers and falls back to MarketCheck's first-seen date", () => {
    const l = normalize({ id: "x", seller_type: "fsbo", first_seen_at_date: "2026-01-01T00:00:00Z" });
    expect(l).toMatchObject({ sellerType: "private", listedAt: "2026-01-01T00:00:00Z", price: null });
  });
});

describe("marketcheck.search", () => {
  it("searches all four cities, pages through big ones and de-dupes by VIN", async () => {
    const ctx = fixtureContext([...allCities, { fixture: "marketcheck/calgary-page2.json" }]);
    const result = await marketcheck.search(query, ctx, { maxCalls: 6 });

    const cities = ctx.urls.map((u) => new URL(u).searchParams.get("latitude"));
    expect(cities).toEqual(["43.6532", "45.5019", "49.2827", "51.0447", "51.0447"]);
    expect(new URL(ctx.urls[4]).searchParams.get("start")).toBe("50");
    // 2 + 0 + 1 + 50 + 10, minus the Calgary repeat of a Toronto car.
    expect(result.listings).toHaveLength(62);
    expect(result).toMatchObject({ calls: 5, truncated: false, total: 63 });
    expect(result.listings.find((l) => l.vin === "ZFF67NFA0D0190001")?.location).toBe("Toronto, ON");
  });

  it("covers every city before extra pages, and reports what it couldn't fetch", async () => {
    const ctx = fixtureContext(allCities);
    const result = await marketcheck.search(query, ctx, { maxCalls: 4 });
    expect(result).toMatchObject({ calls: 4, truncated: true });
  });

  it("is truncated when there aren't enough calls for every city", async () => {
    const ctx = fixtureContext(allCities.slice(0, 2));
    const result = await marketcheck.search(query, ctx, { maxCalls: 2 });
    expect(result).toMatchObject({ calls: 2, truncated: true });
  });

  it("is complete when every city fits on one page", async () => {
    const ctx = fixtureContext([...allCities.slice(0, 3), { fixture: "marketcheck/calgary-empty.json" }]);
    const result = await marketcheck.search(query, ctx);
    expect(result).toMatchObject({ calls: 4, truncated: false, total: 3 });
  });

  it("keeps what it has when the monthly calls run out mid-search", async () => {
    const ctx = fixtureContext(allCities);
    let n = 0;
    ctx.beforeCall = () => {
      if (++n > 2) throw new BudgetExceededError("marketcheck", 500, 500);
    };
    const result = await marketcheck.search(query, ctx);
    expect(result).toMatchObject({ calls: 2, truncated: true });
    expect(result.listings).toHaveLength(2);
  });

  it("reports API errors without the URL, which holds the key", async () => {
    const ctx = fixtureContext([{ fixture: "marketcheck/error-quota.json", status: 429 }]);
    ctx.apiKey = "secret-key";
    const err = await marketcheck.search(query, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.message).toBe("[marketcheck] HTTP 429 Monthly API quota exhausted");
    expect(err.message).not.toContain("secret-key");
  });
});

describe("live responses saved on 2026-10-22", () => {
  it("normalizes every real Canadian listing", async () => {
    const ctx = fixtureContext(
      ["toronto", "montreal", "vancouver", "calgary"].map((c) => ({
        fixture: `marketcheck/live-2026-10-22-${c}.json`,
      })),
    );
    const result = await marketcheck.search(query, ctx);
    expect(result).toMatchObject({ calls: 4, truncated: false, total: 7 });
    expect(result.listings).toHaveLength(7);
    for (const l of result.listings) {
      expect(l).toMatchObject({ source: "marketcheck", currency: "CAD", country: "CA", make: "Ferrari" });
      expect(l.vin).toMatch(/^ZFF/);
      expect(l.km).toBeLessThanOrEqual(40000);
      expect(l.url).toMatch(/^https?:\/\//);
      expect(l.url).not.toContain("api_key");
      expect(l.location).toMatch(/, (ON|QC|BC|AB)$/);
    }
    // Dealers that say "call for price" have no price, not a price of 0.
    expect(result.listings.filter((l) => l.price == null)).toHaveLength(4);
  });
});
