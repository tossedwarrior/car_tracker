/** Most pages fetched for one watched car in one run, however much budget is left. */
export const MAX_PAGES_PER_WATCH = 5;

/** Local calendar date as YYYY-MM-DD. */
export const localDate = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/** Whole days since 1970-01-01 for a local date, for every-N-days schedules. */
export const dayNumber = (now = new Date()) =>
  Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);

export const isDue = (everyDays: number, now = new Date()) => dayNumber(now) % everyDays === 0;

/**
 * Runs of a source left this month, including today's. A source that runs
 * every 3 days with 9 days left has 3 runs left.
 */
export function runsLeftInMonth(everyDays: number, now = new Date()): number {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let runs = 0;
  for (let day = now.getDate(); day <= daysInMonth; day++) {
    if (isDue(everyDays, new Date(now.getFullYear(), now.getMonth(), day))) runs++;
  }
  return Math.max(1, runs);
}

/**
 * Pages each watched car gets in this run: the calls left this month, spread
 * evenly over the runs left and the watched cars. Always at least 1, so new
 * listings (fetched newest first) are never missed; at most MAX_PAGES_PER_WATCH.
 */
export function pagesPerWatch({
  limit,
  used,
  watchCount,
  everyDays,
  now = new Date(),
}: {
  limit: number;
  used: number;
  watchCount: number;
  everyDays: number;
  now?: Date;
}): number {
  const perRun = Math.floor(Math.max(0, limit - used) / runsLeftInMonth(everyDays, now));
  const perWatch = Math.floor(perRun / Math.max(1, watchCount));
  return Math.min(MAX_PAGES_PER_WATCH, Math.max(1, perWatch));
}
