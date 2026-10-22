import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { checkRuns, watchlist } from "@/db/schema";
import { MAX_PAGES_PER_WATCH, pagesPerWatch } from "@/jobs/budget";
import { listingSources } from "@/sources";
import { getUsage, monthKey } from "@/sources/usage";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const now = new Date();
  const month = new Date(`${monthKey(now)}-01T12:00:00Z`).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });
  const watchCount = db.select().from(watchlist).where(eq(watchlist.active, true)).all().length;
  const runs = db.select().from(checkRuns).orderBy(desc(checkRuns.id)).limit(10).all();

  const sources = listingSources.map((s) => {
    const used = getUsage(s.id);
    const pages = pagesPerWatch({ limit: s.monthlyCallLimit, used, watchCount });
    return { s, used, pages, maxCalls: pages * watchCount, hasKey: !!process.env[s.apiKeyEnv] };
  });

  return (
    <>
      <h1>Settings</h1>

      <section>
        <h2>API calls in {month}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Used this month</th>
                <th className="num">Refresh all, at most</th>
                <th>API key</th>
              </tr>
            </thead>
            <tbody>
              {sources.map(({ s, used, pages, maxCalls, hasKey }) => (
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
                    {maxCalls} call{maxCalls === 1 ? "" : "s"}
                    <div className="muted small">
                      {pages} page{pages === 1 ? "" : "s"} × {watchCount} car{watchCount === 1 ? "" : "s"}
                    </div>
                  </td>
                  <td>{hasKey ? "Set" : <span className="error">Missing ({s.apiKeyEnv})</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Listings refresh only when you press Refresh. Each car fetches up to {MAX_PAGES_PER_WATCH} pages
          (20 listings each) and stops early once it has them all. Each source stops before its free
          limit; when few calls are left, they are shared so every car gets its newest listings.
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
