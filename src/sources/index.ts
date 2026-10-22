import { autodev } from "./autodev";
import type { ListingSource, SourceContext } from "./types";
import { reserveCall } from "./usage";

/** Every listing source the app knows about. Remove one here to turn it off. */
export const listingSources: ListingSource[] = [autodev];

export function getSource(id: string): ListingSource {
  const source = listingSources.find((s) => s.id === id);
  if (!source) throw new Error(`Unknown source: ${id}`);
  return source;
}

/** Real context: global fetch, the monthly call counter, and the key from .env. */
export function liveContext(source: ListingSource): SourceContext {
  const apiKey = process.env[source.apiKeyEnv];
  if (!apiKey) throw new Error(`${source.apiKeyEnv} is not set in .env`);
  return {
    fetch: (url, init) => fetch(url, init),
    beforeCall: () => reserveCall(source.id, source.monthlyCallLimit),
    apiKey,
  };
}

export type * from "./types";
