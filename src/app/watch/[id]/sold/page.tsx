import { notFound } from "next/navigation";
import { Money } from "@/components/Money";
import { SoldPullButton } from "@/components/SoldPullButton";
import { updatedText, WatchHeader } from "@/components/WatchHeader";
import { getSoldResults, median } from "@/jobs/sold";
import { getDisplayCurrency } from "@/lib/display-currency";
import { formatKm, formatPrice } from "@/lib/format";
import { Rates } from "@/lib/fx";
import { showMoney } from "@/lib/money";
import { getListings, getWatch } from "@/lib/watchlist";
import { hasApiKey, soldSources } from "@/sources";
import { getUsage } from "@/sources/usage";

export const dynamic = "force-dynamic";

export default async function SoldPricesPage({ params }: { params: Promise<{ id: string }> }) {
  const watch = await getWatch(Number((await params).id));
  if (!watch) notFound();

  const display = await getDisplayCurrency();
  const rates = await Rates.load();
  const sold = (await getSoldResults(watch)).map((r) => ({
    ...r,
    // Each sale converted at the rate on the day it sold.
    shown: showMoney(rates, display, r.price, r.currency, r.soldDate),
  }));
  const forSale = await getListings(watch.id);

  const values = (xs: Array<number | null>) => xs.filter((v): v is number => v != null);
  const typicalSale = median(values(sold.map((r) => r.shown.value)));
  const typicalAsk = median(
    values(forSale.map((l) => showMoney(rates, display, l.price, l.currency).value)),
  );
  const pricedAsks = forSale.filter((l) => l.price != null).length;
  const gap = typicalSale && typicalAsk ? (typicalAsk - typicalSale) / typicalSale : null;

  const source = soldSources[0];
  const callsLeft = source.monthlyCallLimit - await getUsage(source.id);
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

      {typicalSale != null && (
        <div className="tiles">
          <div className="tile">
            <div className="muted small">Typical sale</div>
            <div className="tile-value">{formatPrice(typicalSale, display)}</div>
            <div className="muted small">
              median of {sold.length} sale{sold.length === 1 ? "" : "s"}
            </div>
          </div>
          {typicalAsk != null && (
            <div className="tile">
              <div className="muted small">Typical asking price</div>
              <div className="tile-value">{formatPrice(typicalAsk, display)}</div>
              <div className="muted small">median of {pricedAsks} priced listings</div>
            </div>
          )}
          {gap != null && (
            <div className="tile">
              <div className="muted small">Asking vs sold</div>
              <div className={`tile-value ${gap > 0 ? "error" : "good"}`}>
                {gap > 0 ? "+" : ""}
                {Math.round(gap * 100)}%
              </div>
              <div className="muted small">
                {gap > 0 ? "Dealers ask more than cars sell for" : "Asking prices are below recent sales"}
              </div>
            </div>
          )}
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
                  <td className="num">
                    <Money shown={r.shown} strong />
                  </td>
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
        the mileage or trim. Sales are converted at the Bank of Canada rate on the day they sold;
        asking prices at the latest rate. The free Old Cars Data plan returns the latest 20 sales per
        update; {Math.max(0, callsLeft)} of {source.monthlyCallLimit} updates left this month.
      </p>
    </>
  );
}
