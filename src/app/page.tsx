import Link from "next/link";
import { Money } from "@/components/Money";
import { RefreshButton } from "@/components/RefreshButton";
import { getMarketHistory } from "@/jobs/market";
import { maxRefreshCalls } from "@/jobs/refresh";
import { getDisplayCurrency } from "@/lib/display-currency";
import { formatKm, formatYears, timeAgo, watchTitle } from "@/lib/format";
import { Rates } from "@/lib/fx";
import { showMoney, type Shown } from "@/lib/money";
import { listWatches } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const watches = listWatches();
  const display = await getDisplayCurrency();
  const rates = Rates.load();
  const show = (amount: number | null, currency: string) => showMoney(rates, display, amount, currency);
  /** Cheapest across currencies, compared in the display currency. */
  const lowest = (prices: Array<{ price: number; currency: string }>): Shown | null =>
    prices
      .map((p) => show(p.price, p.currency))
      .sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity))[0] ?? null;
  const activeCount = watches.filter((w) => w.active).length;

  return (
    <>
      <div className="page-head">
        <h1>Watchlist</h1>
        <div className="head-actions">
          {activeCount > 0 && (
            <RefreshButton maxCalls={maxRefreshCalls(activeCount)} label="Refresh all" />
          )}
          <Link href="/watch/new" className="button primary">
            Add a car
          </Link>
        </div>
      </div>

      {watches.length === 0 ? (
        <div className="empty">
          <p>Nothing on the watchlist yet.</p>
          <p className="muted">
            Add a car by make, model and year range, for example Ferrari 458 Italia, 2011–2015.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Car</th>
                <th>Years</th>
                <th>Max mileage</th>
                <th className="num">Target</th>
                <th className="num">For sale</th>
                <th className="num">Lowest ask</th>
                <th>Market</th>
                <th>Refreshed</th>
              </tr>
            </thead>
            <tbody>
              {watches.map((w) => (
                <tr key={w.id}>
                  <td>
                    <Link href={`/watch/${w.id}`} className="strong">
                      {watchTitle(w)}
                    </Link>
                  </td>
                  <td>{formatYears(w.yearMin, w.yearMax)}</td>
                  <td>{w.maxKm ? `Under ${formatKm(w.maxKm)}` : "Any"}</td>
                  <td className="num">
                    {w.targetPrice ? <Money shown={show(w.targetPrice, w.targetCurrency)} /> : "—"}
                  </td>
                  <td className="num">{w.activeCount}</td>
                  <td className="num">
                    {(() => {
                      const low = lowest(w.lowest);
                      return low ? <Money shown={low} /> : "—";
                    })()}
                  </td>
                  <td>
                    {(() => {
                      const { trend } = getMarketHistory(w, rates);
                      if (!trend.label) return <span className="muted">Not enough history</span>;
                      const arrow = { rising: "↑", flat: "→", cooling: "↓" }[trend.label];
                      return (
                        <Link href={`/watch/${w.id}/market`}>
                          <span aria-hidden="true">{arrow}</span>{" "}
                          {trend.label[0].toUpperCase() + trend.label.slice(1)}
                        </Link>
                      );
                    })()}
                  </td>
                  <td className="muted">{w.lastRefreshed ? timeAgo(w.lastRefreshed) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
