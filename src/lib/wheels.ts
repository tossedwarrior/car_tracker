// Wheels on a car photo, so they can turn as the car drives.
//
// Positions are fractions of the photo, so they hold at any size: x and the
// radius r are fractions of its width, y a fraction of its height.

export interface Wheel {
  x: number;
  y: number;
  r: number;
}

export interface WheelSpec {
  front: Wheel;
  rear: Wheel;
}

const inRange = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

const isWheel = (w: unknown): w is Wheel => {
  const o = w as Wheel;
  return !!o && inRange(o.x, 0, 1) && inRange(o.y, 0, 1) && inRange(o.r, 0.01, 0.5);
};

/** Wheel positions from stored or submitted JSON; null if missing or invalid. */
export function parseWheels(json: string | null | undefined): WheelSpec | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as WheelSpec;
    return isWheel(v?.front) && isWheel(v?.rear)
      ? { front: pick(v.front), rear: pick(v.rear) }
      : null;
  } catch {
    return null;
  }
}

const round = (n: number) => Math.round(n * 10000) / 10000;
const pick = (w: Wheel): Wheel => ({ x: round(w.x), y: round(w.y), r: round(w.r) });

/**
 * A first guess for a photo cropped tight to the car: two wheels about 17% of
 * the width across, sitting on the bottom edge, 19% in from each end.
 * `aspect` is height / width.
 */
export function guessWheels(aspect: number, facesRight = false): WheelSpec {
  const r = 0.075;
  const y = Math.max(0.5, 1 - r / aspect);
  const left = { x: 0.2, y, r };
  const right = { x: 0.81, y, r };
  return facesRight ? { front: right, rear: left } : { front: left, rear: right };
}

/**
 * CSS for a wheel layer: a circle the size of the wheel, showing that part of
 * the photo, positioned over the wheel. Turning the layer turns the wheel.
 */
export function wheelStyle(w: Wheel, aspect: number, src: string) {
  const pct = (n: number) => `${Math.round(n * 1e6) / 1e4}%`;
  return {
    left: pct(w.x - w.r),
    top: pct((w.y * aspect - w.r) / aspect),
    width: pct(w.r * 2),
    backgroundImage: `url("${src}")`,
    // The photo at full car width, shifted so the wheel lands in the circle.
    backgroundSize: `${pct(1 / (2 * w.r))} auto`,
    backgroundPosition: `${pct((w.x - w.r) / (1 - 2 * w.r))} ${pct((w.y * aspect - w.r) / (aspect - 2 * w.r))}`,
  };
}

/**
 * How far a wheel turns, in degrees, when the car moves `dx` pixels (negative
 * is left) with a wheel radius of `radiusPx`: rolling without slipping.
 */
export const wheelTurn = (dx: number, radiusPx: number) =>
  radiusPx > 0 ? (dx / radiusPx) * (180 / Math.PI) : 0;
