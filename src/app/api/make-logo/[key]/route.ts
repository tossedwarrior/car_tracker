import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { getMakeLogo } from "@/lib/make-logos";
import { getSessionUser } from "@/lib/users";

/** A make's uploaded logo (Settings > Brand logos), for anyone signed in. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  if (!(await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value))) {
    return new Response("Sign in first.", { status: 401 });
  }
  const logo = await getMakeLogo((await params).key);
  if (!logo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(logo.data), {
    headers: {
      "Content-Type": logo.contentType,
      // The URL carries a version, so the browser can keep it until it changes.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // An SVG opened on its own can't run scripts or load anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
