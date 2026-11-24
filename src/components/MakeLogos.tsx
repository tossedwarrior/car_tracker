"use client";

import { useActionState } from "react";
import { removeMakeLogo, uploadMakeLogo, type MakeLogoState } from "@/app/actions";
import type { MakeRow } from "@/lib/make-logos";

const shows: Record<MakeRow["shows"], string> = {
  uploaded: "Your upload",
  emblem: "Simple Icons emblem",
  name: "The make's name",
};

/** Settings (owner): each make on anyone's watchlist, its background logo, and a way to upload one. */
export function MakeLogos({ makes }: { makes: MakeRow[] }) {
  if (makes.length === 0) return <p className="muted">No cars yet.</p>;
  return (
    <div className="make-logos">
      {makes.map((m) => (
        <MakeLogoRow key={m.key} row={m} />
      ))}
    </div>
  );
}

function MakeLogoRow({ row }: { row: MakeRow }) {
  const [state, action, pending] = useActionState<MakeLogoState, FormData>(uploadMakeLogo, {});
  return (
    <div className="make-logo-row">
      <div className="make-logo-preview" aria-hidden="true">
        {row.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.logo.url} alt="" />
        ) : (
          <span>{row.make}</span>
        )}
      </div>
      <div className="make-logo-info">
        <p className="strong">{row.make}</p>
        <p className="muted small">
          {row.cars} {row.cars === 1 ? "car" : "cars"} · {shows[row.shows]}
        </p>
      </div>
      <form action={action} className="make-logo-form">
        <input type="hidden" name="make" value={row.make} />
        <input type="file" name="logo" accept=".png,.jpg,.jpeg,.webp,.svg" aria-label={`Logo for ${row.make}`} required />
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Uploading…" : row.shows === "uploaded" ? "Replace" : "Upload"}
        </button>
        {state.error && <em className="error">{state.error}</em>}
      </form>
      {row.shows === "uploaded" && (
        <form action={removeMakeLogo}>
          <input type="hidden" name="key" value={row.key} />
          <button type="submit" className="button">
            Remove
          </button>
        </form>
      )}
    </div>
  );
}
