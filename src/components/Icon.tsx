/** The design's 18px icons (Streamline Material, exported from Figma at 48px). */
export type IconName = "arrow-back" | "refresh" | "edit" | "sort" | "chevron-down" | "upload";

export function Icon({ name }: { name: IconName }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="icon" src={`/icons/${name}.png`} width={18} height={18} alt="" aria-hidden="true" />;
}
