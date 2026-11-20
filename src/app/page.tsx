import { cookies } from "next/headers";
import Link from "next/link";
import { CarList } from "@/components/CarList";
import { CarShowroom } from "@/components/CarShowroom";
import { requireUser } from "@/lib/current-user";
import { getDisplayCurrency } from "@/lib/display-currency";
import { Rates } from "@/lib/fx";
import { getHomeCars } from "@/lib/home";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const view = (await cookies()).get("home_view")?.value === "list" ? "list" : "expanded";
  const user = await requireUser();
  const cars = await getHomeCars(user.id, await Rates.load(), await getDisplayCurrency());

  if (cars.length === 0) {
    return (
      <div className="form-page">
        <h1>Your watchlist</h1>
        <div className="empty">
          <p>No cars yet.</p>
          <p className="muted">
            <Link href="/watch/new">Add a car</Link> you want to follow. You&apos;ll see every listing for it, what
            similar cars sold for at auction and where its price is heading.
          </p>
        </div>
      </div>
    );
  }

  return view === "list" ? <CarList cars={cars} /> : <CarShowroom cars={cars} />;
}
