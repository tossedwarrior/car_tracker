import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Dates are ISO-8601 strings (YYYY-MM-DD or full timestamps). Prices are whole
// units of `currency` (no cents). Mileage is always stored in km; adapters
// convert from miles.

export const currencies = ["CAD", "USD"] as const;
export type Currency = (typeof currencies)[number];

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/** The cars I care about. */
export const watchlist = sqliteTable("watchlist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  make: text("make").notNull(),
  model: text("model").notNull(),
  yearMin: integer("year_min").notNull(),
  yearMax: integer("year_max").notNull(),
  maxKm: integer("max_km"),
  trim: text("trim"),
  targetPrice: integer("target_price"),
  targetCurrency: text("target_currency", { enum: currencies })
    .notNull()
    .default("CAD"),
  notes: text("notes"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // When this car's listings were last refreshed (ISO timestamp).
  lastRefreshed: text("last_refreshed"),
  createdAt: createdAt(),
});

export const listingStatuses = ["active", "gone"] as const;
export const sellerTypes = ["dealer", "private", "auction", "unknown"] as const;

/** One row per car for sale. */
export const listings = sqliteTable(
  "listings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    sourceListingId: text("source_listing_id").notNull(),
    vin: text("vin"),
    watchId: integer("watch_id")
      .notNull()
      .references(() => watchlist.id, { onDelete: "cascade" }),
    title: text("title"),
    make: text("make"),
    model: text("model"),
    year: integer("year"),
    trim: text("trim"),
    km: integer("km"),
    price: integer("price"),
    currency: text("currency", { enum: currencies }).notNull(),
    sellerType: text("seller_type", { enum: sellerTypes })
      .notNull()
      .default("unknown"),
    sellerName: text("seller_name"),
    location: text("location"),
    country: text("country"),
    url: text("url"),
    // Date the source says the car was listed, when it gives one; otherwise
    // days listed is counted from first_seen.
    listedAt: text("listed_at"),
    firstSeen: text("first_seen").notNull(),
    lastSeen: text("last_seen").notNull(),
    // Date this listing's source last completed a full search for its watch.
    // Stops a second run on the same day from counting a miss twice.
    lastChecked: text("last_checked"),
    // Refreshes (on different days) in a row the listing was missing from. At 3 it's "gone".
    missedChecks: integer("missed_checks").notNull().default(0),
    status: text("status", { enum: listingStatuses })
      .notNull()
      .default("active"),
  },
  (t) => [
    uniqueIndex("listings_watch_source_id_uq").on(t.watchId, t.source, t.sourceListingId),
    index("listings_watch_vin_idx").on(t.watchId, t.vin),
    index("listings_watch_status_idx").on(t.watchId, t.status),
  ],
);

/** Saved each time a listing's price changes. */
export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    price: integer("price").notNull(),
    currency: text("currency", { enum: currencies }).notNull(),
  },
  (t) => [index("price_snapshots_listing_idx").on(t.listingId, t.date)],
);

/** Auction results to compare asking prices against. */
export const soldResults = sqliteTable(
  "sold_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    sourceResultId: text("source_result_id").notNull(),
    auctionHouse: text("auction_house"),
    title: text("title").notNull(),
    make: text("make"),
    model: text("model"),
    year: integer("year"),
    km: integer("km"),
    price: integer("price").notNull(),
    currency: text("currency").notNull(),
    soldDate: text("sold_date").notNull(),
    url: text("url"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sold_results_source_id_uq").on(t.source, t.sourceResultId),
    index("sold_results_model_date_idx").on(t.make, t.model, t.soldDate),
  ],
);

/** Weekly market trend for each watched car. */
export const marketSnapshots = sqliteTable(
  "market_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    watchId: integer("watch_id")
      .notNull()
      .references(() => watchlist.id, { onDelete: "cascade" }),
    // Monday of the ISO week, YYYY-MM-DD.
    week: text("week").notNull(),
    medianAsk: integer("median_ask"),
    medianSold: integer("median_sold"),
    listingCount: integer("listing_count").notNull(),
    medianDaysListed: real("median_days_listed"),
    currency: text("currency", { enum: currencies }).notNull(),
  },
  (t) => [uniqueIndex("market_snapshots_watch_week_uq").on(t.watchId, t.week)],
);

export const alertTypes = ["new_listing", "price_drop", "under_target"] as const;

/** So the same alert isn't sent twice. */
export const alertsSent = sqliteTable(
  "alerts_sent",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    type: text("type", { enum: alertTypes }).notNull(),
    // Price the alert fired at, so each new price drop alerts once.
    price: integer("price").notNull().default(0),
    date: text("date").notNull(),
    seen: integer("seen", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    uniqueIndex("alerts_sent_listing_type_price_uq").on(
      t.listingId,
      t.type,
      t.price,
    ),
  ],
);

/** Running count of API calls per source per month, to stay on free limits. */
export const apiUsage = sqliteTable(
  "api_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    source: text("source").notNull(),
    // YYYY-MM
    month: text("month").notNull(),
    calls: integer("calls").notNull().default(0),
  },
  (t) => [uniqueIndex("api_usage_source_month_uq").on(t.source, t.month)],
);

/** Cached daily exchange rates for CAD/USD display. */
export const fxRates = sqliteTable(
  "fx_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    rate: real("rate").notNull(),
  },
  (t) => [uniqueIndex("fx_rates_date_pair_uq").on(t.date, t.base, t.quote)],
);

export const checkRunStatuses = ["running", "ok", "partial", "failed"] as const;

/** One row per refresh, for the settings page. */
export const checkRuns = sqliteTable("check_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status", { enum: checkRunStatuses }).notNull().default("running"),
  // What happened, one line per watch and source.
  log: text("log").notNull().default(""),
});
