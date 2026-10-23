// A fingerprint of the source code a build was made from, saved next to the
// build, so the server can tell a current build from a leftover older one.
//
//   node scripts/build-stamp.cjs write   # after `next build` (npm run build does this)

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const INPUTS = ["src", "drizzle", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json"];
const BUILD_DIR = path.join(ROOT, ".next");
const STAMP = path.join(BUILD_DIR, "source-fingerprint");

function files(p) {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) return [];
  if (!fs.statSync(full).isDirectory()) return [p];
  return fs
    .readdirSync(full)
    .sort()
    .flatMap((name) => files(path.join(p, name)));
}

function fingerprint() {
  const hash = crypto.createHash("sha256");
  for (const file of INPUTS.flatMap(files)) {
    hash.update(file.split(path.sep).join("/"));
    hash.update(fs.readFileSync(path.join(ROOT, file)));
  }
  return hash.digest("hex");
}

/** True when there's a build and it was made from the code as it is now. */
function isCurrent() {
  try {
    return (
      fs.existsSync(path.join(BUILD_DIR, "BUILD_ID")) &&
      fs.readFileSync(STAMP, "utf8") === fingerprint()
    );
  } catch {
    return false;
  }
}

function write() {
  fs.writeFileSync(STAMP, fingerprint());
}

module.exports = { fingerprint, isCurrent, write };

if (require.main === module && process.argv[2] === "write") write();
