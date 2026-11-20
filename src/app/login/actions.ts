"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidEmail, normalizeEmail, safeNext, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { isDevServer, sendSignInLink } from "@/lib/email";
import { createLoginToken, endSession, findOrCreateUser, redeemLoginToken } from "@/lib/users";

export interface SignInState {
  error?: string;
  /** Set once the link is on its way. */
  sentTo?: string;
  /** Development only, while no email service is set up: the link itself. */
  devLink?: string;
  email?: string;
}

/**
 * The site's own address, for links in emails. APP_URL in production: taking
 * it from the request's Host header would let someone send a victim a
 * sign-in link that points at their own site.
 */
async function siteUrl(): Promise<string> {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (!isDevServer()) throw new Error("Set APP_URL to this site's address (e.g. https://example.com).");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
}

/** Sign up and sign in are the same: email a one-time link to the address. */
export async function requestSignIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = normalizeEmail(form.get("email"));
  if (!isValidEmail(email)) return { error: "Enter your email address, like you@example.com.", email };

  const { user } = await findOrCreateUser(email);
  const token = await createLoginToken(user.id);
  if (!token) return { error: "That's a lot of sign-in links. Use the latest one, or try again in an hour.", email };

  const next = safeNext(form.get("next"));
  const params = new URLSearchParams({ token });
  if (next !== "/") params.set("next", next);
  const url = `${await siteUrl()}/login/verify?${params}`;

  const { delivered } = await sendSignInLink({ email, url });
  return { sentTo: email, devLink: !delivered && isDevServer() ? url : undefined };
}

/** The button on the link's page: use the token, start a session, go on. */
export async function completeSignIn(form: FormData) {
  const result = await redeemLoginToken(String(form.get("token") ?? ""));
  if (!result) redirect("/login/verify?expired=1");

  const h = await headers();
  const secure = h.get("x-forwarded-proto") === "https" || !!process.env.APP_URL?.startsWith("https:");
  (await cookies()).set(SESSION_COOKIE, result.sessionToken, sessionCookieOptions(secure));
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  const jar = await cookies();
  await endSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
