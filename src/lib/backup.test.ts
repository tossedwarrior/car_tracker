import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { listings, watchImages, watchlist } from "@/db/schema";
import { insertRow } from "@/test/db";
import { createBackup, restoreBackup, unpackBackup } from "./backup";
import { getImage, saveCarPhotoSettings, saveImage } from "./images";

describe("backup and restore", () => {
  it("puts back everything, images byte for byte, and replaces what was there", async () => {
    const watch = await insertRow(watchlist, { make: "Ferrari", model: "Roma", yearMin: 2021, yearMax: 2024 });
    await db.insert(listings).values({
      watchId: watch.id,
      source: "autodev",
      sourceListingId: "R1",
      currency: "USD",
      price: 210000,
      firstSeen: "2026-10-01",
      lastSeen: "2026-10-01",
    });
    const photo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 255, 254]);
    await saveImage(watch.id, "photo", { contentType: "image/png", data: photo, fileName: "roma.png", width: 2400, height: 900 });
    await saveCarPhotoSettings(watch.id, { wheels: null, facesRight: true });

    const backup = await createBackup();
    expect(unpackBackup(backup).tables.watchlist).toHaveLength(1);

    // Things change after the backup...
    await insertRow(watchlist, { make: "Porsche", model: "911", yearMin: 2020, yearMax: 2024 });
    await db.delete(watchImages);

    // ...and restoring puts it back exactly as it was.
    const counts = await restoreBackup(backup);
    expect(counts).toMatchObject({ watchlist: 1, listings: 1, watchImages: 1 });
    expect((await db.select().from(watchlist)).map((w) => w.model)).toEqual(["Roma"]);
    const restored = await getImage(watch.id, "photo");
    expect(restored?.data.equals(photo)).toBe(true);
    expect(restored).toMatchObject({ fileName: "roma.png", width: 2400, facesRight: true });
    expect((await db.select().from(listings))[0]).toMatchObject({ sourceListingId: "R1", price: 210000 });
  });

  it("refuses a file that isn't a backup, and changes nothing", async () => {
    const before = await db.select().from(watchlist);
    await expect(restoreBackup(Buffer.from("not a backup"))).rejects.toThrow("isn't a Poster Wall backup");
    await expect(restoreBackup(Buffer.from(JSON.stringify({ hello: 1 })))).rejects.toThrow("isn't a Poster Wall backup");
    expect(await db.select().from(watchlist)).toEqual(before);
  });
});
