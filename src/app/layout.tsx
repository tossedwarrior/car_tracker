import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Car Price Tracker",
  description: "Tracks asking and sold prices for the exotics I'm watching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
