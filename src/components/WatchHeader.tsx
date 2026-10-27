import Link from "next/link";
import { formatKm, formatPrice, formatYears, timeAgo, watchTitle } from "@/lib/format";
import type { Watch } from "@/lib/watchlist";
import { Icon } from "./Icon";

/**
 * A watched car's header and For sale / Sold / Market tabs (Figma 16:9–16:36):
 * back link, year range, name, actions, last refresh, personal notes.
 */
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
  /** e.g. "Listings refreshed 1 day ago" */
  updated: string;
  action?: React.ReactNode;
}) {
  const criteria = [
    watch.maxKm ? `under ${formatKm(watch.maxKm)}` : null,
    watch.targetPrice ? `target ${formatPrice(watch.targetPrice, watch.targetCurrency)}` : null,
  ].filter(Boolean);

  return (
    <>
      <div className="car-head">
        <Link href="/" className="text-action car-back">
          <Icon name="arrow-back" />
          <span>Back to watchlist</span>
        </Link>

        <div>
          <p className="car-years">
            {formatYears(watch.yearMin, watch.yearMax).replace("–", " - ")}
            {criteria.length > 0 && <span className="small"> · {criteria.join(" · ")}</span>}
          </p>
          <h1>{watchTitle(watch)}</h1>
        </div>

        <div className="car-actions">
          {action}
          <Link href={`/watch/${watch.id}/edit`} className="text-action">
            <Icon name="edit" />
            <span>Edit</span>
          </Link>
        </div>

        <p className="car-refreshed">{updated}</p>

        {watch.notes && (
          <div className="car-notes">
            <p className="label">Personal notes</p>
            <p>{watch.notes}</p>
          </div>
        )}
      </div>

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
