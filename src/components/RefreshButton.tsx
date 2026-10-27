"use client";

import { useActionState } from "react";
import { refreshListings, type RefreshState } from "@/app/actions";
import { Icon } from "./Icon";

/** Ask before a refresh that could use more than this many API calls. */
const CONFIRM_ABOVE_CALLS = 20;

export function RefreshButton({
  watchId,
  maxCalls,
  label = "Refresh",
  shortLabel,
}: {
  /** Refresh one watched car; omit for all of them. */
  watchId?: number;
  maxCalls: number;
  label?: string;
  /** A shorter label for phones, where space is tight. */
  shortLabel?: string;
}) {
  const [state, action, pending] = useActionState(refreshListings, {} as RefreshState);

  return (
    <form
      action={action}
      className="refresh"
      onSubmit={(e) => {
        if (
          maxCalls > CONFIRM_ABOVE_CALLS &&
          !confirm(`This refresh can use up to ${maxCalls} API calls. Go ahead?`)
        ) {
          e.preventDefault();
        }
      }}
    >
      {watchId && <input type="hidden" name="watchId" value={watchId} />}
      <button type="submit" className="text-action" disabled={pending || maxCalls === 0}>
        <Icon name="refresh" />
        {pending ? (
          <span>Refreshing…</span>
        ) : shortLabel ? (
          <>
            <span className="label-long">{label}</span>
            <span className="label-short">{shortLabel}</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </button>
      {state.log && !pending && (
        <details className="refresh-result" open={state.status !== "ok"}>
          <summary className={state.status === "ok" ? "muted small" : "error small"}>
            {state.status === "ok" ? "Refreshed" : state.status === "partial" ? "Partly refreshed" : "Refresh failed"}
            {` · ${state.calls} call${state.calls === 1 ? "" : "s"}`}
          </summary>
          <pre className="log">{state.log.join("\n")}</pre>
        </details>
      )}
    </form>
  );
}
