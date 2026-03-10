import { createHash } from "crypto";
import { search } from "./search.js";
import { openPage } from "./scrape.js";
import { extractKnowledge, rephraseQuery } from "../lib/gemini.js";
import { MAX_PAGE_CONTENT_LENGTH } from "@browse/shared";
import type { BrowseResult, TraceStep } from "@browse/shared";
import type { CacheService } from "./cache.js";
import type { Env } from "../config/env.js";

const THOROUGH_CONFIDENCE_THRESHOLD = 0.6;

function hashKey(s: string): string {
  return createHash("sha256").update(s.toLowerCase().trim()).digest("hex").slice(0, 24);
}

// Time-sensitive keywords → short TTL, everything else → longer TTL
const TIME_SENSITIVE = /\b(today|tonight|yesterday|latest|current|now|live|breaking|this week|this month|this year|price|stock|score|weather|202[4-9])\b/i;

function getCacheTTL(query: string): number {
  return TIME_SENSITIVE.test(query) ? 300 : 1800; // 5 min vs 30 min
}

/** Run a single search → fetch → extract pass. Returns result + raw page texts for merging. */
async function singlePass(
  query: string,
  env: Env,
  cache: CacheService,
  trace: TraceStep[],
  existingPageTexts?: Map<string, string>,
  passLabel?: string,
) {
  const label = passLabel ? ` (${passLabel})` : "";

  // Search
  const searchStart = Date.now();
  const { results: searchResults } = await search(query, env.SERP_API_KEY, cache);
  trace.push({
    step: `Search Web${label}`,
    duration_ms: Date.now() - searchStart,
    detail: `${searchResults.length} results (Tavily)`,
  });

  if (searchResults.length === 0) {
    throw new Error("No search results found");
  }

  // Fetch pages
  const scrapeStart = Date.now();
  const pages = await Promise.allSettled(
    searchResults.slice(0, 5).map((r) => openPage(r.url, cache))
  );
  const successfulPages = pages
    .filter(
      (p): p is PromiseFulfilledResult<Awaited<ReturnType<typeof openPage>>> =>
        p.status === "fulfilled"
    )
    .map((p) => p.value.page);
  trace.push({
    step: `Fetch Pages${label}`,
    duration_ms: Date.now() - scrapeStart,
    detail: `${successfulPages.length} pages (Readability)`,
  });

  // Build content + merge page texts
  const pageTexts = new Map<string, string>(existingPageTexts || []);
  const pageContents = successfulPages
    .map((p, i) => {
      const url = searchResults[i]?.url || "";
      const content = p.content.slice(0, MAX_PAGE_CONTENT_LENGTH);
      pageTexts.set(url, content);
      return `[Source ${i + 1}] URL: ${url}\nTitle: ${p.title}\n\n${content}`;
    })
    .join("\n\n---\n\n");

  // Extract + verify
  const llmStart = Date.now();
  const knowledge = await extractKnowledge(query, pageContents, env.OPENROUTER_API_KEY, pageTexts);
  const llmDuration = Date.now() - llmStart;

  // Trace steps
  const verifiedCount = knowledge.claims.filter((c: any) => c.verified === true).length;
  const strongConsensus = knowledge.claims.filter(
    (c: any) => c.consensusLevel === "strong" || c.consensusLevel === "moderate"
  ).length;
  const contradictionCount = knowledge.contradictions?.length || 0;

  trace.push({
    step: `Extract Claims${label}`,
    duration_ms: Math.round(llmDuration * 0.30),
    detail: `${knowledge.claims.length} claims`,
  });
  trace.push({
    step: `Verify Evidence${label}`,
    duration_ms: Math.round(llmDuration * 0.15),
    detail: `${verifiedCount}/${knowledge.claims.length} claims verified`,
  });
  trace.push({
    step: `Cross-Source Consensus${label}`,
    duration_ms: Math.round(llmDuration * 0.10),
    detail: `${strongConsensus}/${knowledge.claims.length} multi-source agreement${contradictionCount > 0 ? `, ${contradictionCount} contradiction${contradictionCount > 1 ? "s" : ""}` : ""}`,
  });
  trace.push({
    step: `Build Evidence Graph${label}`,
    duration_ms: Math.round(llmDuration * 0.10),
    detail: `${knowledge.sources.length} sources`,
  });
  trace.push({
    step: `Generate Answer${label}`,
    duration_ms: Math.round(llmDuration * 0.35),
    detail: "OpenRouter",
  });

  return { knowledge, pageTexts };
}

export async function answerQuery(
  query: string,
  env: Env,
  cache: CacheService,
  depth: "fast" | "thorough" = "fast",
): Promise<BrowseResult> {
  // Cache key includes depth so thorough results are cached separately
  const cacheKey = `answer:${depth}:${hashKey(query)}`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    const result = JSON.parse(cached) as BrowseResult;
    result.trace = [{ step: "Cache Hit", duration_ms: 0, detail: "Served from cache" }, ...result.trace];
    return result;
  }

  const trace: TraceStep[] = [];

  // First pass
  const { knowledge, pageTexts } = await singlePass(query, env, cache, trace);

  // Thorough mode: if confidence is low, rephrase and do a second pass
  if (depth === "thorough" && knowledge.confidence < THOROUGH_CONFIDENCE_THRESHOLD) {
    const rephraseStart = Date.now();
    const rephrasedQuery = await rephraseQuery(query, env.OPENROUTER_API_KEY);
    trace.push({
      step: "Rephrase Query",
      duration_ms: Date.now() - rephraseStart,
      detail: `"${rephrasedQuery.slice(0, 80)}"`,
    });

    // Second pass with rephrased query, merging existing page texts
    const { knowledge: pass2 } = await singlePass(
      rephrasedQuery, env, cache, trace, pageTexts, "pass 2"
    );

    // Pick whichever pass produced higher confidence
    const best = pass2.confidence > knowledge.confidence ? pass2 : knowledge;
    trace.push({
      step: "Select Best Result",
      duration_ms: 0,
      detail: `Pass ${pass2.confidence > knowledge.confidence ? "2" : "1"} selected (${Math.round(best.confidence * 100)}% vs ${Math.round((pass2.confidence > knowledge.confidence ? knowledge : pass2).confidence * 100)}%)`,
    });

    const result = { ...best, trace };
    await cache.set(cacheKey, JSON.stringify(result), getCacheTTL(query));
    return result;
  }

  const result = { ...knowledge, trace };
  await cache.set(cacheKey, JSON.stringify(result), getCacheTTL(query));
  return result;
}
