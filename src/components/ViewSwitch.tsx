import { setHomeView } from "@/app/actions";

/** "View" with expanded / list buttons (Figma 8:158, 9:206). */
export function ViewSwitch({ current }: { current: "expanded" | "list" }) {
  return (
    <form action={setHomeView} className="view-switch">
      <span>View</span>
      <button type="submit" name="view" value="expanded" aria-pressed={current === "expanded"} aria-label="Expanded view">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/view-expanded.png" width={24} height={24} alt="" />
      </button>
      <button type="submit" name="view" value="list" aria-pressed={current === "list"} aria-label="List view">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/view-list.png" width={24} height={24} alt="" />
      </button>
    </form>
  );
}
