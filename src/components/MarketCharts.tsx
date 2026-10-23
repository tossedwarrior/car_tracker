"use client";

import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
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
  /** Middle half of a month's sales (25th to 75th percentile). */
  low?: number;
  high?: number;
}

/** One auction sale, plotted as its own dot. */
export interface SaleDot extends ChartPoint {
  title: string;
  /** What it sold for, when that's in another currency. */
  original: string | null;
  auctionHouse: string | null;
  url: string | null;
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

/** 0 up to past `max` in round steps (1, 2, 2.5 or 5 × a power of ten), about 4 of them. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough)!;
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step);
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

type PriceDatum =
  | (ChartPoint & { kind: "ask" })
  | (ChartPoint & { kind: "month" })
  | (SaleDot & { kind: "sale" });

/** Recharts passes the hovered datum on `payload`. */
function SaleShape(props: { cx?: number; cy?: number; payload?: SaleDot }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return <g />;
  return (
    <g style={{ cursor: payload?.url ? "pointer" : "default" }}>
      {/* Bigger than the dot, so it's easy to hover. */}
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      <circle
        cx={cx}
        cy={cy}
        r={4}
        fill="var(--series-2)"
        fillOpacity={0.7}
        stroke="var(--chart-surface)"
        strokeWidth={2}
      />
    </g>
  );
}

function PriceTooltip({ datum, format }: { datum?: PriceDatum; format: (v: number) => string }) {
  if (!datum) return null;
  const color = datum.kind === "ask" ? "var(--series-1)" : "var(--series-2)";
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-row">
        <span className={datum.kind === "sale" ? "dot-key" : "line-key"} style={{ background: color }} />
        <span>
          <strong>{format(datum.v)}</strong>{" "}
          <span className="muted">
            {datum.kind === "ask"
              ? "typical asking"
              : datum.kind === "month"
                ? `monthly median · ${datum.count} sale${datum.count === 1 ? "" : "s"}`
                : (datum.original ?? "")}
          </span>
        </span>
      </div>
      {datum.kind === "sale" && <div>{datum.title}</div>}
      {datum.kind === "month" && datum.low != null && datum.high != null && datum.count! > 1 && (
        <div className="muted small">
          Middle half: {format(datum.low)} – {format(datum.high)}
        </div>
      )}
      <div className="muted small">
        {datum.kind === "sale"
          ? [datum.auctionHouse, fmtDate(datum.t)].filter(Boolean).join(" · ")
          : datum.kind === "month"
            ? fmtDate(datum.t, true)
            : `week of ${fmtDate(datum.t)}`}
      </div>
      {datum.kind === "sale" && datum.url && <div className="muted small">Click to open the sale</div>}
    </div>
  );
}

function PriceChart({
  currency,
  start,
  end,
  ask,
  sold,
  sales,
  format,
}: {
  currency: string;
  start: number;
  end: number;
  ask: ChartPoint[];
  sold: ChartPoint[];
  sales: SaleDot[];
  format: (v: number) => string;
}) {
  const askData = ask.map((p) => ({ ...p, kind: "ask" as const }));
  const monthData = sold.map((p) => ({ ...p, kind: "month" as const, range: [p.low ?? p.v, p.high ?? p.v] }));
  const saleData = sales.map((p) => ({ ...p, kind: "sale" as const }));
  const hasData = askData.length + saleData.length > 0;
  // Sale dots get their own tooltip: Recharts would otherwise show the line under the pointer.
  const [hovered, setHovered] = useState<{ datum: PriceDatum; x: number; y: number } | null>(null);
  const yTicks = niceTicks(Math.max(0, ...askData.map((d) => d.v), ...saleData.map((d) => d.v)));

  return (
    <figure className="chart">
      <figcaption>
        <span className="chart-title">Price ({currency})</span>
        <span className="legend">
          {saleData.length > 0 && (
            <>
              <span>
                <span className="dot-key" style={{ background: "var(--series-2)" }} /> Each auction sale
              </span>
              <span>
                <span className="line-key" style={{ background: "var(--series-2)" }} /> Monthly median sale
              </span>
              <span>
                <span className="area-key" style={{ background: "var(--series-2)" }} /> Middle half of sales
              </span>
            </>
          )}
          {askData.length > 0 && (
            <span>
              <span className="line-key" style={{ background: "var(--series-1)" }} /> Typical asking, weekly
            </span>
          )}
        </span>
      </figcaption>
      {hasData ? (
        <div className="chart-plot" onMouseLeave={() => setHovered(null)}>
          {hovered && (
            <div className="chart-tooltip-float" style={{ left: hovered.x, top: hovered.y }}>
              <PriceTooltip datum={hovered.datum} format={format} />
            </div>
          )}
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
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
                allowDuplicatedCategory={false}
              />
              <YAxis
                dataKey="v"
                width={64}
                tickFormatter={compactMoney(currency)}
                stroke="none"
                tick={{ fill: "var(--chart-ink)", fontSize: 12 }}
                domain={[0, yTicks.at(-1)!]}
                ticks={yTicks}
              />
              <Tooltip
                shared={false}
                cursor={false}
                isAnimationActive={false}
                content={({ active, payload }) =>
                  active && !hovered ? (
                    <PriceTooltip datum={payload?.[0]?.payload as PriceDatum | undefined} format={format} />
                  ) : null
                }
              />
              <Scatter
                name="sale"
                data={saleData}
                dataKey="v"
                isAnimationActive={false}
                shape={(props: unknown) => <SaleShape {...(props as Parameters<typeof SaleShape>[0])} />}
                onMouseEnter={(d: unknown) => {
                  const { cx, cy, payload } = d as { cx: number; cy: number; payload: PriceDatum };
                  setHovered({ datum: payload, x: cx, y: cy });
                }}
                onMouseLeave={() => setHovered(null)}
                onClick={(d: unknown) => {
                  const url = (d as { payload?: SaleDot })?.payload?.url;
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }}
              />
              <Area
                name="band"
                data={monthData}
                dataKey="range"
                stroke="none"
                fill="var(--series-2)"
                fillOpacity={0.12}
                activeDot={false}
                tooltipType="none"
                isAnimationActive={false}
              />
              <Line
                name="month"
                data={monthData}
                dataKey="v"
                stroke="var(--series-2)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 5, fill: "var(--series-2)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Line
                name="ask"
                data={askData}
                dataKey="v"
                stroke="var(--series-1)"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={askData.length <= DOTS_UP_TO ? { r: 4, fill: "var(--series-1)", stroke: "var(--chart-surface)", strokeWidth: 2 } : false}
                activeDot={{ r: 5, fill: "var(--series-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="chart-empty muted small">No prices yet.</p>
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
  sales,
  listed,
  daysListed,
  showActivity = true,
}: {
  currency: string;
  start: number;
  end: number;
  ask: ChartPoint[];
  sold: ChartPoint[];
  sales: SaleDot[];
  listed: ChartPoint[];
  daysListed: ChartPoint[];
  /** The cars-listed and days-listed charts; hidden for a single variant. */
  showActivity?: boolean;
}) {
  const money = new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: 0 });
  const fmtMoney = (v: number) => (currency === "CAD" ? `CA${money.format(v)}` : money.format(v));

  return (
    <div className="charts">
      <PriceChart
        currency={currency}
        start={start}
        end={end}
        ask={ask}
        sold={sold}
        sales={sales}
        format={fmtMoney}
      />
      {showActivity && <div className="chart-pair">
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
      </div>}
    </div>
  );
}
