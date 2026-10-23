import { describe, expect, it } from "vitest";
import { variantOf } from "./variants";

describe("variantOf", () => {
  it.each([
    ["10k-Mile 2012 Ferrari 458 Spider", "Spider"],
    ["2,400-Mile 2012 Ferrari 458 Italia", "Standard"],
    ["2015 Ferrari 458 Speciale - Atelier", "Speciale"],
    ["2015 Ferrari 458 Speciale Aperta", "Speciale"],
    ["2012 Ferrari 458 Challenge", "Challenge (track car)"],
    ["2009 Ferrari F430 Scuderia Spider 16M", "16M"],
    ["2008 Ferrari F430 Scuderia", "Scuderia"],
    ["2007 Ferrari F430 Berlinetta F1", "Standard"],
    ["2011 Aston Martin DBS Volante", "Volante"],
  ])("%s → %s", (title, variant) => {
    expect(variantOf(title)).toBe(variant);
  });

  it("reads the trim too, and ignores blanks", () => {
    expect(variantOf("2014 Ferrari F430", "Spider F1")).toBe("Spider");
    expect(variantOf(null, undefined, "")).toBe("Standard");
  });
});
