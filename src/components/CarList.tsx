import Link from "next/link";
import type { HomeCar } from "@/lib/home";
import { CarSprite } from "./CarSprite";
import { CarStats } from "./CarStats";
import { ViewSwitch } from "./ViewSwitch";

/** The list home view (Figma 9:173): every car, text left, photo right. */
export function CarList({ cars }: { cars: HomeCar[] }) {
  return (
    <div className="car-list">
      <div className="car-list-switch">
        <ViewSwitch current="list" />
      </div>
      {cars.map((car) => {
        const photo = car.images.photo;
        const logo = car.images.logo;
        return (
          <article key={car.id} className="car-row">
            <div className="car-row-text">
              <p className="scene-years">{car.years}</p>
              <h2 className="car-row-title">
                <Link href={`/watch/${car.id}`}>{car.title}</Link>
              </h2>
              <CarStats car={car} />
              <Link href={`/watch/${car.id}`} className="pill-button primary">
                View listings &amp; market
              </Link>
            </div>
            <Link href={`/watch/${car.id}`} className="car-row-panel" aria-hidden="true" tabIndex={-1}>
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
          </article>
        );
      })}
    </div>
  );
}
