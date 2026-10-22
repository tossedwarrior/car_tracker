"use client";

import { useRouter } from "next/navigation";

/** A "Sort by" dropdown; each option is a link the page builds. */
export function SortMenu({
  current,
  options,
}: {
  current: string;
  options: Array<{ value: string; label: string; href: string }>;
}) {
  const router = useRouter();
  return (
    <label className="sort-menu">
      <span className="muted small">Sort by</span>
      <select
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
