import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fixListing } from "@/app/actions";
import { db } from "@/db";
import { currencies, listings } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function FixListingPage({ params }: { params: Promise<{ id: string }> }) {
  const [l] = await db.select().from(listings).where(eq(listings.id, Number((await params).id))).limit(1);
  if (!l) notFound();

  return (
    <>
      <p className="crumb">
        <Link href={`/watch/${l.watchId}`}>Back to listings</Link>
      </p>
      <h1>Fix listing details</h1>
      <p className="muted">
        {l.title} · {l.sellerName ?? "Unknown seller"}
        {l.vin && <span className="mono"> · {l.vin}</span>}
      </p>
      <p>
        Sources sometimes get a listing&apos;s currency or location wrong, for example a Canadian
        dealer group&apos;s U.S. branch priced in USD. Check the{" "}
        {l.url ? (
          <a href={l.url} target="_blank" rel="noopener noreferrer">
            dealer&apos;s ad
          </a>
        ) : (
          "dealer's ad"
        )}{" "}
        and correct it here. Refreshes keep your correction.
      </p>

      <form action={fixListing} className="form">
        <input type="hidden" name="id" value={l.id} />
        <div className="row">
          <label className="field">
            <span>The price {l.price?.toLocaleString("en-CA") ?? ""} is in</span>
            <select name="currency" defaultValue={l.currencyOverride ?? ""}>
              <option value="">As the source says ({l.currencyOverride ? "reset" : l.currency})</option>
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Where the car is</span>
            <input
              name="location"
              defaultValue={l.locationOverride ?? ""}
              placeholder={l.location ?? "City, state or province"}
            />
            <small>Leave blank to use the source&apos;s location.</small>
          </label>
        </div>
        <div className="actions">
          <button type="submit" className="button primary">
            Save correction
          </button>
          <Link href={`/watch/${l.watchId}`} className="button">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
