import Link from "next/link";
import { formatKm, formatPrice, formatYears, watchTitle } from "@/lib/format";
import { listWatches } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export default function WatchlistPage() {
  const watches = listWatches();

  return (
    <>
      <div className="page-head">
        <h1>Watchlist</h1>
        <Link href="/watch/new" className="button primary">
          Add a car
        </Link>
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
                    {w.targetPrice ? formatPrice(w.targetPrice, w.targetCurrency) : "—"}
                  </td>
                  <td className="num">{w.activeCount}</td>
                  <td className="num">
                    {w.lowest.length
                      ? w.lowest.map((l) => formatPrice(l.price, l.currency)).join(" · ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
