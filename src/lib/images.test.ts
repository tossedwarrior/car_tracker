import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { insertRow } from "@/test/db";
import { watchlist } from "@/db/schema";
import { GET } from "@/app/api/watch/[id]/image/[kind]/route";
import { getImage, imageVersions, MAX_IMAGE_BYTES, readImageUpload, saveImage, sniffImageType } from "./images";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const SVG = new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>');

const file = (bytes: Uint8Array, name = "logo.png", type = "image/png") => new File([new Uint8Array(bytes)], name, { type });

describe("sniffImageType", () => {
  it("goes by the file's bytes, not its name", async () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
    expect(sniffImageType(SVG)).toBe("image/svg+xml");
    expect(sniffImageType(new TextEncoder().encode("<html>hi</html>"))).toBeNull();
  });
});

describe("readImageUpload", () => {
  it("requires an image only when asked to", async () => {
    expect(await readImageUpload(null, "logo", { required: true })).toEqual({ error: "Add a brand logo" });
    expect(await readImageUpload(file(new Uint8Array()), "photo", { required: true })).toEqual({ error: "Add a car photo" });
    expect(await readImageUpload(null, "logo", { required: false })).toEqual({ image: null });
  });

  it("rejects files that aren't images, or are too big", async () => {
    const fake = file(new TextEncoder().encode("not an image"), "logo.png");
    expect(await readImageUpload(fake, "logo", { required: true })).toEqual({ error: "Choose a PNG, JPEG, WebP or SVG image" });
    const big = file(new Uint8Array(MAX_IMAGE_BYTES + 1));
    expect(await readImageUpload(big, "logo", { required: true })).toEqual({ error: "Choose an image under 8 MB" });
  });

  it("returns the image with its real type", async () => {
    const result = await readImageUpload(file(JPEG, "photo.png", "image/png"), "photo", { required: true });
    expect(result).toMatchObject({ image: { contentType: "image/jpeg", fileName: "photo.png" } });
  });
});

describe("saving and serving images", () => {
  it("keeps one logo and one photo per car, replacing on a new upload", async () => {
    const id = (await insertRow(watchlist, { make: "Ferrari", model: "Roma", yearMin: 2021, yearMax: 2024 })).id;
    await saveImage(id, "logo", { contentType: "image/png", data: Buffer.from(PNG), fileName: "a.png", width: 8, height: 8 }, new Date("2026-10-27T10:00:00Z"));
    await saveImage(id, "logo", { contentType: "image/jpeg", data: Buffer.from(JPEG), fileName: "b.jpg", width: 8, height: 8 }, new Date("2026-10-27T11:00:00Z"));

    expect(await getImage(id, "logo")).toMatchObject({ contentType: "image/jpeg", fileName: "b.jpg" });
    expect(await imageVersions(id)).toEqual({ logo: "2026-10-27T11:00:00.000Z" });

    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: String(id), kind: "logo" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);

    const missing = await GET(new Request("http://x"), { params: Promise.resolve({ id: String(id), kind: "photo" }) });
    expect(missing.status).toBe(404);
    const bad = await GET(new Request("http://x"), { params: Promise.resolve({ id: String(id), kind: "other" }) });
    expect(bad.status).toBe(404);
  });
});
