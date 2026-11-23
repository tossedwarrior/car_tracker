import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { watchImages, watchlist } from "@/db/schema";
import { carImagesUrl, findCarImages } from "@/sources/carsxe";
import { insertRow, makeUser } from "@/test/db";
import { NextRequest } from "next/server";
import { POST as preparePhotoRoute } from "@/app/api/prepare-photo/route";
import { SESSION_COOKIE } from "@/lib/auth";
import {
  downloadImage,
  findWheels,
  isPrivateAddress,
  lookUpCarPhoto,
  prepareCarPhoto,
  prepareUpload,
  modelMask,
  removeBackground,
} from "./car-photo";
import { createSession } from "./users";
import { getImage } from "./images";

afterEach(() => vi.unstubAllEnvs());

/**
 * A made-up side-on car on a transparent 2400 × 800 canvas: a body from
 * x 200 to 2200, roof at y 250, sill at 620, and two wheels of radius 150
 * centred at x 600 and 1800 resting on y 700.
 */
const carSvg = (background = "none") => `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="800">
  <rect width="2400" height="800" fill="${background}"/>
  <path d="M200 620 L200 450 Q260 380 600 360 L900 250 L1500 250 L1900 380 Q2200 420 2200 620 Z" fill="#c00"/>
  <circle cx="600" cy="550" r="150" fill="#111"/>
  <circle cx="1800" cy="550" r="150" fill="#111"/>
</svg>`;
const png = (svg: string) => sharp(Buffer.from(svg)).png().toBuffer();
const jpeg = (svg: string) => sharp(Buffer.from(svg)).jpeg().toBuffer();

describe("findWheels", () => {
  it("finds two wheels resting on the bottom edge", () => {
    // 200 × 60 outline: body above y 45, wheels of radius 15 at x 40 and 160.
    const [w, h] = [200, 60];
    const opaque = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const wheel = [40, 160].some((cx) => (x - cx) ** 2 + (y - 44.5) ** 2 <= 15 ** 2);
        opaque[y * w + x] = y < 45 || wheel ? 1 : 0;
      }
    }
    const wheels = findWheels(opaque, w, h)!;
    expect(wheels.front.x).toBeCloseTo(0.2, 1);
    expect(wheels.rear.x).toBeCloseTo(0.8, 1);
    expect(wheels.front.r).toBeCloseTo(15 / 200, 2);
  });

  it("gives up on a shape resting flat on the ground", () => {
    const opaque = new Uint8Array(200 * 60).fill(1);
    expect(findWheels(opaque, 200, 60)).toBeNull();
  });
});

describe("prepareCarPhoto", () => {
  it("crops a cut-out to the car and marks its wheels", async () => {
    const prepared = await prepareCarPhoto(await png(carSvg()));
    if ("reject" in prepared) throw new Error(prepared.reject);
    // Cropped to the car: 2001 × 451, about x 200–2200 and y 250–700.
    expect(prepared.width).toBeGreaterThan(1990);
    expect(prepared.height).toBeGreaterThan(440);
    expect(prepared.wheels.front.x).toBeCloseTo(0.2, 1);
    expect(prepared.wheels.rear.x).toBeCloseTo(0.8, 1);
    expect(prepared.wheels.front.r).toBeCloseTo(0.075, 2);
    expect(prepared.wheels.front.y).toBeCloseTo(300 / 450, 1);
    expect((await sharp(prepared.data).metadata()).hasAlpha).toBe(true);
  });

  it("finds the rims when a solid shadow under the car hides where the tyres touch", async () => {
    // Studio photos often have a dark shadow strip along the ground; here it
    // runs under the whole car, and the wheels have silver rims (radius 120).
    const svg = carSvg()
      .replace("</svg>", "")
      .concat(`<rect x="180" y="640" width="2040" height="70" fill="#222"/>
        <circle cx="600" cy="550" r="120" fill="#ccc"/><circle cx="600" cy="550" r="20" fill="#333"/>
        <circle cx="1800" cy="550" r="120" fill="#ccc"/><circle cx="1800" cy="550" r="20" fill="#333"/>
      </svg>`);
    const prepared = await prepareCarPhoto(await png(svg));
    if ("reject" in prepared) throw new Error(prepared.reject);
    const { front, rear } = prepared.wheels;
    const w = prepared.width;
    expect(front.x * w).toBeCloseTo((600 - 180) * (w / 2041), -1.5);
    expect(rear.x * w).toBeCloseTo((1800 - 180) * (w / 2041), -1.5);
    // Rim 120 × 1.24 ≈ 149: the turning circle about fills the 150 tyre.
    expect(front.r * 2041).toBeGreaterThan(135);
    expect(front.r * 2041).toBeLessThan(160);
  });

  it("turns down photos without a transparent background, and non-images", async () => {
    expect(await prepareCarPhoto(await jpeg(carSvg("#fff")))).toEqual({ reject: "no transparent background" });
    expect(await prepareCarPhoto(Buffer.from("hello"))).toEqual({ reject: "not an image" });
  });
});

