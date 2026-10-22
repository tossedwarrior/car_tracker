import Link from "next/link";
import { markAlertsSeen } from "@/app/actions";
import { Money } from "@/components/Money";
import { getAlerts, type AlertRow } from "@/jobs/alerts";
import { getDisplayCurrency } from "@/lib/display-currency";
import { formatKm, watchTitle } from "@/lib/format";
import { Rates } from "@/lib/fx";
import { showMoney } from "@/lib/money";

export const dynamic = "force-dynamic";

const typeLabels: Record<AlertRow["type"], string> = {
  new_listing: "New listing",
  price_drop: "Price drop",
  under_target: "Under target",
};

export default async function AlertsPage() {
  const alerts = getAlerts();
  const unseen = alerts.filter((a) => !a.seen).length;
  const display = await getDisplayCurrency();
  const rates = Rates.load();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p className="muted">
            New listings, price drops and cars under your target, found when you refresh.
          </p>
        </div>
        {unseen > 0 && (
          <form action={markAlertsSeen}>
            <button type="submit" className="button">
              Mark all as seen
            </button>
          </form>
        )}
      </div>

      {alerts.length === 0 ? (
        <div className="empty">
          <p>No alerts yet.</p>
          <p className="muted">They appear here after a refresh finds something new.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Alert</th>
                <th className="num">Price</th>
                <th>Car</th>
                <th>Where</th>
                <th>Found</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => {
                const l = a.listing;
                return (
                  <tr key={a.id} className={a.seen ? undefined : "unseen"}>
                    <td className="nowrap">
                      {!a.seen && <span className="dot" aria-label="Not seen yet" />}
                      <span className={`badge inline ${a.type === "new_listing" ? "" : "good"}`}>
                        {typeLabels[a.type]}
                      </span>
                    </td>
                    <td className="num">
                      <Money shown={showMoney(rates, display, a.price || null, l.currency)} strong />
                      {a.previousPrice != null && (
                        <div className="muted small">
                          was {showMoney(rates, display, a.previousPrice, l.currency).main}
                        </div>
                      )}
                    </td>
                    <td>
                      <Link href={`/watch/${a.watch.id}`}>{watchTitle(a.watch)}</Link>
                      <div className="muted small">
                        {[l.year, l.trim, formatKm(l.km)].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td>
                      {l.location ?? "—"}
                      {l.sellerName && <div className="muted small">{l.sellerName}</div>}
                    </td>
                    <td className="nowrap">
                      {new Date(`${a.date}T12:00:00`).toLocaleDateString("en-CA", { dateStyle: "medium" })}
                    </td>
                    <td className="nowrap">
                      {l.url && (
                        <a href={l.url} target="_blank" rel="noopener noreferrer">
                          View ad
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
