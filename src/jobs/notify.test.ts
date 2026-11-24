import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { follows, users, watchlist } from "@/db/schema";
import { setCustomerioForTests } from "@/lib/customerio";
import { Rates } from "@/lib/fx";
import { profileTraits, recordAccountDeleted } from "@/lib/people";
import type { NormalizedListing } from "@/sources/types";
import { fakeCustomerio } from "@/test/customerio";
import { followedWatch, makeUser } from "@/test/db";
import { recordAlerts } from "./alerts";
import { recordListings } from "./ingest";
import { updatePreferences } from "@/lib/users";
import { nextListingEmailDate, scheduleListingEmail, sendDueListingEmails, sendSampleListingEmail } from "./notify";

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

// Local times: the emails go by the server's clock.
const at = (ymd: string, hour = 9) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, hour);
};

/** A refresh that records which cars it was asked for and does nothing. */
function fakeRefresh() {
  const asked: number[][] = [];
  const run = async ({ watchIds }: { watchIds: number[] }) => {
    asked.push(watchIds);
    return { runId: 0, status: "ok" as const, log: [], calls: 0 };
  };
  return { asked, run };
}

const userRow = async (id: number) => (await db.select().from(users).where(eq(users.id, id)))[0];

describe("choosing the day", () => {
  it("finds the next date on that day of the month", () => {
    expect(nextListingEmailDate(15, "2026-12-10")).toBe("2026-12-15");
    expect(nextListingEmailDate(15, "2026-12-15")).toBe("2026-12-15");
    expect(nextListingEmailDate(15, "2026-12-16")).toBe("2027-01-15");
    expect(nextListingEmailDate(1, "2026-02-28")).toBe("2026-03-01");
    // Only 1–28, so every month has it.
    expect(nextListingEmailDate(31, "2026-02-01")).toBe("2026-02-28");
  });

  it("never brings the next email within two weeks of the last", () => {
    expect(scheduleListingEmail(20, "2026-12-10", null)).toBe("2026-12-20");
    // Had one on the 5th: the 20th is fine, the 12th isn't (January's is).
    expect(scheduleListingEmail(20, "2026-12-10", "2026-12-05")).toBe("2026-12-20");
    expect(scheduleListingEmail(12, "2026-12-10", "2026-12-05")).toBe("2027-01-12");
  });

  it("is saved from Settings, and only a new day moves the next email", async () => {
    const user = await makeUser({ listingEmailNext: "2026-12-01" });
    const prefs = { name: null, listingEmails: true, monthlyReport: true };
    await updatePreferences(user.id, { ...prefs, listingEmailDay: 1 }, at("2026-11-24"));
    expect((await userRow(user.id)).listingEmailNext).toBe("2026-12-01");
    await updatePreferences(user.id, { ...prefs, listingEmailDay: 26 }, at("2026-11-24"));
    expect(await userRow(user.id)).toMatchObject({ listingEmailDay: 26, listingEmailNext: "2026-11-26" });
    await updatePreferences(user.id, { ...prefs, listingEmailDay: 99 }, at("2026-11-24"));
    expect((await userRow(user.id)).listingEmailDay).toBe(28);
  });
});

