import type { NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { prepareUpload } from "@/lib/car-photo";
import { getSessionUser } from "@/lib/users";

// The car form sends a photo here as soon as it's chosen: the background is
// removed (if plain), it's cropped to the car and the wheels are found, and
// the form shows the result to check before saving. Nothing is stored.

/** Phone photos can be big; what's saved is checked again (8 MB) on save. */
const MAX_INPUT = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!(await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value))) {
    return Response.json({ error: "Sign in first." }, { status: 401 });
  }
  if (Number(request.headers.get("content-length")) > MAX_INPUT) {
    return Response.json({ error: "Choose a photo under 25 MB." }, { status: 413 });
  }
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_INPUT) {
    return Response.json({ error: "Choose a photo under 25 MB." }, { status: 400 });
  }
  const result = await prepareUpload(bytes);
  if ("error" in result) return Response.json(result, { status: 400 });
  return Response.json({
    image: result.data.toString("base64"),
    width: result.width,
    height: result.height,
    wheels: result.wheels,
    background: result.background,
  });
}
