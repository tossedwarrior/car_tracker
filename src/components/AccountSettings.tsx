"use client";

import { useActionState } from "react";
import { deleteAccount, savePreferences, type PreferencesState } from "@/app/actions";

/** Settings for everyone: your name, which emails you get, and deleting your account. */
export function AccountSettings({
  email,
  name,
  listingEmails,
  monthlyReport,
}: {
  email: string;
  name: string | null;
  listingEmails: boolean;
  monthlyReport: boolean;
}) {
  const [state, action, pending] = useActionState<PreferencesState, FormData>(savePreferences, {});

  return (
    <>
      <section>
        <h2>Your account</h2>
        <p className="muted">Signed in as {email}.</p>
        <form action={action} className="form">
          <label className="field">
            <span>Name</span>
            <input name="name" defaultValue={name ?? ""} autoComplete="given-name" maxLength={100} />
          </label>
          <fieldset className="checks">
            <legend>Email me</legend>
            <label>
              <input type="checkbox" name="listingEmails" defaultChecked={listingEmails} /> When a new car is listed
              for one I follow
            </label>
            <label>
              <input type="checkbox" name="monthlyReport" defaultChecked={monthlyReport} /> A monthly market report
              for the cars I follow
            </label>
          </fieldset>
          <div className="actions">
            <button type="submit" className="button primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
            {state.saved && !pending && (
              <span className="muted" role="status">
                Saved.
              </span>
            )}
          </div>
        </form>
      </section>

      <section>
        <h2>Delete your account</h2>
        <p className="muted small">
          Removes your account, your watchlist, target prices, notes and alerts. This can&apos;t be undone.
        </p>
        <form
          action={deleteAccount}
          onSubmit={(e) => {
            if (!confirm("Delete your account and everything in it? This can't be undone.")) e.preventDefault();
          }}
        >
          <button type="submit" className="button danger">
            Delete my account
          </button>
        </form>
      </section>
    </>
  );
}
