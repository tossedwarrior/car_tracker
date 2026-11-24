// CarsXE's Vehicle Images API: photos of a make and model found around the
// web (https://api.carsxe.com/docs/v1/images). Used to find a side-on photo
// for a car nobody has uploaded one for. The images live on other sites;
// `link` is theirs and `contextLink` the page it's on. CarsXE's usage-rights
// labels come from those sites, and don't themselves grant a license.
//
// Each request costs a CarsXE credit (the free sandbox has 50 or 100, once),
// so the app asks once per car search (watchlist.photo_lookup_at).

export const CARSXE_KEY_ENV = "CARSXE_API_KEY";

export interface CarImageQuery {
  make: string;
  model: string;
  year?: number;
  trim?: string | null;
}

export interface CarImage {
  link: string;
  contextLink: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The request URL, key included; never log it. */
export function carImagesUrl(q: CarImageQuery, key: string, license = process.env.CARSXE_LICENSE?.trim()): string {
  const url = new URL("https://api.carsxe.com/images");
  const params: Record<string, string> = {
    key,
    make: q.make,
    model: q.model,
    angle: "side",
    transparent: "true",
    format: "json",
  };
  if (q.year) params.year = String(q.year);
  if (q.trim) params.trim = q.trim;
  // e.g. "ShareCommercially" to ask only for images labelled for reuse.
  if (license) params.license = license;
  url.search = new URLSearchParams(params).toString();
  return url.toString();
}

/**
 * Side-on photos of a car, best first. Empty when CarsXE has none; throws
 * (with CarsXE's message, never the key) when the request itself fails.
 */
export async function findCarImages(q: CarImageQuery, key: string, fetchImpl: FetchLike = fetch): Promise<CarImage[]> {
  const res = await fetchImpl(carImagesUrl(q, key), { signal: AbortSignal.timeout(60_000) });
  const text = await res.text().catch(() => "");
  let body: { success?: boolean; message?: string; error?: string; images?: Array<Record<string, unknown>> } | null = null;
  try {
    body = JSON.parse(text);
  } catch {}
  const message = body?.message || body?.error || "";
  if (/no images/i.test(message)) return [];
  if (!res.ok || !body || body.success === false) {
    // CarsXE's own words, never the request (it has the key in it).
    const said = message || text.replace(/\s+/g, " ").slice(0, 200).replaceAll(key, "…");
    throw new Error(`CarsXE: HTTP ${res.status}${said ? `, ${said}` : ""}`);
  }
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  return (body.images ?? []).flatMap((i) => {
    const link = str(i.link);
    return link
      ? [{ link, contextLink: str(i.contextLink), mime: str(i.mime), width: num(i.width), height: num(i.height), byteSize: num(i.byteSize) }]
      : [];
  });
}
