import { tavilySearch } from "../lib/tavily.js";
import { sanitizeText } from "../lib/sanitize.js";
import type { SearchProvider } from "../lib/searchProvider.js";
import type { CacheService } from "./cache.js";

export type SearchResult = {
  url: string;
  title: string;
  snippet: string;
  score: number;
};

/**
 * Search using a SearchProvider (pluggable backend).
 * Falls back to direct Tavily call for backward compatibility.
 */
export async function search(
  query: string,
  apiKeyOrProvider: string | SearchProvider,
  cache: CacheService,
  limit: number = 10
): Promise<{ results: SearchResult[]; cached: boolean }> {
  const cacheKey = `search:${query}:${limit}`;
  const cached = await cache.get(cacheKey);
  if (cached) return { results: JSON.parse(cached), cached: true };

  let results: SearchResult[];

  if (typeof apiKeyOrProvider === "string") {
    // Backward compatible: direct Tavily API key
    const response = await tavilySearch(query, apiKeyOrProvider, limit);
    results = response.results.map((r) => ({
      url: r.url,
      title: sanitizeText(r.title),
      snippet: sanitizeText(r.content),
      score: r.score,
    }));
  } else {
    // SearchProvider interface
    results = await apiKeyOrProvider.search(query, limit);
  }

  await cache.set(cacheKey, JSON.stringify(results), 600);
  return { results, cached: false };
}
