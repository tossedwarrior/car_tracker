import { WatchForm } from "@/components/WatchForm";
import { requireUser } from "@/lib/current-user";
import { maxCarsPerUser } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export default async function NewWatchPage() {
  const user = await requireUser();
  return (
    <div className="form-page">
      <h1>Add a car</h1>
      <p className="muted form-intro">
        Tell us the car you&apos;re after. If someone already follows the same car, you&apos;ll see its listings
        and price history right away.
        {!user.isAdmin && ` You can follow up to ${maxCarsPerUser()} cars.`}
      </p>
      <WatchForm />
    </div>
  );
}
