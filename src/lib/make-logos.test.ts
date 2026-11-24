import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/make-logo/[key]/route";
import { watchlist } from "@/db/schema";
import { SESSION_COOKIE } from "@/lib/auth";
import { insertRow, makeUser } from "@/test/db";
import { createBackup, restoreBackup, unpackBackup } from "./backup";
import { deleteMakeLogo, getMakeLogos, listMakes, logoForMake, saveMakeLogo } from "./make-logos";
import { createSession } from "./users";

const svg = (letter: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text y="30">${letter}</text></svg>`);
const upload = (letter: string) => ({ contentType: "image/svg+xml", data: svg(letter), fileName: `${letter}.svg`, width: 100, height: 40 });

describe("make logos", () => {
  it("are used for every car of the make, ahead of the brand's emblem", async () => {
    expect(logoForMake("Porsche", await getMakeLogos())?.url).toBe("/logos/porsche.svg");
    expect(logoForMake("Mercedes-Benz", await getMakeLogos())).toBeNull();

    await saveMakeLogo("Mercedes-Benz", upload("M"), new Date("2026-11-23T10:00:00Z"));
    await saveMakeLogo("porsche", upload("P"));
    const uploaded = await getMakeLogos();
    // However the make is typed.
    expect(logoForMake("mercedes benz", uploaded)).toEqual({
      url: "/api/make-logo/mercedesbenz?v=2026-11-23T10%3A00%3A00.000Z",
      width: 100,
      height: 40,
    });
    expect(logoForMake("Porsche", uploaded)?.url).toMatch(/^\/api\/make-logo\/porsche\?v=/);

    await deleteMakeLogo("porsche");
    expect(logoForMake("Porsche", await getMakeLogos())?.url).toBe("/logos/porsche.svg");
    await deleteMakeLogo("mercedesbenz");
  });

  it("lists each make on a watchlist once, with what its cars show", async () => {
    for (const make of ["Ferrari", "ferrari", "Pagani", "Lotus"]) {
      await insertRow(watchlist, { make, model: "X", yearMin: 2020, yearMax: 2020 });
    }
    await saveMakeLogo("Lotus", upload("L"));
    const rows = await listMakes();
    expect(rows.map((r) => [r.make, r.cars, r.shows])).toEqual([
      ["Ferrari", 2, "emblem"],
      ["Lotus", 1, "uploaded"],
      ["Pagani", 1, "name"],
    ]);
    await deleteMakeLogo("lotus");
  });

  it("are served to signed-in people only, and kept in backups", async () => {
    await saveMakeLogo("Pagani", upload("Z"));
    const session = await createSession((await makeUser()).id);
    const get = (cookie?: string) =>
      GET(new NextRequest("http://x/api/make-logo/pagani", { headers: cookie ? { cookie } : {} }), {
        params: Promise.resolve({ key: "pagani" }),
      });
    expect((await get()).status).toBe(401);
    const res = await get(`${SESSION_COOKIE}=${session}`);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toContain(">Z<");

    const backup = await createBackup();
    expect(unpackBackup(backup).tables.makeLogos).toHaveLength(1);
    await deleteMakeLogo("pagani");
    await restoreBackup(backup);
    expect(Object.keys(await getMakeLogos())).toEqual(["pagani"]);
  });
});
