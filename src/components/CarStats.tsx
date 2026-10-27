import type { HomeCar } from "@/lib/home";

const trendText = { rising: "Rising", flat: "Flat", cooling: "Cooling" } as const;
// The design's arrow points down for cooling; turn it for the others.
const trendTurn = { rising: "rotate(180deg)", flat: "rotate(-90deg)", cooling: undefined } as const;

/** Cars for sale, lowest ask and market status (Figma 3:140 / 9:187). */
export function CarStats({ car }: { car: HomeCar }) {
  const pct = (x: number) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
  return (
    <div className="car-stats">
      <div>
        <p className="car-stat-label">Cars for sale</p>
        <p className="car-stat-value">{car.forSale}</p>
        <p className="car-stat-sub">
          {car.newListings ? `${car.newListings} new listing${car.newListings === 1 ? "" : "s"}` : "No new listings"}
        </p>
      </div>
      <div>
        <p className="car-stat-label">Lowest ask</p>
        <p className="car-stat-value">{car.lowest?.main ?? "—"}</p>
        <p className="car-stat-sub">{car.lowest?.original ?? (car.lowest ? " " : "No prices yet")}</p>
      </div>
      <div>
        <p className="car-stat-label">Market status</p>
        <p className="car-stat-value">
          {car.trend ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="trend-arrow"
                src="/icons/arrow-down.png"
                width={24}
                height={24}
                alt=""
                style={{ transform: trendTurn[car.trend.label] }}
              />
              {trendText[car.trend.label]}
            </>
          ) : (
            "—"
          )}
        </p>
        <p className="car-stat-sub">
          {car.trend ? `${pct(car.trend.change)} over 3 months` : "Needs 3 months of prices"}
        </p>
      </div>
    </div>
  );
}
