import type { Currency } from "@/db/schema";
import { formatPrice } from "./format";
import type { Rates } from "./fx";

export const DISPLAY_COOKIE = "display_currency";
export const parseDisplayCurrency = (v: string | undefined): Currency => (v === "USD" ? "USD" : "CAD");

export interface Shown {
  /** In the display currency, or the original if it can't be converted. */
  main: string;
  /** The original amount, when it differs from `main`'s currency. */
  original: string | null;
  /** Converted number, for comparing and sorting. */
  value: number | null;
}

/**
 * Show an amount in the display currency, converted at the rate on `date`
 * (a sale date), or the latest rate for current asking prices.
 */
export function showMoney(
  rates: Rates,
  display: Currency,
  amount: number | null,
  currency: string,
  date?: string | null,
): Shown {
  if (amount == null) return { main: "No price", original: null, value: null };
  if (currency === display) return { main: formatPrice(amount, currency), original: null, value: amount };
  const converted = rates.convert(amount, currency, display, date);
  if (converted == null) return { main: formatPrice(amount, currency), original: null, value: null };
  return {
    main: formatPrice(converted, display),
    original: formatPrice(amount, currency),
    value: converted,
  };
}

/** True when the listing's price, converted at the latest rate, is at or under the watch's target. */
export function isUnderTarget(
  rates: Rates,
  listing: { price: number | null; currency: string },
  watch: { targetPrice: number | null; targetCurrency: string },
): boolean {
  if (watch.targetPrice == null || listing.price == null) return false;
  const price = rates.convert(listing.price, listing.currency, watch.targetCurrency);
  return price != null && price <= watch.targetPrice;
}
