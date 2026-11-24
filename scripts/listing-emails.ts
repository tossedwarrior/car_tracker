// Monthly new-listing emails from the command line: the same check the
// server runs every hour, for a daily cron job (with
// LISTING_EMAILS_SCHEDULE=off on the server), or to send one now.
//
//   npm run listing-emails                        # everyone whose day it is
//   npm run listing-emails -- --user 3            # account #3's email now, whatever its day
//   npm run listing-emails -- --user 3 --sample   # a sample: its newest cars, no refresh,
//                                                 # its schedule unchanged
import "dotenv/config";
import { closeDb } from "@/db";
import { customerio } from "@/lib/customerio";
import { sendDueListingEmails, sendSampleListingEmail } from "@/jobs/notify";

const args = process.argv.slice(2);
const at = args.indexOf("--user");
const userIds = at >= 0 ? [Number(args[at + 1])].filter(Boolean) : undefined;
if (at >= 0 && !userIds?.length) throw new Error("--user needs an account number");
const sample = args.includes("--sample");
if (sample && !userIds) throw new Error("--sample needs --user <account number>");
if (!customerio()) console.log("Customer.io isn't set up (CUSTOMERIO_PIPELINES_KEY), so nothing is sent.");

if (sample) {
  for (const id of userIds!) {
    const shown = await sendSampleListingEmail(id);
    console.log(
      shown
        ? `Account #${id}: sample sent with its ${shown} newest car(s).`
        : `Account #${id}: no sample sent (no cars for sale on its list yet, or no such account).`,
    );
  }
} else {
  const { due, sent, refresh } = await sendDueListingEmails({ userIds });
  console.log(`${due} due, ${sent} sent (the rest had no new cars).`);
  if (refresh) console.log(`Refresh #${refresh.runId}: ${refresh.status}\n${refresh.log.join("\n")}`);
}
await customerio()?.flush();
await closeDb();
