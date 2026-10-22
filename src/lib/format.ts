import type { Currency } from "@/db/schema";

const moneyFormats: Record<string, Intl.NumberFormat> = {};

/** 360594, "USD" → "US$360,594"; CAD → "CA$…". */
export function formatPrice(price: number | null, currency: Currency | string): string {
  if (price == null) return "No price";
  moneyFormats[currency] ??= new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    maximumFractionDigits: 0,
  });
  // en-CA renders USD as "US$" and CAD as "$"; spell CAD out to avoid mix-ups.
  const s = moneyFormats[currency].format(price);
  return currency === "CAD" ? `CA${s}` : s;
}

export function formatKm(km: number | null): string {
  return km == null ? "—" : `${km.toLocaleString("en-CA")} km`;
}

/** Whole days from an ISO date to now. */
export function daysSince(iso: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

export function formatYears(min: number, max: number): string {
  return min === max ? String(min) : `${min}–${max}`;
}

export function watchTitle(w: { make: string; model: string; trim?: string | null }) {
  return [w.make, w.model, w.trim].filter(Boolean).join(" ");
}
