import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { CustomerioAnalytics } from "@/components/CustomerioAnalytics";
import { NavLinks } from "@/components/NavLinks";
import { countUnseenAlerts } from "@/jobs/alerts";
import { getCurrentUser } from "@/lib/current-user";
import { sans, serif } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poster Wall",
  description: "Follow the exotics you want: every listing, auction results and where prices are heading.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  // Signed out (sign-in and About pages only): no navigation.
  const unseenAlerts = user ? await countUnseenAlerts(user.id) : 0;

  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <header className="site">
          <div className="inner">
            <Link href="/" className="brand">
              Poster Wall
            </Link>
            {user && <NavLinks unseenAlerts={unseenAlerts} />}
          </div>
        </header>
        <main>{children}</main>
        <CustomerioAnalytics user={user && { id: user.id, email: user.email }} />
      </body>
    </html>
  );
}
