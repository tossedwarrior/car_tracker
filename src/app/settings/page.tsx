import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { checkRuns, watchlist } from "@/db/schema";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { callsPerWatch } from "@/jobs/budget";
import { getDisplayCurrency } from "@/lib/display-currency";
import { allSources, hasApiKey } from "@/sources";
import { getUsage, monthKey } from "@/sources/usage";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const currency = await getDisplayCurrency();
  const now = new Date();
  const month = new Date(`${monthKey(now)}-01T12:00:00Z`).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });
  const watchCount = db.select().from(watchlist).where(eq(watchlist.active, true)).all().length;
  const runs = db.select().from(checkRuns).orderBy(desc(checkRuns.id)).limit(10).all();

  const sources = allSources.map((s) => {
    const used = getUsage(s.id);
    const perCar =
      s.kind === "listings"
        ? callsPerWatch({ ...s.callsPerWatch, limit: s.monthlyCallLimit, used, watchCount })
        : 1;
    return { s, used, perCar, hasKey: hasApiKey(s) };
  });

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <section>
        <h2>Show prices in</h2>
        <CurrencyToggle current={currency} />
        <p className="muted small">
          Prices in other currencies are converted at the Bank of Canada&apos;s rate, with the original
          shown underneath.
        </p>
      </section>

      <section>
        <h2>API calls in {month}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Used this month</th>
                <th className="num">Calls per car, at most</th>
                <th>API key</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(({ s, used, perCar, hasKey }) => (
                <tr key={s.id}>
                  <td className="strong">{s.label}</td>
                  <td>
                    <div className="meter" role="meter" aria-valuenow={used} aria-valuemin={0} aria-valuemax={s.monthlyCallLimit}>
                      <span style={{ width: `${Math.min(100, (used / s.monthlyCallLimit) * 100)}%` }} />
                    </div>
                    <span className="small">
                      {used.toLocaleString()} of {s.monthlyCallLimit.toLocaleString()} free
                    </span>
                  </td>
                  <td className="num">
                    {perCar}
                    <div className="muted small">
                      {s.kind === "listings"
                        ? `per refresh · ${perCar * watchCount} for all ${watchCount}`
                        : "per sold-prices update"}
                    </div>
                  </td>
                  <td>{hasKey ? "Set" : <span className="error">Missing ({s.apiKeyEnv})</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Nothing runs on its own: listings update when you press Refresh, and auction results when
          you press Update sold prices on a car. Each source stops before its free limit. Auto.dev
          fetches up to 5 pages of 20 per car; MarketCheck searches 100 miles around Toronto,
          Montreal, Vancouver and Calgary (one call each, more if a city has over 50); Old Cars Data
          returns the latest 20 sold auctions per update on the free plan.
        </p>
      </section>

      <section>
        <h2>Recent refreshes</h2>
        {runs.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          <div className="runs">
            {runs.map((r) => (
              <details key={r.id} open={r.id === runs[0].id}>
                <summary>
                  <span className={`status ${r.status}`}>{r.status}</span>{" "}
                  {new Date(r.startedAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" })}
                </summary>
                <pre className="log">{r.log || "…"}</pre>
              </details>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
