import { sendDueListingEmails } from "./notify";

// The hourly check for monthly new-listing emails, while the server runs.
// Safe to run alongside the cron job or a second server process: each
// person's day moves on before their email is sent.

const HOUR = 60 * 60 * 1000;
const state = globalThis as typeof globalThis & { listingEmailTimer?: ReturnType<typeof setInterval> };

export function startListingEmailSchedule() {
  // Once per process, even when the dev server reloads this file.
  if (state.listingEmailTimer) return;
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      const { due, sent, refresh } = await sendDueListingEmails();
      if (due) {
        console.log(
          `[listing emails] ${due} due, ${sent} sent` + (refresh ? `; refresh #${refresh.runId}: ${refresh.status}` : ""),
        );
      }
    } catch (e) {
      console.warn(`[listing emails] check failed: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  state.listingEmailTimer = setInterval(check, HOUR);
  state.listingEmailTimer.unref?.();
  // A minute after starting, so the server's up first.
  setTimeout(check, 60_000).unref?.();
}
