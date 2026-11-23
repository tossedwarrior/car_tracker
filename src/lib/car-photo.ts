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

type Raw = { data: Buffer; info: OutputInfo };
type Box = { x0: number; y0: number; w: number; h: number };

/** An image as RGBA pixels, upright, or null if it isn't one. */
async function decode(bytes: Buffer, maxWidth?: number): Promise<Raw | null> {
  try {
    let img = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate();
    if (maxWidth) img = img.resize({ width: maxWidth, withoutEnlargement: true });
    return await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    return null;
  }
}

const alphaAt = (raw: Raw, x: number, y: number) => {
  const { width, channels } = raw.info;
  return raw.data[(y * width + x) * channels + channels - 1];
};

/** Whether almost all of the image's border is see-through: a real cut-out. */
function clearBorder(raw: Raw): boolean {
  const { width: W, height: H } = raw.info;
  let clear = 0;
  let border = 0;
  for (let x = 0; x < W; x += 2) for (const y of [0, H - 1]) (border++, alphaAt(raw, x, y) < 16 && clear++);
  for (let y = 0; y < H; y += 2) for (const x of [0, W - 1]) (border++, alphaAt(raw, x, y) < 16 && clear++);
  return clear / border >= 0.9;
}

/** Tight round the car's solid pixels (a soft shadow is mostly see-through). */
function cropBox(raw: Raw): Box | null {
  const { width: W, height: H } = raw.info;
  let [x0, y0, x1, y1] = [W, H, -1, -1];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (alphaAt(raw, x, y) < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The wheels inside the crop: from where the tyres touch the ground, else from the rims. */
async function wheelsIn(raw: Raw, box: Box): Promise<WheelSpec | null> {
  const { x0, y0, w, h } = box;
  const opaque = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) opaque[y * w + x] = alphaAt(raw, x0 + x, y0 + y) >= 128 ? 1 : 0;
  const wheels = findWheels(opaque, w, h);
  if (wheels) return wheels;
  // A shadow under the car, or one tyre lower than the other: look for the
  // rims instead, on a copy about 500 px wide.
  const small = Math.min(1, 500 / w);
  const sw = Math.round(w * small);
  const sh = Math.round(h * small);
  const { width: W, height: H, channels } = raw.info;
  const rgba = await sharp(raw.data, { raw: { width: W, height: H, channels } })
    .extract({ left: x0, top: y0, width: w, height: h })
    .resize(sw, sh)
    .ensureAlpha()
    .raw()
    .toBuffer();
  return findWheelsByCircles(rgba, sw, sh);
}

/** The crop as a PNG at most MAX_WIDTH wide. */
async function exportPng(raw: Raw, box: Box) {
  const { width: W, height: H, channels } = raw.info;
  const scale = Math.min(1, MAX_WIDTH / box.w);
  const width = Math.round(box.w * scale);
  const height = Math.round(box.h * scale);
  const data = await sharp(raw.data, { raw: { width: W, height: H, channels } })
    .extract({ left: box.x0, top: box.y0, width: box.w, height: box.h })
    .resize(width, height)
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { data, width, height };
}

/**
 * Turn a downloaded image into a home-page car photo, or say why it won't
 * do: it needs a transparent background around a side-on car with two
 * findable wheels. Crops to the car (soft shadows left out) and saves a PNG.
 */
export async function prepareCarPhoto(bytes: Buffer): Promise<PreparedPhoto | { reject: string }> {
  const raw = await decode(bytes);
  if (!raw) return { reject: "not an image" };
  if (!clearBorder(raw)) return { reject: "no transparent background" };
  const box = cropBox(raw);
  if (!box) return { reject: "empty image" };
  if (box.w < 500) return { reject: `too small (${box.w} px wide)` };
  if (box.w / box.h < MIN_ASPECT || box.w / box.h > MAX_ASPECT) return { reject: "not a side-on view" };
  const wheels = await wheelsIn(raw, box);
  if (!wheels) return { reject: "couldn't find two wheels" };
  const png = await exportPng(raw, box);
  if (png.data.length > MAX_IMAGE_BYTES) return { reject: "too large" };
  return { ...png, wheels };
}

// ---------- Uploaded photos ----------

/** Colour distance between two pixels (RGB, 0–441). */
const dist = (d: Buffer, i: number, r: number, g: number, b: number) =>
  Math.hypot(d[i] - r, d[i + 1] - g, d[i + 2] - b);

/**
 * Make a plain background see-through: the colour most of the border shares
 * (white, grey, a studio backdrop), flooded in from the edges so the car
 * itself is left alone even where it's a similar colour. Follows gentle
 * gradients, and softens the car's outline by a pixel. Returns false, and
 * changes nothing, when the background isn't plain enough to tell apart.
 */
export function removePlainBackground(raw: Raw): boolean {
  const { width: W, height: H, channels: C } = raw.info;
  const d = raw.data;
  const at = (x: number, y: number) => (y * W + x) * C;

  // The background's colour: the median of the border's.
  const border: number[] = [];
  for (let x = 0; x < W; x++) border.push(at(x, 0), at(x, H - 1));
  for (let y = 0; y < H; y++) border.push(at(0, y), at(W - 1, y));
  const median = (k: number) => border.map((i) => d[i + k]).sort((a, b) => a - b)[border.length >> 1];
  const [r, g, b] = [median(0), median(1), median(2)];
  const near = border.filter((i) => dist(d, i, r, g, b) < 40).length;
  if (near / border.length < 0.8) return false; // a busy background: a street, a showroom

  // Flood in from the border: background is close to its colour, or barely
  // different from the background pixel next to it (a gradient).
  const bg = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  for (const i of border) {
    const p = i / C;
    if (!bg[p] && dist(d, i, r, g, b) < 40) (bg[p] = 1, (queue[tail++] = p));
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % W;
    const y = (p - x) / W;
    const i = p * C;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (bg[q]) continue;
      const j = q * C;
      const toBg = dist(d, j, r, g, b);
      const step = Math.hypot(d[j] - d[i], d[j + 1] - d[i + 1], d[j + 2] - d[i + 2]);
      if (toBg < 48 || (step < 6 && toBg < 90)) (bg[q] = 1, (queue[tail++] = q));
    }
  }
  // Something has to be left that's car-sized, not a speck or the whole frame.
  const kept = W * H - tail;
  if (kept < W * H * 0.03 || kept > W * H * 0.97) return false;

  // Keep the car: the biggest piece left, and any other piece at least a
  // fifth its size. Specks of a textured wall or floor go with the background.
  const piece = new Int32Array(W * H).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < W * H; start++) {
    if (bg[start] || piece[start] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    head = tail = 0;
    queue[tail++] = start;
    piece[start] = id;
    while (head < tail) {
      const p = queue[head++];
      size++;
      const x = p % W;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (q < 0 || q >= W * H || bg[q] || piece[q] >= 0) continue;
        piece[q] = id;
        queue[tail++] = q;
      }
    }
    sizes.push(size);
  }
  const biggest = Math.max(...sizes);
  for (let p = 0; p < W * H; p++) if (!bg[p] && sizes[piece[p]] < biggest / 5) bg[p] = 1;

  for (let p = 0; p < W * H; p++) {
    const i = p * C + C - 1;
    if (bg[p]) {
      d[i] = 0;
      continue;
    }
    // The outline: as see-through as it is close to the background.
    const x = p % W;
    const y = (p - x) / W;
    const edge = (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (y > 0 && bg[p - W]) || (y < H - 1 && bg[p + W]);
    if (edge) d[i] = Math.min(d[i], Math.round(Math.max(0, Math.min(1, (dist(d, p * C, r, g, b) - 10) / 50)) * 255));
  }
  return true;
}

