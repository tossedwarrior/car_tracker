import {
  BudgetExceededError,
  kmToMiles,
  milesToKm,
  SourceError,
  type ListingQuery,
  type ListingSource,
  type NormalizedListing,
  type SearchOptions,
  type SearchResult,
  type SourceContext,
} from "./types";

// MarketCheck Inventory Search API, Canadian dealer listings.
// Docs: https://docs.marketcheck.com/docs/api/cars/inventory/inventory-search.md
//
// The free plan only searches within 100 miles of a point, so each watched
// car is searched around four cities. Prices come back in CAD for Canada;
// mileage is always in miles.

const BASE_URL = "https://api.marketcheck.com/v2/search/car/active";
const PAGE_SIZE = 50; // API maximum
const RADIUS_MILES = 100; // free plan maximum

export const CITIES = [
  { name: "Toronto", latitude: 43.6532, longitude: -79.3832 },
  { name: "Montreal", latitude: 45.5019, longitude: -73.5674 },
  { name: "Vancouver", latitude: 49.2827, longitude: -123.1207 },
  { name: "Calgary", latitude: 51.0447, longitude: -114.0719 },
] as const;
type City = (typeof CITIES)[number];

interface MarketCheckListing {
  id: string;
  vin?: string;
  heading?: string;
  price?: number;
  miles?: number;
  vdp_url?: string;
  seller_type?: string;
  first_seen_at_source_date?: string;
  first_seen_at_date?: string;
  dealer?: { name?: string; city?: string; state?: string; country?: string };
  build?: { year?: number; make?: string; model?: string; trim?: string };
}

interface MarketCheckResponse {
  num_found: number;
  listings: MarketCheckListing[];
}

export function buildSearchUrl(
  query: ListingQuery,
  city: City,
  start: number,
  apiKey: string,
): string {
  const params = new URLSearchParams({
    api_key: apiKey,
    // Otherwise MarketCheck appends the key to every URL in the response.
    append_api_key: "false",
    country: "ca",
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    radius: String(RADIUS_MILES),
    car_type: "used",
    make: query.make,
    model: query.model,
    year_range: `${query.yearMin}-${query.yearMax}`,
    sort_by: "first_seen",
    sort_order: "desc",
    rows: String(PAGE_SIZE),
    start: String(start),
  });
  if (query.maxKm) params.set("miles_range", `0-${kmToMiles(query.maxKm)}`);
  if (query.trim) params.set("trim", query.trim);
  return `${BASE_URL}?${params}`;
}

const sellerTypes = { dealer: "dealer", fsbo: "private", auction: "auction" } as const;

export function normalize(raw: MarketCheckListing): NormalizedListing | null {
  if (!raw.id) return null;
  const b = raw.build ?? {};
  const d = raw.dealer ?? {};
  const title =
    raw.heading ?? [b.year, b.make, b.model, b.trim].filter(Boolean).join(" ");

  return {
    source: marketcheck.id,
    sourceListingId: raw.id,
    vin: raw.vin ?? null,
    title,
    make: b.make ?? null,
    model: b.model ?? null,
    year: b.year ?? null,
    trim: b.trim ?? null,
    km: raw.miles != null ? milesToKm(raw.miles) : null,
    price: raw.price ? raw.price : null,
    currency: "CAD",
    sellerType: sellerTypes[raw.seller_type as keyof typeof sellerTypes] ?? "unknown",
    sellerName: d.name ?? null,
    location: [d.city, d.state].filter(Boolean).join(", ") || null,
    country: "CA",
    url: raw.vdp_url ?? null,
    listedAt: raw.first_seen_at_source_date ?? raw.first_seen_at_date ?? null,
  };
}

async function fetchPage(url: string, ctx: SourceContext): Promise<MarketCheckResponse> {
  ctx.beforeCall();
  const res = await ctx.fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    // Never echo the URL: it carries the API key.
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      detail = body.message || detail;
    } catch {}
    throw new SourceError(marketcheck.id, `HTTP ${res.status} ${detail}`, res.status);
  }
  return (await res.json()) as MarketCheckResponse;
}

/**
 * First page for every city (newest listings first), then more pages for any
 * city with more results, while calls last.
 */
async function search(
  query: ListingQuery,
  ctx: SourceContext,
  { maxCalls = marketcheck.callsPerWatch.max }: SearchOptions = {},
): Promise<SearchResult> {
  const listings = new Map<string, NormalizedListing>();
  const fetched = new Map<City, number>();
  const found = new Map<City, number>();
  let calls = 0;
  let outOfCalls = false;

  const fetchCity = async (city: City) => {
    const start = fetched.get(city) ?? 0;
    const page = await fetchPage(buildSearchUrl(query, city, start, ctx.apiKey), ctx);
    calls++;
    found.set(city, page.num_found);
    fetched.set(city, start + PAGE_SIZE);
    for (const raw of page.listings ?? []) {
      const l = normalize(raw);
      // Same car near two cities: keep one, by VIN when there is one.
      const key = l?.vin ?? l?.sourceListingId;
      if (l && key && !listings.has(key)) listings.set(key, l);
    }
  };
  const hasMore = (city: City) =>
    !found.has(city) || (fetched.get(city) ?? 0) < (found.get(city) ?? 0);

  try {
    for (const city of CITIES) {
      if (calls >= maxCalls) break;
      await fetchCity(city);
    }
    for (const city of CITIES) {
      while (hasMore(city) && found.has(city) && calls < maxCalls) await fetchCity(city);
    }
  } catch (e) {
    // Out of calls partway through: keep what was already fetched.
    if (!(e instanceof BudgetExceededError && calls > 0)) throw e;
    outOfCalls = true;
  }

  const total = [...found.values()].reduce((a, b) => a + b, 0);
  return {
    listings: [...listings.values()],
    calls,
    truncated: outOfCalls || CITIES.some(hasMore),
    total: found.size ? total : null,
  };
}

export const marketcheck: ListingSource = {
  kind: "listings",
  id: "marketcheck",
  label: "MarketCheck (Canada)",
  monthlyCallLimit: 500,
  // One page per city at least; a couple more if a city has over 50 matches.
  callsPerWatch: { min: CITIES.length, max: CITIES.length + 2 },
  apiKeyEnv: "MARKETCHECK_API_KEY",
  search,
};
