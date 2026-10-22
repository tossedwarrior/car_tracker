// Install or remove the macOS launchd agent that runs the daily check.
//
//   npm run schedule:install
//   npm run schedule:uninstall
//
// launchd runs a missed job when the Mac wakes, so a check skipped while
// asleep still happens that day. Output goes to data/logs/daily.log.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SCHEDULE_HOUR, SCHEDULE_LABEL, schedulePlistPath } from "@/jobs/schedule";

const action = process.argv[2];
const plistPath = schedulePlistPath();
const domain = `gui/${process.getuid!()}`;
const projectDir = process.cwd();
const logPath = path.join(projectDir, "data/logs/daily.log");

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function unload() {
  try {
    execFileSync("launchctl", ["bootout", `${domain}/${SCHEDULE_LABEL}`], { stdio: "ignore" });
  } catch {
    // Not loaded.
  }
}

if (action === "install") {
  const args = [process.execPath, path.join(projectDir, "node_modules/tsx/dist/cli.mjs"), "scripts/daily.ts"];
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SCHEDULE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join("\n")}
  </array>
  <key>WorkingDirectory</key><string>${xml(projectDir)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>${SCHEDULE_HOUR}</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>${xml(logPath)}</string>
  <key>StandardErrorPath</key><string>${xml(logPath)}</string>
</dict>
</plist>
`;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  unload();
  fs.writeFileSync(plistPath, plist);
  execFileSync("launchctl", ["bootstrap", domain, plistPath]);
  console.log(`Installed ${plistPath}. The check runs daily at ${SCHEDULE_HOUR}:00; log: ${logPath}`);
} else if (action === "uninstall") {
  unload();
  fs.rmSync(plistPath, { force: true });
  console.log(`Removed ${SCHEDULE_LABEL}.`);
} else {
  console.error("Usage: tsx scripts/schedule.ts install|uninstall");
  process.exit(1);
}
