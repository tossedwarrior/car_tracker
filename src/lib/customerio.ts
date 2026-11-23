import { Analytics } from "@customerio/cdp-analytics-node";

// Customer.io, server side. Three keys, three jobs:
//
// - CUSTOMERIO_PIPELINES_KEY (sk_…, a Node.js "Data In" integration): people
//   and events from the server, through the Pipelines API.
// - CUSTOMERIO_APP_API_KEY (sk_…, Account Settings > API Credentials): the
//   transactional sign-in email, through the App API.
// - NEXT_PUBLIC_CUSTOMERIO_WRITE_KEY (pk_…, a JavaScript integration): the
//   browser (src/components/CustomerioAnalytics.tsx).
//
// Without a key, its part does nothing, so the app works before Customer.io
// is set up. Nothing here throws: Customer.io being down never breaks a
// sign-in or a refresh; problems go to the server log.

export type Traits = Record<string, unknown>;

/** What the app sends to Customer.io. Tests swap in a fake. */
export interface CustomerioClient {
  identify(userId: number, traits: Traits): Promise<void>;
  track(userId: number, event: string, properties?: Traits, messageId?: string): Promise<void>;
  /** Send anything queued; scripts call this before they exit. */
  flush(): Promise<void>;
}

export type Region = "us" | "eu";

/** CUSTOMERIO_REGION, else the region in a key's prefix (sk_eu_…), else US. */
export function customerioRegion(env: Record<string, string | undefined> = process.env): Region {
  const set = env.CUSTOMERIO_REGION?.trim().toLowerCase();
  if (set === "eu" || set === "us") return set;
  const keys = [env.CUSTOMERIO_PIPELINES_KEY, env.CUSTOMERIO_APP_API_KEY, env.NEXT_PUBLIC_CUSTOMERIO_WRITE_KEY];
  return keys.some((k) => k?.includes("_eu_")) ? "eu" : "us";
}

export const pipelinesHost = (region: Region) =>
  region === "eu" ? "https://cdp-eu.customer.io" : "https://cdp.customer.io";
export const appApiHost = (region: Region) =>
  region === "eu" ? "https://api-eu.customer.io" : "https://api.customer.io";

function pipelinesClient(key: string): CustomerioClient {
  const analytics = new Analytics({
    writeKey: key,
    host: pipelinesHost(customerioRegion()),
    // Send each call right away: this app sends a few events a minute at
    // most, and the sign-in email waits for the person to exist first.
    maxEventsInBatch: 1,
  });
  /** Resolves once Customer.io has the call (or it failed, which is logged). */
  const send =(what: string, call: (done: (err?: unknown) => void) => void) =>
    new Promise<void>((resolve) => {
      try {
        call((err) => {
          if (err) console.error(`[customer.io] ${what} failed:`, err);
          resolve();
        });
      } catch (err) {
        console.error(`[customer.io] ${what} failed:`, err);
        resolve();
      }
    });
  return {
    identify: (userId, traits) =>
      send("identify", (done) => analytics.identify({ userId: String(userId), traits }, done)),
    track: (userId, event, properties, messageId) =>
      send(`track ${event}`, (done) =>
        analytics.track({ userId: String(userId), event, properties, ...(messageId ? { messageId } : {}) }, done),
      ),
    flush: async () => {
      try {
        await analytics.closeAndFlush({ timeout: 10_000 });
      } catch (err) {
        console.error("[customer.io] flush failed:", err);
      }
      cached = undefined; // closed; the next call opens a new one
    },
  };
}

let cached: CustomerioClient | null | undefined;
let override: CustomerioClient | null | undefined;

/** The Pipelines client, or null when CUSTOMERIO_PIPELINES_KEY isn't set. */
export function customerio(): CustomerioClient | null {
  if (override !== undefined) return override;
  if (cached === undefined) {
    const key = process.env.CUSTOMERIO_PIPELINES_KEY?.trim();
    cached = key ? pipelinesClient(key) : null;
  }
  return cached;
}

/** Tests: use this client instead (null for "not set up"); undefined goes back to the real one. */
export function setCustomerioForTests(client: CustomerioClient | null | undefined) {
  override = client;
}

/** Seconds since 1970, how Customer.io likes dates it can segment on. */
export const unixTime = (iso: string | null | undefined) =>
  iso ? Math.floor(new Date(iso).getTime() / 1000) : undefined;

// ---------- Transactional email (App API) ----------

export interface TransactionalEmail {
  /** The message's trigger name or numeric ID in Customer.io. */
  message: string;
  to: string;
  userId: number;
  data: Traits;
  /** Leave link tracking on (default false) and keep the sent message (default false). */
  tracked?: boolean;
  retain?: boolean;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Send a transactional email. Returns whether Customer.io accepted it;
 * false (with a log line) when CUSTOMERIO_APP_API_KEY isn't set or it failed.
 */
export async function sendTransactionalEmail(email: TransactionalEmail, fetchImpl: FetchLike = fetch): Promise<boolean> {
  const key = process.env.CUSTOMERIO_APP_API_KEY?.trim();
  if (!key) return false;
  const message = /^\d+$/.test(email.message) ? Number(email.message) : email.message;
  const from = process.env.CUSTOMERIO_FROM?.trim();
  try {
    const res = await fetchImpl(`${appApiHost(customerioRegion())}/v1/send/email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        transactional_message_id: message,
        to: email.to,
        identifiers: { id: String(email.userId) },
        message_data: email.data,
        tracked: email.tracked ?? false,
        disable_message_retention: !(email.retain ?? false),
        ...(from ? { from } : {}),
      }),
    });
    if (res.ok) return true;
    console.error(`[customer.io] transactional email failed: ${res.status} ${await res.text().catch(() => "")}`);
  } catch (err) {
    console.error("[customer.io] transactional email failed:", err);
  }
  return false;
}
