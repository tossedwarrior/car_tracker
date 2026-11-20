// Email the app sends. Customer.io will deliver these (see
// docs/CUSTOMERIO_PLAN.md). Until it's connected nothing is emailed: on a
// development server the link goes to the server log and the sign-in page
// shows it. In production it's never logged, since a log reader could use it.

export interface SentEmail {
  /** False when nothing actually went out (no email service set up yet). */
  delivered: boolean;
}

export const isDevServer = () => process.env.NODE_ENV !== "production";

export async function sendSignInLink({ email, url }: { email: string; url: string }): Promise<SentEmail> {
  if (isDevServer()) console.log(`[sign-in link] ${email}: ${url}`);
  else console.warn(`[sign-in link] no email service set up; nothing sent to ${email}`);
  return { delivered: false };
}
