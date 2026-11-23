import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bodyStyleOf, bodyStyles, outlineFor } from "./outlines";

describe("bodyStyleOf", () => {
  it("reads the body style from the make, model and trim", () => {
    const style = (make: string, model: string, trim: string | null = null) => bodyStyleOf({ make, model, trim });
    expect(style("Ferrari", "458 Italia")).toBe("coupe");
    expect(style("Ferrari", "458", "Spider")).toBe("convertible");
    expect(style("Aston Martin", "DB11 Volante")).toBe("convertible");
    expect(style("Porsche", "911", "Targa 4S")).toBe("convertible");
    expect(style("Lamborghini", "Urus")).toBe("suv");
    expect(style("Ferrari", "Purosangue")).toBe("suv");
    expect(style("Mercedes-Benz", "G 63")).toBe("suv");
    expect(style("Porsche", "Panamera", "Turbo S")).toBe("sedan");
    expect(style("Rolls-Royce", "Ghost")).toBe("sedan");
    // A Rolls-Royce Dawn is a convertible, not a sedan.
    expect(style("Rolls-Royce", "Dawn")).toBe("convertible");
  });
});

describe("outlineFor", () => {
  it("points at a drawn outline whose size matches the file, with wheels inside it", () => {
    for (const style of bodyStyles) {
      const file = fs.readFileSync(path.join("public/outlines", `${style}.svg`), "utf8");
      const outline = outlineFor({ make: "X", model: { coupe: "Y", convertible: "Spider", suv: "Urus", sedan: "Panamera" }[style] });
      expect(outline.style).toBe(style);
      expect(outline.url).toBe(`/outlines/${style}.svg`);
      expect(file).toContain(`width="${outline.width}" height="${outline.height}"`);
      for (const w of [outline.wheels.front, outline.wheels.rear]) {
        // The tyre fits inside the picture.
        expect(w.y + (w.r * outline.width) / outline.height).toBeLessThanOrEqual(1.001);
        expect(w.x - w.r).toBeGreaterThan(0);
        expect(w.x + w.r).toBeLessThan(1);
      }
    }
  });
});
