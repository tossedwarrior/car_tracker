import type { WheelSpec } from "./wheels";

// A stand-in for a car with no photo: a plain outline of its body style
// (public/outlines/*.svg, drawn by scripts/draw-outlines.py), with spoked
// wheels at known positions so it drives and its wheels turn like a photo.

export const bodyStyles = ["coupe", "convertible", "suv", "sedan"] as const;
export type BodyStyle = (typeof bodyStyles)[number];

export interface Outline {
  style: BodyStyle;
  url: string;
  width: number;
  height: number;
  wheels: WheelSpec;
  facesRight: false;
}

/** Sizes and wheels as printed by scripts/draw-outlines.py. */
const OUTLINES: Record<BodyStyle, Omit<Outline, "style" | "url" | "facesRight">> = {
  coupe: {
    width: 2400,
    height: 475,
    wheels: { front: { x: 0.2167, y: 0.6526, r: 0.0688 }, rear: { x: 0.7833, y: 0.6526, r: 0.0688 } },
  },
  convertible: {
    width: 2400,
    height: 412,
    wheels: { front: { x: 0.2167, y: 0.5995, r: 0.0688 }, rear: { x: 0.7833, y: 0.5995, r: 0.0688 } },
  },
  suv: {
    width: 2400,
    height: 575,
    wheels: { front: { x: 0.225, y: 0.6696, r: 0.0792 }, rear: { x: 0.7833, y: 0.6696, r: 0.0792 } },
  },
  sedan: {
    width: 2400,
    height: 455,
    wheels: { front: { x: 0.225, y: 0.6264, r: 0.0708 }, rear: { x: 0.7792, y: 0.6264, r: 0.0708 } },
  },
};

const CONVERTIBLE = /\b(spider|spyder|roadster|cabrio(let)?|convertible|volante|aperta|targa|speedster|barchetta|drophead|dawn|corniche)\b/i;
const SUV = new RegExp(
  "\\b(" +
    [
      "urus", "purosangue", "cayenne", "macan", "dbx", "bentayga", "cullinan", "levante", "grecale",
      "g[- ]?class", "g ?63", "g ?wagon", "range rover", "defender", "escalade", "x[3-7] ?m", "xm",
      "rs ?q8", "sq[5-8]", "q[5-8]", "gl[es]", "model [xy]", "lyriq", "navigator", "suv", "4x4",
    ].join("|") +
    ")\\b",
  "i",
);
const SEDAN = new RegExp(
  "\\b(" +
    [
      "panamera", "taycan", "quattroporte", "ghibli", "rapide", "lagonda", "flying spur", "mulsanne", "ghost",
      "phantom", "s-class", "s ?[5-6]\\d{2}", "maybach", "m[3-5]", "rs ?[3-7]", "e ?63", "c ?63", "model s",
      "lucid air", "ct[4-5]", "sedan", "saloon", "4-door", "four[- ]door", "gran coupe", "sportback",
    ].join("|") +
    ")\\b",
  "i",
);

/** A car's body style from its make, model and trim; a coupe unless something says otherwise. */
export function bodyStyleOf(car: { make: string; model: string; trim?: string | null }): BodyStyle {
  const name = `${car.make} ${car.model} ${car.trim ?? ""}`;
  if (CONVERTIBLE.test(name)) return "convertible";
  if (SUV.test(name)) return "suv";
  if (SEDAN.test(name)) return "sedan";
  return "coupe";
}

export function outlineFor(car: { make: string; model: string; trim?: string | null }): Outline {
  const style = bodyStyleOf(car);
  return { style, url: `/outlines/${style}.svg`, facesRight: false, ...OUTLINES[style] };
}

type Drawable = { url: string; width: number | null; height: number | null; wheels: WheelSpec | null; facesRight: boolean };

/** What the home page draws for a car: its photo, or its outline until it has one. */
export function drawnCar<P extends Drawable>(car: { images: { photo?: P }; outline: Outline | null }): P | Outline | null {
  const photo = car.images.photo;
  return photo?.width && photo.height ? photo : car.outline;
}
