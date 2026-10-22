import Link from "next/link";
import { notFound } from "next/navigation";
import { Money } from "@/components/Money";
import { RefreshButton } from "@/components/RefreshButton";
import { SortMenu } from "@/components/SortMenu";
import { updatedText, WatchHeader } from "@/components/WatchHeader";
import { maxRefreshCalls } from "@/jobs/refresh";
import { getSoldResults } from "@/jobs/sold";
import type { Currency } from "@/db/schema";
import { getDisplayCurrency } from "@/lib/display-currency";
import { daysSince, formatKm } from "@/lib/format";
import { Rates } from "@/lib/fx";
import { isUnderTarget, showMoney } from "@/lib/money";
import {
  countGone,
  getListings,
  getWatch,
  listingSorts,
  sortByPrice,
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
  const display = await getDisplayCurrency();
  const rates = Rates.load();
  let rows = getListings(watch.id, { sort, includeGone });
  // Prices come in CAD and USD, so compare them converted.
  if (sort === "price" || sort === "price-desc") {
    rows = sortByPrice(rows, rates, sort === "price" ? "asc" : "desc");
  }
  const goneCount = countGone(watch.id);
  const forSaleCount = includeGone ? rows.length - goneCount : rows.length;

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
      <WatchHeader
        watch={watch}
        tab="listings"
        forSaleCount={forSaleCount}
        soldCount={getSoldResults(watch).length}
        updated={updatedText("Listings refreshed", watch.lastRefreshed, "Listings not refreshed yet")}
        action={watch.active && <RefreshButton watchId={watch.id} maxCalls={maxRefreshCalls(1)} />}
      />

      <div className="toolbar">
        <SortMenu
          current={sort}
          options={(Object.keys(listingSorts) as ListingSort[]).map((key) => ({
            value: key,
            label: listingSorts[key].label,
            href: href({ sort: key }),
          }))}
        />
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
                <ListingRow key={l.id} listing={l} watch={watch} rates={rates} display={display} />
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

function ListingRow({
  listing: l,
  watch,
  rates,
  display,
}: {
  listing: Listing;
  watch: Watch;
  rates: Rates;
  display: Currency;
}) {
  const days = daysSince(l.listedAt ?? l.firstSeen);
  const underTarget = l.status === "active" && isUnderTarget(rates, l, watch);
  const gone = l.status === "gone";

  return (
    <tr className={gone ? "gone" : undefined}>
      <td className="num">
        <Money shown={showMoney(rates, display, l.price, l.currency)} strong />
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
        <div className="small">
          <Link href={`/listing/${l.id}/fix`} className="muted">
            {l.currencyOverride || l.locationOverride ? "Corrected" : "Fix"}
          </Link>
        </div>
      </td>
    </tr>
  );
}

