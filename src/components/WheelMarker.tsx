"use client";

import { useEffect, useRef, useState } from "react";
import { guessWheels, type Wheel, type WheelSpec } from "@/lib/wheels";
import { CarSprite } from "./CarSprite";

type Which = "front" | "rear";

/**
 * Mark where a car photo's wheels are, so they can turn on the home page:
 * drag a circle to move it, drag its dot to resize it, spin to check.
 * Sends `wheels` (JSON) and `facesRight` with the form.
 */
export function WheelMarker({
  src,
  initialWheels,
  initialFacesRight,
}: {
  src: string;
  initialWheels: WheelSpec | null;
  initialFacesRight: boolean;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [wheels, setWheels] = useState<WheelSpec | null>(initialWheels);
  const [facesRight, setFacesRight] = useState(initialFacesRight);
  const [spin, setSpin] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ which: Which; mode: "move" | "resize" } | null>(null);

  // A new photo: measure it and make a first guess at the wheels.
  useEffect(() => {
    setSize(null);
    setWheels(initialWheels);
    const img = new Image();
    img.onload = () => {
      const s = { width: img.naturalWidth, height: img.naturalHeight };
      setSize(s);
      setWheels((w) => w ?? guessWheels(s.height / s.width, initialFacesRight));
    };
    img.src = src;
    // Only when the photo itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (!size || !wheels) return null;
  const aspect = size.height / size.width;

  // Wheels are stored in the photo's own coordinates; a right-facing photo is
  // shown mirrored, so mirror x on the way in and out.
  const shownX = (x: number) => (facesRight ? 1 - x : x);

  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current || !box.current) return;
    const rect = box.current.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const { which, mode } = drag.current;
    setWheels((current) => {
      if (!current) return current;
      const w = current[which];
      let next: Wheel;
      if (mode === "move") {
        next = { ...w, x: clamp(shownX(px), w.r, 1 - w.r), y: clamp(py, 0, 1) };
      } else {
        // Distance from the centre, in fractions of the width.
        const dx = px - shownX(w.x);
        const dy = (py - w.y) * aspect;
        next = { ...w, r: clamp(Math.hypot(dx, dy), 0.02, 0.3) };
      }
      return { ...current, [which]: next };
    });
  };

  const handle = (which: Which, mode: "move" | "resize") => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    drag.current = { which, mode };
  };

  return (
    <div className="wheel-marker">
      <input type="hidden" name="wheels" value={JSON.stringify(wheels)} />
      <p className="pill-label">Wheels</p>
      <p className="muted small">
        Drag each circle over a wheel and pull its dot so the circle covers the whole tyre. Then
        spin the wheels: if a wheel wobbles, nudge its circle until it turns smoothly.
      </p>

      <div
        ref={box}
        className="wheel-marker-stage"
        style={{ aspectRatio: `${size.width} / ${size.height}` }}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <CarSprite src={src} width={size.width} height={size.height} wheels={wheels} facesRight={facesRight} spin={spin} />
        {(["front", "rear"] as const).map((which) => {
          const w = wheels[which];
          return (
            <div
              key={which}
              className="wheel-ring"
              style={{
                left: `${(shownX(w.x) - w.r) * 100}%`,
                top: `${((w.y * aspect - w.r) / aspect) * 100}%`,
                width: `${w.r * 200}%`,
              }}
              onPointerDown={handle(which, "move")}
              role="slider"
              aria-label={`${which === "front" ? "Front" : "Rear"} wheel position`}
              aria-valuetext={`${Math.round(w.x * 100)}% across, ${Math.round(w.y * 100)}% down`}
            >
              <span className="wheel-ring-label">{which === "front" ? "Front" : "Rear"}</span>
              <span className="wheel-ring-handle" onPointerDown={handle(which, "resize")} aria-label="Resize" />
            </div>
          );
        })}
      </div>

      <div className="wheel-marker-actions">
        <button type="button" className="pill-button small" onClick={() => setSpin((s) => !s)}>
          {spin ? "Stop spinning" : "Spin wheels to check"}
        </button>
        <label className="check">
          <input type="checkbox" name="facesRight" checked={facesRight} onChange={(e) => setFacesRight(e.currentTarget.checked)} />
          The car in this photo faces right
        </label>
        <button
          type="button"
          className="text-link"
          onClick={() => setWheels(guessWheels(aspect, facesRight))}
        >
          Reset wheels
        </button>
      </div>
    </div>
  );
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
