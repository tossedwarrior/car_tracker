"use client";

import { useActionState } from "react";
import { requestSignIn, type SignInState } from "@/app/login/actions";

/** Email in, sign-in link out. New addresses get an account on the way. */
export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestSignIn, {});

  if (state.sentTo) {
    return (
      <div className="signin-sent" role="status">
        <p className="strong">{state.devLink ? "No email sent" : "Check your email"}</p>
        <p className="muted">
          {state.devLink ? "The link below signs in" : "We sent a sign-in link to"} {state.sentTo}. It works once, for
          the next 30 minutes.
        </p>
        {state.devLink && (
          <p className="notice small">
            {state.emailProblem === "failed"
              ? "Customer.io didn't send the email (the reason is in the server log)"
              : "No email service is set up yet"}
            , so here&apos;s the link (development only): <a href={state.devLink}>Sign in</a>
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="form">
      <input type="hidden" name="next" value={next} />
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          required
          defaultValue={state.email}
          aria-invalid={!!state.error}
        />
        {state.error ? (
          <em className="error">{state.error}</em>
        ) : (
          <small>We&apos;ll email you a link to sign in. New here? This makes your account.</small>
        )}
      </label>
      <div className="actions">
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Sending…" : "Email me a link"}
        </button>
      </div>
    </form>
  );
}
