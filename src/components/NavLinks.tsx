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
        {/* Three lines that draw themselves into an X when open (styles in
            globals.css), the same icon as on anasashraf.com. */}
        <svg className="menu-icon" viewBox="290 190 260 260" width="26" height="26" aria-hidden="true">
          <path className="menu-top" d="M300,220 C300,220 520,220 540,220 C740,220 640,540 520,420 C440,340 300,200 300,200" />
          <path className="menu-middle" d="M300,320 L540,320" />
          <path
            className="menu-bottom"
            d="M300,210 C300,210 520,210 540,210 C740,210 640,530 520,410 C440,330 300,190 300,190"
            transform="translate(480, 320) scale(1, -1) translate(-480, -318)"
          />
        </svg>
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
