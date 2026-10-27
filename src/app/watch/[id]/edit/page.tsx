import { notFound } from "next/navigation";
import { DeleteWatchButton } from "@/components/DeleteWatchButton";
import { WatchForm } from "@/components/WatchForm";
import { watchTitle } from "@/lib/format";
import { imageUrl, imageVersions } from "@/lib/images";
import { getWatch } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export default async function EditWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const watch = getWatch(Number((await params).id));
  if (!watch) notFound();
  const versions = imageVersions(watch.id);

  return (
    <div className="form-page">
      <h1>Edit {watchTitle(watch)}</h1>
      <WatchForm
        watch={watch}
        images={{
          logo: versions.logo && imageUrl(watch.id, "logo", versions.logo),
          photo: versions.photo && imageUrl(watch.id, "photo", versions.photo),
        }}
      />
      <hr />
      <DeleteWatchButton id={watch.id} title={watchTitle(watch)} />
    </div>
  );
}
