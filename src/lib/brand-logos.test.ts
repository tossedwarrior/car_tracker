import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_SLUGS, LOGO_SIZES } from "./brand-logos.generated";
import { brandLogo, makeKey } from "./brand-logos";

describe("brandLogo", () => {
  it("finds a make's emblem however it's typed", () => {
    expect(brandLogo("Ferrari")?.url).toBe("/logos/ferrari.svg");
    expect(brandLogo("rolls-royce")?.url).toBe("/logos/rollsroyce.svg");
    expect(brandLogo("Aston Martin")?.url).toBe("/logos/astonmartin.svg");
    expect(brandLogo("Mercedes-AMG")?.url).toBe("/logos/amg.svg");
    expect(brandLogo("VW")?.url).toBe("/logos/volkswagen.svg");
    expect(makeKey("Citroën")).toBe("citroen");
  });

  it("has none for a make without one, so its name is shown", () => {
    expect(brandLogo("Pagani")).toBeNull();
    expect(brandLogo("Mercedes-Benz")).toBeNull();
  });

  it("has a file, cropped to the emblem, for every brand", () => {
    let cropped = 0;
    for (const slug of new Set(Object.values(BRAND_SLUGS))) {
      const svg = fs.readFileSync(path.join("public/logos", `${slug}.svg`), "utf8");
      const { width, height } = LOGO_SIZES[slug];
      expect(svg).toContain(`width="${width}" height="${height}"`);
      // Inside Simple Icons' 24 × 24 box, and in proportion with the file's size.
      const [x, y, w, h] = svg.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(24.01);
      expect(y + h).toBeLessThanOrEqual(24.01);
      expect(height / width).toBeCloseTo(h / w, 2);
      if (Math.min(w, h) < 23.9) cropped++;
    }
    // Most emblems don't fill the square (round badges like BMW's do).
    expect(cropped).toBeGreaterThan(30);
  });
});
