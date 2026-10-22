import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

const tables = [
  "watchlist",
  "listings",
  "price_snapshots",
  "sold_results",
  "market_snapshots",
  "alerts_sent",
  "api_usage",
  "fx_rates",
];

export default function Home() {
  const counts = tables.map((name) => {
    const row = db.get<{ n: number }>(sql.raw(`select count(*) as n from ${name}`));
    return { name, n: row.n };
  });

  return (
    <>
      <h1>Car Price Tracker</h1>
      <p>Database is set up. Pages come in step 3.</p>
      <table>
        <thead>
          <tr><th>Table</th><th>Rows</th></tr>
        </thead>
        <tbody>
          {counts.map((c) => (
            <tr key={c.name}><td>{c.name}</td><td>{c.n}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
