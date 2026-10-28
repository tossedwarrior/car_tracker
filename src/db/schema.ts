import {
  boolean,
  customType,
  double,
  index,
  int,
  mediumtext,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

// MySQL: GoDaddy's managed database on the live site, a local server on the
// Mac (scripts/mysql-local.sh).
//
// Dates are ISO-8601 strings (YYYY-MM-DD or full timestamps). Prices are whole
// units of `currency` (no cents). Mileage is always stored in km; adapters
// convert from miles. Text that's indexed or compared is varchar (MySQL can't
// index unlimited text); free text is text.

export const currencies = ["CAD", "USD"] as const;
export type Currency = (typeof currencies)[number];

const id = () => int("id").autoincrement().primaryKey();
const date = (name: string) => varchar(name, { length: 32 });
const createdAt = () =>
  date("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

/** Images up to MAX_IMAGE_BYTES; MySQL's plain blob stops at 64 KB. */
const longblob = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "longblob" });

/** The cars I care about. */
export const watchlist = mysqlTable("watchlist", {
  id: id(),
  make: varchar("make", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  yearMin: int("year_min").notNull(),
  yearMax: int("year_max").notNull(),
  maxKm: int("max_km"),
  trim: text("trim"),
  targetPrice: int("target_price"),
  targetCurrency: varchar("target_currency", { length: 16, enum: currencies })
    .notNull()
    .default("CAD"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  // When this car's listings were last refreshed (ISO timestamp).
  lastRefreshed: date("last_refreshed"),
  // When auction results were last pulled for this car (ISO timestamp).
  lastSoldPull: date("last_sold_pull"),
  createdAt: createdAt(),
});

export const listingStatuses = ["active", "gone"] as const;
export const sellerTypes = ["dealer", "private", "auction", "unknown"] as const;

/** One row per car for sale. */
export const listings = mysqlTable(
  "listings",
  {
    id: id(),
    source: varchar("source", { length: 32 }).notNull(),
    sourceListingId: varchar("source_listing_id", { length: 191 }).notNull(),
    vin: varchar("vin", { length: 64 }),
    watchId: int("watch_id")
      .notNull()
      .references(() => watchlist.id, { onDelete: "cascade" }),
    title: text("title"),
    make: varchar("make", { length: 100 }),
    model: varchar("model", { length: 100 }),
    year: int("year"),
    trim: text("trim"),
    km: int("km"),
    price: int("price"),
    currency: varchar("currency", { length: 16, enum: currencies }).notNull(),
    sellerType: varchar("seller_type", { length: 16, enum: sellerTypes })
      .notNull()
      .default("unknown"),
    sellerName: text("seller_name"),
    location: text("location"),
    country: varchar("country", { length: 8 }),
    url: text("url"),
    // Date the source says the car was listed, when it gives one; otherwise
    // days listed is counted from first_seen.
    listedAt: date("listed_at"),
    firstSeen: date("first_seen").notNull(),
    lastSeen: date("last_seen").notNull(),
    // Corrections I made by hand, because a source got them wrong (e.g. a USD
    // price at a Canadian dealer's U.S. branch). Refreshes keep these.
    currencyOverride: varchar("currency_override", { length: 16, enum: currencies }),
    locationOverride: text("location_override"),
    // Date this listing's source last completed a full search for its watch.
    // Stops a second run on the same day from counting a miss twice.
    lastChecked: date("last_checked"),
    // Refreshes (on different days) in a row the listing was missing from. At 3 it's "gone".
    missedChecks: int("missed_checks").notNull().default(0),
    status: varchar("status", { length: 16, enum: listingStatuses })
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
export const priceSnapshots = mysqlTable(
  "price_snapshots",
  {
    id: id(),
    listingId: int("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    price: int("price").notNull(),
    currency: varchar("currency", { length: 16, enum: currencies }).notNull(),
  },
  (t) => [index("price_snapshots_listing_idx").on(t.listingId, t.date)],
);

/** Auction results to compare asking prices against. */
export const soldResults = mysqlTable(
  "sold_results",
  {
    id: id(),
    source: varchar("source", { length: 32 }).notNull(),
    sourceResultId: varchar("source_result_id", { length: 191 }).notNull(),
    auctionHouse: text("auction_house"),
    title: text("title").notNull(),
    make: varchar("make", { length: 100 }),
    model: varchar("model", { length: 100 }),
    year: int("year"),
    km: int("km"),
    price: int("price").notNull(),
    currency: varchar("currency", { length: 8 }).notNull(),
    soldDate: date("sold_date").notNull(),
    url: text("url"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sold_results_source_id_uq").on(t.source, t.sourceResultId),
    index("sold_results_model_date_idx").on(t.make, t.model, t.soldDate),
  ],
);

/** Weekly market trend for each watched car. */
export const marketSnapshots = mysqlTable(
  "market_snapshots",
  {
    id: id(),
    watchId: int("watch_id")
      .notNull()
      .references(() => watchlist.id, { onDelete: "cascade" }),
    // Monday of the ISO week, YYYY-MM-DD.
    week: date("week").notNull(),
    medianAsk: int("median_ask"),
    medianSold: int("median_sold"),
    listingCount: int("listing_count").notNull(),
    medianDaysListed: double("median_days_listed"),
    currency: varchar("currency", { length: 16, enum: currencies }).notNull(),
  },
  (t) => [uniqueIndex("market_snapshots_watch_week_uq").on(t.watchId, t.week)],
);

export const alertTypes = ["new_listing", "price_drop", "under_target"] as const;

/** So the same alert isn't sent twice. */
export const alertsSent = mysqlTable(
  "alerts_sent",
  {
    id: id(),
    listingId: int("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 16, enum: alertTypes }).notNull(),
    // Price the alert fired at, so each new price drop alerts once.
    price: int("price").notNull().default(0),
    date: date("date").notNull(),
    seen: boolean("seen").notNull().default(false),
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
export const apiUsage = mysqlTable(
  "api_usage",
  {
    id: id(),
    source: varchar("source", { length: 32 }).notNull(),
    // YYYY-MM
    month: varchar("month", { length: 7 }).notNull(),
    calls: int("calls").notNull().default(0),
  },
  (t) => [uniqueIndex("api_usage_source_month_uq").on(t.source, t.month)],
);

/** Cached daily exchange rates for CAD/USD display. */
export const fxRates = mysqlTable(
  "fx_rates",
  {
    id: id(),
    date: date("date").notNull(),
    base: varchar("base", { length: 8 }).notNull(),
    quote: varchar("quote", { length: 8 }).notNull(),
    rate: double("rate").notNull(),
  },
  (t) => [uniqueIndex("fx_rates_date_pair_uq").on(t.date, t.base, t.quote)],
);

export const checkRunStatuses = ["running", "ok", "partial", "failed"] as const;

/** One row per refresh, for the settings page. */
export const checkRuns = mysqlTable("check_runs", {
  id: id(),
  startedAt: date("started_at").notNull(),
  finishedAt: date("finished_at"),
  status: varchar("status", { length: 16, enum: checkRunStatuses }).notNull().default("running"),
  // What happened, one line per watch and source.
  log: mediumtext("log").notNull().$defaultFn(() => ""),
});

export const imageKinds = ["logo", "photo"] as const;
export type ImageKind = (typeof imageKinds)[number];

/** A watched car's brand logo and car photo, stored with the data so they survive redeploys. */
export const watchImages = mysqlTable(
  "watch_images",
  {
    id: id(),
    watchId: int("watch_id")
      .notNull()
      .references(() => watchlist.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16, enum: imageKinds }).notNull(),
    contentType: varchar("content_type", { length: 64 }).notNull(),
    data: longblob("data").notNull(),
    fileName: text("file_name"),
    // Pixel size, so pages can reserve the right space before the image loads.
    width: int("width"),
    height: int("height"),
    // Car photos only: where the two wheels are, so they can turn (JSON,
    // see WheelSpec in src/lib/wheels.ts), and whether the car faces right.
    wheels: text("wheels"),
    facesRight: boolean("faces_right").notNull().default(false),
    updatedAt: date("updated_at").notNull(),
  },
  (t) => [uniqueIndex("watch_images_watch_kind_uq").on(t.watchId, t.kind)],
);
