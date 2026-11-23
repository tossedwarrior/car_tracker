"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { saveWatch, type WatchFormState } from "@/app/actions";
import type { Watch } from "@/lib/watchlist";
import type { WheelSpec } from "@/lib/wheels";
import { Icon } from "./Icon";
import { WheelMarker } from "./WheelMarker";

const initial: WatchFormState = { errors: {} };
const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg";

/**
 * Add or edit a watched car (Figma "Add a car", 10:384): two columns of
 * rounded fields, notes, brand logo and car photo uploads, then the buttons.
 */
export function WatchForm({
  watch,
  images = {},
  lockedImages = { logo: false, photo: false },
}: {
  watch?: Watch;
  /** Current images when editing. */
  images?: { logo?: string; photo?: string; wheels?: WheelSpec | null; facesRight?: boolean };
  /** Images this person can't replace, because others follow the car too. */
  lockedImages?: { logo: boolean; photo: boolean };
}) {
  // The car photo being shown: a newly chosen file, else the current one.
  const [photoSrc, setPhotoSrc] = useState<string | undefined>(images.photo);
  // Wheels found in a newly chosen photo (null: the wheel tool guesses).
  const [foundWheels, setFoundWheels] = useState<WheelSpec | null>(null);
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
      {e.form && (
        <p className="error wide" role="alert">
          {e.form}
        </p>
      )}

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

      {!lockedImages.logo && (
        <ImageField
          name="logo"
          label="Brand logo"
          prompt="Upload logo"
          required={false}
          current={images.logo}
          error={e.logo}
          hint="Optional. Transparent background, cropped tight. SVG, or PNG at least 1600 px wide."
        />
      )}
      {!lockedImages.photo && (
        <ImageField
          name="photo"
          label="Car photo"
          prompt="Upload photo"
          required={false}
          current={images.photo}
          error={e.photo}
          hint="Optional. A side-on photo; on a simple background (a studio, or a wall and floor) we'll remove the background, crop it and mark the wheels for you. Facing left is best."
          prepare={preparePhoto}
          onPreview={(url, wheels) => {
            setFoundWheels(wheels ?? null);
            setPhotoSrc(url ?? images.photo);
          }}
        />
      )}
      {photoSrc && !lockedImages.photo && (
        <div className="wide">
          <WheelMarker
            src={photoSrc}
            // A newly chosen photo starts with the wheels found in it, or a guess.
            initialWheels={photoSrc === images.photo ? (images.wheels ?? null) : foundWheels}
            initialFacesRight={images.facesRight ?? false}
          />
        </div>
      )}

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

interface Prepared {
  file?: File;
  wheels: WheelSpec | null;
  note: string;
}

/**
 * Send a chosen car photo to be prepared (src/app/api/prepare-photo):
 * background removed if plain, cropped to the car, wheels found. Returns the
 * prepared file to use instead, or just a note when it's best left as it was.
 */
async function preparePhoto(file: File): Promise<Prepared> {
  try {
    const res = await fetch("/api/prepare-photo", { method: "POST", body: file });
    const body = (await res.json()) as {
      error?: string;
      image?: string;
      wheels?: WheelSpec | null;
      background?: "removed" | "already" | "busy";
    };
    if (!res.ok || !body.image) return { wheels: null, note: body.error ?? "Couldn't prepare this photo; it's used as it is." };
    if (body.background === "busy") {
      return {
        wheels: null,
        note: "The background is too busy to remove, so the photo is as you chose it. A photo against a plain wall or studio works best (on a Mac: right-click the file, Quick Actions, Remove Background).",
      };
    }
    const bytes = Uint8Array.from(atob(body.image), (c) => c.charCodeAt(0));
    const name = file.name.replace(/\.[^.]+$/, "") + ".png";
    const done = body.background === "removed" ? "Background removed and cropped to the car" : "Cropped to the car";
    return {
      file: new File([bytes], name, { type: "image/png" }),
      wheels: body.wheels ?? null,
      note: body.wheels ? `${done}, wheels marked. Check them below.` : `${done}. Place the wheels below.`,
    };
  } catch {
    return { wheels: null, note: "Couldn't prepare this photo; it's used as it is." };
  }
}

/** An upload box (10:463, 10:467): click or drop an image; shows a preview once chosen. */
function ImageField({
  name,
  label,
  prompt,
  required,
  current,
  error,
  hint,
  prepare,
  onPreview,
}: {
  name: string;
  label: string;
  prompt: string;
  required: boolean;
  current?: string;
  error?: string;
  hint?: string;
  /** Prepare a chosen file (car photos); the result replaces it, with a note. */
  prepare?: (file: File) => Promise<Prepared>;
  /** Called with the preview URL shown (or undefined when cleared), and any wheels found. */
  onPreview?: (url: string | undefined, wheels?: WheelSpec | null) => void;
}) {
  const [chosen, setChosen] = useState<{ url: string; name: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [original, setOriginal] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Only the latest choice counts, if someone picks again mid-way.
  const latest = useRef(0);

  /** Put a file in the input (so it's what's saved) and show it. */
  const use = (file: File, wheels: WheelSpec | null) => {
    const files = new DataTransfer();
    files.items.add(file);
    if (input.current) input.current.files = files.files;
    const url = URL.createObjectURL(file);
    setChosen({ url, name: file.name });
    onPreview?.(url, wheels);
  };

  const choose = async (file: File | undefined) => {
    const turn = ++latest.current;
    setOriginal(null);
    if (!file) {
      setChosen(null);
      setStatus(null);
      onPreview?.(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setChosen({ url, name: file.name });
    onPreview?.(url, null);
    if (!prepare) return;
    setStatus("Removing the background and finding the wheels…");
    const result = await prepare(file);
    if (turn !== latest.current) return;
    setStatus(result.note);
    if (result.file) {
      setOriginal(file);
      use(result.file, result.wheels);
    }
  };
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
          ref={input}
          type="file"
          name={name}
          accept={IMAGE_ACCEPT}
          aria-required={required}
          aria-invalid={!!error}
          onChange={(event) => void choose(event.currentTarget.files?.[0])}
        />
      </span>
      {error ? (
        <em className="error">{error}</em>
      ) : status ? (
        <small className="small upload-status" role="status">
          {status}
          {original && (
            <>
              {" "}
              <button
                type="button"
                className="link-button"
                onClick={(event) => {
                  event.preventDefault();
                  use(original, null);
                  setOriginal(null);
                  setStatus("Using your photo as it was. Place the wheels below.");
                }}
              >
                Use my original instead
              </button>
            </>
          )}
        </small>
      ) : (
        hint && <small className="muted small">{hint}</small>
      )}
    </label>
  );
}