describe("downloading", () => {
  it("never reaches this machine or a private network", async () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.0.1", "169.254.169.254", "::1", "fd00::1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    const fetch = vi.fn();
    await expect(downloadImage("http://127.0.0.1/a.png", fetch)).rejects.toThrow("not a public address");
    await expect(downloadImage("https://intranet.example/a.png", fetch, async () => ["10.0.0.7"])).rejects.toThrow(
      "not a public address",
    );
    await expect(downloadImage("file:///etc/passwd", fetch)).rejects.toThrow("not a web link");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("follows a redirect only to another public address", async () => {
    const resolve = async (host: string) => (host === "inside.example" ? ["192.168.1.1"] : ["93.184.216.34"]);
    const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://inside.example/x" } }));
    await expect(downloadImage("https://cdn.example/a.png", fetch, resolve)).rejects.toThrow("not a public address");
  });
});

describe("CarsXE", () => {
  it("asks for side-on photos with a transparent background, and reads the links", async () => {
    const url = new URL(carImagesUrl({ make: "Ferrari", model: "458 Italia", year: 2013 }, "KEY"));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      make: "Ferrari",
      model: "458 Italia",
      year: "2013",
      angle: "side",
      transparent: "true",
    });
    const fetch = async () =>
      Response.json({ success: true, images: [{ link: "https://a.example/1.png", contextLink: "https://a.example", width: 2000 }, { mime: "x" }] });
    expect(await findCarImages({ make: "Ferrari", model: "F8" }, "KEY", fetch)).toEqual([
      { link: "https://a.example/1.png", contextLink: "https://a.example", mime: null, width: 2000, height: null, byteSize: null },
    ]);
  });

  it("treats 'no images' as none, and other failures as errors without the key", async () => {
    const none = async () => Response.json({ success: false, message: "No images found" }, { status: 404 });
    expect(await findCarImages({ make: "X", model: "Y" }, "SECRET", none)).toEqual([]);
    const quota = async () => Response.json({ success: false, message: "API usage limit exceeded" }, { status: 429 });
    const error = await findCarImages({ make: "X", model: "Y" }, "SECRET", quota).catch((e: Error) => e);
    expect(String(error)).toContain("API usage limit exceeded");
    expect(String(error)).not.toContain("SECRET");
  });
});

describe("lookUpCarPhoto", () => {
  it("keeps the first suggestion that works, PNGs first, once per car", async () => {
    vi.stubEnv("CARSXE_API_KEY", "KEY");
    const car = await insertRow(watchlist, { make: "Ferrari", model: "Roma", yearMin: 2020, yearMax: 2024 });
    const opaqueJpeg = await jpeg(carSvg("#fff"));
    const cutOut = await png(carSvg());
    const fetch = vi.fn(async (url: string) => {
      if (url.startsWith("https://api.carsxe.com/")) {
        return Response.json({
          success: true,
          images: [
            { link: "https://dealer.example/roma.jpg", contextLink: "https://dealer.example/roma" },
            { link: "https://press.example/roma.png", contextLink: "https://press.example/gallery" },
          ],
        });
      }
      return new Response(new Uint8Array(url.endsWith(".jpg") ? opaqueJpeg : cutOut));
    });
    const resolve = async () => ["93.184.216.34"];

    const result = await lookUpCarPhoto(car.id, { fetchImpl: fetch, resolve });
    // The PNG is tried first, though CarsXE listed the JPEG first.
    expect(result).toEqual({ status: "saved", source: "https://press.example/gallery", tried: 1 });
    const photo = await getImage(car.id, "photo");
    expect(photo).toMatchObject({ contentType: "image/png", sourceUrl: "https://press.example/gallery", facesRight: false });
    expect(JSON.parse(photo!.wheels!).front.x).toBeCloseTo(0.2, 1);
    const carsxeCall = String((fetch.mock.calls[0] as unknown as [string])[0]);
    expect(new URL(carsxeCall).searchParams.get("year")).toBe("2022");

    // Asked once: a second lookup spends nothing.
    expect(await lookUpCarPhoto(car.id, { fetchImpl: fetch, resolve })).toEqual({ status: "has_photo" });
    await db.delete(watchImages).where(eq(watchImages.watchId, car.id));
    expect(await lookUpCarPhoto(car.id, { fetchImpl: fetch, resolve })).toEqual({ status: "already_looked" });
    expect(fetch.mock.calls.filter(([u]) => String(u).includes("carsxe")).length).toBe(1);
  });

  it("lets a failed request be tried again", async () => {
    vi.stubEnv("CARSXE_API_KEY", "KEY");
    const car = await insertRow(watchlist, { make: "Ferrari", model: "F430", yearMin: 2005, yearMax: 2009 });
    const down = vi.fn(async () => new Response("<html>Internal error</html>", { status: 500 }));
    await expect(lookUpCarPhoto(car.id, { fetchImpl: down })).rejects.toThrow("CarsXE: HTTP 500, <html>Internal error</html>");
    expect((await db.select().from(watchlist).where(eq(watchlist.id, car.id)))[0].photoLookupAt).toBeNull();
  });

  it("does nothing without a CarsXE key", async () => {
    const car = await insertRow(watchlist, { make: "Ferrari", model: "SF90", yearMin: 2020, yearMax: 2024 });
    expect(await lookUpCarPhoto(car.id, { fetchImpl: vi.fn() })).toEqual({ status: "no_key" });
    expect((await db.select().from(watchlist).where(eq(watchlist.id, car.id)))[0].photoLookupAt).toBeNull();
  });
});

