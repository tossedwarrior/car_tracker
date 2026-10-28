"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Header links; the current page's link is bold. On phones they fold into a
 * menu button (Figma 21:213) that opens them as a list under the header.
 */
export function NavLinks({ unseenAlerts }: { unseenAlerts: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = (href: string) => (path === href ? "page" : undefined);

  // Close on navigation, Escape, or a tap anywhere else.
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div ref={root} className="site-nav">
      <button
        type="button"
        className="menu-button"
        aria-expanded={open}
        aria-controls="main-nav"
        aria-label={unseenAlerts > 0 ? `Menu, ${unseenAlerts} unread alerts` : "Menu"}
        onClick={() => setOpen((o) => !o)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/menu.png" width={24} height={24} alt="" />
        {unseenAlerts > 0 && <span className="menu-dot" aria-hidden="true" />}
      </button>
      <nav id="main-nav" aria-label="Main" className={open ? "open" : undefined}>
        <Link href="/about" aria-current={current("/about")}>
          About
        </Link>
        <Link href="/alerts" aria-current={current("/alerts")}>
          Alerts
          {unseenAlerts > 0 && (
            <span className="nav-count" aria-label={`${unseenAlerts} not seen`}>
              {unseenAlerts}
            </span>
          )}
        </Link>
        <Link href="/settings" aria-current={current("/settings")}>
          Settings
        </Link>
        <Link href="/watch/new" aria-current={current("/watch/new")}>
          Add a car
        </Link>
      </nav>
    </div>
  );
}
