import fs from "node:fs";
import path from "node:path";
import type { FetchLike, SourceContext } from "@/sources/types";

const FIXTURES = path.resolve(import.meta.dirname, "../sources/__fixtures__");

export function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), "utf8"));
}

/**
 * A fake source context that answers each request with the next saved
 * response, and records the URLs it was asked for.
 */
export function fixtureContext(
  responses: Array<{ fixture: string; status?: number }>,
): SourceContext & { urls: string[]; headers: Array<HeadersInit | undefined> } {
  const queue = [...responses];
  const urls: string[] = [];
  const headers: Array<HeadersInit | undefined> = [];
  const fetch: FetchLike = async (url, init) => {
    urls.push(url);
    headers.push(init?.headers);
    const next = queue.shift();
    if (!next) throw new Error(`Unexpected request: ${url}`);
    return new Response(JSON.stringify(loadFixture(next.fixture)), {
      status: next.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { fetch, beforeCall: () => {}, apiKey: "test-key", urls, headers };
}
