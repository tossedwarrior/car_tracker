import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { watchImages, type ImageKind } from "@/db/schema";

// A watched car's brand logo and car photo: checked, stored in the database,
// and served back by /api/watch/[id]/image/[kind].

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;
export const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp,.svg";

const labels: Record<ImageKind, string> = { logo: "brand logo", photo: "car photo" };

/** The real type from the file's first bytes; browsers' own guesses can be wrong. */
export function sniffImageType(bytes: Uint8Array): (typeof IMAGE_TYPES)[number] | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  const head = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  return null;
}

export interface ImageUpload {
  contentType: string;
  data: Buffer;
  fileName: string;
}

/**
 * Check one uploaded file. Returns the image to save, nothing when none was
 * chosen (and it isn't required), or an error to show next to the field.
 */
export async function readImageUpload(
  value: FormDataEntryValue | null,
  kind: ImageKind,
  { required }: { required: boolean },
): Promise<{ image: ImageUpload | null } | { error: string }> {
  const file = value instanceof File && value.size > 0 ? value : null;
  if (!file) return required ? { error: `Add a ${labels[kind]}` } : { image: null };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Choose an image under 8 MB" };
  const data = Buffer.from(await file.arrayBuffer());
  const contentType = sniffImageType(data);
  if (!contentType) return { error: "Choose a PNG, JPEG, WebP or SVG image" };
  return { image: { contentType, data, fileName: file.name } };
}

export function saveImage(watchId: number, kind: ImageKind, image: ImageUpload, now = new Date()) {
  const values = { ...image, updatedAt: now.toISOString() };
  db.insert(watchImages)
    .values({ watchId, kind, ...values })
    .onConflictDoUpdate({ target: [watchImages.watchId, watchImages.kind], set: values })
    .run();
}

export function getImage(watchId: number, kind: ImageKind) {
  return db
    .select()
    .from(watchImages)
    .where(and(eq(watchImages.watchId, watchId), eq(watchImages.kind, kind)))
    .get();
}

/** Which images a car has, and a version for each so browsers refetch after a change. */
export function imageVersions(watchId: number): Partial<Record<ImageKind, string>> {
  const rows = db
    .select({ kind: watchImages.kind, updatedAt: watchImages.updatedAt })
    .from(watchImages)
    .where(eq(watchImages.watchId, watchId))
    .all();
  return Object.fromEntries(rows.map((r) => [r.kind, r.updatedAt]));
}

export const imageUrl = (watchId: number, kind: ImageKind, version: string) =>
  `/api/watch/${watchId}/image/${kind}?v=${encodeURIComponent(version)}`;
