import Link from "next/link";
import { notFound } from "next/navigation";
import { RefreshButton } from "@/components/RefreshButton";
import { maxRefreshCalls } from "@/jobs/refresh";
import { daysSince, formatKm, formatPrice, formatYears, timeAgo, watchTitle } from "@/lib/format";
import {
  countGone,
  getListings,
  getWatch,
  listingSorts,
  type Listing,
  type ListingSort,
  type Watch,
} from "@/lib/watchlist";

export const dynamic = "force-dynamic";

const sellerLabels: Record<Listing["sellerType"], string> = {
  dealer: "Dealer",
  private: "Private",
  auction: "Auction",
  unknown: "",
};

export default async function WatchListingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: string; gone?: string }>;
}) {
  const watch = getWatch(Number((await params).id));
  if (!watch) notFound();

  const query = await searchParams;
  const sort: ListingSort = query.sort && query.sort in listingSorts ? (query.sort as ListingSort) : "price";
  const includeGone = query.gone === "1";
  const rows = getListings(watch.id, { sort, includeGone });
  const goneCount = countGone(watch.id);

  const href = (next: { sort?: ListingSort; gone?: boolean }) => {
    const p = new URLSearchParams();
    const s = next.sort ?? sort;
    if (s !== "price") p.set("sort", s);
    if (next.gone ?? includeGone) p.set("gone", "1");
    const qs = p.toString();
    return `/watch/${watch.id}${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <p className="crumb">
        <Link href="/">Watchlist</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{watchTitle(watch)}</h1>
          <p className="muted">{criteria(watch)}</p>
          <p className="muted small">
            {watch.lastRefreshed ? `Refreshed ${timeAgo(watch.lastRefreshed)}` : "Not refreshed yet"}
          </p>
        </div>
        <div className="head-actions">
          {watch.active && <RefreshButton watchId={watch.id} maxCalls={maxRefreshCalls(1)} />}
          <Link href={`/watch/${watch.id}/edit`} className="button">
            Edit
          </Link>
        </div>
      </div>
      {watch.notes && <p className="notes">{watch.notes}</p>}

      <div className="toolbar">
        <nav className="segmented" aria-label="Sort listings">
          {(Object.keys(listingSorts) as ListingSort[]).map((key) => (
            <Link key={key} href={href({ sort: key })} aria-current={key === sort ? "true" : undefined}>
              {listingSorts[key].label}
            </Link>
          ))}
        </nav>
        {goneCount > 0 && (
          <Link href={href({ gone: !includeGone })} className="muted">
            {includeGone ? "Hide" : "Show"} {goneCount} gone
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <p>No listings yet.</p>
          <p className="muted">Press Refresh to search for matching cars.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="listings">
            <thead>
              <tr>
                <th className="num">Price</th>
                <th>Car</th>
                <th className="num">Mileage</th>
                <th>Location</th>
                <th>Seller</th>
                <th className="num">Days listed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <ListingRow key={l.id} listing={l} watch={watch} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <p className="muted small">
          {rows.length} {includeGone ? "listings" : "for sale"}
        </p>
      )}
    </>
  );
}

function ListingRow({ listing: l, watch }: { listing: Listing; watch: Watch }) {
  const days = daysSince(l.listedAt ?? l.firstSeen);
  // Until currency conversion lands, only compare prices in the same currency.
  const underTarget =
    watch.targetPrice != null &&
    l.price != null &&
    l.currency === watch.targetCurrency &&
    l.price <= watch.targetPrice;
  const gone = l.status === "gone";

  return (
    <tr className={gone ? "gone" : undefined}>
      <td className="num strong">
        {formatPrice(l.price, l.currency)}
        {underTarget && <span className="badge good">Under target</span>}
        {gone && <span className="badge">Gone</span>}
      </td>
      <td>
        {l.year} {l.trim ?? l.model}
        {l.vin && <div className="muted small mono">{l.vin}</div>}
      </td>
      <td className="num">{formatKm(l.km)}</td>
      <td>{l.location ?? "—"}</td>
      <td>
        {l.sellerName ?? "—"}
        {sellerLabels[l.sellerType] && <div className="muted small">{sellerLabels[l.sellerType]}</div>}
      </td>
      <td className="num">{days}</td>
      <td>
        {l.url && (
          <a href={l.url} target="_blank" rel="noopener noreferrer">
            View ad
          </a>
        )}
      </td>
    </tr>
  );
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
