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

/** "just now", "5 min ago", "3 hours ago", "2 days ago". */
export function timeAgo(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
