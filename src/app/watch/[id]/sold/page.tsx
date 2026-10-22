import { notFound } from "next/navigation";
import { SoldPullButton } from "@/components/SoldPullButton";
import { updatedText, WatchHeader } from "@/components/WatchHeader";
import { getSoldResults, median } from "@/jobs/sold";
import { formatKm, formatPrice } from "@/lib/format";
import { getListings, getWatch } from "@/lib/watchlist";
import { hasApiKey, soldSources } from "@/sources";
import { getUsage } from "@/sources/usage";

export const dynamic = "force-dynamic";

/** Median price per currency, most common currency first. */
function mediansByCurrency(rows: Array<{ price: number | null; currency: string }>) {
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    if (r.price == null) continue;
    groups.set(r.currency, [...(groups.get(r.currency) ?? []), r.price]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([currency, prices]) => ({ currency, count: prices.length, median: median(prices)! }));
}

export default async function SoldPricesPage({ params }: { params: Promise<{ id: string }> }) {
  const watch = getWatch(Number((await params).id));
  if (!watch) notFound();

  const sold = getSoldResults(watch);
  const forSale = getListings(watch.id);
  const soldMedians = mediansByCurrency(sold);
  const askMedians = mediansByCurrency(forSale);
  const source = soldSources[0];
  const callsLeft = source.monthlyCallLimit - getUsage(source.id);
  const keySet = hasApiKey(source);

  return (
    <>
      <WatchHeader
        watch={watch}
        tab="sold"
        forSaleCount={forSale.length}
        soldCount={sold.length}
        updated={updatedText("Sold prices updated", watch.lastSoldPull, "Sold prices not pulled yet")}
        action={keySet && <SoldPullButton watchId={watch.id} callsLeft={callsLeft} />}
      />

      {!keySet && (
        <p className="notice">
          Add <code>{source.apiKeyEnv}</code> to <code>.env</code> to pull auction results from{" "}
          {source.label}.
        </p>
      )}

      {sold.length > 0 && (
        <div className="tiles">
          {soldMedians.map((m) => {
            const ask = askMedians.find((a) => a.currency === m.currency);
            const gap = ask ? (ask.median - m.median) / m.median : null;
            return (
              <div className="tile" key={m.currency}>
                <div className="muted small">Typical sale, {m.currency}</div>
                <div className="tile-value">{formatPrice(m.median, m.currency)}</div>
                <div className="muted small">
                  median of {m.count} sale{m.count === 1 ? "" : "s"}
                </div>
                {ask && gap != null && (
                  <div className="small">
                    Asking: {formatPrice(ask.median, ask.currency)}{" "}
                    <span className={gap > 0 ? "error" : "good"}>
                      ({gap > 0 ? "+" : ""}
                      {Math.round(gap * 100)}% vs sold)
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sold.length === 0 ? (
        <div className="empty">
          <p>No auction results yet.</p>
          <p className="muted">
            {keySet
              ? "Press Update sold prices to pull recent sales of this model."
              : "Auction results appear here once Old Cars Data is set up."}
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sold</th>
                <th className="num">Price</th>
                <th>Car</th>
                <th className="num">Mileage</th>
                <th>Auction</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sold.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">
                    {new Date(`${r.soldDate}T12:00:00`).toLocaleDateString("en-CA", {
                      dateStyle: "medium",
                    })}
                  </td>
                  <td className="num strong">{formatPrice(r.price, r.currency)}</td>
                  <td>{r.title}</td>
                  <td className="num">{formatKm(r.km)}</td>
                  <td>{r.auctionHouse ?? "—"}</td>
                  <td className="nowrap">
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noopener noreferrer">
                        View sale
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Sales of any {watch.make} {watch.model} from {watch.yearMin} to {watch.yearMax}, whatever
        the mileage or trim. Comparisons are only made within the same currency. The free Old Cars
        Data plan returns the latest 20 sales per update; {Math.max(0, callsLeft)} of{" "}
        {source.monthlyCallLimit} updates left this month.
      </p>
    </>
  );
}
