// Run one search against a real listing source and print what comes back.
// Uses real API calls (one per page), counted against the monthly limit.
//
//   npm run check-source -- autodev --make Ferrari --model "458 Italia" --years 2011-2015 --max-km 40000
//   npm run check-source -- autodev ... --pages 2 --save
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { getSource, liveContext } from "@/sources";
import { getUsage } from "@/sources/usage";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    make: { type: "string" },
    model: { type: "string" },
    years: { type: "string" },
    "max-km": { type: "string" },
    trim: { type: "string" },
    pages: { type: "string", default: "1" },
    save: { type: "boolean", default: false },
  },
});

const source = getSource(positionals[0] ?? "autodev");
if (!values.make || !values.model || !values.years) {
  console.error("Need --make, --model and --years (e.g. 2011-2015)");
  process.exit(1);
}
const [yearMin, yearMax = yearMin] = values.years.split("-").map(Number);
const query = {
  make: values.make,
  model: values.model,
  yearMin,
  yearMax,
  maxKm: values["max-km"] ? Number(values["max-km"]) : null,
  trim: values.trim ?? null,
};

const ctx = liveContext(source);
const savedPages: unknown[] = [];
if (values.save) {
  const realFetch = ctx.fetch;
  ctx.fetch = async (url, init) => {
    const res = await realFetch(url, init);
    const body = await res.clone().json().catch(() => null);
    // Auto.dev echoes the account's name, email, IP and location in `user`.
    if (body && typeof body === "object") delete (body as Record<string, unknown>).user;
    savedPages.push(body);
    return res;
  };
}

const before = getUsage(source.id);
const result = await source.search(query, ctx, { maxPages: Number(values.pages) });

console.table(
  result.listings.map((l) => ({
    title: l.title,
    price: l.price,
    km: l.km,
    seller: l.sellerName,
    location: l.location,
    listed: l.listedAt?.slice(0, 10),
  })),
);
console.log(
  `${result.listings.length} listings, ${result.total ?? "?"} total reported, ` +
    `${result.calls} call(s)${result.truncated ? ", more pages not fetched" : ""}.`,
);
console.log(`${source.label}: ${before} → ${getUsage(source.id)} of ${source.monthlyCallLimit} calls this month.`);

if (values.save) {
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join("src/sources/__fixtures__", source.id, `live-${date}.json`);
  fs.writeFileSync(file, JSON.stringify(savedPages.length === 1 ? savedPages[0] : savedPages, null, 2) + "\n");
  console.log(`Saved raw response to ${file}`);
}
