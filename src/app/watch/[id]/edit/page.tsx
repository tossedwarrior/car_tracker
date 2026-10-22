import { notFound } from "next/navigation";
import { DeleteWatchButton } from "@/components/DeleteWatchButton";
import { WatchForm } from "@/components/WatchForm";
import { watchTitle } from "@/lib/format";
import { getWatch } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export default async function EditWatchPage({ params }: { params: Promise<{ id: string }> }) {
  const watch = getWatch(Number((await params).id));
  if (!watch) notFound();

  return (
    <>
      <h1>Edit {watchTitle(watch)}</h1>
      <WatchForm watch={watch} />
      <hr />
      <DeleteWatchButton id={watch.id} title={watchTitle(watch)} />
    </>
  );
}
