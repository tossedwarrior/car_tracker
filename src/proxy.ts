import { NextResponse, type NextRequest } from "next/server";
import { isValidSession, SESSION_COOKIE } from "@/lib/auth";

// When APP_PASSWORD is set, signed-out visitors see the sign-in page (status
// 200, so a host's health check still passes) instead of the app.

export async function proxy(request: NextRequest) {
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  // The About page is public, for visitors from the portfolio; it only shows
  // the link to the source code to people who are signed in.
  if (pathname === "/about" && (request.method === "GET" || request.method === "HEAD")) {
    return NextResponse.next();
  }

  // Pages: show the sign-in form at the same address, then come back here.
  if (request.method === "GET" || request.method === "HEAD") {
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
