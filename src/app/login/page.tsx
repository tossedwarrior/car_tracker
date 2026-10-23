import type { Metadata } from "next";
import { safeNext } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in · Car Price Tracker" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="login">
      <h1>Sign in</h1>
      <p className="muted">This is a private car price tracker.</p>
      <form method="post" action="/api/login" className="form">
        <input type="hidden" name="next" value={safeNext(next)} />
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            autoFocus
            required
            aria-invalid={!!error}
          />
          {error && <em className="error">That password isn&apos;t right.</em>}
        </label>
        <div className="actions">
          <button type="submit" className="button primary">
            Sign in
          </button>
        </div>
      </form>
    </div>
  );
}
