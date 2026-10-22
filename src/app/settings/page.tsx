import { desc, eq } from "drizzle-orm";
import fs from "node:fs";
import { db } from "@/db";
import { checkRuns, watchlist } from "@/db/schema";
import { pagesPerWatch } from "@/jobs/budget";
import { SCHEDULE_HOUR, schedulePlistPath } from "@/jobs/schedule";
import { RunCheckButton } from "@/components/RunCheckButton";
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
  const scheduled = fs.existsSync(schedulePlistPath());

  const sources = listingSources.map((s) => {
    const used = getUsage(s.id);
    const pages = pagesPerWatch({
      limit: s.monthlyCallLimit,
      used,
      watchCount,
      everyDays: s.everyDays,
      now,
    });
    return { s, used, pages, maxCalls: pages * watchCount, hasKey: !!process.env[s.apiKeyEnv] };
  });
  const maxCalls = sources.reduce((n, x) => n + (x.hasKey ? x.maxCalls : 0), 0);

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
                <th>Runs</th>
                <th className="num">Next run, at most</th>
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
                  <td>{s.everyDays === 1 ? "Daily" : `Every ${s.everyDays} days`}</td>
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
          Each source stops before its free limit. Pages per car are the calls left this month spread
          over the runs left, up to 5 pages (100 listings) per car.
        </p>
      </section>

      <section>
        <h2>Daily check</h2>
        <p>
          {scheduled ? (
            <>Scheduled to run every day at {SCHEDULE_HOUR}:00 on this Mac.</>
          ) : (
            <>
              <span className="error">Not scheduled.</span>{" "}
              <span className="muted">
                Run <code>npm run schedule:install</code> to check every day at {SCHEDULE_HOUR}:00.
              </span>
            </>
          )}
        </p>
        <RunCheckButton maxCalls={maxCalls} />

        {runs.length > 0 && (
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
