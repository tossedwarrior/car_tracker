"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ChartPoint {
  /** Epoch ms */
  t: number;
  v: number;
  /** Sales behind a monthly median. */
  count?: number;
}

interface Series {
  key: string;
  label: string;
  color: string;
  points: ChartPoint[];
  format: (v: number) => string;
  note?: (p: ChartPoint) => string | null;
}

const DOTS_UP_TO = 24;
const fmtDate = (t: number, monthly = false) =>
  new Date(t).toLocaleDateString("en-CA", monthly ? { month: "short", year: "numeric" } : { dateStyle: "medium" });
const fmtTick = (t: number) => new Date(t).toLocaleDateString("en-CA", { month: "short", year: "numeric" });

function compactMoney(currency: string) {
  const f = new Intl.NumberFormat("en-CA", { notation: "compact", maximumFractionDigits: 1 });
  return (v: number) => `${currency === "USD" ? "US$" : "CA$"}${f.format(v)}`;
}

/** Month ticks spread across the domain, at most ~6. */
function monthTicks(start: number, end: number): number[] {
  const months = Math.max(1, Math.round((end - start) / (30.4 * 86_400_000)));
  const every = Math.max(1, Math.ceil(months / 6));
  const ticks: number[] = [];
  const d = new Date(start);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  for (let i = 0; d.getTime() <= end; i++, d.setMonth(d.getMonth() + 1)) {
    if (i % every === 0) ticks.push(d.getTime());
  }
  return ticks;
}

function ChartTooltip({
  active,
  label,
  series,
  rows,
}: {
  active?: boolean;
  label?: string | number;
  series: Series[];
  rows: Map<number, Record<string, ChartPoint>>;
}) {
  if (!active || label == null) return null;
  const row = rows.get(Number(label));
  if (!row) return null;
  const present = series.filter((s) => row[s.key]);
  if (!present.length) return null;
  return (
    <div className="chart-tooltip">
      {present.map((s) => {
        const p = row[s.key];
        const note = s.note?.(p);
        return (
          <div key={s.key} className="chart-tooltip-row">
            <span className="line-key" style={{ background: s.color }} />
            <span>
              <strong>{s.format(p.v)}</strong>
              <span className="muted">
                {" "}
                {s.label}
                {note ? ` · ${note}` : ""}
              </span>
            </span>
          </div>
        );
      })}
      <div className="muted small">{fmtDate(Number(label), present.every((s) => s.key === "sold"))}</div>
    </div>
  );
}

function TimeChart({
  title,
  series,
  start,
  end,
  yFormat,
  empty,
}: {
  title: string;
  series: Series[];
  start: number;
  end: number;
  yFormat: (v: number) => string;
  empty: string;
}) {
  // One row per date, holding whichever series have a point there.
  const rows = new Map<number, Record<string, ChartPoint>>();
  for (const s of series) for (const p of s.points) rows.set(p.t, { ...rows.get(p.t), [s.key]: p });
  const data = [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([t, r]) => ({ t, ...Object.fromEntries(Object.entries(r).map(([k, p]) => [k, p.v])) }));
  const hasData = series.some((s) => s.points.length);

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">{title}</span>
        {series.length > 1 && (
          <span className="legend">
            {series.map((s) => (
              <span key={s.key}>
                <span className="line-key" style={{ background: s.color }} /> {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      {hasData ? (
        <div className="chart-plot">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[start, end]}
                ticks={monthTicks(start, end)}
                tickFormatter={fmtTick}
                stroke="var(--chart-axis)"
                tick={{ fill: "var(--chart-ink)", fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                width={64}
                tickFormatter={yFormat}
                stroke="none"
                tick={{ fill: "var(--chart-ink)", fontSize: 12 }}
                domain={["auto", "auto"]}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
                content={({ active, label }) => (
                  <ChartTooltip active={active} label={label} series={series} rows={rows} />
                )}
                isAnimationActive={false}
              />
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  connectNulls
                  isAnimationActive={false}
                  dot={
                    s.points.length <= DOTS_UP_TO
                      ? { r: 4, fill: s.color, stroke: "var(--chart-surface)", strokeWidth: 2 }
                      : false
                  }
                  activeDot={{ r: 5, fill: s.color, stroke: "var(--chart-surface)", strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="chart-empty muted small">{empty}</p>
      )}
    </figure>
  );
}

export function MarketCharts({
  currency,
  start,
  end,
  ask,
  sold,
  listed,
  daysListed,
}: {
  currency: string;
  start: number;
  end: number;
  ask: ChartPoint[];
  sold: ChartPoint[];
  listed: ChartPoint[];
  daysListed: ChartPoint[];
}) {
  const money = new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: 0 });
  const fmtMoney = (v: number) => (currency === "CAD" ? `CA${money.format(v)}` : money.format(v));

  return (
    <div className="charts">
      <TimeChart
        title={`Typical price (${currency})`}
        start={start}
        end={end}
        yFormat={compactMoney(currency)}
        empty="No prices yet."
        series={[
          { key: "ask", label: "Asking, weekly", color: "var(--series-1)", points: ask, format: fmtMoney },
          {
            key: "sold",
            label: "Sold at auction, monthly",
            color: "var(--series-2)",
            points: sold,
            format: fmtMoney,
            note: (p) => (p.count ? `${p.count} sale${p.count === 1 ? "" : "s"}` : null),
          },
        ]}
      />
      <div className="chart-pair">
        <TimeChart
          title="Cars listed"
          start={start}
          end={end}
          yFormat={(v) => String(v)}
          empty="Builds from your first refresh."
          series={[{ key: "listed", label: "listed", color: "var(--series-1)", points: listed, format: (v) => `${v} cars` }]}
        />
        <TimeChart
          title="Typical days listed"
          start={start}
          end={end}
          yFormat={(v) => String(Math.round(v))}
          empty="Builds from your first refresh."
          series={[
            { key: "days", label: "median", color: "var(--series-1)", points: daysListed, format: (v) => `${Math.round(v)} days` },
          ]}
        />
      </div>
    </div>
  );
}
