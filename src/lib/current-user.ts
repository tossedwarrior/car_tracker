import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE } from "./auth";
import { getSessionUser, type User } from "./users";

// The signed-in person for the current request. src/proxy.ts only checks
// that a session cookie exists; every page, action and route that reads or
// changes data checks the session itself through these.

/** The signed-in person, or null. Looked up once per request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  return getSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
});

/** The signed-in person; anyone else goes to the sign-in page. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** The owner; anyone else gets "not found". */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) notFound();
  return user;
}
