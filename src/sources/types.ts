import type { Currency, sellerTypes } from "@/db/schema";

/** What to search for: one watched car. Mileage is in km. */
export interface ListingQuery {
  make: string;
  model: string;
  yearMin: number;
  yearMax: number;
  maxKm?: number | null;
  trim?: string | null;
}

/** One car for sale, in the shape every listing source returns. */
export interface NormalizedListing {
  source: string;
  sourceListingId: string;
  vin: string | null;
  title: string;
  make: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  km: number | null;
  price: number | null;
  currency: Currency;
  sellerType: (typeof sellerTypes)[number];
  sellerName: string | null;
  location: string | null;
  country: string | null;
  url: string | null;
  /** When the source says the car was listed (ISO-8601), if it says. */
  listedAt: string | null;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * What an adapter needs from the outside world. Tests pass a fake `fetch`
 * that serves saved responses, so no real API calls are used.
 */
export interface SourceContext {
  fetch: FetchLike;
  /** Called before every real API call. Throws if the source is over budget. */
  beforeCall: () => void;
  apiKey: string;
}

export interface SearchOptions {
  /** Most pages to fetch for one query. Each page is one API call. */
  maxPages?: number;
}

export interface SearchResult {
  listings: NormalizedListing[];
  /** API calls this search used. */
  calls: number;
  /** True if more pages existed than maxPages allowed. */
  truncated: boolean;
  /** Total matches the source reports, when it reports one. */
  total: number | null;
}

export interface ListingSource {
  id: string;
  label: string;
  /** Free-plan calls per month. The call counter stops before this. */
  monthlyCallLimit: number;
  /** Name of the env var holding this source's key. */
  apiKeyEnv: string;
  search(
    query: ListingQuery,
    ctx: SourceContext,
    opts?: SearchOptions,
  ): Promise<SearchResult>;
}

export class SourceError extends Error {
  constructor(
    public readonly source: string,
    message: string,
    public readonly status?: number,
  ) {
    super(`[${source}] ${message}`);
    this.name = "SourceError";
  }
}

export const KM_PER_MILE = 1.609344;
export const milesToKm = (miles: number) => Math.round(miles * KM_PER_MILE);
export const kmToMiles = (km: number) => Math.floor(km / KM_PER_MILE);

/** Thrown by SourceContext.beforeCall when a source is out of free calls. */
export class BudgetExceededError extends Error {
  constructor(
    public readonly source: string,
    public readonly used: number,
    public readonly limit: number,
  ) {
    super(`${source} has used ${used} of ${limit} free calls this month`);
    this.name = "BudgetExceededError";
  }
}
