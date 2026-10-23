import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { countUnseenAlerts } from "@/jobs/alerts";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { getDisplayCurrency } from "@/lib/display-currency";
import "./globals.css";

export const metadata: Metadata = {
  title: "Car Price Tracker",
  description: "Tracks asking and sold prices for the exotics I'm watching.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
  const currency = await getDisplayCurrency();
  // Signed out (sign-in page only): no navigation, nothing from the database.
  const unseenAlerts = signedIn ? countUnseenAlerts() : 0;

  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="inner">
            <Link href="/" className="brand">
              Car Price Tracker
            </Link>
            {signedIn && (
              <>
                <nav>
                  <Link href="/">Watchlist</Link>
                  <Link href="/alerts">
                    Alerts
                    {unseenAlerts > 0 && (
                      <span className="nav-count" aria-label={`${unseenAlerts} not seen`}>
                        {unseenAlerts}
                      </span>
                    )}
                  </Link>
                  <Link href="/settings">Settings</Link>
                </nav>
                <CurrencyToggle current={currency} />
              </>
            )}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
