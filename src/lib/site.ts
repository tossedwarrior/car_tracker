/**
 * A full link to a page on this site, for emails and Customer.io. Uses
 * APP_URL; without it (a development server), the path alone.
 */
export function absoluteUrl(path: string): string {
  const base = process.env.APP_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}
