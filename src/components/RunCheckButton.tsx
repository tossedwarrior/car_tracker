"use client";

import { useActionState } from "react";
import { runCheckNow, type CheckNowState } from "@/app/actions";

export function RunCheckButton({ maxCalls }: { maxCalls: number }) {
  const [state, action, pending] = useActionState(runCheckNow, {} as CheckNowState);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Run the daily check now? It can use up to ${maxCalls} API call(s).`)) e.preventDefault();
      }}
    >
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Checking…" : "Run check now"}
      </button>
      {state.log && (
        <pre className="log" aria-live="polite">
          {state.log.join("\n")}
        </pre>
      )}
    </form>
  );
}
