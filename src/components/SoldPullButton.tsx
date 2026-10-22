"use client";

import { useActionState } from "react";
import { pullSold, type SoldPullState } from "@/app/actions";

export function SoldPullButton({ watchId, callsLeft }: { watchId: number; callsLeft: number }) {
  const [state, action, pending] = useActionState(pullSold, {} as SoldPullState);

  return (
    <form
      action={action}
      className="refresh"
      onSubmit={(e) => {
        const msg = `This uses 1 of your ${callsLeft} Old Cars Data queries left this month. Go ahead?`;
        if (!confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="watchId" value={watchId} />
      <button type="submit" className="button" disabled={pending || callsLeft <= 0}>
        {pending ? "Updating…" : "Update sold prices"}
      </button>
      {!pending && state.message && <span className="muted small">{state.message}</span>}
      {!pending && state.error && <span className="error small">{state.error}</span>}
    </form>
  );
}
