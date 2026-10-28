import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { NavLinks } from "@/components/NavLinks";
import { countUnseenAlerts } from "@/jobs/alerts";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";
import { sans, serif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poster Wall",
  description: "Tracks asking and sold prices for the exotics I'm watching.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const signedIn = await isValidSession((await cookies()).get(SESSION_COOKIE)?.value);
  // Signed out (sign-in page only): no navigation, nothing from the database.
  const unseenAlerts = signedIn ? await countUnseenAlerts() : 0;

  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <header className="site">
          <div className="inner">
            <Link href="/" className="brand">
              Poster Wall
            </Link>
            {signedIn && (
              <NavLinks unseenAlerts={unseenAlerts} />
            )}
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
