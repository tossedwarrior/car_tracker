import { eq, inArray } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { alertsSent, follows, listings, users, watchlist } from "@/db/schema";
import { insertRow, makeUser } from "@/test/db";
import {
  adoptLegacyData,
  createLoginToken,
  deleteUser,
  endSession,
  findOrCreateUser,
  getSessionUser,
  MAX_LINKS_PER_HOUR,
  peekLoginToken,
  redeemLoginToken,
} from "./users";

const now = new Date("2026-11-20T12:00:00Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

afterEach(() => vi.unstubAllEnvs());

describe("accounts", () => {
  it("makes one account per address, whatever its case, and the owner's is the admin", async () => {
    vi.stubEnv("OWNER_EMAIL", "Owner@Example.com");
    const a = await findOrCreateUser("New.Person@example.com");
    const b = await findOrCreateUser("new.person@EXAMPLE.com");
    expect(a.created).toBe(true);
    expect(b).toMatchObject({ created: false, user: { id: a.user.id, email: "new.person@example.com", isAdmin: false } });
    expect((await findOrCreateUser("owner@example.com")).user.isAdmin).toBe(true);
  });
});

describe("sign-in links", () => {
  it("work once, within 30 minutes, and start a session", async () => {
    const user = await makeUser();
    const token = (await createLoginToken(user.id, now))!;
    expect((await peekLoginToken(token, later(29)))?.id).toBe(user.id);
    expect(await peekLoginToken(token, later(31))).toBeNull();

    const signedIn = await redeemLoginToken(token, later(5));
    expect(signedIn?.user.id).toBe(user.id);
    expect(await redeemLoginToken(token, later(6))).toBeNull(); // used up
    expect((await getSessionUser(signedIn!.sessionToken, later(10)))?.id).toBe(user.id);
    expect((await db.select().from(users).where(eq(users.id, user.id)))[0].lastSignInAt).toBe(later(5).toISOString());
  });

  it("refuses unknown tokens and keeps only hashes", async () => {
    const user = await makeUser();
    const token = (await createLoginToken(user.id, now))!;
    expect(await peekLoginToken("made-up", now)).toBeNull();
    const stored = JSON.stringify(await db.select().from(users));
    expect(stored).not.toContain(token);
  });

  it("stops after a handful of links an hour", async () => {
    const user = await makeUser();
    for (let i = 0; i < MAX_LINKS_PER_HOUR; i++) expect(await createLoginToken(user.id, now)).not.toBeNull();
    expect(await createLoginToken(user.id, later(30))).toBeNull();
    expect(await createLoginToken(user.id, later(61))).not.toBeNull();
  });
});

describe("sessions", () => {
  it("last 30 days and end on sign-out", async () => {
    const user = await makeUser();
    const { sessionToken } = (await redeemLoginToken((await createLoginToken(user.id, now))!, now))!;
    expect(await getSessionUser(sessionToken, later(29 * 24 * 60))).not.toBeNull();
    expect(await getSessionUser(sessionToken, later(31 * 24 * 60))).toBeNull();
    await endSession(sessionToken);
    expect(await getSessionUser(sessionToken, now)).toBeNull();
    expect(await getSessionUser(undefined, now)).toBeNull();
  });
});

describe("adoptLegacyData", () => {
  it("gives the owner every unfollowed car, with its old target and notes, and every unowned alert", async () => {
    const owner = await makeUser({ isAdmin: true });
    const other = await makeUser();
    const old = await insertRow(watchlist, {
      make: "Ferrari",
      model: "458 Italia",
      yearMin: 2011,
      yearMax: 2015,
      legacyTargetPrice: 250000,
      legacyNotes: "Manual only",
    });
    const theirs = await insertRow(watchlist, { make: "Porsche", model: "911 GT3", yearMin: 2018, yearMax: 2019 });
    await db.insert(follows).values({ userId: other.id, watchId: theirs.id });
    const listing = await insertRow(listings, {
      watchId: old.id,
      source: "autodev",
      sourceListingId: "L1",
      currency: "USD",
      firstSeen: "2026-10-01",
      lastSeen: "2026-10-01",
    });
    await db.insert(alertsSent).values({ listingId: listing.id, type: "new_listing", date: "2026-10-01" });

    await adoptLegacyData(owner.id);
    await adoptLegacyData(owner.id); // again: nothing more

    expect(await db.select().from(follows).where(eq(follows.userId, owner.id))).toMatchObject([
      { watchId: old.id, targetPrice: 250000, targetCurrency: "CAD", notes: "Manual only" },
    ]);
    expect((await db.select().from(alertsSent).where(eq(alertsSent.listingId, listing.id))).map((a) => a.userId)).toEqual([
      owner.id,
    ]);
  });
});

describe("deleteUser", () => {
  it("removes the account and any car only they followed, leaving shared cars", async () => {
    const leaving = await makeUser();
    const staying = await makeUser();
    const solo = await insertRow(watchlist, { make: "Lamborghini", model: "Huracan", yearMin: 2015, yearMax: 2019 });
    const shared = await insertRow(watchlist, { make: "Ferrari", model: "F8", yearMin: 2020, yearMax: 2023 });
    await db.insert(follows).values([
      { userId: leaving.id, watchId: solo.id },
      { userId: leaving.id, watchId: shared.id },
      { userId: staying.id, watchId: shared.id },
    ]);

    await deleteUser(leaving.id);

    expect(await db.select().from(users).where(eq(users.id, leaving.id))).toEqual([]);
    const left = await db.select().from(watchlist).where(inArray(watchlist.id, [solo.id, shared.id]));
    expect(left.map((w) => w.model)).toEqual(["F8"]);
    expect((await db.select().from(follows).where(eq(follows.watchId, shared.id))).map((f) => f.userId)).toEqual([
      staying.id,
    ]);
  });
});
