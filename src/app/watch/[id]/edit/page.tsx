import { notFound } from "next/navigation";
import { requireUser } from "@/lib/current-user";
import { DeleteWatchButton } from "@/components/DeleteWatchButton";
import { WatchForm } from "@/components/WatchForm";
import { watchTitle } from "@/lib/format";
import { getCarImages } from "@/lib/images";
import { countFollowers, getWatch } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export default async function EditWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const watch = await getWatch(user.id, Number((await params).id));
  if (!watch) notFound();
  const images = await getCarImages(watch.id);
  // Images are shared by everyone following the car (see saveWatch).
  const mayReplace = user.isAdmin || (await countFollowers(watch.id)) === 1;

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
        lockedImages={{ logo: !mayReplace && !!images.logo, photo: !mayReplace && !!images.photo }}
      />
      <hr />
      <DeleteWatchButton id={watch.id} title={watchTitle(watch)} />
    </div>
  );
}