describe("prepareUpload", () => {
  it("removes a plain background, crops to the car and finds its wheels", async () => {
    // The made-up car on a light grey studio backdrop, saved as a JPEG.
    const photo = await jpeg(carSvg("#f2f2f2"));
    const prepared = await prepareUpload(photo);
    if ("error" in prepared) throw new Error(prepared.error);
    expect(prepared.background).toBe("removed");
    // Cropped to the car (about 2000 × 450 of the 2400 × 800 photo).
    expect(prepared.width).toBeGreaterThan(1950);
    expect(prepared.height).toBeLessThan(470);
    expect(prepared.wheels?.front.x).toBeCloseTo(0.2, 1);
    expect(prepared.wheels?.rear.x).toBeCloseTo(0.8, 1);
    // The corners are see-through now.
    const { data, info } = await sharp(prepared.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[info.channels - 1]).toBe(0);
  });

  it("removes a two-tone, textured background: a concrete wall above a pale floor", async () => {
    // A blotchy grey wall down to y 600, a near-white floor below, and the car.
    const wall = Array.from({ length: 120 }, (_, i) => {
      const shade = 95 + ((i * 37) % 40);
      return `<rect x="${(i * 97) % 2400}" y="${(i * 53) % 560}" width="160" height="60" fill="rgb(${shade},${shade + 4},${shade + 10})"/>`;
    }).join("");
    const svg = carSvg("rgb(112,118,126)").replace(
      '<path d=',
      `${wall}<rect x="0" y="600" width="2400" height="200" fill="#e6e6e4"/><path d=`,
    );
    const prepared = await prepareUpload(await jpeg(svg));
    if ("error" in prepared) throw new Error(prepared.error);
    expect(prepared.background).toBe("removed");
    expect(prepared.width).toBeLessThan(2100);
    expect(prepared.wheels?.front.x).toBeCloseTo(0.2, 1);
    expect(prepared.wheels?.rear.x).toBeCloseTo(0.8, 1);
  });

  it("leaves a busy background alone, and never turns a photo down", async () => {
    // Random noise all over: nothing plain to remove.
    const noise = Buffer.alloc(800 * 300 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 251;
    const photo = await sharp(noise, { raw: { width: 800, height: 300, channels: 3 } }).jpeg().toBuffer();
    const prepared = await prepareUpload(photo);
    if ("error" in prepared) throw new Error(prepared.error);
    expect(prepared).toMatchObject({ background: "busy", wheels: null, width: 800, height: 300 });
    expect(await prepareUpload(Buffer.from("not an image"))).toEqual({ error: "That file isn't an image." });
  });

  it("keeps a photo that's already a cut-out, and is only for people signed in", async () => {
    const cutOut = await png(carSvg());
    const session = await createSession((await makeUser()).id);
    const post = (cookie?: string) =>
      preparePhotoRoute(
        new NextRequest("http://x/api/prepare-photo", {
          method: "POST",
          body: new Uint8Array(cutOut),
          headers: cookie ? { cookie } : {},
        }),
      );
    expect((await post()).status).toBe(401);
    const body = await (await post(`${SESSION_COOKIE}=${session}`)).json();
    expect(body).toMatchObject({ background: "already" });
    expect(body.wheels.front.x).toBeCloseTo(0.2, 1);
    expect(Buffer.from(body.image, "base64").subarray(1, 4).toString()).toBe("PNG");
  });
});

describe("the background model", () => {
  const decoded = async (svg: string) =>
    sharp(await jpeg(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const solid = (raw: { data: Buffer }) => {
    let n = 0;
    for (let p = 3; p < raw.data.length; p += 4) if (raw.data[p] >= 128) n++;
    return n;
  };

  it("gives a full-size mask, and only ever takes pieces away from the colour cut-out", async () => {
    const photo = await decoded(carSvg("#f2f2f2"));
    const mask = await modelMask(photo);
    expect(mask?.length).toBe(2400 * 800);

    const byColour = await decoded(carSvg("#f2f2f2"));
    expect(await removeBackground(byColour)).toBe(true);
    const withModel = await decoded(carSvg("#f2f2f2"));
    expect(await removeBackground(withModel, mask)).toBe(true);
    expect(solid(withModel)).toBeLessThanOrEqual(solid(byColour));
    // The car itself stays.
    expect(solid(withModel)).toBeGreaterThan(solid(byColour) * 0.9);
  });

  it("can be turned off", async () => {
    vi.stubEnv("CAR_PHOTO_MODEL", "off");
    expect(await modelMask(await decoded(carSvg("#f2f2f2")))).toBeNull();
  });
});
