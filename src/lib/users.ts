import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertsSent, follows, loginTokens, sessions, users, watchlist } from "@/db/schema";
import { hashToken, LOGIN_LINK_MINUTES, newToken, normalizeEmail, SESSION_DAYS } from "./auth";

export type User = typeof users.$inferSelect;

/** Sign-in links one address can ask for in an hour, to stop someone flooding an inbox. */
export const MAX_LINKS_PER_HOUR = 5;

/** The app owner's address (OWNER_EMAIL), lowercased; null if unset. */
export function ownerEmail(): string | null {
  return normalizeEmail(process.env.OWNER_EMAIL) || null;
}

/**
 * The owner is whoever OWNER_EMAIL names right now, so changing it takes
 * effect on the next page load, even for an account made before.
 */
function withOwner(user: User): User {
  const owner = ownerEmail();
  return owner && user.email === owner ? { ...user, isAdmin: true } : user;
}

export async function getUser(id: number): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row;
}

/** The account for this address, made on first use. Returns whether it's new. */
export async function findOrCreateUser(email: string): Promise<{ user: User; created: boolean }> {
  const address = normalizeEmail(email);
  const [existing] = await db.select().from(users).where(eq(users.email, address)).limit(1);
  if (existing) return { user: existing, created: false };
  await db
    .insert(users)
    .values({ email: address, isAdmin: address === ownerEmail() })
    .onDuplicateKeyUpdate({ set: { id: sql`id` } });
  const [user] = await db.select().from(users).where(eq(users.email, address)).limit(1);
  return { user, created: true };
}

/**
 * A new sign-in link token for this person, or null if they've asked for
 * too many in the last hour.
 */
export async function createLoginToken(userId: number, now = new Date()): Promise<string | null> {
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(loginTokens)
    .where(and(eq(loginTokens.userId, userId), gt(loginTokens.createdAt, hourAgo)));
  if (Number(n) >= MAX_LINKS_PER_HOUR) return null;

  const token = newToken();
  await db.insert(loginTokens).values({
    userId,
    tokenHash: await hashToken(token),
    expiresAt: new Date(now.getTime() + LOGIN_LINK_MINUTES * 60_000).toISOString(),
    createdAt: now.toISOString(),
  });
  return token;
}

/** Who an unused, unexpired sign-in link is for, without using it up. */
export async function peekLoginToken(token: string, now = new Date()): Promise<User | null> {
  const [row] = await db
    .select({ user: users })
    .from(loginTokens)
    .innerJoin(users, eq(loginTokens.userId, users.id))
    .where(
      and(
        eq(loginTokens.tokenHash, await hashToken(token)),
        isNull(loginTokens.usedAt),
        gt(loginTokens.expiresAt, now.toISOString()),
      ),
    )
    .limit(1);
  return row?.user ? withOwner(row.user) : null;
}

/**
 * Use up a sign-in link and start a session. Returns the session token for
 * the cookie, or null if the link is used, expired or unknown.
 */
export async function redeemLoginToken(
  token: string,
  now = new Date(),
): Promise<{ user: User; sessionToken: string } | null> {
  const user = await peekLoginToken(token, now);
  if (!user) return null;
  // Only the first of two simultaneous clicks gets through.
  const [result] = await db
    .update(loginTokens)
    .set({ usedAt: now.toISOString() })
    .where(and(eq(loginTokens.tokenHash, await hashToken(token)), isNull(loginTokens.usedAt)));
  if (result.affectedRows !== 1) return null;

  await db.update(users).set({ lastSignInAt: now.toISOString() }).where(eq(users.id, user.id));
  if (user.isAdmin) await adoptLegacyData(user.id);
  return { user, sessionToken: await createSession(user.id, now) };
}

export async function createSession(userId: number, now = new Date()): Promise<string> {
  const token = newToken();
  await db.insert(sessions).values({
    userId,
    tokenHash: await hashToken(token),
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString(),
    createdAt: now.toISOString(),
  });
  return token;
}

/** The person a session cookie belongs to, if it's still valid. */
export async function getSessionUser(token: string | undefined, now = new Date()): Promise<User | null> {
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, await hashToken(token)), gt(sessions.expiresAt, now.toISOString())))
    .limit(1);
  return row?.user ? withOwner(row.user) : null;
}

export async function endSession(token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, await hashToken(token)));
}

export async function setDisplayCurrency(userId: number, currency: User["displayCurrency"]) {
  await db.update(users).set({ displayCurrency: currency }).where(eq(users.id, userId));
}

export async function updatePreferences(
  userId: number,
  prefs: { name: string | null; listingEmails: boolean; monthlyReport: boolean; listingEmailDay: number },
  now = new Date(),
) {
  const { clampDay, scheduleListingEmail } = await import("@/jobs/notify");
  const { localDate } = await import("@/jobs/budget");
  const user = await getUser(userId);
  if (!user) return;
  const listingEmailDay = clampDay(prefs.listingEmailDay);
  // A new day: the next email moves to it (never within two weeks of the last).
  const listingEmailNext =
    listingEmailDay !== user.listingEmailDay || !user.listingEmailNext
      ? scheduleListingEmail(listingEmailDay, localDate(now), user.listingEmailSentOn)
      : user.listingEmailNext;
  await db.update(users).set({ ...prefs, listingEmailDay, listingEmailNext }).where(eq(users.id, userId));
}

/**
 * Delete an account: its sessions, follows and alerts go with it (foreign
 * keys), and any car search nobody else follows is deleted too.
 */
export async function deleteUser(userId: number) {
  const watchIds = (await db.select({ id: follows.watchId }).from(follows).where(eq(follows.userId, userId))).map(
    (r) => r.id,
  );
  await db.delete(users).where(eq(users.id, userId));
  const { deleteIfUnfollowed } = await import("./watchlist");
  for (const id of watchIds) await deleteIfUnfollowed(id);
}

/**
 * Before accounts the app had one user. The owner (OWNER_EMAIL) takes over
 * that data on sign-in: a follow, with the old target price and notes, for
 * every car nobody follows yet, and every alert that has no owner. Safe to
 * run again; it only picks up what's still unclaimed.
 */
export async function adoptLegacyData(userId: number) {
  const orphans = await db
    .select({ watch: watchlist })
    .from(watchlist)
    .leftJoin(follows, eq(follows.watchId, watchlist.id))
    .where(isNull(follows.id));
  for (const { watch } of orphans) {
    await db
      .insert(follows)
      .values({
        userId,
        watchId: watch.id,
        targetPrice: watch.legacyTargetPrice,
        targetCurrency: watch.legacyTargetCurrency,
        notes: watch.legacyNotes,
      })
      .onDuplicateKeyUpdate({ set: { id: sql`id` } });
  }
  await db.update(alertsSent).set({ userId }).where(isNull(alertsSent.userId));
}
