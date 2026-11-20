import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

// Signed-out visitors see the sign-in page (status 200, so a host's health
// check still passes) instead of the app. This only checks that a session
// cookie is there; pages, actions and routes check that it's valid
// (src/lib/current-user.ts) and send stale ones to /login.

/** Pages anyone can open, signed in or not (any method, for their form actions). */
const PUBLIC = ["/login", "/login/verify"];

export async function proxy(request: NextRequest) {
  if (request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (PUBLIC.includes(pathname)) return NextResponse.next();
  // The About page is public, for visitors from the portfolio.
  if (pathname === "/about" && (request.method === "GET" || request.method === "HEAD")) {
    return NextResponse.next();
  }

  // Pages: show the sign-in form at the same address, then come back here.
  // The sign-in form's action posts to that same address, so it goes there
  // too. (Actions check the session themselves; any other action just finds
  // nobody signed in.)
  const isAction = request.method === "POST" && request.headers.has("next-action");
  if (request.method === "GET" || request.method === "HEAD" || isAction) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.rewrite(url);
  }
  // Anything else (form posts, Refresh buttons) needs a signed-in session.
  return new NextResponse("Sign in first.", { status: 401 });
}

export const config = {
  // Build files and the icon carry no data, and the sign-in page needs them.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
