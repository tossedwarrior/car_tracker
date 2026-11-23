"use client";

import { AnalyticsBrowser } from "@customerio/cdp-analytics-browser";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Customer.io in the browser (the JavaScript integration's write key,
// NEXT_PUBLIC_CUSTOMERIO_WRITE_KEY): who's signed in, which pages they look
// at, and clicks on anything marked data-track. Does nothing without the key.
//
// Mark a link or button to track its clicks:
//   <a data-track="listing_clicked" data-track-props='{"car":"Ferrari 458"}'>

const WRITE_KEY = process.env.NEXT_PUBLIC_CUSTOMERIO_WRITE_KEY?.trim();
const EU = process.env.NEXT_PUBLIC_CUSTOMERIO_REGION?.trim().toLowerCase() === "eu" || !!WRITE_KEY?.includes("_eu_");

let analytics: AnalyticsBrowser | null = null;
function load(): AnalyticsBrowser | null {
  if (!WRITE_KEY) return null;
  analytics ??= AnalyticsBrowser.load({ writeKey: WRITE_KEY, ...(EU ? { cdnURL: "https://cdp-eu.customer.io" } : {}) });
  return analytics;
}

/** Track an event from the browser, e.g. from a button's onClick. */
export function trackInBrowser(event: string, properties?: Record<string, unknown>) {
  void load()?.track(event, properties);
}

export function CustomerioAnalytics({ user }: { user: { id: number; email: string } | null }) {
  const path = usePathname();

  // Who's here. The server sends the rest of the profile; the browser only
  // ties this browser's activity to the person.
  const userId = user?.id;
  const email = user?.email;
  const wasSignedIn = useRef(false);
  useEffect(() => {
    const cio = load();
    if (!cio) return;
    if (userId) {
      void cio.identify(String(userId), { email });
      wasSignedIn.current = true;
    } else if (wasSignedIn.current) {
      // Signed out: what happens next in this browser isn't theirs.
      void cio.reset();
      wasSignedIn.current = false;
    }
  }, [userId, email]);

  useEffect(() => {
    void load()?.page();
  }, [path]);

  useEffect(() => {
    if (!WRITE_KEY) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-track]");
      if (!el) return;
      let props: Record<string, unknown> = {};
      try {
        props = JSON.parse(el.dataset.trackProps ?? "{}");
      } catch {}
      trackInBrowser(el.dataset.track!, props);
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
