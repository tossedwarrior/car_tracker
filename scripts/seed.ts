// Add the example watch from SPEC.md and load the saved Auto.dev response
// (src/sources/__fixtures__/autodev/live-2026-10-22.json) as its listings.
// Uses no API calls. Safe to run more than once.
//
//   npm run db:seed
import "dotenv/config";
import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, priceSnapshots, watchlist } from "@/db/schema";
import { normalize } from "@/sources/autodev";

const FIXTURE = "src/sources/__fixtures__/autodev/live-2026-10-22.json";
const SEEN = "2026-10-22";

const example = {
  make: "Ferrari",
  model: "458 Italia",
  yearMin: 2011,
  yearMax: 2015,
  maxKm: 40000,
  targetPrice: 250000,
  targetCurrency: "CAD" as const,
};

let watch = db
  .select()
  .from(watchlist)
  .where(and(eq(watchlist.make, example.make), eq(watchlist.model, example.model)))
  .get();
watch ??= db.insert(watchlist).values(example).returning().get();

const raw = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as { data: Parameters<typeof normalize>[0][] };
let added = 0;
for (const listing of raw.data.map(normalize)) {
  if (!listing) continue;
  const row = db
    .insert(listings)
    .values({ ...listing, watchId: watch.id, firstSeen: SEEN, lastSeen: SEEN })
    .onConflictDoNothing()
    .returning({ id: listings.id, price: listings.price, currency: listings.currency })
    .get();
  if (!row) continue;
  added++;
  if (row.price != null) {
    db.insert(priceSnapshots).values({ listingId: row.id, date: SEEN, price: row.price, currency: row.currency }).run();
  }
}

console.log(`Watch #${watch.id} ${watch.make} ${watch.model}: added ${added} listings.`);
