import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { makeLogos, watchlist } from "@/db/schema";
import { brandLogo, makeKey, type BrandLogo } from "./brand-logos";
import type { ImageUpload } from "./images";

// Logos the owner uploads once per make, in Settings: for brands Simple Icons
// has no emblem for (Mercedes-Benz, Lotus, Pagani…), or to use a better one.
// What's behind a car, in order: a logo uploaded for that car, the make's
// uploaded logo, the brand's Simple Icons emblem, the make's name in type.

export const makeLogoUrl = (key: string, version: string) =>
  `/api/make-logo/${encodeURIComponent(key)}?v=${encodeURIComponent(version)}`;

/** Every uploaded make logo, ready to show, by make key. */
export async function getMakeLogos(): Promise<Record<string, BrandLogo>> {
  const rows = await db
    .select({ makeKey: makeLogos.makeKey, width: makeLogos.width, height: makeLogos.height, updatedAt: makeLogos.updatedAt })
    .from(makeLogos);
  return Object.fromEntries(
    rows.map((r) => [r.makeKey, { url: makeLogoUrl(r.makeKey, r.updatedAt), width: r.width ?? 1, height: r.height ?? 1 }]),
  );
}

/** The logo for a car of this make with no logo of its own: uploaded for the make, else its emblem. */
export function logoForMake(make: string, uploaded: Record<string, BrandLogo>): BrandLogo | null {
  return uploaded[makeKey(make)] ?? brandLogo(make);
}

export async function getMakeLogo(key: string) {
  const [row] = await db.select().from(makeLogos).where(eq(makeLogos.makeKey, key)).limit(1);
  return row;
}

export async function saveMakeLogo(make: string, image: ImageUpload, now = new Date()) {
  const key = makeKey(make);
  if (!key) throw new Error("No make");
  const values = {
    make: make.trim(),
    contentType: image.contentType,
    data: image.data,
    fileName: image.fileName,
    width: image.width,
    height: image.height,
    updatedAt: now.toISOString(),
  };
  await db.insert(makeLogos).values({ makeKey: key, ...values }).onDuplicateKeyUpdate({ set: values });
}

export async function deleteMakeLogo(key: string) {
  await db.delete(makeLogos).where(eq(makeLogos.makeKey, key));
}

export interface MakeRow {
  key: string;
  /** As typed on the first car of that make. */
  make: string;
  cars: number;
  /** What's shown behind its cars without a logo of their own. */
  shows: "uploaded" | "emblem" | "name";
  logo: BrandLogo | null;
}

/** Each make on anyone's watchlist, and the logo its cars get, for Settings. */
export async function listMakes(): Promise<MakeRow[]> {
  const uploaded = await getMakeLogos();
  const cars = await db.select({ make: watchlist.make }).from(watchlist).orderBy(asc(watchlist.make));
  const byKey = new Map<string, MakeRow>();
  for (const { make } of cars) {
    const key = makeKey(make);
    if (!key) continue;
    const row = byKey.get(key);
    if (row) {
      row.cars++;
      continue;
    }
    const logo = uploaded[key] ?? brandLogo(make);
    byKey.set(key, { key, make, cars: 1, shows: uploaded[key] ? "uploaded" : logo ? "emblem" : "name", logo });
  }
  return [...byKey.values()].sort((a, b) => a.make.localeCompare(b.make));
}
