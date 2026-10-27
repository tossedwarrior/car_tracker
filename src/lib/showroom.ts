// The expanded home view's motion, as plain numbers so it can be tested.
//
// `u` is how far the scroll is from a car's own spot, in screens: 0 is the
// car parked in the middle, -1 the screen before it (still to come), +1 the
// screen after (gone past). Between two cars, the current one accelerates
// away to the left, then the next drives in from the right and brakes to a
// stop, and its text fades up from below.

/** Screens either side of a car's spot where it stays parked. */
export const HOLD = 0.08;
/** Leaving runs from HOLD to here... */
export const LEAVE_END = 0.56;
/** ...and the next car arrives from here (screens before its spot) to ARRIVE_END. */
export const ARRIVE_START = 0.6;
export const ARRIVE_END = 0.1;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (t: number) => t * t * (3 - 2 * t);

export interface SceneMotion {
  /** Car offset from the centre, in pixels (negative is left). */
  x: number;
  /** Small vertical bounce while moving, in pixels. */
  bob: number;
  /** Fully off the stage either side. */
  offStage: boolean;
  textOpacity: number;
  /** Text offset: up as it leaves, rising from below as it arrives. */
  textY: number;
  logoOpacity: number;
}

export function sceneMotion(u: number, stageW: number, carW: number): SceneMotion {
  const leaving = clamp01((u - HOLD) / (LEAVE_END - HOLD));
  const arriving = clamp01((-u - ARRIVE_END) / (ARRIVE_START - ARRIVE_END));
  const away = stageW / 2 + carW / 2 + 48;
  // Distance grows with t² while leaving (speeding up) and shrinks with t²
  // while arriving (slowing down), so the car accelerates out and brakes in.
  const x = u >= 0 ? -away * leaving * leaving : away * arriving * arriving;
  // Text stays while the car is parked, and fades as soon as it moves off.
  const fade = u >= 0 ? clamp01((u - HOLD) / 0.18) : clamp01((-u - 0.04) / 0.22);
  const textOpacity = 1 - smooth(fade);
  return {
    x,
    bob: x === 0 ? 0 : Math.sin(x / 22) * 1.2,
    offStage: (u >= 0 && leaving >= 1) || (u < 0 && arriving >= 1),
    textOpacity,
    textY: u >= 0 ? -12 * (1 - textOpacity) : 32 * (1 - textOpacity),
    logoOpacity: 0.05 * (1 - smooth(clamp01((Math.abs(u) - 0.05) / 0.4))),
  };
}
