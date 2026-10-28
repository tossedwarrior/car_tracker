import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

export const metadata: Metadata = {
  title: "About · Poster Wall",
  description: "A price tracker for used exotic cars, prototyped with AI by Anas Ashraf.",
};

// Public, so visitors from the portfolio can read it without the password
// (see src/proxy.ts). The link to the source code shows only to people
// signed in to the app.
const GITHUB_URL = "https://github.com/tossedwarrior/car_tracker";
const PORTFOLIO_URL = "https://anasashraf.com";

const sources = [
  {
    name: "Auto.dev",
    url: "https://www.auto.dev",
    what: "Dealer listings across the U.S., in U.S. dollars.",
  },
  {
    name: "MarketCheck",
    url: "https://www.marketcheck.com",
    what: "Dealer listings within 100 miles of Toronto, Montreal, Vancouver and Calgary, in Canadian dollars.",
  },
  {
    name: "Old Cars Data",
    url: "https://oldcarsdata.com",
    what: "Sold prices from collector-car auctions, to compare asking prices with what cars really sell for.",
  },
  {
    name: "Bank of Canada Valet API",
    url: "https://www.bankofcanada.ca/valet/docs",
    what: "Daily exchange rates, so U.S. and Canadian prices can be compared in either currency.",
  },
];

const features = [
  ["Every listing, one place", "Searches dealers in the U.S. and Canada and recognizes the same car on two sites by its VIN."],
  ["Price history", "Saves each price change, and marks a car gone once it stops appearing."],
  ["Market trends", "Weekly typical asking prices, monthly auction results, and whether the market is rising or cooling."],
  ["Alerts", "New listings, price drops, and cars that come in under my target price."],
  ["Free to run", "Refreshes only when I ask, and each source stops before its free monthly limit."],
];

export default async function AboutPage() {
  const signedIn = await isValidSession((await cookies()).get(SESSION_COOKIE)?.value);

  return (
    <article className="about">
      <header className="about-head">
        <p className="about-eyebrow">About</p>
        <h1>Poster Wall</h1>
        <p className="about-lead">
          A price tracker for the used exotic cars I&apos;ve wanted since they were posters on my wall.
          It follows every listing for the cars I&apos;m watching, records each price change, and compares
          asking prices with what the same cars sell for at auction, so I know a fair price when one
          comes up.
        </p>
      </header>

      <section className="about-row">
        <h2>An AI prototype</h2>
        <div>
          <p>
            I built Poster Wall to show how I prototype with AI. I wrote the spec and designed every screen
            in Figma, then built it with Claude Code, Anthropic&apos;s AI coding agent, one step at a time:
            the data sources, the listings and market pages, alerts, the redesign from my Figma files, the
            home page where the cars drive in and out as you scroll, and hosting.
          </p>
        </div>
      </section>

      <section className="about-row">
        <h2>What it does</h2>
        <dl className="about-list">
          {features.map(([term, text]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="about-row">
        <h2>Data sources</h2>
        <dl className="about-list">
          {sources.map((s) => (
            <div key={s.name}>
              <dt>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.name}
                </a>
              </dt>
              <dd>{s.what}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="about-row">
        <h2>Built with</h2>
        <p>Next.js, React and TypeScript, with a MySQL database through Drizzle ORM and charts by Recharts. Hosted on GoDaddy.</p>
      </section>

      <section className="about-row">
        <h2>Links</h2>
        <ul className="about-links">
          <li>
            <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">
              My portfolio, anasashraf.com
            </a>
          </li>
          {signedIn ? (
            <>
              <li>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  Source code on GitHub
                </a>
              </li>
              <li>
                <Link href="/">Open the app</Link>
              </li>
            </>
          ) : (
            <li>
              <Link href="/login?next=%2F">Sign in to the app</Link>
            </li>
          )}
        </ul>
      </section>
    </article>
  );
}
