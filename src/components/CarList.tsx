import Link from "next/link";
import type { HomeCar } from "@/lib/home";
import { CarSprite } from "./CarSprite";
import { CarStats } from "./CarStats";
import { ViewSwitch } from "./ViewSwitch";

/**
 * The list home view: every car, its heading and details on the left and its
 * photo on the right (Figma 9:173). On phones the photo sits between the
 * heading and the details (Figma 24:290).
 */
export function CarList({ cars }: { cars: HomeCar[] }) {
  return (
    <div className="car-list">
      <div className="car-list-switch">
        <ViewSwitch current="list" />
      </div>
      {cars.map((car) => {
        const photo = car.images.photo;
        const logo = car.images.logo;
        const logoAspect = logo?.width && logo.height ? logo.height / logo.width : 0.47;
        return (
          <article key={car.id} className="car-row">
            <div className="car-row-head">
              <p className="scene-years">{car.years}</p>
              <h2 className="car-row-title">
                <Link href={`/watch/${car.id}`}>{car.title}</Link>
              </h2>
            </div>
            <Link
              href={`/watch/${car.id}`}
              className="car-row-panel"
              aria-hidden="true"
              tabIndex={-1}
              style={{ "--logo-aspect": logoAspect } as React.CSSProperties}
            >
              {logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="car-row-logo" src={logo.url} alt="" />
              )}
              {photo?.width && photo.height ? (
                <div className="car-row-car">
                  <CarSprite src={photo.url} width={photo.width} height={photo.height} wheels={null} facesRight={photo.facesRight} />
                </div>
              ) : (
                <span className="car-row-empty">No photo yet</span>
              )}
            </Link>
            <div className="car-row-body">
              <CarStats car={car} />
              <Link href={`/watch/${car.id}`} className="pill-button primary">
                View listings &amp; market
              </Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
