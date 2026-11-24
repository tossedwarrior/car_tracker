// Look online (CarsXE) for photos of cars that don't have one, the same as
// adding a car does. Each car is looked up once; --force asks again and
// replaces an existing photo. Each lookup uses a CarsXE credit.
//
//   npm run find-photos              # every car without a photo
//   npm run find-photos -- 3 7       # only cars #3 and #7
//   npm run find-photos -- --force 3 # look again for car #3
//   npm run find-photos -- --save-to /tmp/photos 3   # also keep every suggestion
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { closeDb, db } from "@/db";
import { watchlist } from "@/db/schema";
import { lookUpCarPhoto } from "@/lib/car-photo";
import { watchTitle } from "@/lib/format";

const args = process.argv.slice(2);
const force = args.includes("--force");
const saveTo = args.includes("--save-to") ? args[args.indexOf("--save-to") + 1] : null;
const ids = args.filter((a) => a !== saveTo).map(Number).filter(Boolean);
const cars = (await db.select().from(watchlist)).filter((w) => !ids.length || ids.includes(w.id));

for (const car of cars) {
  try {
    let n = 0;
    const result = await lookUpCarPhoto(car.id, {
      force,
      onSuggestion: saveTo
        ? (s, bytes, outcome) => {
            fs.mkdirSync(saveTo, { recursive: true });
            const file = path.join(saveTo, `car${car.id}-${++n}-${outcome.replace(/\W+/g, "_")}.img`);
            fs.writeFileSync(file, bytes);
            console.log(`  saved ${file} (${s.link})`);
          }
        : undefined,
    });
    console.log(`#${car.id} ${watchTitle(car)}: ${result.status}`);
    if (result.status === "saved") console.log(`  from ${result.source} (suggestion ${result.tried})`);
    if (result.status === "none_usable") for (const r of result.reasons) console.log(`  skipped ${r}`);
    if (result.status === "no_key") break;
  } catch (e) {
    console.log(`#${car.id} ${watchTitle(car)}: failed, ${(e as Error).message}`);
  }
}
await closeDb();
