import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { fxRates } from "@/db/schema";
import type { FetchLike } from "@/sources/types";

// Exchange rates from the Bank of Canada Valet API: free, no key, daily
// averages in Canadian dollars per unit of each currency.
// https://www.bankofcanada.ca/valet/docs

const VALET = "https://www.bankofcanada.ca/valet/observations";
/** Currencies converted through CAD. Auctions sell in more than CAD/USD. */
export const FX_CURRENCIES = ["USD", "EUR", "GBP", "CHF", "JPY", "AUD"] as const;
/** How far back to load on first sync, to cover two years of auction results. */
const HISTORY_DAYS = 2 * 365 + 31;

interface ValetResponse {
  observations: Array<{ d: string } & Record<string, { v: string } | string>>;
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Fetch any rates newer than the latest one saved (or two years' worth on
 * the first run). Free and unmetered; called before refreshes and sold pulls.
 * Returns the number of rates saved.
 */
export async function syncRates({
  fetch: fetchFn = (url, init) => fetch(url, init),
  now = new Date(),
}: { fetch?: FetchLike; now?: Date } = {}): Promise<number> {
  const latest = db.select({ date: fxRates.date }).from(fxRates).orderBy(desc(fxRates.date)).get();
  const today = isoDate(now);
  if (latest?.date === today) return 0;

  const start = latest
    ? latest.date
    : isoDate(new Date(now.getTime() - HISTORY_DAYS * 86_400_000));
  const series = FX_CURRENCIES.map((c) => `FX${c}CAD`).join(",");
  const res = await fetchFn(`${VALET}/${series}/json?start_date=${start}&end_date=${today}`);
  if (!res.ok) throw new Error(`Bank of Canada rates: HTTP ${res.status}`);
  const body = (await res.json()) as ValetResponse;

  const rows = body.observations.flatMap((o) =>
    FX_CURRENCIES.flatMap((base) => {
      const cell = o[`FX${base}CAD`];
      const rate = typeof cell === "object" ? Number(cell.v) : NaN;
      return rate > 0 ? [{ date: o.d, base, quote: "CAD", rate }] : [];
    }),
  );
  for (let i = 0; i < rows.length; i += 500) {
    db.insert(fxRates).values(rows.slice(i, i + 500)).onConflictDoNothing().run();
  }
  return rows.length;
}

/** Saved rates, for converting any amount between any two known currencies. */
export class Rates {
  // currency → [date, CAD per unit], oldest first
  private readonly byCurrency = new Map<string, Array<[string, number]>>();

  constructor(rows: Array<{ date: string; base: string; rate: number }>) {
    for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
      const list = this.byCurrency.get(r.base) ?? [];
      list.push([r.date, r.rate]);
      this.byCurrency.set(r.base, list);
    }
  }

  static load(): Rates {
    return new Rates(db.select().from(fxRates).where(eq(fxRates.quote, "CAD")).all());
  }

  get latestDate(): string | null {
    const usd = this.byCurrency.get("USD");
    return usd?.at(-1)?.[0] ?? null;
  }

  /**
   * CAD per unit of `currency` on `date` (YYYY-MM-DD): that day's rate, else
   * the last one before it (weekends, holidays), else the earliest saved.
   * Without a date, the latest. Null if the currency has no rates.
   */
  cadPer(currency: string, date?: string | null): number | null {
    if (currency === "CAD") return 1;
    const list = this.byCurrency.get(currency);
    if (!list?.length) return null;
    if (!date) return list[list.length - 1][1];
    let lo = 0;
    let hi = list.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid][0] <= date) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return list[Math.max(0, found)][1];
  }

  /** Convert at the rate on `date` (or the latest). Null if a rate is missing. */
  convert(amount: number, from: string, to: string, date?: string | null): number | null {
    if (from === to) return amount;
    const fromCad = this.cadPer(from, date?.slice(0, 10));
    const toCad = this.cadPer(to, date?.slice(0, 10));
    if (fromCad == null || toCad == null) return null;
    return Math.round((amount * fromCad) / toCad);
  }
}
