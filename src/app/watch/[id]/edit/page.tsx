import { notFound } from "next/navigation";
import { DeleteWatchButton } from "@/components/DeleteWatchButton";
import { WatchForm } from "@/components/WatchForm";
import { watchTitle } from "@/lib/format";
import { getCarImages } from "@/lib/images";
import { getWatch } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export default async function EditWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const watch = getWatch(Number((await params).id));
  if (!watch) notFound();
  const images = getCarImages(watch.id);

  return (
    <div className="form-page">
      <h1>Edit {watchTitle(watch)}</h1>
      <WatchForm
        watch={watch}
        images={{
          logo: images.logo?.url,
          photo: images.photo?.url,
          wheels: images.photo?.wheels,
          facesRight: images.photo?.facesRight,
        }}
      />
      <hr />
      <DeleteWatchButton id={watch.id} title={watchTitle(watch)} />
    </div>
  );
}
