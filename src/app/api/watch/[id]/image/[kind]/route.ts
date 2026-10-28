import { imageKinds, type ImageKind } from "@/db/schema";
import { getImage } from "@/lib/images";

/** A car's brand logo or photo. Behind the sign-in like every other page. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
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
