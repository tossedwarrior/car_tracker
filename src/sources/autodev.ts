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

// Auto.dev Vehicle Listings API (U.S. dealers).
// Docs: https://docs.auto.dev/v2/products/vehicle-listings

const BASE_URL = "https://api.auto.dev/listings";
// The free plan silently caps `limit` at 20 rows per page.
const PAGE_SIZE = 20;

interface AutoDevListing {
  vin?: string;
  createdAt?: string;
  vehicle?: {
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
  };
  retailListing?: {
    vdp?: string;
    price?: number;
    miles?: number;
    used?: boolean;
    dealer?: string;
    city?: string;
    state?: string;
    zip?: string;
  } | null;
  wholesaleListing?: unknown;
}

interface AutoDevResponse {
  data: AutoDevListing[];
  links?: { next?: string };
  total?: number;
}

export function buildSearchUrl(query: ListingQuery): string {
  const params = new URLSearchParams({
    "vehicle.make": query.make,
    "vehicle.model": query.model,
    "vehicle.year": `${query.yearMin}-${query.yearMax}`,
    limit: String(PAGE_SIZE),
    sort: "createdAt.desc",
    includes: "total",
  });
  if (query.maxKm) params.set("retailListing.miles", `0-${kmToMiles(query.maxKm)}`);
  if (query.trim) params.set("vehicle.trim", query.trim);
  return `${BASE_URL}?${params}`;
}

/** "2024-05-01 14:04:06" (UTC) → "2024-05-01T14:04:06Z" */
function toIso(ts: string | undefined): string | null {
  if (!ts) return null;
  const iso = ts.includes("T") ? ts : ts.replace(" ", "T");
  return /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
}

export function normalize(raw: AutoDevListing): NormalizedListing | null {
  const vin = raw.vehicle?.vin ?? raw.vin ?? null;
  const retail = raw.retailListing;
  // Wholesale-only rows aren't for sale to the public.
  if (!vin || !retail) return null;

  const v = raw.vehicle ?? {};
  const title = [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");
  const location = [retail.city, retail.state].filter(Boolean).join(", ");

  return {
    source: autodev.id,
    sourceListingId: vin,
    vin,
    title,
    make: v.make ?? null,
    model: v.model ?? null,
    year: v.year ?? null,
    trim: v.trim ?? null,
    km: retail.miles != null ? milesToKm(retail.miles) : null,
    // Auto.dev uses 0 for "no price listed".
    price: retail.price ? retail.price : null,
    currency: "USD",
    sellerType: "dealer",
    sellerName: retail.dealer ?? null,
    location: location || null,
    country: "US",
    url: retail.vdp ?? null,
    listedAt: toIso(raw.createdAt),
  };
}

async function fetchPage(url: string, ctx: SourceContext): Promise<AutoDevResponse> {
  await ctx.beforeCall();
  const res = await ctx.fetch(url, {
    headers: {
      Authorization: `Bearer ${ctx.apiKey}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      detail = [body.code, body.error].filter(Boolean).join(": ") || detail;
    } catch {}
    throw new SourceError(autodev.id, `HTTP ${res.status} ${detail}`, res.status);
  }
  return (await res.json()) as AutoDevResponse;
}

async function search(
  query: ListingQuery,
  ctx: SourceContext,
  { maxCalls = autodev.callsPerWatch.max }: SearchOptions = {},
): Promise<SearchResult> {
  const listings = new Map<string, NormalizedListing>();
  let url: string | undefined = buildSearchUrl(query);
  let calls = 0;
  let total: number | null = null;

  while (url && calls < maxCalls) {
    let page: AutoDevResponse;
    try {
      page = await fetchPage(url, ctx);
    } catch (e) {
      // Out of calls partway through: keep the pages already fetched.
      if (e instanceof BudgetExceededError && calls > 0) break;
      throw e;
    }
    calls++;
    total ??= page.total ?? null;
    for (const raw of page.data ?? []) {
      const listing = normalize(raw);
      if (listing && !listings.has(listing.sourceListingId)) {
        listings.set(listing.sourceListingId, listing);
      }
    }
    url = page.data?.length === PAGE_SIZE ? page.links?.next : undefined;
  }

  return { listings: [...listings.values()], calls, truncated: !!url, total };
}

export const autodev: ListingSource = {
  kind: "listings",
  id: "autodev",
  label: "Auto.dev (U.S.)",
  monthlyCallLimit: 1000,
  callsPerWatch: { min: 1, max: 5 },
  apiKeyEnv: "AUTO_DEV_API_KEY",
  search,
};
