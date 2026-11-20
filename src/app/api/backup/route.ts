import { backupFileName, createBackup, describeCounts, restoreBackup } from "@/lib/backup";
import { getCurrentUser } from "@/lib/current-user";

// Settings' Backup & restore: the owner's only. A backup holds every account.

const ownerOnly = async () => !!(await getCurrentUser())?.isAdmin;
const notFound = () => new Response("Not found", { status: 404 });

export const dynamic = "force-dynamic";

/** Download the whole database as a backup file. */
export async function GET() {
  if (!(await ownerOnly())) return notFound();
  const bytes = await createBackup();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${backupFileName()}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Replace everything with the backup file sent as the request body. */
export async function POST(request: Request) {
  if (!(await ownerOnly())) return notFound();
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length) return Response.json({ error: "Choose a backup file." }, { status: 400 });
  try {
    const counts = await restoreBackup(bytes);
    return Response.json({ restored: describeCounts(counts) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
