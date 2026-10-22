// The daily check. Run by the launchd schedule, or by hand:
//
//   npm run check:daily            # sources due today
//   npm run check:daily -- --all    # every source, due or not
import "dotenv/config";
import { runDailyCheck } from "@/jobs/daily";

const result = await runDailyCheck({ allSources: process.argv.includes("--all") });
console.log(`[${new Date().toISOString()}] Daily check #${result.runId}: ${result.status}, ${result.calls} call(s)`);
console.log(result.log.join("\n"));
process.exitCode = result.status === "failed" ? 1 : 0;
