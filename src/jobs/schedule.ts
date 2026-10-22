import os from "node:os";
import path from "node:path";

// The daily check runs from a macOS launchd agent (see scripts/schedule.ts).
export const SCHEDULE_LABEL = "com.carpricetracker.daily";
export const SCHEDULE_HOUR = 7;
export const schedulePlistPath = () =>
  path.join(os.homedir(), "Library/LaunchAgents", `${SCHEDULE_LABEL}.plist`);
