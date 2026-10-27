"use client";

import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

/**
 * "Sort by: price: low to high" (Figma 16:43). The visible text is the design;
 * a transparent native select on top does the choosing, so it works with a
 * keyboard, a screen reader and a phone's own picker.
 */
export function SortMenu({
  current,
  options,
}: {
  current: string;
  options: Array<{ value: string; label: string; href: string }>;
}) {
  const router = useRouter();
  const label = options.find((o) => o.value === current)?.label ?? "";
  return (
    <label className="sort-menu">
      <Icon name="sort" />
      <span aria-hidden="true">Sort by: {label.charAt(0).toLowerCase() + label.slice(1)}</span>
      <Icon name="chevron-down" />
      <select
        aria-label="Sort by"
        value={current}
        onChange={(e) => {
          const option = options.find((o) => o.value === e.target.value);
          if (option) router.push(option.href, { scroll: false });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
