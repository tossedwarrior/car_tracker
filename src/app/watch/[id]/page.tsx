import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
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
  const watch = await getWatch(Number((await params).id));
  if (!watch) notFound();

  const query = await searchParams;
  const sort: ListingSort = query.sort && query.sort in listingSorts ? (query.sort as ListingSort) : "price";
  const includeGone = query.gone === "1";
  const display = await getDisplayCurrency();
  const rates = await Rates.load();
  let rows = await getListings(watch.id, { sort, includeGone });
  // Prices come in CAD and USD, so compare them converted.
  if (sort === "price" || sort === "price-desc") {
    rows = sortByPrice(rows, rates, sort === "price" ? "asc" : "desc");
  }
  const goneCount = await countGone(watch.id);
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
        soldCount={(await getSoldResults(watch)).length}
        updated={updatedText("Listings refreshed", watch.lastRefreshed, "Listings not refreshed yet")}
        action={watch.active && <RefreshButton watchId={watch.id} maxCalls={await maxRefreshCalls(1)} />}
      />

      <div className="toolbar">
        {goneCount > 0 && (
          <Link href={href({ gone: !includeGone })} className="muted">
            {includeGone ? "Hide" : "Show"} {goneCount} gone
          </Link>
        )}
        <SortMenu
          current={sort}
          options={(Object.keys(listingSorts) as ListingSort[]).map((key) => ({
            value: key,
            label: listingSorts[key].label,
            href: href({ sort: key }),
          }))}
        />
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <p>No listings yet.</p>
          <p className="muted">Press Refresh to search for matching cars.</p>
        </div>
      ) : (
        <div className="listing-table" role="table" aria-label="Cars for sale">
          <div className="listing-row head" role="row">
            <div role="columnheader">Price</div>
            <div role="columnheader">Car</div>
            <div role="columnheader">Mileage</div>
            <div role="columnheader">Location</div>
            <div role="columnheader">Seller</div>
            <div role="columnheader">Days listed</div>
            <div role="columnheader">
              <span className="sr-only">Fix</span>
            </div>
          </div>
          {rows.map((l) => (
            <ListingRow key={l.id} listing={l} watch={watch} rates={rates} display={display} />
          ))}
        </div>
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
  const shown = showMoney(rates, display, l.price, l.currency);
  const car = [l.year, l.trim && l.trim !== "Base" ? l.trim : l.model].filter(Boolean).join(" ");
  const corrected = !!(l.currencyOverride || l.locationOverride);

  return (
    <div className={`listing-row${gone ? " gone" : ""}`} role="row">
      <div className="cell-price" role="cell">
        {shown.main}
        {shown.original && <span className="sub">{shown.original}</span>}
        {underTarget && <span className="tag good">Under target</span>}
        {gone && <span className="tag">Gone</span>}
      </div>
      <div className="cell-car" role="cell">
        {l.url ? (
          <a className="car-link" href={l.url} target="_blank" rel="noopener noreferrer">
            {car}
          </a>
        ) : (
          car
        )}
        {l.vin && <span className="sub">{l.vin}</span>}
      </div>
      <div className="cell-meta" role="cell">
        <span className="meta-label">Mileage</span>
        <span>{formatKm(l.km)}</span>
      </div>
      <div className="cell-meta" role="cell">
        <span className="meta-label">Location</span>
        <span>{l.location ?? "—"}</span>
      </div>
      <div className="cell-meta" role="cell">
        <span className="meta-label">Seller</span>
        <span>
          {l.sellerName ?? "—"}
          {sellerLabels[l.sellerType] && <span className="sub">{sellerLabels[l.sellerType]}</span>}
        </span>
      </div>
      <div className="cell-meta" role="cell">
        <span className="meta-label">Days listed</span>
        <span>{days}</span>
      </div>
      <div className="cell-edit" role="cell">
        <Link
          href={`/listing/${l.id}/fix`}
          className="icon-link"
          title={corrected ? "Corrected by hand. Change the correction" : "Fix this listing's currency or location"}
          aria-label={corrected ? "Change correction" : "Fix listing"}
        >
          <Icon name="edit" />
        </Link>
      </div>
    </div>
  );
}
