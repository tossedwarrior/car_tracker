// Copies car brands' emblems from Simple Icons (CC0, a dev dependency) into
// public/logos/, cropped tight to the emblem, and writes their sizes to
// src/lib/brand-logos.generated.ts. The home page shows a car's emblem faintly
// behind it when nobody has uploaded a logo for it (src/lib/brand-logos.ts).
// The emblems are the brands' trademarks: they're shown to say which make a
// car is, nothing more.
//
//   npx tsx scripts/brand-logos.ts
//
// Add a brand: put its make and Simple Icons slug in BRANDS, then run this.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

/** Make, as people type it (lowercased, letters and digits only) → Simple Icons slug. */
export const BRANDS: Record<string, string> = {
  acura: "acura",
  amg: "amg",
  astonmartin: "astonmartin",
  audi: "audi",
  bentley: "bentley",
  bmw: "bmw",
  bugatti: "bugatti",
  cadillac: "cadillac",
  chevrolet: "chevrolet",
  chevy: "chevrolet",
  chrysler: "chrysler",
  citroen: "citroen",
  dacia: "dacia",
  ds: "dsautomobiles",
  dsautomobiles: "dsautomobiles",
  ferrari: "ferrari",
  fiat: "fiat",
  ford: "ford",
  honda: "honda",
  hyundai: "hyundai",
  infiniti: "infiniti",
  jeep: "jeep",
  kia: "kia",
  koenigsegg: "koenigsegg",
  lada: "lada",
  lamborghini: "lamborghini",
  lucid: "lucid",
  maserati: "maserati",
  mazda: "mazda",
  mclaren: "mclaren",
  mercedesamg: "amg",
  mg: "mg",
  mini: "mini",
  mitsubishi: "mitsubishi",
  nissan: "nissan",
  opel: "opel",
  peugeot: "peugeot",
  polestar: "polestar",
  porsche: "porsche",
  ram: "ram",
  renault: "renault",
  rimac: "rimacautomobili",
  rollsroyce: "rollsroyce",
  seat: "seat",
  skoda: "skoda",
  smart: "smart",
  subaru: "subaru",
  suzuki: "suzuki",
  tesla: "tesla",
  toyota: "toyota",
  volkswagen: "volkswagen",
  vw: "volkswagen",
  volvo: "volvo",
};

const ROOT = path.resolve(import.meta.dirname, "..");
const ICONS = path.join(ROOT, "node_modules/simple-icons/icons");
const OUT = path.join(ROOT, "public/logos");
const RENDER = 1200; // px, to find the emblem's edges

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const slug of [...new Set(Object.values(BRANDS))].sort()) {
    const svg = fs.readFileSync(path.join(ICONS, `${slug}.svg`), "utf8");
    const d = svg.match(/<path d="([^"]+)"/)?.[1];
    if (!d) throw new Error(`${slug}: no path`);
    // Where the emblem actually is inside Simple Icons' 24 × 24 box.
    // (Rendered first, then trimmed: sharp trims before it resizes.)
    const rendered = await sharp(Buffer.from(svg), { density: (RENDER / 24) * 72 }).resize(RENDER, RENDER).png().toBuffer();
    const { info } = await sharp(rendered).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    const unit = 24 / RENDER;
    const x = -(info.trimOffsetLeft ?? 0) * unit;
    const y = -(info.trimOffsetTop ?? 0) * unit;
    const w = info.width * unit;
    const h = info.height * unit;
    const width = 1000;
    const height = Math.round((1000 * h) / w);
    fs.writeFileSync(
      path.join(OUT, `${slug}.svg`),
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x.toFixed(3)} ${y.toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}"><path fill="#000" d="${d}"/></svg>\n`,
    );
    sizes[slug] = { width, height };
  }
  const brands = Object.fromEntries(Object.entries(BRANDS).sort());
  fs.writeFileSync(
    path.join(ROOT, "src/lib/brand-logos.generated.ts"),
    `// Written by scripts/brand-logos.ts; don't edit by hand.\n\n` +
      `/** Make (lowercased, letters and digits only) → emblem in public/logos/. */\n` +
      `export const BRAND_SLUGS: Record<string, string> = ${JSON.stringify(brands, null, 2)};\n\n` +
      `/** Each emblem's size, for its proportions. */\n` +
      `export const LOGO_SIZES: Record<string, { width: number; height: number }> = ${JSON.stringify(sizes, null, 2)};\n`,
  );
  console.log(`${Object.keys(sizes).length} emblems written to public/logos/`);
}

await main();
