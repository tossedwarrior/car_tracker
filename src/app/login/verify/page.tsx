import type { Metadata } from "next";
import Link from "next/link";
import { completeSignIn } from "@/app/login/actions";
import { safeNext } from "@/lib/auth";
import { peekLoginToken } from "@/lib/users";

export const metadata: Metadata = { title: "Sign in · Poster Wall" };
export const dynamic = "force-dynamic";

/**
 * Where a sign-in link lands. Opening the link only shows a button: email
 * scanners that open every link would otherwise use it up first.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const { token, next } = await searchParams;
  const user = token ? await peekLoginToken(token) : null;

  if (!token || !user) {
    return (
      <div className="login">
        <h1>That link has expired</h1>
        <p className="muted">
          Sign-in links work once, for 30 minutes. <Link href="/login">Get a new one</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="login">
      <h1>Sign in</h1>
      <p className="muted">Signing in as {user.email}.</p>
      <form action={completeSignIn} className="form">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="next" value={safeNext(next)} />
        <div className="actions">
          <button type="submit" className="button primary">
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}
