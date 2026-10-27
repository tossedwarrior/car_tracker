"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header links; the current page's link is bold, as in the design. */
export function NavLinks({ unseenAlerts }: { unseenAlerts: number }) {
  const path = usePathname();
  const current = (href: string) => (path === href ? "page" : undefined);
  return (
    <nav aria-label="Main">
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
  );
}
