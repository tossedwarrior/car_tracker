import type { Metadata } from "next";
import { cookies } from "next/headers";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

export const metadata: Metadata = {
  title: "About · Poster Wall",
  description: "A price tracker for used exotic cars, prototyped with AI by Anas Ashraf.",
};

// Figma "Poster Wall", frame 46:2. Public, so visitors from the portfolio can
// read it without the password (see src/proxy.ts); the link to the source
// code shows only to people signed in to the app.
const GITHUB_URL = "https://github.com/tossedwarrior/car_tracker";
const PORTFOLIO_URL = "https://anasashraf.com";

const features = [
  "Searches dealer listings in the U.S. and Canada for each car on my watchlist",
  "Saves every price change, and marks a car as likely sold once its listing disappears",
  "Matches listings by VIN, so the same car posted on more than one site is only counted once",
  "Shows each car's market trend: weekly asking prices, auction results, and whether prices are rising or cooling",
  "Alerts me to new listings, price drops and cars that come in within my budget",
];

const sources = [
  { name: "Auto.dev", url: "https://www.auto.dev", what: "Dealer listings across the U.S., in U.S. dollars." },
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

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

export default async function AboutPage() {
  const signedIn = await isValidSession((await cookies()).get(SESSION_COOKIE)?.value);

  return (
    <article className="about">
      <h1>About</h1>
      <p>
        Ever since I was a kid, I&apos;ve always had posters of cars that I dreamed of on my walls. Over the
        years I watched their prices rise and fall with the economy. Now that owning one is getting closer, I
        want to know two things before I buy. Am I overpaying and is the market in a bubble?
      </p>
      <p>
        Poster Wall answers both. It follows dealer listings for the cars on my watchlist, records every price
        change, and compares asking prices with what similar cars sold for at auction. When the right car comes
        up, I can see whether the price is fair.
      </p>

      <section>
        <h2>What it does</h2>
        <ul>
          {features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>How I built it</h2>
        <p>
          I built Poster Wall to show how I prototype with AI, and because I wanted the tool for myself. I wrote
          the spec, designed the screens in Figma, then built it with Claude Code and Codex.
        </p>
        <p>
          All the data comes from free API plans, and each has a monthly call limit. Instead of refreshing on a
          schedule, Poster Wall only refreshes when I ask, so it never goes over.
        </p>
      </section>

      <section>
        <h2>Data sources</h2>
        <dl className="about-sources">
          {sources.map((s) => (
            <div key={s.name}>
              <dt>
                <a href={s.url} {...external}>
                  {s.name}
                </a>
              </dt>
              <dd>{s.what}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2>Tech stack</h2>
        <p>
          Next.js, React and TypeScript, with a MySQL database through Drizzle ORM and charts by Recharts.
          Hosted on GoDaddy.
        </p>
      </section>

      <section>
        <h2>Links</h2>
        <ul className="about-links">
          <li>
            <a href={PORTFOLIO_URL} {...external}>
              My portfolio, anasashraf.com
            </a>
          </li>
          {signedIn && (
            <li>
              <a href={GITHUB_URL} {...external}>
                Source code on GitHub
              </a>
            </li>
          )}
        </ul>
      </section>
    </article>
  );
}
