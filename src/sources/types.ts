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
  /** Most API calls (pages) to use for one query. */
  maxCalls?: number;
}

export interface SearchResult {
  listings: NormalizedListing[];
  /** API calls this search used. */
  calls: number;
  /** True if more pages existed than maxCalls allowed. */
  truncated: boolean;
  /** Total matches the source reports, when it reports one. */
  total: number | null;
}

/** What every API source has, whatever it returns. */
export interface ApiSource {
  id: string;
  label: string;
  /** Free-plan calls per month. The call counter stops before this. */
  monthlyCallLimit: number;
  /** Name of the env var holding this source's key. */
  apiKeyEnv: string;
}

/** A source of cars for sale (asking prices). */
export interface ListingSource extends ApiSource {
  kind: "listings";
  /**
   * Calls one watched car uses per refresh: at least `min` (e.g. one per
   * city), at most `max` when there are more pages.
   */
  callsPerWatch: { min: number; max: number };
  search(
    query: ListingQuery,
    ctx: SourceContext,
    opts?: SearchOptions,
  ): Promise<SearchResult>;
}

/** One finished auction, in the shape every sold-results source returns. */
export interface NormalizedSoldResult {
  source: string;
  sourceResultId: string;
  /** Where it sold, e.g. "Bring a Trailer". */
  auctionHouse: string | null;
  title: string;
  make: string | null;
  model: string | null;
  year: number | null;
  km: number | null;
  price: number;
  /** ISO 4217, e.g. USD, CAD, GBP, EUR. */
  currency: string;
  /** YYYY-MM-DD */
  soldDate: string;
  url: string | null;
}

export interface SoldSearchResult {
  results: NormalizedSoldResult[];
  /** Metered API calls this search used. */
  calls: number;
  /** The source's own name for the model, when it differs from the watch's. */
  matchedModel: string | null;
}

/** A source of auction results (what cars actually sold for). */
export interface SoldSource extends ApiSource {
  kind: "sold";
  search(query: ListingQuery, ctx: SourceContext): Promise<SoldSearchResult>;
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
