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

interface Parts {
  car: HTMLDivElement | null;
  wheels: (HTMLDivElement | null)[];
  text: HTMLDivElement | null;
  logo: HTMLDivElement | null;
}

export function CarShowroom({ cars }: { cars: HomeCar[] }) {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const parts = useRef<Parts[]>(cars.map(() => ({ car: null, wheels: [], text: null, logo: null })));
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);

  const update = useCallback(() => {
    const el = section.current;
    const st = stage.current;
    if (!el || !st) return;
    const screen = st.clientHeight;
    const stageW = st.clientWidth;
    const top = el.getBoundingClientRect().top + window.scrollY;
    // 0 at the first car, 1 at the second, and so on.
    const s = Math.min(cars.length - 1, (window.scrollY - top) / screen);
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

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Images change sizes as they load.
    const sizes = new ResizeObserver(schedule);
    if (stage.current) sizes.observe(stage.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      sizes.disconnect();
    };
  }, [update]);

  const goTo = (i: number) => {
    const el = section.current;
    const st = stage.current;
    if (!el || !st) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: i === 0 ? 0 : top + i * st.clientHeight, behavior: reduce ? "auto" : "smooth" });
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
        {cars.map((car, i) => {
          const photo = car.images.photo;
          const logo = car.images.logo;
          const aspect = photo?.width && photo.height ? photo.height / photo.width : 0.32;
          const logoAspect = logo?.width && logo.height ? logo.height / logo.width : 0.47;
          return (
            <div
              key={car.id}
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
                <div className="scene-heading">
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
