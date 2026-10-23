import { NextResponse, type NextRequest } from "next/server";
import { safeNext, sameText, SESSION_COOKIE, SESSION_DAYS, sessionToken } from "@/lib/auth";

/** The sign-in form posts here: check the password, set the cookie, go back. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = safeNext(form.get("next"));
  const expected = process.env.APP_PASSWORD;
  const given = String(form.get("password") ?? "");

  // 303 so the browser follows with a GET. Relative Location, so it works
  // behind the host's proxy whatever address it sees internally.
  const goTo = (path: string) =>
    new NextResponse(null, { status: 303, headers: { Location: path } });

  if (!expected) return goTo(next);
  if (!sameText(given, expected)) {
    // Slow down guessing.
    await new Promise((r) => setTimeout(r, 1000));
    return goTo(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const response = goTo(next);
  response.cookies.set(SESSION_COOKIE, await sessionToken(expected), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return response;
}
