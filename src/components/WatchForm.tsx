"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveWatch, type WatchFormState } from "@/app/actions";
import type { Watch } from "@/lib/watchlist";

const initial: WatchFormState = { errors: {} };

export function WatchForm({ watch }: { watch?: Watch }) {
  const [state, action, pending] = useActionState(saveWatch, initial);
  const e = state.errors;
  // After a failed submit React resets the form to its defaults, so the
  // defaults become what was just typed.
  const v = (name: keyof Watch) => state.values?.[name] ?? watch?.[name];

  return (
    <form action={action} className="form" noValidate>
      {watch && <input type="hidden" name="id" value={watch.id} />}

      <div className="row">
        <Field label="Make" name="make" error={e.make} defaultValue={v("make")} placeholder="Ferrari" required />
        <Field label="Model" name="model" error={e.model} defaultValue={v("model")} placeholder="458 Italia" required />
      </div>

      <div className="row">
        <Field label="From year" name="yearMin" error={e.yearMin} defaultValue={v("yearMin")} placeholder="2011" inputMode="numeric" required />
        <Field label="To year" name="yearMax" error={e.yearMax} defaultValue={v("yearMax")} placeholder="2015" inputMode="numeric" required />
      </div>

      <div className="row">
        <Field label="Max mileage (km)" name="maxKm" error={e.maxKm} defaultValue={v("maxKm")} placeholder="40,000" inputMode="numeric" hint="Optional" />
        <Field label="Trim" name="trim" error={e.trim} defaultValue={v("trim")} placeholder="Spider" hint="Optional. Must match the listing's trim exactly." />
      </div>

      <div className="row">
        <Field label="Target price" name="targetPrice" error={e.targetPrice} defaultValue={v("targetPrice")} placeholder="250,000" inputMode="numeric" hint="Optional. Alerts when a car comes in under it." />
        <label className="field">
          <span>Currency</span>
          <select name="targetCurrency" defaultValue={String(v("targetCurrency") ?? "CAD")}>
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
          </select>
          {e.targetCurrency && <em className="error">{e.targetCurrency}</em>}
        </label>
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea name="notes" rows={3} defaultValue={String(v("notes") ?? "")} />
      </label>

      <div className="actions">
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Saving…" : watch ? "Save changes" : "Add to watchlist"}
        </button>
        <Link href={watch ? `/watch/${watch.id}` : "/"} className="button">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  hint,
  defaultValue,
  ...input
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  defaultValue?: string | number | boolean | null;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue">) {
  return (
    <label className="field">
      <span>{label}</span>
      <input name={name} defaultValue={defaultValue == null ? "" : String(defaultValue)} aria-invalid={!!error} {...input} />
      {error ? <em className="error">{error}</em> : hint && <small>{hint}</small>}
    </label>
  );
}
