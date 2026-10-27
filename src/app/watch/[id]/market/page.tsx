import Link from "next/link";
import { notFound } from "next/navigation";
import { MarketCharts, type ChartPoint, type SaleDot } from "@/components/MarketCharts";
import { RefreshButton } from "@/components/RefreshButton";
import { SoldPullButton } from "@/components/SoldPullButton";
import { WatchHeader } from "@/components/WatchHeader";
import {
  getMarketDetails,
  getMarketHistory,
  HISTORY_DAYS,
  MARKET_CURRENCY,
  type Point,
} from "@/jobs/market";
import { maxRefreshCalls } from "@/jobs/refresh";
import { getSoldResults } from "@/jobs/sold";
import { getDisplayCurrency } from "@/lib/display-currency";
import { formatKm, formatPrice, timeAgo } from "@/lib/format";
import { Rates } from "@/lib/fx";
import { getListings, getWatch } from "@/lib/watchlist";
import { hasApiKey, soldSources } from "@/sources";
import { getUsage } from "@/sources/usage";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const trendText = { rising: "Rising", flat: "Flat", cooling: "Cooling" } as const;
const trendArrow = { rising: "↑", flat: "→", cooling: "↓" } as const;

const pct = (x: number) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const watch = getWatch(Number((await params).id));
  if (!watch) notFound();

  const display = await getDisplayCurrency();
  const rates = Rates.load();
  const now = new Date();

  const all = getMarketDetails(watch, rates, now);
  const requested = (await searchParams).variant;
  const variant = all.variants.some((v) => v.variant === requested) ? requested! : null;
  const details = variant ? getMarketDetails(watch, rates, now, { variant }) : all;
  const history = getMarketHistory(watch, rates, now, { variant });
  const { trend, sold: months } = history;

  // Market numbers are kept in CAD; show them in the chosen currency at today's rate.
  const show = (cad: number | null) =>
    cad == null ? "—" : formatPrice(rates.convert(cad, MARKET_CURRENCY, display) ?? cad, display);
  const money = (p: Point) => rates.convert(p.value, MARKET_CURRENCY, display) ?? p.value;
  const t = (date: string) => new Date(`${date}T12:00:00`).getTime();
  const toChart = (points: Point[], convert = false): ChartPoint[] =>
    points.map((p) => ({ t: t(p.date), v: convert ? money(p) : p.value }));

  const ask = toChart(history.ask, true);
  const sold: ChartPoint[] = months.map((m) => ({
    t: t(m.date),
    v: money(m),
    count: m.count,
    low: money({ date: m.date, value: m.low }),
    high: money({ date: m.date, value: m.high }),
  }));
  const sales: SaleDot[] = history.sales.map((s) => ({
    t: t(s.date),
    // Converted at the rate on the day it sold.
    v: rates.convert(s.price, s.currency, display, s.date) ?? money(s),
    title: s.title,
    original: s.currency === display ? null : formatPrice(s.price, s.currency),
    auctionHouse: s.auctionHouse,
    url: s.url,
  }));
  const end = now.getTime();
  // Two years at most; at least 3 months, so a new watch isn't one dot on a vast axis.
  const start = Math.max(
    end - HISTORY_DAYS * DAY,
    Math.min(end - 91 * DAY, ...[...ask, ...sales].map((p) => p.t)) - 7 * DAY,
  );

  const soldSource = soldSources[0];
  const href = (v: string | null) => `/watch/${watch.id}/market${v ? `?variant=${encodeURIComponent(v)}` : ""}`;
  const { momentum, priceCuts, askVsSold } = details;
  const updated = [
    watch.lastRefreshed ? `Listings refreshed ${timeAgo(watch.lastRefreshed)}` : "Listings not refreshed yet",
    watch.lastSoldPull ? `sold prices updated ${timeAgo(watch.lastSoldPull)}` : "sold prices not pulled yet",
  ].join(" · ");

  return (
    <>
      <WatchHeader
        watch={watch}
        tab="market"
        forSaleCount={getListings(watch.id).length}
        soldCount={getSoldResults(watch).length}
        updated={updated}
        action={
          <>
            {watch.active && (
              <RefreshButton watchId={watch.id} maxCalls={maxRefreshCalls(1)} label="Refresh listings" />
            )}
            {hasApiKey(soldSource) && (
              <SoldPullButton
                watchId={watch.id}
                callsLeft={soldSource.monthlyCallLimit - getUsage(soldSource.id)}
              />
            )}
          </>
        }
      />

      {all.variants.length > 1 && (
        <div className="toolbar start">
          <nav className="segmented wrap" aria-label="Variant">
            <Link href={href(null)} aria-current={!variant ? "true" : undefined}>
              All
            </Link>
            {all.variants.map((v) => (
              <Link
                key={v.variant}
                href={href(v.variant)}
                aria-current={v.variant === variant ? "true" : undefined}
                title={`${v.listed} for sale, ${v.sales} sold`}
              >
                {v.variant} <span className="muted small">{v.listed + v.sales}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}

      <div className="tiles">
        <div className="tile">
          <div className="muted small">Market{variant ? `, ${variant}` : ""}</div>
          {trend.label ? (
            <>
              <div className="tile-value">
                <span aria-hidden="true">{trendArrow[trend.label]}</span> {trendText[trend.label]}
              </div>
              <div className="muted small">
                {pct(trend.change!)} over 3 months, from {trend.basis === "asking" ? "asking prices" : "auction sales"}
              </div>
            </>
          ) : (
            <>
              <div className="tile-value muted">Not enough history</div>
              <div className="muted small">Needs 3 months of prices; see the momentum and gap beside it meanwhile.</div>
            </>
          )}
        </div>

        <div className="tile">
          <div className="muted small">Typical sale, last 3 months</div>
          <div className="tile-value">{show(momentum.recent)}</div>
          <div className="muted small">
            {momentum.recentCount} sale{momentum.recentCount === 1 ? "" : "s"}
            {momentum.change != null ? (
              <>
                {" · "}
                <strong>{pct(momentum.change)}</strong> vs {show(momentum.prior)} the 3 months before (
                {momentum.priorCount})
              </>
            ) : (
              " · no sales the 3 months before to compare"
            )}
          </div>
        </div>

        <div className="tile">
          <div className="muted small">Asking vs recent sales</div>
          <div className="tile-value">{askVsSold.gap != null ? pct(askVsSold.gap) : "—"}</div>
          <div className="muted small">
            Typical asking {show(askVsSold.ask)} vs typical sale {show(askVsSold.sold)}
            {askVsSold.gap != null && (askVsSold.gap > 0 ? ": room to negotiate" : ": asking below recent sales")}
          </div>
        </div>

        <div className="tile">
          <div className="muted small">Price cuts, last 30 days</div>
          <div className="tile-value">
            {priceCuts.cut} of {priceCuts.of}
          </div>
          <div className="muted small">
            {priceCuts.cut
              ? `cars for sale, typically by ${(priceCuts.medianCut! * 100).toFixed(1)}%`
              : "cars for sale had a price cut"}
          </div>
        </div>
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
        showActivity={!variant}
      />
      {variant && (
        <p className="muted small">
          Weekly asking prices, cars listed and days listed are kept for all variants together, so
          they&apos;re hidden while one variant is selected.
        </p>
      )}

      <section>
        <h2>By variant</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Variant</th>
                <th className="num">For sale</th>
                <th className="num">Typical asking</th>
                <th className="num">Sold (2 years)</th>
                <th className="num">Typical sale</th>
                <th className="num">Asking vs sold</th>
              </tr>
            </thead>
            <tbody>
              {all.variants.map((v) => (
                <tr key={v.variant} className={v.variant === variant ? "selected" : undefined}>
                  <td>
                    <Link href={href(v.variant)}>{v.variant}</Link>
                  </td>
                  <td className="num">{v.listed}</td>
                  <td className="num">{show(v.medianAsk)}</td>
                  <td className="num">{v.sales}</td>
                  <td className="num">{show(v.medianSold)}</td>
                  <td className="num">{v.gap != null ? pct(v.gap) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>By model year{variant ? `, ${variant}` : ""}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th className="num">For sale</th>
                <th className="num">Typical asking</th>
                <th className="num">Typical mileage</th>
                <th className="num">Sold (2 years)</th>
                <th className="num">Typical sale</th>
              </tr>
            </thead>
            <tbody>
              {details.years.map((y) => (
                <tr key={y.year}>
                  <td>{y.year}</td>
                  <td className="num">{y.listed}</td>
                  <td className="num">{show(y.medianAsk)}</td>
                  <td className="num">{y.medianKm != null ? formatKm(y.medianKm) : "—"}</td>
                  <td className="num">{y.sales}</td>
                  <td className="num">{show(y.medianSold)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Month by month{variant ? `, ${variant}` : ""}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Sales</th>
                <th className="num">Typical sale</th>
                <th className="num">Middle half of sales</th>
                <th className="num">Change from month before</th>
              </tr>
            </thead>
            <tbody>
              {months.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No auction results yet.
                  </td>
                </tr>
              )}
              {[...months].reverse().map((m, i, list) => {
                const before = list[i + 1];
                return (
                  <tr key={m.date}>
                    <td>{fmtMonth(m.date)}</td>
                    <td className="num">{m.count}</td>
                    <td className="num">{show(m.value)}</td>
                    <td className="num">{m.count > 1 ? `${show(m.low)} – ${show(m.high)}` : "—"}</td>
                    <td className="num">{before ? pct(m.value / before.value - 1) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="muted small">
        Typical means median, so a few very expensive or cheap cars don&apos;t swing it; the middle
        half is the 25th to 75th percentile. Rising if the typical price is up more than 3% over 3
        months, cooling if down more than 3%, otherwise flat. Variants come from each listing&apos;s
        title and trim. Asking prices are recorded weekly from your first refresh; auction sales go
        back as far as Old Cars Data has returned, the latest 20 per update on the free plan. Shown
        in {display}; auction sales at the rate on the day they sold.
      </p>
    </>
  );
}

const fmtMonth = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-CA", { month: "long", year: "numeric" });
