// Sign-in basics shared by the proxy, pages and routes. Nothing here touches
// the database, so src/proxy.ts can import it cheaply.
//
// People sign up and sign in the same way: enter an email, get a one-time
// link, open it. The link's token (and the session cookie's) is random; the
// database keeps only its SHA-256 hash.

export const SESSION_COOKIE = "cpt_session";
export const SESSION_DAYS = 30;
/** How long a sign-in link works. */
export const LOGIN_LINK_MINUTES = 30;

/** A random token for a link or cookie: 32 bytes, URL-safe. */
export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

/** What the database keeps instead of the token itself. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Only same-site paths, so a sign-in link can't redirect somewhere else. */
export function safeNext(next: unknown): string {
  const path = typeof next === "string" ? next : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}

/** Lowercase and trim, so Me@X.com and me@x.com are one account. */
export function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

/** A plausible address: something@something.tld, no spaces, not absurdly long. */
export function isValidEmail(email: string): boolean {
  return email.length <= 191 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Cookie settings for the session; secure when the site is served over HTTPS. */
export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}
