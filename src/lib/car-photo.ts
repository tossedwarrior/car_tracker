import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp, { type OutputInfo } from "sharp";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { watchImages, watchlist } from "@/db/schema";
import { CARSXE_KEY_ENV, findCarImages, type CarImage, type FetchLike } from "@/sources/carsxe";
import { MAX_IMAGE_BYTES, saveCarPhotoSettings, saveImage } from "./images";
import type { WheelSpec } from "./wheels";

// A car photo for the home page's drive-by, found online so nobody has to
// prepare one: CarsXE suggests side-on photos (src/sources/carsxe.ts); this
// downloads them one by one and keeps the first that works: a transparent
// background, a car-shaped outline, and two wheels it can find. It crops the
// photo tight to the car and marks the wheels, just as the upload form asks
// people to. The owner can still replace it or adjust the wheels by hand.

/** Longest edge kept; the home page never shows a car wider than this. */
const MAX_WIDTH = 2400;
/** A side-on car is this many times wider than tall. */
const MIN_ASPECT = 1.8;
const MAX_ASPECT = 5;

// ---------- Finding the wheels ----------

/**
 * Find the two wheels in a car's outline: `opaque` is 1 for each pixel of
 * the car (row by row, `width` × `height`), cropped tight to the car.
 *
 * The tyres are what touch the bottom edge, so each contact patch gives a
 * wheel's centre across. Moving out from it, the car's lowest edge follows
 * the bottom of the tyre, a circle resting on the ground: a point `dx`
 * along and `d` up lies on a circle of radius (dx² + d²) / 2d. Where the
 * edge stops rising, the body has taken over. Returns null when the outline
 * doesn't look like two wheels on the ground.
 */
export function findWheels(opaque: Uint8Array, width: number, height: number): WheelSpec | null {
  // How far above the bottom edge each column's lowest car pixel is.
  const lift = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let y = height - 1;
    while (y >= 0 && !opaque[y * width + x]) y--;
    lift[x] = y < 0 ? Infinity : height - 1 - y;
  }

  // Runs of columns on the ground, with tiny gaps (tread pattern) bridged.
  const touching = (x: number) => lift[x] <= Math.max(1, height * 0.012);
  const gap = Math.max(2, Math.round(width * 0.01));
  const runs: Array<{ start: number; end: number }> = [];
  for (let x = 0; x < width; x++) {
    if (!touching(x)) continue;
    const last = runs.at(-1);
    if (last && x - last.end <= gap) last.end = x;
    else runs.push({ start: x, end: x });
  }
  // One long run is a shadow or a body touching the ground, not tyres.
  if (runs.some((r) => r.end - r.start > width * 0.35)) return null;
  const biggest = [...runs].sort((a, b) => b.end - b.start - (a.end - a.start)).slice(0, 2);
  if (biggest.length < 2) return null;
  const [left, right] = biggest.sort((a, b) => a.start - b.start);

  const wheel = (run: { start: number; end: number }) => {
    const cx = (run.start + run.end) / 2;
    const estimates: number[] = [];
    // The edge stops rising for this many columns: the body has taken over.
    // (Near the ground the tyre itself rises less than a pixel a column.)
    const flatLimit = Math.max(4, Math.round(width * 0.012));
    for (const dir of [-1, 1]) {
      let flat = 0;
      let peak = 0;
      let keep = estimates.length; // estimates before the current flat stretch
      const edge = dir < 0 ? run.start : run.end;
      for (let x = edge + dir; x >= 0 && x < width && Math.abs(x - cx) < width * 0.2; x += dir) {
        const d = lift[x];
        if (!Number.isFinite(d)) break;
        if (d > peak) {
          peak = d;
          flat = 0;
          keep = estimates.length;
        } else if (++flat >= flatLimit) {
          estimates.length = keep; // drop what was measured along the body
          break;
        }
        if (d >= Math.max(3, height * 0.015)) estimates.push(((x - cx) ** 2 + d ** 2) / (2 * d));
      }
    }
    if (estimates.length < 4) return null;
    estimates.sort((a, b) => a - b);
    const r = estimates[Math.floor(estimates.length / 2)];
    return { x: cx / width, y: (height - r) / height, r: r / width };
  };

  const a = wheel(left);
  const b = wheel(right);
  if (!a || !b) return null;
  if (Math.abs(a.r - b.r) / Math.max(a.r, b.r) > 0.3) return null;
  // Same size: real wheels on a side-on photo are, near enough.
  const r = (a.r + b.r) / 2;
  const y = 1 - (r * width) / height;
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const wheels = { front: { x: round(a.x), y: round(y), r: round(r) }, rear: { x: round(b.x), y: round(y), r: round(r) } };
  // A wheel above the top of the photo isn't a wheel.
  if (y - (r * width) / height < -0.05) return null;
  return sideOnWheels(wheels, width, height) ? wheels : null;
}

