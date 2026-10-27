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
  /** Gets each wheel layer, to turn it from a scroll position. */
  wheelRef?: (el: HTMLDivElement | null, index: number) => void;
  className?: string;
}) {
  const aspect = height / width;
  return (
    <div className={`car-sprite ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <div className="car-sprite-inner" style={facesRight ? { transform: "scaleX(-1)" } : undefined}>
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
