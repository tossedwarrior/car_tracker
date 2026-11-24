import { wheelStyle, type WheelSpec } from "@/lib/wheels";

/**
 * A car photo with its wheels as separate layers that can turn. Always drawn
 * facing left (a right-facing photo is mirrored). Sized by its container's
 * width; the height follows the photo.
 */
export function CarSprite({
  src,
  width,
  height,
  wheels,
  facesRight,
  spin = false,
  shadow = false,
  wheelRef,
  className = "",
}: {
  src: string;
  width: number;
  height: number;
  wheels: WheelSpec | null;
  facesRight: boolean;
  /** Spin the wheels on a loop, to check they're placed right. */
  spin?: boolean;
  /** A soft shadow on the ground under it, so it doesn't look like it's floating. */
  shadow?: boolean;
  /** Gets each wheel layer, to turn it from a scroll position. */
  wheelRef?: (el: HTMLDivElement | null, index: number) => void;
  className?: string;
}) {
  const aspect = height / width;
  return (
    <div className={`car-sprite ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <div className="car-sprite-inner" style={facesRight ? { transform: "scaleX(-1)" } : undefined}>
        {shadow && <GroundShadow wheels={wheels} aspect={aspect} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={width} height={height} draggable={false} />
        {wheels &&
          [wheels.front, wheels.rear].map((w, i) => (
            <div
              key={i}
              ref={wheelRef ? (el) => wheelRef(el, i) : undefined}
              className={`car-wheel${spin ? (facesRight ? " spin reverse" : " spin") : ""}`}
              style={wheelStyle(w, aspect, src)}
            />
          ))}
      </div>
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 1e6) / 1e4}%`;

/**
 * A shadow drawn on the ground (rather than kept from the photo, whose light
 * and floor differ from one photo to the next): a long faint one under the
 * body, and a darker patch where each tyre touches. Sized from the wheels;
 * without them, along the bottom of the photo.
 */
function GroundShadow({ wheels, aspect }: { wheels: WheelSpec | null; aspect: number }) {
  const both = wheels ? [wheels.front, wheels.rear] : [];
  // Where the tyres touch, as a fraction of the height; r is of the width.
  const ground = both.length ? Math.max(...both.map((w) => w.y + w.r / aspect)) : 0.985;
  const r = both.length ? both[0].r : 0.075;
  const xs = both.map((w) => w.x);
  // Nearly bumper to bumper.
  const left = Math.max(0.02, (xs.length ? Math.min(...xs) : 0.2) - r * 2.4);
  const right = Math.min(0.98, (xs.length ? Math.max(...xs) : 0.8) + r * 2.4);
  // Thickness, as a fraction of the width, turned into one of the height;
  // a little under half of it above the ground, hidden by the car.
  const band = (t: number) => ({ top: pct(ground - (t / aspect) * 0.42), height: pct(t / aspect) });
  return (
    <div className="car-shadow" aria-hidden="true">
      <div className="car-shadow-body" style={{ left: pct(left), width: pct(right - left), ...band(r * 0.6) }} />
      {both.map((w, i) => (
        <div
          key={i}
          className="car-shadow-tyre"
          style={{ left: pct(w.x - r * 1.25), width: pct(r * 2.5), ...band(r * 0.34) }}
        />
      ))}
    </div>
  );
}