/** A tyre's radius over its rim's, a little under the real ratio (about 1.25 on low-profile tyres) so the turning circle never takes in the wheel arch. */
export const TYRE_TO_RIM = 1.24;

/**
 * Find the two wheels by their shape: for photos where a shadow or the
 * angle stops findWheels() reading them off the bottom edge. Polished rims
 * against black tyres make the strongest circles in a car's lower half, so
 * each edge pixel votes for the circle centres it could lie on (a circle
 * Hough transform), and the two best-supported circles, side by side and
 * about the same size, are the rims. The tyre is TYRE_TO_RIM times wider.
 *
 * `rgba` is the photo cropped to the car, 4 bytes a pixel; keep it small
 * (500 px wide is plenty), since the work grows with width cubed.
 */
export function findWheelsByCircles(rgba: Uint8Array, width: number, height: number): WheelSpec | null {
  const n = width * height;
  // Brightness, with see-through pixels as mid-grey so the car's outline is an edge too.
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    const l = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    lum[i] = l * a + 160 * (1 - a);
  }
  // Edges (Sobel), keeping the strongest 15%.
  const gx = new Float32Array(n);
  const gy = new Float32Array(n);
  const mag = new Float32Array(n);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const L = (dx: number, dy: number) => lum[i + dy * width + dx];
      gx[i] = L(1, -1) + 2 * L(1, 0) + L(1, 1) - L(-1, -1) - 2 * L(-1, 0) - L(-1, 1);
      gy[i] = L(-1, 1) + 2 * L(0, 1) + L(1, 1) - L(-1, -1) - 2 * L(0, -1) - L(1, -1);
      mag[i] = Math.hypot(gx[i], gy[i]);
    }
  }
  const strong = [...mag].filter((m) => m > 0).sort((a, b) => a - b);
  if (strong.length < 100) return null;
  const threshold = Math.max(40, strong[Math.floor(strong.length * 0.85)]);

  // Votes for (centre, rim radius), centres in the lower 70% of the car.
  const rMin = Math.max(4, Math.round(width * 0.03));
  const rMax = Math.max(rMin + 1, Math.round(width * 0.11));
  const nR = rMax - rMin + 1;
  const top = Math.floor(height * 0.3);
  const acc = new Float32Array(width * height * nR);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (mag[i] < threshold) continue;
      const nx = gx[i] / mag[i];
      const ny = gy[i] / mag[i];
      for (let r = rMin; r <= rMax; r++) {
        for (const side of [-1, 1]) {
          const cx = Math.round(x + side * r * nx);
          const cy = Math.round(y + side * r * ny);
          if (cx < 0 || cx >= width || cy < top || cy >= height) continue;
          acc[(cy * width + cx) * nR + (r - rMin)] += 1;
        }
      }
    }
  }
  // Each circle's support: votes near its centre over its circumference.
  const score = (cx: number, cy: number, k: number) => {
    let v = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < width && y >= 0 && y < height) v += acc[(y * width + x) * nR + k];
      }
    }
    return v / (2 * Math.PI * (k + rMin));
  };
  type Circle = { x: number; y: number; r: number; s: number };
  const candidates: Circle[] = [];
  for (let y = top; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let k = 0; k < nR; k++) {
        if (acc[(y * width + x) * nR + k] < 3) continue;
        const s = score(x, y, k);
        if (s >= 0.5) candidates.push({ x, y, r: k + rMin, s });
      }
    }
  }
  candidates.sort((a, b) => b.s - a.s);

  // The best-supported pair that could be a side-on car's wheels.
  const leaders = candidates.slice(0, 300);
  let best: { a: Circle; b: Circle; tyre: number; s: number } | null = null;
  for (let i = 0; i < leaders.length; i++) {
    for (let j = i + 1; j < leaders.length; j++) {
      const [a, b] = [leaders[i], leaders[j]].sort((p, q) => p.x - q.x);
      if (Math.abs(a.r - b.r) / Math.max(a.r, b.r) > 0.25) continue;
      const tyre = ((a.r + b.r) / 2) * TYRE_TO_RIM;
      const wheels = {
        front: { x: a.x / width, y: a.y / height, r: tyre / width },
        rear: { x: b.x / width, y: b.y / height, r: tyre / width },
      };
      if (!sideOnWheels(wheels, width, height)) continue;
      const s = a.s + b.s;
      if (!best || s > best.s) best = { a, b, tyre, s };
    }
  }
  if (!best) return null;
  const round = (v: number) => Math.round(v * 10000) / 10000;
  const wheel = (c: Circle) => ({ x: round(c.x / width), y: round(c.y / height), r: round(best.tyre / width) });
  return { front: wheel(best.a), rear: wheel(best.b) };
}

