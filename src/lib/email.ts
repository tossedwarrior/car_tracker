import { sendTransactionalEmail } from "./customerio";
import { LOGIN_LINK_MINUTES } from "./auth";
import { syncPerson } from "./people";

// Email the app sends itself. Customer.io delivers the sign-in link as a
// transactional message (CUSTOMERIO_APP_API_KEY, CUSTOMERIO_SIGNIN_MESSAGE).
// Until that's set up nothing is emailed: on a development server the link
// goes to the server log and the sign-in page shows it. In production it's
// never logged, since a log reader could use it.

export interface SentEmail {
  /** False when nothing went out. */
  delivered: boolean;
  /** Why not: no email service set up yet, or Customer.io refused it (see the server log). */
  problem?: "not_set_up" | "failed";
}

export const isDevServer = () => process.env.NODE_ENV !== "production";

/** The transactional message's trigger name (or ID) in Customer.io. */
export const signInMessage = () => process.env.CUSTOMERIO_SIGNIN_MESSAGE?.trim() || "sign_in_link";

export async function sendSignInLink({
  userId,
  email,
  url,
}: {
  userId: number;
  email: string;
  url: string;
}): Promise<SentEmail> {
  if (process.env.CUSTOMERIO_APP_API_KEY?.trim()) {
    // Make sure Customer.io knows the person first (a no-op without the
    // Pipelines key), so the email lands on their profile.
    await syncPerson(userId);
    const delivered = await sendTransactionalEmail({
      message: signInMessage(),
      to: email,
      userId,
      // In the message: {{trigger.signin_url}} and {{trigger.expires_minutes}}.
      data: { signin_url: url, expires_minutes: LOGIN_LINK_MINUTES },
      // The link signs someone in: no click-tracking redirect, and not kept
      // in Customer.io's copy of the sent message.
      tracked: false,
      retain: false,
    });
    if (delivered) return { delivered };
    if (isDevServer()) console.log(`[sign-in link] ${email}: ${url}`);
    else console.warn(`[sign-in link] not sent to ${email}: Customer.io refused it (see above)`);
    return { delivered: false, problem: "failed" };
  }
  if (isDevServer()) console.log(`[sign-in link] ${email}: ${url}`);
  else console.warn(`[sign-in link] not sent to ${email}: no email service set up`);
  return { delivered: false, problem: "not_set_up" };
}
