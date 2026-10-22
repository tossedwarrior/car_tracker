import { describe, expect, it } from "vitest";
import { fixtureContext } from "@/test/fixtures";
import { autodev, buildSearchUrl, normalize } from "./autodev";
import { SourceError } from "./types";

const query = {
  make: "Ferrari",
  model: "458 Italia",
  yearMin: 2011,
  yearMax: 2015,
  maxKm: 40000,
};

describe("buildSearchUrl", () => {
  it("maps the watch filters to Auto.dev params, converting km to miles", () => {
    const url = new URL(buildSearchUrl(query));
    expect(url.origin + url.pathname).toBe("https://api.auto.dev/listings");
    expect(url.searchParams.get("vehicle.make")).toBe("Ferrari");
    expect(url.searchParams.get("vehicle.model")).toBe("458 Italia");
    expect(url.searchParams.get("vehicle.year")).toBe("2011-2015");
    expect(url.searchParams.get("retailListing.miles")).toBe("0-24854");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.has("vehicle.trim")).toBe(false);
  });

  it("adds trim only when set", () => {
    const url = new URL(buildSearchUrl({ ...query, maxKm: null, trim: "Spider" }));
    expect(url.searchParams.get("vehicle.trim")).toBe("Spider");
    expect(url.searchParams.has("retailListing.miles")).toBe(false);
  });
});

describe("normalize", () => {
  it("maps a listing into the shared shape", () => {
    const listing = normalize({
      vin: "ZFF67NFA1B0170001",
      createdAt: "2026-02-02 14:04:06",
      vehicle: { vin: "ZFF67NFA1B0170001", year: 2012, make: "Ferrari", model: "458 Italia", trim: "Spider" },
      retailListing: {
        vdp: "https://dealer.example.com/x",
        price: 199750,
        miles: 4900,
        dealer: "Sample Exotics of Scottsdale",
        city: "Scottsdale",
        state: "AZ",
      },
    });
    expect(listing).toEqual({
      source: "autodev",
      sourceListingId: "ZFF67NFA1B0170001",
      vin: "ZFF67NFA1B0170001",
      title: "2012 Ferrari 458 Italia Spider",
      make: "Ferrari",
      model: "458 Italia",
      year: 2012,
      trim: "Spider",
      km: 7886,
      price: 199750,
      currency: "USD",
      sellerType: "dealer",
      sellerName: "Sample Exotics of Scottsdale",
      location: "Scottsdale, AZ",
      country: "US",
      url: "https://dealer.example.com/x",
      listedAt: "2026-02-02T14:04:06Z",
    });
  });

  it("treats a price of 0 as no price and keeps missing mileage as null", () => {
    const listing = normalize({
      vehicle: { vin: "ZFF67NFA1B0170002" },
      retailListing: { price: 0 },
    });
    expect(listing?.price).toBeNull();
    expect(listing?.km).toBeNull();
  });

  it("skips wholesale-only rows and rows without a VIN", () => {
    expect(normalize({ vehicle: { vin: "ZFF67NFA1B0170003" }, retailListing: null })).toBeNull();
    expect(normalize({ retailListing: { price: 1 } })).toBeNull();
  });
});

describe("autodev.search", () => {
  it("follows pages, de-dupes by VIN and drops wholesale rows", async () => {
    const ctx = fixtureContext([
      { fixture: "autodev/search-page1.json" },
      { fixture: "autodev/search-page2.json" },
    ]);
    const result = await autodev.search(query, ctx);

    expect(ctx.urls).toHaveLength(2);
    expect(ctx.urls[1]).toBe("https://api.auto.dev/listings?page=2&limit=20");
    expect(ctx.headers[0]).toMatchObject({ Authorization: "Bearer test-key" });
    // 20 + 4 rows, minus 1 wholesale-only, minus 1 repeated VIN.
    expect(result.listings).toHaveLength(22);
    expect(result.calls).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.total).toBe(23);
    expect(new Set(result.listings.map((l) => l.vin)).size).toBe(22);
  });

  it("stops at maxPages and reports the result as truncated", async () => {
    const ctx = fixtureContext([{ fixture: "autodev/search-page1.json" }]);
    const result = await autodev.search(query, ctx, { maxPages: 1 });
    expect(result.calls).toBe(1);
    expect(result.truncated).toBe(true);
    expect(result.listings).toHaveLength(19);
  });

  it("handles no results", async () => {
    const ctx = fixtureContext([{ fixture: "autodev/search-empty.json" }]);
    const result = await autodev.search(query, ctx);
    expect(result).toEqual({ listings: [], calls: 1, truncated: false, total: 0 });
  });

  it("checks the budget before every call", async () => {
    const ctx = fixtureContext([{ fixture: "autodev/search-page1.json" }]);
    ctx.beforeCall = () => {
      throw new Error("over budget");
    };
    await expect(autodev.search(query, ctx)).rejects.toThrow("over budget");
    expect(ctx.urls).toHaveLength(0);
  });

  it("turns API errors into a SourceError with the API's message", async () => {
    const ctx = fixtureContext([{ fixture: "autodev/error-invalid-parameter.json", status: 400 }]);
    const err = await autodev.search(query, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.status).toBe(400);
    expect(err.message).toContain("INVALID_PARAMETER");
  });
});

describe("live response saved on 2026-10-22", () => {
  it("normalizes every row of a real Auto.dev page", async () => {
    const ctx = fixtureContext([{ fixture: "autodev/live-2026-10-22.json" }]);
    const result = await autodev.search(query, ctx, { maxPages: 1 });
    expect(result.total).toBe(80);
    expect(result.truncated).toBe(true);
    expect(result.listings).toHaveLength(20);
    for (const l of result.listings) {
      expect(l.vin).toMatch(/^ZFF/);
      expect(l.make).toBe("Ferrari");
      expect(l.model).toBe("458 Italia");
      expect(l.price).toBeGreaterThan(0);
      expect(l.km).toBeLessThanOrEqual(40000);
      expect(l.url).toMatch(/^https?:\/\//);
      expect(l.listedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    }
  });
});
