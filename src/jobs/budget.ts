/** Local calendar date as YYYY-MM-DD. */
export const localDate = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/**
 * Calls each watched car gets from one source in one refresh: up to the
 * source's `max`, but when few calls are left this month, shared evenly so
 * every car still gets the source's `min` (its newest listings).
 */
export function callsPerWatch({
  min,
  max,
  limit,
  used,
  watchCount,
}: {
  min: number;
  max: number;
  limit: number;
  used: number;
  watchCount: number;
}): number {
  const perWatch = Math.floor(Math.max(0, limit - used) / Math.max(1, watchCount));
  return Math.min(max, Math.max(min, perWatch));
}
