import { describe, expect, it } from "vitest";
import { fixtureContext, loadFixture } from "@/test/fixtures";
import { matchModel, normalize, oldcarsdata } from "./oldcarsdata";
import { SourceError } from "./types";

const ferrariModels = (loadFixture("oldcarsdata/live-models-ferrari.json") as { data: string[] }).data;
const query = { make: "Ferrari", model: "458 Italia", yearMin: 2011, yearMax: 2015 };

describe("matchModel", () => {
  it("matches dealer model names to Old Cars Data's shorter ones", () => {
    expect(matchModel("458 Italia", ferrariModels)).toBe("458");
    expect(matchModel("458", ferrariModels)).toBe("458");
    expect(matchModel("F12berlinetta", ferrariModels)).toBeNull();
    expect(matchModel("812 Superfast", ferrariModels)).toBe("812");
    expect(matchModel("Roma", ["Roma", "Roma Spider"])).toBe("Roma");
    expect(matchModel("Enzo Ferrari", ["Enzo"])).toBe("Enzo");
  });
});

describe("normalize", () => {
  it("keeps only sold cars and converts mileage to km", () => {
    const [sold, gbp, notSold, dateOnly] = (loadFixture("oldcarsdata/auctions-458.json") as { data: never[] }).data.map(normalize);
    expect(sold).toEqual({
      source: "oldcarsdata",
      sourceResultId: "9001",
      auctionHouse: "Bring a Trailer",
      title: "2013 Ferrari 458 Italia",
      make: "Ferrari",
      model: "458",
      year: 2013,
      km: 20117,
      price: 245000,
      currency: "USD",
      soldDate: "2026-09-14",
      url: "https://auctions.example.com/lot/9001",
    });
    expect(gbp).toMatchObject({ auctionHouse: "Collecting Cars", currency: "GBP", km: 18000 });
    expect(notSold).toBeNull();
    expect(dateOnly).toMatchObject({ soldDate: "2026-05-02", km: null, auctionHouse: "RM Sotheby's" });
  });
});

describe("oldcarsdata.search", () => {
  it("looks up the model name for free, then uses one metered query", async () => {
    const ctx = fixtureContext([
      { fixture: "oldcarsdata/live-models-ferrari.json" },
      { fixture: "oldcarsdata/auctions-458.json" },
    ]);
    let metered = 0;
    ctx.beforeCall = () => void metered++;

    const result = await oldcarsdata.search(query, ctx);

    expect(metered).toBe(1);
    expect(ctx.urls[0]).toBe("https://api.oldcarsdata.com/models?make=Ferrari");
    const params = Object.fromEntries(new URL(ctx.urls[1]).searchParams);
    expect(params).toMatchObject({
      make: "Ferrari",
      model: "458",
      year_min: "2011",
      year_max: "2015",
      status: "sold",
      sort: "date",
      direction: "desc",
      limit: "20",
    });
    expect(ctx.headers[1]).toMatchObject({ Authorization: "Bearer test-key" });
    expect(result).toMatchObject({ calls: 1, matchedModel: "458" });
    expect(result.results).toHaveLength(3);
  });

  it("explains when it can't find the model, without spending a query", async () => {
    const ctx = fixtureContext([{ fixture: "oldcarsdata/live-models-ferrari.json" }]);
    let metered = 0;
    ctx.beforeCall = () => void metered++;
    const err = await oldcarsdata.search({ ...query, model: "Modulo Concept" }, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.message).toContain('no model like "Modulo Concept" for Ferrari');
    expect(metered).toBe(0);
  });

  it("reports API errors", async () => {
    const ctx = fixtureContext([
      { fixture: "oldcarsdata/live-models-ferrari.json" },
      { fixture: "oldcarsdata/error-unauthorized.json", status: 401 },
    ]);
    const err = await oldcarsdata.search(query, ctx).catch((e) => e);
    expect(err.message).toBe("[oldcarsdata] HTTP 401 invalid_api_key: Invalid API key");
  });
});

describe("live response saved on 2026-10-22", () => {
  it("normalizes real auction results", () => {
    const { data } = loadFixture("oldcarsdata/live-2026-10-22-auctions-458.json") as { data: never[] };
    const results = data.map(normalize).filter((r) => r !== null);
    // 20 sold, one with no price.
    expect(data).toHaveLength(20);
    expect(results).toHaveLength(19);
    expect(new Set(results.map((r) => r.currency))).toEqual(new Set(["USD", "GBP", "EUR"]));
    for (const r of results) {
      expect(r.model).toBe("458");
      expect(r.soldDate).toMatch(/^2026-\d\d-\d\d$/);
      expect(r.price).toBeGreaterThan(0);
      expect(r.km === null || r.km > 0).toBe(true);
    }
    // "16k-Kilometer 2014 Ferrari 458 Spider" is already in km.
    expect(results.find((r) => r.title.startsWith("16k-Kilometer"))?.km).toBe(16000);
  });
});
