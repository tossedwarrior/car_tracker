import { imageKinds, type ImageKind } from "@/db/schema";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { getImage } from "@/lib/images";
import { getSessionUser } from "@/lib/users";

/** A car's brand logo or photo, for anyone signed in. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  if (!(await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value))) {
    return new Response("Sign in first.", { status: 401 });
  }
  const { id, kind } = await params;
  if (!imageKinds.includes(kind as ImageKind)) return new Response("Not found", { status: 404 });
  const image = await getImage(Number(id), kind as ImageKind);
  if (!image) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      // The URL carries a version, so the browser can keep it until it changes.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // An SVG opened on its own can't run scripts or load anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
