import { NextResponse, type NextRequest } from "next/server";

// Password for the whole site, for when it's on the internet. Set
// APP_PASSWORD where the app is hosted; the browser asks for it once (any
// username). With no APP_PASSWORD, as on this Mac, there's no password.

/** Compare without stopping at the first difference, so timing doesn't leak it. */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function passwordFromHeader(header: string | null): string | null {
  if (!header?.startsWith("Basic ")) return null;
  try {
    const decoded = atob(header.slice(6));
    return decoded.slice(decoded.indexOf(":") + 1);
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return NextResponse.next();

  const given = passwordFromHeader(request.headers.get("authorization"));
  if (given != null && sameText(given, expected)) return NextResponse.next();

  return new NextResponse("Password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Car Price Tracker", charset="UTF-8"' },
  });
}
