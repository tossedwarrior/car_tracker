"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useState } from "react";
import { saveWatch, type WatchFormState } from "@/app/actions";
import type { Watch } from "@/lib/watchlist";
import { Icon } from "./Icon";

const initial: WatchFormState = { errors: {} };
const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg";

/**
 * Add or edit a watched car (Figma "Add a car", 10:384): two columns of
 * rounded fields, notes, brand logo and car photo uploads, then the buttons.
 */
export function WatchForm({
  watch,
  images = {},
}: {
  watch?: Watch;
  /** Current image URLs when editing. */
  images?: { logo?: string; photo?: string };
}) {
  const [state, action, pending] = useActionState(saveWatch, initial);
  const e = state.errors;
  const v = (name: keyof Watch) => state.values?.[name] ?? watch?.[name];
  const adding = !watch;

  return (
    <form
      className="car-form"
      noValidate
      // Submitting this way (not <form action>) stops React clearing the form,
      // so chosen images stay chosen if another field needs fixing.
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      {watch && <input type="hidden" name="id" value={watch.id} />}

      <Field label="Make" required name="make" error={e.make} defaultValue={v("make")} placeholder="Ferrari" />
      <Field label="Model" required name="model" error={e.model} defaultValue={v("model")} placeholder="458 Italia" />
      <Field label="From" required name="yearMin" error={e.yearMin} defaultValue={v("yearMin")} placeholder="2011" inputMode="numeric" />
      <Field label="To" required name="yearMax" error={e.yearMax} defaultValue={v("yearMax")} placeholder="2015" inputMode="numeric" />
      <Field label="Max mileage (km)" name="maxKm" error={e.maxKm} defaultValue={v("maxKm")} placeholder="40,000" inputMode="numeric" />
      <Field label="Trim" name="trim" error={e.trim} defaultValue={v("trim")} placeholder="Spider" />
      <Field label="Target price" name="targetPrice" error={e.targetPrice} defaultValue={v("targetPrice")} placeholder="$240,000" inputMode="numeric" />

      <label className="pill-field">
        <span className="pill-label">Currency</span>
        <select className="pill-input pill-select" name="targetCurrency" defaultValue={String(v("targetCurrency") ?? "CAD")}>
          <option value="CAD">CAD</option>
          <option value="USD">USD</option>
        </select>
        {e.targetCurrency && <em className="error">{e.targetCurrency}</em>}
      </label>

      <label className="pill-field wide">
        <span className="pill-label">Notes</span>
        <textarea className="pill-input pill-textarea" name="notes" defaultValue={String(v("notes") ?? "")} placeholder="Manual cars only" />
      </label>

      <ImageField name="logo" label="Brand logo" prompt="Upload logo" required={adding} current={images.logo} error={e.logo} />
      <ImageField name="photo" label="Car photo" prompt="Upload photo" required={adding} current={images.photo} error={e.photo} />

      <div className="form-buttons wide">
        <button type="submit" className="pill-button primary" disabled={pending}>
          {pending ? "Saving…" : adding ? "Add to watchlist" : "Save changes"}
        </button>
        <Link href={watch ? `/watch/${watch.id}` : "/"} className="pill-button">
          Cancel
        </Link>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  error,
  defaultValue,
  ...input
}: {
  label: string;
  name: string;
  required?: boolean;
  error?: string;
  defaultValue?: string | number | boolean | null;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue">) {
  return (
    <label className="pill-field">
      <span className="pill-label">
        {label}
        {required && "*"}
      </span>
      <input
        className="pill-input"
        name={name}
        defaultValue={defaultValue == null ? "" : String(defaultValue)}
        aria-invalid={!!error}
        aria-required={required}
        {...input}
      />
      {error && <em className="error">{error}</em>}
    </label>
  );
}

/** An upload box (10:463, 10:467): click or drop an image; shows a preview once chosen. */
function ImageField({
  name,
  label,
  prompt,
  required,
  current,
  error,
}: {
  name: string;
  label: string;
  prompt: string;
  required: boolean;
  current?: string;
  error?: string;
}) {
  const [chosen, setChosen] = useState<{ url: string; name: string } | null>(null);
  // Free the preview's memory when it's replaced or the form goes away.
  useEffect(() => {
    if (!chosen) return;
    return () => URL.revokeObjectURL(chosen.url);
  }, [chosen]);
  const preview = chosen?.url ?? current;

  return (
    <label className={`pill-field wide upload${preview ? " has-image" : ""}`}>
      <span className="pill-label">
        {label}
        {required && "*"}
      </span>
      <span className="upload-box" aria-invalid={!!error}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview && <img className="upload-preview" src={preview} alt="" />}
        <Icon name="upload" />
        <span className="upload-text">
          {chosen ? chosen.name : current ? `${prompt} to replace it` : `${prompt} .png`}
        </span>
        <input
          type="file"
          name={name}
          accept={IMAGE_ACCEPT}
          aria-required={required}
          aria-invalid={!!error}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setChosen(file ? { url: URL.createObjectURL(file), name: file.name } : null);
          }}
        />
      </span>
      {error && <em className="error">{error}</em>}
    </label>
  );
}
