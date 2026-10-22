import {
  milesToKm,
  SourceError,
  type ListingQuery,
  type NormalizedSoldResult,
  type SoldSearchResult,
  type SoldSource,
  type SourceContext,
} from "./types";

// Old Cars Data: finished auctions from Bring a Trailer, Cars & Bids,
// RM Sotheby's, Collecting Cars and 15 more.
// Docs: https://oldcarsdata.com/llms.txt, https://api.oldcarsdata.com/openapi.json
//
// The free Starter plan allows 10 metered queries a month and returns only the
// latest 20 auctions per query. GET /models is free and doesn't count.

const API = "https://api.oldcarsdata.com";
const STARTER_RESULT_LIMIT = 20;

const auctionHouses: Record<string, string> = {
  bringatrailer: "Bring a Trailer",
  carsandbids: "Cars & Bids",
  hemmings: "Hemmings",
  autohunter: "AutoHunter",
  hagerty: "Hagerty",
  pcarmarket: "PCAR Market",
  acc: "All Collector Cars",
  gooding: "Gooding & Co",
  rmsothebys: "RM Sotheby's",
  barrettjackson: "Barrett-Jackson",
  sothebysmotorsport: "Sotheby's Motorsport",
  carandclassic: "Car & Classic",
  themarket: "The Market",
  broadarrow: "Broad Arrow",
  mbmarket: "MB Market",
  mecum: "Mecum",
  pistonheads: "PistonHeads",
  collectingcars: "Collecting Cars",
  bonhams: "Bonhams",
};

interface OcdAuction {
  id: number;
  source?: string;
  url?: string;
  title?: string;
  auction_status?: string;
  price?: number;
  currency?: string;
  auction_end_at?: string;
  auction_end_date?: string;
  mileage?: number;
  mileage_unit?: string;
  year?: number;
  listing_make?: string;
  listing_model?: string;
  ocd_make_name?: string;
  ocd_model_name?: string;
}

/**
 * Old Cars Data's model names are shorter than dealer ones ("458" vs
 * "458 Italia"). Pick the exact match, else the longest name the watch's
 * model starts with (or that starts with the watch's model).
 */
export function matchModel(watchModel: string, models: string[]): string | null {
  const want = watchModel.trim().toLowerCase();
  const exact = models.find((m) => m.toLowerCase() === want);
  if (exact) return exact;
  const candidates = models.filter((m) => {
    const have = m.toLowerCase();
    return want.startsWith(`${have} `) || have.startsWith(`${want} `);
  });
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function normalize(raw: OcdAuction): NormalizedSoldResult | null {
  const soldDate = (raw.auction_end_at ?? raw.auction_end_date ?? "").slice(0, 10);
  if (raw.auction_status !== "sold" || !raw.price || !soldDate) return null;
  // Some auction houses put 0 when the mileage isn't known.
  const km =
    !raw.mileage
      ? null
      : raw.mileage_unit?.toLowerCase().startsWith("k")
        ? Math.round(raw.mileage)
        : milesToKm(raw.mileage);
  return {
    source: oldcarsdata.id,
    sourceResultId: String(raw.id),
    auctionHouse: raw.source ? (auctionHouses[raw.source] ?? raw.source) : null,
    title: raw.title ?? [raw.year, raw.listing_make, raw.listing_model].filter(Boolean).join(" "),
    make: raw.ocd_make_name ?? raw.listing_make ?? null,
    model: raw.ocd_model_name ?? raw.listing_model ?? null,
    year: raw.year ?? null,
    km,
    price: raw.price,
    currency: raw.currency ?? "USD",
    soldDate,
    url: raw.url ?? null,
  };
}

async function getJson<T>(url: string, ctx: SourceContext, metered: boolean): Promise<T> {
  if (metered) ctx.beforeCall();
  const res = await ctx.fetch(url, {
    headers: { Authorization: `Bearer ${ctx.apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; message?: string; code?: string };
      detail = [body.code, body.message ?? body.error].filter(Boolean).join(": ") || detail;
    } catch {}
    throw new SourceError(oldcarsdata.id, `HTTP ${res.status} ${detail}`, res.status);
  }
  return (await res.json()) as T;
}

/** One metered query: the latest sold auctions for the watched model and years. */
async function search(query: ListingQuery, ctx: SourceContext): Promise<SoldSearchResult> {
  const { data: models } = await getJson<{ data: string[] }>(
    `${API}/models?${new URLSearchParams({ make: query.make })}`,
    ctx,
    false,
  );
  const model = matchModel(query.model, models);
  if (!model) {
    throw new SourceError(
      oldcarsdata.id,
      `no model like "${query.model}" for ${query.make}; it has ${models.join(", ")}`,
    );
  }

  const params = new URLSearchParams({
    make: query.make,
    model,
    year_min: String(query.yearMin),
    year_max: String(query.yearMax),
    status: "sold",
    sort: "date",
    direction: "desc",
    limit: String(STARTER_RESULT_LIMIT),
  });
  const page = await getJson<{ data: OcdAuction[] }>(`${API}/auctions?${params}`, ctx, true);

  return {
    results: (page.data ?? []).map(normalize).filter((r) => r !== null),
    calls: 1,
    matchedModel: model === query.model ? null : model,
  };
}

export const oldcarsdata: SoldSource = {
  kind: "sold",
  id: "oldcarsdata",
  label: "Old Cars Data (auctions)",
  monthlyCallLimit: 10,
  apiKeyEnv: "OLD_CARS_DATA_API_KEY",
  search,
};