/**
 * Whether two wheels (fractions of a photo cropped to the car) fit a
 * side-on view: level with each other, about the same size, resting on the
 * ground, and a wheelbase apart. A three-quarter view fails: its far wheel
 * sits higher and smaller.
 */
export function sideOnWheels(w: WheelSpec, width: number, height: number): boolean {
  const { front, rear } = w;
  const level = Math.abs(front.y - rear.y) <= 0.06;
  const sized = [front, rear].every((v) => v.r >= 0.045 && v.r <= 0.15);
  // The bottom of each tyre, as a fraction of the car's height.
  const grounded = [front, rear].every((v) => v.y + (v.r * width) / height >= 0.9);
  const spacing = rear.x - front.x;
  return level && sized && grounded && spacing >= 0.48 && spacing <= 0.78;
}

// ---------- Preparing a photo ----------

export interface PreparedPhoto {
  data: Buffer;
  width: number;
  height: number;
  wheels: WheelSpec;
}

/**
 * Turn a downloaded image into a home-page car photo, or say why it won't
 * do: it needs a transparent background around a side-on car with two
 * findable wheels. Crops to the car (soft shadows left out) and saves a PNG.
 */
export async function prepareCarPhoto(bytes: Buffer): Promise<PreparedPhoto | { reject: string }> {
  let raw: { data: Buffer; info: OutputInfo };
  try {
    raw = await sharp(bytes, { limitInputPixels: 40_000_000 })
      .rotate()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    return { reject: "not an image" };
  }
  const { width: W, height: H, channels } = raw.info;
  const alpha = (x: number, y: number) => raw.data[(y * W + x) * channels + channels - 1];

  // A real cut-out: almost all of the border is see-through.
  let clear = 0;
  let border = 0;
  for (let x = 0; x < W; x += 2) for (const y of [0, H - 1]) (border++, alpha(x, y) < 16 && clear++);
  for (let y = 0; y < H; y += 2) for (const x of [0, W - 1]) (border++, alpha(x, y) < 16 && clear++);
  if (clear / border < 0.9) return { reject: "no transparent background" };

  // Tight to the car's solid pixels (a soft shadow is mostly see-through).
  let [x0, y0, x1, y1] = [W, H, -1, -1];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (alpha(x, y) < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { reject: "empty image" };
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w < 500) return { reject: `too small (${w} px wide)` };
  if (w / h < MIN_ASPECT || w / h > MAX_ASPECT) return { reject: "not a side-on view" };

  const opaque = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) opaque[y * w + x] = alpha(x0 + x, y0 + y) >= 128 ? 1 : 0;
  let wheels = findWheels(opaque, w, h);
  if (!wheels) {
    // A shadow under the car, or one tyre lower than the other: look for the
    // rims instead, on a copy about 500 px wide.
    const small = Math.min(1, 500 / w);
    const sw = Math.round(w * small);
    const sh = Math.round(h * small);
    const rgba = await sharp(raw.data, { raw: { width: W, height: H, channels } })
      .extract({ left: x0, top: y0, width: w, height: h })
      .resize(sw, sh)
      .ensureAlpha()
      .raw()
      .toBuffer();
    wheels = findWheelsByCircles(rgba, sw, sh);
  }
  if (!wheels) return { reject: "couldn't find two wheels" };

  const scale = Math.min(1, MAX_WIDTH / w);
  const outW = Math.round(w * scale);
  const outH = Math.round(h * scale);
  const data = await sharp(raw.data, { raw: { width: W, height: H, channels } })
    .extract({ left: x0, top: y0, width: w, height: h })
    .resize(outW, outH)
    .png({ compressionLevel: 9 })
    .toBuffer();
  if (data.length > MAX_IMAGE_BYTES) return { reject: "too large" };
  return { data, width: outW, height: outH, wheels };
}

// ---------- Downloading from other sites ----------

/** True for addresses on this machine or a private network, which a link must never reach. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** A host's addresses. Tests pass their own. */
export type Resolve = (host: string) => Promise<string[]>;
const dnsResolve: Resolve = async (host) => (await lookup(host, { all: true })).map((a) => a.address);

async function checkUrl(raw: string, resolve: Resolve): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("not a web link");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await resolve(host);
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error("not a public address");
  return url;
}

/**
 * Download an image from another site: public addresses only (redirects
 * included), 15 seconds, at most MAX_IMAGE_BYTES.
 */
