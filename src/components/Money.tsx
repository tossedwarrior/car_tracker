import type { Shown } from "@/lib/money";

/** A converted price with the original amount underneath when it differs. */
export function Money({ shown, strong }: { shown: Shown; strong?: boolean }) {
  return (
    <>
      <span className={strong ? "strong" : undefined}>{shown.main}</span>
      {shown.original && <div className="muted small">{shown.original}</div>}
    </>
  );
}
