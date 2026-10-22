import { notFound } from "next/navigation";
import { MarketCharts, type ChartPoint, type SaleDot } from "@/components/MarketCharts";
import { updatedText, WatchHeader } from "@/components/WatchHeader";
import { getMarketHistory, HISTORY_DAYS, MARKET_CURRENCY, type Point } from "@/jobs/market";
import { getSoldResults } from "@/jobs/sold";
import { getDisplayCurrency } from "@/lib/display-currency";
import { formatPrice } from "@/lib/format";
import { Rates } from "@/lib/fx";
import { getListings, getWatch } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const trendText = { rising: "Rising", flat: "Flat", cooling: "Cooling" } as const;
const trendArrow = { rising: "↑", flat: "→", cooling: "↓" } as const;

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const watch = getWatch(Number((await params).id));
  if (!watch) notFound();

  const display = await getDisplayCurrency();
  const rates = Rates.load();
  const now = new Date();
  const history = getMarketHistory(watch, rates, now);
  const { trend } = history;

  // Market history is kept in CAD; show it in the chosen currency at today's rate.
  const money = (p: Point) => rates.convert(p.value, MARKET_CURRENCY, display) ?? p.value;
  const toChart = (points: Point[], convert = false): ChartPoint[] =>
    points.map((p) => ({ t: new Date(`${p.date}T12:00:00`).getTime(), v: convert ? money(p) : p.value }));

  const ask = toChart(history.ask, true);
  const sold = history.sold.map((p, i) => ({ ...toChart([p], true)[0], count: history.sold[i].count }));
  const sales: SaleDot[] = history.sales.map((s) => ({
    t: new Date(`${s.date}T12:00:00`).getTime(),
    // Converted at the rate on the day it sold.
    v: rates.convert(s.price, s.currency, display, s.date) ?? money(s),
    title: s.title,
    original: s.currency === display ? null : formatPrice(s.price, s.currency),
    auctionHouse: s.auctionHouse,
    url: s.url,
  }));
  const allDates = [...ask, ...sales].map((p) => p.t);
  const end = now.getTime();
  // Two years at most; at least 3 months, so a new watch isn't one dot on a vast axis.
  const start = Math.max(end - HISTORY_DAYS * DAY, Math.min(end - 91 * DAY, ...allDates) - 7 * DAY);

  const latestAsk = history.ask.at(-1);
  const latestSold = history.sold.at(-1);

  return (
    <>
      <WatchHeader
        watch={watch}
        tab="market"
        forSaleCount={getListings(watch.id).length}
        soldCount={getSoldResults(watch).length}
        updated={updatedText("Listings refreshed", watch.lastRefreshed, "Listings not refreshed yet")}
      />

      <div className="tiles">
        <div className="tile">
          <div className="muted small">Market</div>
          {trend.label ? (
            <>
              <div className="tile-value">
                <span aria-hidden="true">{trendArrow[trend.label]}</span> {trendText[trend.label]}
              </div>
              <div className="muted small">
                {trend.change! > 0 ? "+" : ""}
                {(trend.change! * 100).toFixed(1)}% over 3 months, from{" "}
                {trend.basis === "asking" ? "asking prices" : "auction sales"}
              </div>
            </>
          ) : (
            <>
              <div className="tile-value muted">Not enough history</div>
              <div className="muted small">{trend.reason}</div>
            </>
          )}
        </div>
        {latestAsk && (
          <div className="tile">
            <div className="muted small">Typical asking price</div>
            <div className="tile-value">{formatPrice(money(latestAsk), display)}</div>
            <div className="muted small">week of {fmtDay(latestAsk.date)}</div>
          </div>
        )}
        {latestSold && (
          <div className="tile">
            <div className="muted small">Typical auction sale</div>
            <div className="tile-value">{formatPrice(money(latestSold), display)}</div>
            <div className="muted small">
              {fmtMonth(latestSold.date)}, {latestSold.count} sale{latestSold.count === 1 ? "" : "s"}
            </div>
          </div>
        )}
      </div>

      <MarketCharts
        currency={display}
        start={start}
        end={end}
        ask={ask}
        sold={sold}
        sales={sales}
        listed={toChart(history.listed)}
        daysListed={toChart(history.daysListed)}
      />

      <p className="muted small">
        Rising if the typical price is up more than 3% over 3 months, cooling if down more than 3%,
        otherwise flat. Asking prices are recorded once a week when you refresh, starting from your
        first refresh; auction sales go back as far as Old Cars Data has returned. Typical means
        median, so a few very expensive or cheap cars don&apos;t swing it.
      </p>

      <details className="table-view">
        <summary>Show as table</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Week of</th>
                <th className="num">Typical asking</th>
                <th className="num">Cars listed</th>
                <th className="num">Typical days listed</th>
              </tr>
            </thead>
            <tbody>
              {history.listed.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">No weekly snapshots yet.</td>
                </tr>
              )}
              {[...history.listed].reverse().map((l) => {
                const a = history.ask.find((p) => p.date === l.date);
                const d = history.daysListed.find((p) => p.date === l.date);
                return (
                  <tr key={l.date}>
                    <td>{fmtDay(l.date)}</td>
                    <td className="num">{a ? formatPrice(money(a), display) : "—"}</td>
                    <td className="num">{l.value}</td>
                    <td className="num">{d ? Math.round(d.value) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Typical auction sale</th>
                <th className="num">Sales</th>
              </tr>
            </thead>
            <tbody>
              {history.sold.length === 0 && (
                <tr>
                  <td colSpan={3} className="muted">No auction results yet.</td>
                </tr>
              )}
              {[...history.sold].reverse().map((s) => (
                <tr key={s.date}>
                  <td>{fmtMonth(s.date)}</td>
                  <td className="num">{formatPrice(money(s), display)}</td>
                  <td className="num">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { dateStyle: "medium" });
const fmtMonth = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "long", year: "numeric" });
