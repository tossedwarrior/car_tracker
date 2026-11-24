// Runs once when the server starts (next dev or npm start).

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // LISTING_EMAILS_SCHEDULE=off when a daily cron job runs
  // `npm run listing-emails` instead (a host that puts idle apps to sleep).
  if (process.env.LISTING_EMAILS_SCHEDULE === "off") return;
  const { startListingEmailSchedule } = await import("./jobs/schedule");
  startListingEmailSchedule();
}
