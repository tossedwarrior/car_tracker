"use client";

import { useActionState } from "react";
import { deleteAccount, savePreferences, type PreferencesState } from "@/app/actions";

/** Settings for everyone: your name, which emails you get, and deleting your account. */
export function AccountSettings({
  email,
  name,
  listingEmails,
  monthlyReport,
  listingEmailDay,
  listingEmailNext,
}: {
  email: string;
  name: string | null;
  listingEmails: boolean;
  monthlyReport: boolean;
  /** 1–28. */
  listingEmailDay: number;
  /** YYYY-MM-DD, or null until it's worked out. */
  listingEmailNext: string | null;
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
              <input type="checkbox" name="listingEmails" defaultChecked={listingEmails} /> Once a month, the new cars
              listed for the ones I follow
            </label>
            <div className="listing-day">
              <label htmlFor="listingEmailDay">On the</label>
              {/* Keyed so it shows the saved day after the form resets on saving. */}
              <select key={listingEmailDay} id="listingEmailDay" name="listingEmailDay" defaultValue={listingEmailDay}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {ordinal(d)}
                  </option>
                ))}
              </select>
              <span>of each month</span>
              {listingEmails && listingEmailNext && (
                <span className="muted small">Next one: {longDate(listingEmailNext)}</span>
              )}
            </div>
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

/** 1st, 2nd, 3rd, 4th… 21st, 22nd. */
function ordinal(n: number) {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "December 1" (with the year when it isn't this one). */
function longDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}
