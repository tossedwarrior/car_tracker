/** Most pages fetched for one watched car in one refresh (5 × 20 = 100 listings). */
export const MAX_PAGES_PER_WATCH = 5;

/** Local calendar date as YYYY-MM-DD. */
export const localDate = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/**
 * Pages each watched car gets in one refresh: up to MAX_PAGES_PER_WATCH, but
 * when few calls are left this month, shared evenly so every car still gets
 * at least its first page (newest listings first).
 */
export function pagesPerWatch({
  limit,
  used,
  watchCount,
}: {
  limit: number;
  used: number;
  watchCount: number;
}): number {
  const perWatch = Math.floor(Math.max(0, limit - used) / Math.max(1, watchCount));
  return Math.min(MAX_PAGES_PER_WATCH, Math.max(1, perWatch));
}