export interface PreparedUpload {
  data: Buffer;
  width: number;
  height: number;
  /** Null when they couldn't be found; the form then guesses. */
  wheels: WheelSpec | null;
  /** "removed" it, it was "already" see-through, or too "busy" to remove (left as it was). */
  background: "removed" | "already" | "busy";
}

/**
 * Do the fiddly part of preparing a car photo for someone uploading one:
 * remove a plain background, crop to the car and find the wheels. Lenient,
 * unlike prepareCarPhoto: it's their photo, so it's never turned down, just
 * left as it is when the background can't be removed.
 */
export async function prepareUpload(bytes: Buffer): Promise<PreparedUpload | { error: string }> {
  // Plenty for the home page, and quick to work on.
  const raw = await decode(bytes, 3000);
  if (!raw) return { error: "That file isn't an image." };
  let background: PreparedUpload["background"] = "already";
  if (!clearBorder(raw)) background = removePlainBackground(raw) ? "removed" : "busy";
  const box = background === "busy" ? null : cropBox(raw);
  const whole = { x0: 0, y0: 0, w: raw.info.width, h: raw.info.height };
  const crop = box ?? whole;
  const found = box ? await wheelsIn(raw, box) : null;
  // Only wheels that fit a side-on car; otherwise the form's guess is as good.
  const wheels = found && sideOnWheels(found, crop.w, crop.h) ? found : null;
  const png = await exportPng(raw, crop);
  if (png.data.length > MAX_IMAGE_BYTES) return { error: "That photo is too large once prepared. Try a smaller one." };
  return { ...png, wheels, background };
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
