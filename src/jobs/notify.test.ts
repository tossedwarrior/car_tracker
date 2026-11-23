import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { follows, users } from "@/db/schema";
import { setCustomerioForTests } from "@/lib/customerio";
import { Rates } from "@/lib/fx";
import { profileTraits, recordAccountDeleted } from "@/lib/people";
import type { NormalizedListing } from "@/sources/types";
import { fakeCustomerio } from "@/test/customerio";
import { followedWatch, makeUser } from "@/test/db";
import { recordAlerts } from "./alerts";
import { recordListings } from "./ingest";
import { latestAlertId, notifyNewListings } from "./notify";

const rates = new Rates([{ date: "2026-01-01", base: "USD", rate: 1.4 }]);

const car = (vin: string, price: number): NormalizedListing => ({
  source: "autodev",
  sourceListingId: vin,
  vin,
  title: vin,
  make: "Ferrari",
  model: "458 Italia",
  year: 2013,
  trim: "Spider",
  km: 12000,
  price,
  currency: "USD",
  sellerType: "dealer",
  sellerName: "Dealer",
  location: "Miami, FL",
  country: "US",
  url: `https://cars.example/${vin}`,
  listedAt: null,
});

async function refresh(watchId: number, date: string, found: NormalizedListing[], firstSearch = false) {
  const { addedIds } = await recordListings({ watchId, source: "autodev", found, date, complete: true });
  await recordAlerts({ watchId, source: "autodev", date, rates, newListingIds: addedIds, firstSearch });
}

describe("notifyNewListings", () => {
  it("sends each follower one event with their new cars, in their currency, unless they opted out", async () => {
    const cio = fakeCustomerio();
    setCustomerioForTests(cio);
    // Target CA$250,000; US$170,000 = CA$238,000 is under it.
    const { userId: wantsEmail, watchId } = await followedWatch({ targetPrice: 250000 });
    const usd = (await makeUser({ displayCurrency: "USD" })).id;
    const optedOut = (await makeUser({ listingEmails: false })).id;
    await db.insert(follows).values([
      { userId: usd, watchId },
      { userId: optedOut, watchId },
    ]);
    await refresh(watchId, "2026-11-01", [car("A", 300000)], true);

    const before = await latestAlertId();
    await refresh(watchId, "2026-11-02", [car("A", 300000), car("B", 170000), car("C", 310000)]);
    expect(await notifyNewListings(before, rates)).toBe(2);

    const events = cio.sent.filter((s) => s.kind === "track");
    expect(events.map((e) => e.userId).sort()).toEqual([wantsEmail, usd].sort());
    const mine = events.find((e) => e.userId === wantsEmail)!;
    expect(mine).toMatchObject({
      event: "new_listings",
      properties: { count: 2, cars: ["Ferrari 458 Italia"] },
    });
    expect(mine.kind === "track" && mine.messageId).toMatch(new RegExp(`^new_listings-${wantsEmail}-\\d+-\\d+$`));
    const listings = (mine.properties as { listings: Array<Record<string, unknown>> }).listings;
    expect(listings.find((l) => l.url === "https://cars.example/B")).toMatchObject({
      title: "2013 Ferrari 458 Italia Spider",
      price: "CA$238,000",
      original_price: "US$170,000",
      mileage: "12,000 km",
      under_target: true,
      car_url: `/watch/${watchId}`,
    });
    const theirs = events.find((e) => e.userId === usd)!.properties as { listings: Array<Record<string, unknown>> };
    expect(theirs.listings.find((l) => l.url === "https://cars.example/B")).toMatchObject({
      price: "US$170,000",
      original_price: null,
      under_target: false,
    });

    // Nothing new since: nothing sent.
    expect(await notifyNewListings(await latestAlertId(), rates)).toBe(0);
  });

  it("does nothing until Customer.io is set up", async () => {
    const { watchId } = await followedWatch();
    await refresh(watchId, "2026-11-01", [car("X", 1)], true);
    await refresh(watchId, "2026-11-02", [car("X", 1), car("Y", 1)]);
    expect(await notifyNewListings(0, rates)).toBe(0);
  });
});

describe("profiles", () => {
  it("carry email preferences, dates as Unix time, and the cars followed", async () => {
    const user = await makeUser({ email: "p@example.com", name: "Sam", createdAt: "2026-11-20T00:00:00.000Z" });
    const traits = profileTraits(user, []);
    expect(traits).toMatchObject({
      email: "p@example.com",
      name: "Sam",
      created_at: 1795132800,
      listing_emails: true,
      monthly_report: true,
      currency: "CAD",
      cars_followed: 0,
      cars: [],
    });
  });

  it("empty out on deletion and say so, for the churn email", async () => {
    const cio = fakeCustomerio();
    setCustomerioForTests(cio);
    const user = await makeUser();
    await recordAccountDeleted(user, new Date("2026-11-23T00:00:00Z"));
    expect(cio.sent).toEqual([
      {
        kind: "identify",
        userId: user.id,
        traits: expect.objectContaining({ email: user.email, monthly_report: false, listing_emails: false, cars: [] }),
      },
      { kind: "track", userId: user.id, event: "account_deleted", properties: undefined, messageId: undefined },
    ]);
    expect((await db.select().from(users).where(eq(users.id, user.id))).length).toBe(1);
  });
});
