// Refresh listings from the command line (same as the Refresh buttons).
//
//   npm run refresh              # every active watched car
//   npm run refresh -- 1 3       # only watched cars #1 and #3
import "dotenv/config";
import { runRefresh } from "@/jobs/refresh";

const ids = process.argv.slice(2).map(Number).filter(Boolean);
const result = await runRefresh({ watchIds: ids.length ? ids : undefined });
console.log(`Refresh #${result.runId}: ${result.status}, ${result.calls} call(s)`);
console.log(result.log.join("\n"));
process.exitCode = result.status === "failed" ? 1 : 0;