describe("monthly new-listing emails", () => {
  it("go to each person on their day: their cars refreshed, one event with what's new, in their currency", async () => {
    const cio = fakeCustomerio();
    setCustomerioForTests(cio);
    const day = { listingEmailDay: 15, listingEmailNext: "2026-12-15" };
    // Target CA$250,000; US$170,000 = CA$238,000 is under it.
    const wantsEmail = (await makeUser(day)).id;
    const { watchId } = await followedWatch({ userId: wantsEmail, targetPrice: 250000 });
    const usd = (await makeUser({ ...day, displayCurrency: "USD" })).id;
    const optedOut = (await makeUser({ ...day, listingEmails: false })).id;
    const later = (await makeUser({ listingEmailDay: 20, listingEmailNext: "2026-12-20" })).id;
    await db.insert(follows).values([usd, optedOut, later].map((userId) => ({ userId, watchId })));
    await refresh(watchId, "2026-11-01", [car("A", 300000)], true);
    await refresh(watchId, "2026-11-20", [car("A", 300000), car("B", 170000), car("C", 310000)]);

    const { asked, run } = fakeRefresh();
    const result = await sendDueListingEmails({ now: at("2026-12-15"), refresh: run, rates });
    expect(result.sent).toBeGreaterThanOrEqual(2);
    expect(asked).toEqual([[watchId]]);

    const events = cio.sent.filter((s) => s.kind === "track");
    const to = (id: number) => events.filter((e) => e.userId === id);
    expect(to(optedOut)).toEqual([]);
    expect(to(later)).toEqual([]);
    const [mine] = to(wantsEmail);
    expect(mine).toMatchObject({
      event: "new_listings",
      properties: { count: 2, cars: ["Ferrari 458 Italia"], since: null },
      messageId: `new_listings-${wantsEmail}-2026-12-15`,
    });
    const listings = (mine.properties as { listings: Array<Record<string, unknown>> }).listings;
    expect(listings.find((l) => l.url === "https://cars.example/B")).toMatchObject({
      title: "2013 Ferrari 458 Italia Spider",
      price: "CA$238,000",
      original_price: "US$170,000",
      mileage: "12,000 km",
      under_target: true,
      car_url: `/watch/${watchId}`,
    });
    const theirs = to(usd)[0].properties as { listings: Array<Record<string, unknown>> };
    expect(theirs.listings.find((l) => l.url === "https://cars.example/B")).toMatchObject({
      price: "US$170,000",
      original_price: null,
      under_target: false,
    });
    expect(await userRow(wantsEmail)).toMatchObject({ listingEmailNext: "2027-01-15", listingEmailSentOn: "2026-12-15" });

    // Checked again that day: already done.
    await sendDueListingEmails({ now: at("2026-12-15", 15), refresh: run, rates });
    expect(to(wantsEmail)).toHaveLength(1);

    // January: one more car, and the email says since when.
    await refresh(watchId, "2027-01-02", [car("A", 300000), car("B", 170000), car("C", 310000), car("D", 320000)]);
    await sendDueListingEmails({ now: at("2027-01-15"), refresh: run, rates });
    const jan = cio.sent.filter((s) => s.kind === "track" && s.userId === wantsEmail);
    expect(jan[1]).toMatchObject({ properties: { count: 1, since: "2026-12-15" } });

    // February: nothing new, so no email, but the day still moves on.
    await sendDueListingEmails({ now: at("2027-02-15"), refresh: run, rates });
    expect(cio.sent.filter((s) => s.kind === "track" && s.userId === wantsEmail)).toHaveLength(2);
    expect((await userRow(wantsEmail)).listingEmailNext).toBe("2027-03-15");
  });

  it("wait until morning, catch up on a day the server was off, and skip cars refreshed just now", async () => {
    const cio = fakeCustomerio();
    setCustomerioForTests(cio);
    const person = (await makeUser({ listingEmailDay: 3, listingEmailNext: "2027-03-03" })).id;
    const { watchId } = await followedWatch({ userId: person });
    await refresh(watchId, "2027-02-20", [car("E", 1)], true);
    await refresh(watchId, "2027-02-21", [car("E", 1), car("F", 1)]);
    const { asked, run } = fakeRefresh();

    await sendDueListingEmails({ now: at("2027-03-03", 7), refresh: run, rates });
    expect(cio.sent.filter((s) => s.userId === person)).toEqual([]);

    // Refreshed an hour before: not again.
    await db
      .update(watchlist)
      .set({ lastRefreshed: at("2027-03-05", 8).toISOString() })
      .where(eq(watchlist.id, watchId));
    await sendDueListingEmails({ now: at("2027-03-05"), refresh: run, rates });
    expect(asked.flat()).not.toContain(watchId);
    expect(cio.sent.filter((s) => s.userId === person)).toHaveLength(1);
    expect((await userRow(person)).listingEmailNext).toBe("2027-04-03");
  });

  it("can be sent to one person now, whatever their day", async () => {
    const cio = fakeCustomerio();
    setCustomerioForTests(cio);
    const person = (await makeUser({ listingEmailDay: 20, listingEmailNext: "2027-05-20" })).id;
    const { watchId } = await followedWatch({ userId: person });
    await refresh(watchId, "2027-05-01", [car("G", 1)], true);
    await refresh(watchId, "2027-05-02", [car("G", 1), car("H", 1)]);
    const { run } = fakeRefresh();
    const result = await sendDueListingEmails({ now: at("2027-05-04"), refresh: run, rates, userIds: [person] });
    expect(result).toMatchObject({ due: 1, sent: 1 });
    expect((await userRow(person)).listingEmailNext).toBe("2027-05-20");
  });

  it("can be tried out with a sample: the newest cars, marked, with nothing moved on", async () => {
    const cio = fakeCustomerio();
    setCustomerioForTests(cio);
    const person = (await makeUser({ listingEmailDay: 9, listingEmailNext: "2027-07-09" })).id;
    const { watchId } = await followedWatch({ userId: person });
    // A first search only: no alerts, so a real email would have nothing.
    await refresh(watchId, "2027-07-01", [car("S1", 1), car("S2", 1), car("S3", 1)], true);
    const before = await userRow(person);

    expect(await sendSampleListingEmail(person, { rates, count: 2 })).toBe(2);
    const [sample] = cio.sent.filter((s) => s.kind === "track" && s.userId === person);
    expect(sample).toMatchObject({ event: "new_listings", properties: { count: 2, sample: true } });
    expect(sample.kind === "track" && sample.messageId).toMatch(/^new_listings-sample-/);
    expect(await userRow(person)).toEqual(before);

    // Nobody follows anything: no sample.
    expect(await sendSampleListingEmail((await makeUser()).id, { rates })).toBe(0);
  });

  it("do nothing until Customer.io is set up", async () => {
    const person = (await makeUser({ listingEmailNext: "2027-06-01" })).id;
    const { watchId } = await followedWatch({ userId: person });
    await refresh(watchId, "2027-05-01", [car("X", 1)], true);
    await refresh(watchId, "2027-05-02", [car("X", 1), car("Y", 1)]);
    const { asked, run } = fakeRefresh();
    expect(await sendDueListingEmails({ now: at("2027-06-01"), refresh: run, rates })).toMatchObject({ due: 0 });
    expect(asked).toEqual([]);
    expect((await userRow(person)).listingEmailNext).toBe("2027-06-01");
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
