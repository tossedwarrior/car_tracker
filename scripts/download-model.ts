// Downloads BiRefNet lite (models/birefnet-lite.onnx, 224 MB; see
// models/README.md), the background-removal model car photo uploads use when
// it's there. Too big for git, so each copy of the app fetches it once:
//
//   npm run download-model
//
// The file is checked against a known SHA-256, so a changed or corrupted
// download is refused rather than used.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const REVISION = "de15b22ba131738a16dff04aab8bdf8dc32e3ac1"; // onnx-community/BiRefNet_lite-ONNX
const URL = `https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/${REVISION}/onnx/model.onnx`;
const SHA256 = "5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333";
const TARGET = path.resolve(import.meta.dirname, "../models/birefnet-lite.onnx");

const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

if (fs.existsSync(TARGET) && sha256(TARGET) === SHA256) {
  console.log(`Already there: ${TARGET}`);
  process.exit(0);
}

console.log(`Downloading BiRefNet lite (224 MB) from Hugging Face…`);
const res = await fetch(URL);
if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
const partial = `${TARGET}.part`;
fs.mkdirSync(path.dirname(TARGET), { recursive: true });
const out = fs.createWriteStream(partial);
for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) out.write(chunk);
await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));

const got = sha256(partial);
if (got !== SHA256) {
  fs.rmSync(partial);
  throw new Error(`Downloaded file doesn't match (SHA-256 ${got}); not using it.`);
}
fs.renameSync(partial, TARGET);
console.log(`Saved ${TARGET}`);
