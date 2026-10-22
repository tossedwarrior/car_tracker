import Link from "next/link";
import { formatKm, formatPrice, formatYears, timeAgo, watchTitle } from "@/lib/format";
import type { Watch } from "@/lib/watchlist";

/** Title, criteria and the For sale / Sold / Market tabs shared by a watched car's pages. */
export function WatchHeader({
  watch,
  tab,
  forSaleCount,
  soldCount,
  updated,
  action,
}: {
  watch: Watch;
  tab: "listings" | "sold" | "market";
  forSaleCount: number;
  soldCount: number;
  /** e.g. "Refreshed 5 min ago" */
  updated: string;
  action?: React.ReactNode;
}) {
  return (
    <>
      <p className="crumb">
        <Link href="/">Watchlist</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{watchTitle(watch)}</h1>
          <p className="muted">{criteria(watch)}</p>
          <p className="muted small">{updated}</p>
        </div>
        <div className="head-actions">
          {action}
          <Link href={`/watch/${watch.id}/edit`} className="button">
            Edit
          </Link>
        </div>
      </div>
      {watch.notes && <p className="notes">{watch.notes}</p>}

      <nav className="tabs" aria-label="Views">
        <Link href={`/watch/${watch.id}`} aria-current={tab === "listings" ? "page" : undefined}>
          For sale <span className="count">{forSaleCount}</span>
        </Link>
        <Link href={`/watch/${watch.id}/sold`} aria-current={tab === "sold" ? "page" : undefined}>
          Sold at auction <span className="count">{soldCount}</span>
        </Link>
        <Link href={`/watch/${watch.id}/market`} aria-current={tab === "market" ? "page" : undefined}>
          Market trend
        </Link>
      </nav>
    </>
  );
}

export function updatedText(label: string, iso: string | null, never: string) {
  return iso ? `${label} ${timeAgo(iso)}` : never;
}

function criteria(w: Watch) {
  return [
    formatYears(w.yearMin, w.yearMax),
    w.maxKm ? `under ${formatKm(w.maxKm)}` : null,
    w.targetPrice ? `target ${formatPrice(w.targetPrice, w.targetCurrency)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
