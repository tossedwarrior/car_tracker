"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HomeCar } from "@/lib/home";
import { sceneMotion } from "@/lib/showroom";
import { wheelTurn } from "@/lib/wheels";
import { CarSprite } from "./CarSprite";
import { CarStats } from "./CarStats";
import { ViewSwitch } from "./ViewSwitch";

// The expanded home view (Figma 3:126). The stage stays put while you scroll;
// each car gets one screen of scroll, and sceneMotion() (src/lib/showroom.ts)
// says where everything is. Wheels roll with the distance driven, so they
// speed up, slow down and reverse with the car.

/** Page scroll at which the stage pins (just under the pinned header): the first car's spot. */
function scrollStart(section: HTMLElement, stage: HTMLElement) {
  const pinnedAt = parseFloat(getComputedStyle(stage).top) || 0;
  return Math.max(0, section.getBoundingClientRect().top + window.scrollY - pinnedAt);
}

interface Parts {
  scene: HTMLDivElement | null;
  heading: HTMLDivElement | null;
  car: HTMLDivElement | null;
  wheels: (HTMLDivElement | null)[];
  text: HTMLDivElement | null;
  logo: HTMLDivElement | null;
}

/** Space kept between the bottom of a car's name and the top of the car. */
const HEADING_GAP = 16;

export function CarShowroom({ cars }: { cars: HomeCar[] }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const parts = useRef<Parts[]>(
    cars.map(() => ({ scene: null, heading: null, car: null, wheels: [], text: null, logo: null })),
  );
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);

  const update = useCallback(() => {
    const el = section.current;
    const st = stage.current;
    if (!el || !st) return;
    const screen = st.clientHeight;
    const stageW = st.clientWidth;
    // 0 at the first car, 1 at the second, and so on.
    const s = Math.min(cars.length - 1, (window.scrollY - scrollStart(el, st)) / screen);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    cars.forEach((carInfo, i) => {
      const p = parts.current[i];
      const u = s - i; // < 0: still to come; > 0: gone past
      const carW = p.car?.clientWidth ?? 0;
      const m = sceneMotion(u, stageW, carW);
      const x = m.x;

      if (p.car) {
        if (reduce) {
          p.car.style.transform = "translateX(-50%)";
          p.car.style.opacity = m.textOpacity.toFixed(3);
        } else {
          p.car.style.transform = `translateX(-50%) translate3d(${x.toFixed(1)}px, ${m.bob.toFixed(2)}px, 0)`;
          p.car.style.opacity = "1";
        }
        p.car.style.visibility = m.offStage ? "hidden" : "visible";
      }

      const wheels = carInfo.images.photo?.wheels;
      if (wheels && !reduce) {
        [wheels.front, wheels.rear].forEach((w, k) => {
          const el = p.wheels[k];
          if (!el) return;
          const turn = wheelTurn(x, w.r * carW);
          // A right-facing photo is drawn mirrored, which mirrors the turn too.
          const deg = carInfo.images.photo?.facesRight ? -turn : turn;
          el.style.transform = `rotate(${deg.toFixed(2)}deg)`;
        });
      }

      if (p.text) {
        p.text.style.opacity = m.textOpacity.toFixed(3);
        p.text.style.transform = `translateY(${m.textY.toFixed(1)}px)`;
        p.text.style.visibility = m.textOpacity < 0.01 ? "hidden" : "visible";
        if (m.textOpacity < 0.5) p.text.setAttribute("inert", "");
        else p.text.removeAttribute("inert");
      }
      if (p.logo) p.logo.style.opacity = m.logoOpacity.toFixed(4);
    });

    const current = Math.max(0, Math.min(cars.length - 1, Math.round(s)));
    if (current !== activeRef.current) {
      activeRef.current = current;
      setActive(current);
    }
  }, [cars]);

  // A long name wraps onto more lines, so each scene measures where its
  // heading ends and the car is sized to fit below it (--heading-room in
  // globals.css). Measured on layout changes, not on every scroll frame.
  const measureHeadings = useCallback(() => {
    for (const p of parts.current) {
      if (!p.scene || !p.heading) continue;
      const bottom = p.heading.offsetTop + p.heading.offsetHeight;
      p.scene.style.setProperty("--heading-room", `${bottom + HEADING_GAP}px`);
    }
  }, []);

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const relayout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        measureHeadings();
        update();
      });
    };
    measureHeadings();
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", relayout);
    // Images change sizes as they load, and names re-wrap when the stage resizes.
    const sizes = new ResizeObserver(relayout);
    if (stage.current) sizes.observe(stage.current);
    // The web fonts change how names wrap once they arrive.
    document.fonts?.ready.then(relayout);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", relayout);
      sizes.disconnect();
    };
  }, [update, measureHeadings]);

  const goTo = (i: number) => {
    const el = section.current;
    const st = stage.current;
    if (!el || !st) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: scrollStart(el, st) + i * st.clientHeight, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <section
      ref={section}
      className="showroom"
      style={{ "--slots": cars.length } as React.CSSProperties}
      aria-label="Watched cars"
    >
      {/* Snap points: each car settles in place when scrolling stops. */}
      {cars.map((c, i) => (
        <div key={c.id} className="showroom-snap" style={{ "--slot": i } as React.CSSProperties} aria-hidden="true" />
      ))}

      <div ref={stage} className="showroom-stage">
        <div className="showroom-ground" aria-hidden="true" />
        {cars.map((car, i) => {
          const photo = car.images.photo;
          const logo = car.images.logo;
          const aspect = photo?.width && photo.height ? photo.height / photo.width : 0.32;
          const logoAspect = logo?.width && logo.height ? logo.height / logo.width : 0.47;
          return (
            <div
              key={car.id}
              ref={(el) => void (parts.current[i].scene = el)}
              className="scene"
              style={{ "--aspect": aspect, "--logo-aspect": logoAspect } as React.CSSProperties}
            >
              {logo && (
                <div ref={(el) => void (parts.current[i].logo = el)} className="scene-logo" aria-hidden="true">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logo.url} alt="" />
                </div>
              )}

              {photo?.width && photo.height ? (
                <div ref={(el) => void (parts.current[i].car = el)} className="scene-car">
                  <CarSprite
                    src={photo.url}
                    width={photo.width}
                    height={photo.height}
                    wheels={photo.wheels}
                    facesRight={photo.facesRight}
                    wheelRef={(el, k) => void (parts.current[i].wheels[k] = el)}
                  />
                </div>
              ) : null}

              <div ref={(el) => void (parts.current[i].text = el)} className="scene-text">
                <div ref={(el) => void (parts.current[i].heading = el)} className="scene-heading">
                  <p className="scene-years">{car.years}</p>
                  <h2 className="scene-title">{car.title}</h2>
                </div>
                {!photo && (
                  <p className="scene-no-photo">
                    <Link href={`/watch/${car.id}/edit`}>Add a car photo</Link> to see it here.
                  </p>
                )}
                <div className="scene-details">
                  <CarStats car={car} />
                  <Link href={`/watch/${car.id}`} className="pill-button primary">
                    View listings &amp; market
                  </Link>
                </div>
              </div>
            </div>
          );
        })}

        <div className="showroom-switch">
          <ViewSwitch current="expanded" />
        </div>

        {cars.length > 1 && (
          <nav className="showroom-dots" aria-label="Jump to a car">
            {cars.map((c, i) => (
              <button
                key={c.id}
                type="button"
                className="showroom-dot"
                aria-label={c.title}
                aria-current={i === active ? "true" : undefined}
                onClick={() => goTo(i)}
              />
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
