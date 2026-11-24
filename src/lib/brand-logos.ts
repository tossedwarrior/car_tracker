import { BRAND_SLUGS, LOGO_SIZES } from "./brand-logos.generated";

// The faint logo behind each car on the home page: the one uploaded for the
// car if there is one, else its brand's emblem (public/logos/, from Simple
// Icons via scripts/brand-logos.ts), else the make's name set in type.

export interface BrandLogo {
  url: string;
  width: number;
  height: number;
}

/** "Rolls-Royce" → "rollsroyce": how BRAND_SLUGS is keyed. */
export const makeKey = (make: string) => make.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

/** A make's emblem, or null if there isn't one (show its name instead). */
export function brandLogo(make: string): BrandLogo | null {
  const slug = BRAND_SLUGS[makeKey(make)];
  const size = slug ? LOGO_SIZES[slug] : undefined;
  return slug && size ? { url: `/logos/${slug}.svg`, ...size } : null;
}
