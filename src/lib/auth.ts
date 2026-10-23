// Sign-in for the hosted site. When APP_PASSWORD is set, every page asks for
// it once per browser; a cookie then keeps you signed in. With no
// APP_PASSWORD, as on this Mac, there's no sign-in.

export const SESSION_COOKIE = "cpt_session";
export const SESSION_DAYS = 30;

/** What the cookie holds: a hash of the password, so changing it signs everyone out. */
export async function sessionToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`car-price-tracker:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compare without stopping at the first difference, so timing doesn't leak it. */
export function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export async function isValidSession(cookie: string | undefined): Promise<boolean> {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  return !!cookie && sameText(cookie, await sessionToken(password));
}

/** Only same-site paths, so the sign-in form can't redirect somewhere else. */
export function safeNext(next: unknown): string {
  const path = typeof next === "string" ? next : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") ? path : "/";
}