export async function downloadImage(
  link: string,
  fetchImpl: FetchLike = fetch,
  resolve: Resolve = dnsResolve,
): Promise<Buffer> {
  let url = await checkUrl(link, resolve);
  for (let hops = 0; ; hops++) {
    const res = await fetchImpl(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: { Accept: "image/*" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (hops >= 3) throw new Error("too many redirects");
      url = await checkUrl(new URL(res.headers.get("location")!, url).toString(), resolve);
      continue;
    }
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    if (Number(res.headers.get("content-length")) > MAX_IMAGE_BYTES) throw new Error("too large");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > MAX_IMAGE_BYTES) throw new Error("too large");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

// ---------- Looking one up for a car ----------

export type PhotoLookup =
  | { status: "saved"; source: string | null; tried: number }
  | { status: "none_usable"; tried: number; reasons: string[] }
  | { status: "has_photo" | "already_looked" | "no_key" | "no_car" };

/**
 * Give a car search a photo if it has none: ask CarsXE once (a credit each
 * time), then keep the first suggestion that prepares cleanly. `force` asks
 * again even after an earlier lookup, and replaces an existing photo.
 */
export async function lookUpCarPhoto(
  watchId: number,
  {
    force = false,
    fetchImpl = fetch,
    resolve = dnsResolve,
    now = new Date(),
    onSuggestion,
  }: {
    force?: boolean;
    fetchImpl?: FetchLike;
    resolve?: Resolve;
    now?: Date;
    /** Each downloaded suggestion and what became of it, for checking by hand. */
    onSuggestion?: (s: CarImage, bytes: Buffer, outcome: string) => Promise<void> | void;
  } = {},
): Promise<PhotoLookup> {
  const [watch] = await db.select().from(watchlist).where(eq(watchlist.id, watchId)).limit(1);
  if (!watch) return { status: "no_car" };
  const hasPhoto = (
    await db.select({ kind: watchImages.kind }).from(watchImages).where(eq(watchImages.watchId, watchId))
  ).some((r) => r.kind === "photo");
  if (hasPhoto && !force) return { status: "has_photo" };
  if (watch.photoLookupAt && !force) return { status: "already_looked" };
  const key = process.env[CARSXE_KEY_ENV]?.trim();
  if (!key) return { status: "no_key" };

  // Marked first, so two people adding the same car at once spend one credit.
  await db.update(watchlist).set({ photoLookupAt: now.toISOString() }).where(eq(watchlist.id, watchId));
  const year = Math.round((watch.yearMin + watch.yearMax) / 2);
  let suggestions: CarImage[];
  try {
    suggestions = await findCarImages({ make: watch.make, model: watch.model, year, trim: watch.trim }, key, fetchImpl);
  } catch (e) {
    // The request failed (CarsXE down, or out of credits): not a real lookup,
    // so the next try isn't refused.
    await db.update(watchlist).set({ photoLookupAt: watch.photoLookupAt }).where(eq(watchlist.id, watchId));
    throw e;
  }

  // PNGs first (they can have a transparent background), then the largest.
  const isPng = (s: CarImage) => s.mime === "image/png" || /\.png(\?|$)/i.test(s.link);
  suggestions.sort((a, b) => Number(isPng(b)) - Number(isPng(a)) || (b.width ?? 0) - (a.width ?? 0));

  const reasons: string[] = [];
  for (const s of suggestions) {
    let prepared: Awaited<ReturnType<typeof prepareCarPhoto>>;
    let bytes: Buffer;
    try {
      bytes = await downloadImage(s.link, fetchImpl, resolve);
      prepared = await prepareCarPhoto(bytes);
    } catch (e) {
      reasons.push(`${host(s.link)}: ${(e as Error).message}`);
      continue;
    }
    await onSuggestion?.(s, bytes, "reject" in prepared ? prepared.reject : "kept");
    if ("reject" in prepared) {
      reasons.push(`${host(s.link)}: ${prepared.reject}`);
      continue;
    }
    const source = s.contextLink ?? s.link;
    await saveImage(
      watchId,
      "photo",
      { contentType: "image/png", data: prepared.data, fileName: `${watch.make} ${watch.model}.png`, width: prepared.width, height: prepared.height, sourceUrl: source },
      now,
    );
    await saveCarPhotoSettings(watchId, { wheels: prepared.wheels, facesRight: false });
    return { status: "saved", source, tried: reasons.length + 1 };
  }
  return { status: "none_usable", tried: suggestions.length, reasons };
}

const host = (link: string) => {
  try {
    return new URL(link).hostname;
  } catch {
    return "?";
  }
};
