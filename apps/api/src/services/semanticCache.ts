/**
 * Semantic Cache — fuzzy query matching via embeddings.
 *
 * Instead of requiring exact query strings to match, this cache embeds queries
 * using OpenAI text-embedding-3-small (512 dims) and finds similar cached queries
 * via cosine similarity. A similarity threshold of 0.92 ensures only semantically
 * equivalent queries hit the cache.
 *
 * Architecture:
 *   - Each cached answer stores its query embedding alongside the result
 *   - On lookup, the new query is embedded and compared against recent embeddings
 *   - If cosine(new, cached) >= SIMILARITY_THRESHOLD → cache hit
 *   - Falls back to exact key match if embeddings unavailable
 *
 * Storage: Redis keys with prefix `semcache:` store JSON {embedding, resultKey}.
 * A sorted set `semcache:index` tracks all active embedding keys for scan.
 *
 * This saves Tavily/Brave/Exa credits when users rephrase the same question,
 * e.g. "What is quantum computing?" vs "Explain quantum computing" → same answer.
 */

import type { CacheService } from "./cache.js";
import { hashKey } from "./searchUtils.js";

// ─── Configuration ──────────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.92;
const MAX_CACHED_EMBEDDINGS = 500; // Max embeddings to compare against
const EMBEDDING_CACHE_TTL = 1800;  // 30 min — same as answer cache
const EMBEDDING_DIMS = 512;

// ─── Embedding ──────────────────────────────────────────────────────

/** Embed a single query text. Returns null on any failure. */
async function embedQuery(query: string, apiKey: string): Promise<number[] | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: [query],
        dimensions: EMBEDDING_DIMS,
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

/** Cosine similarity between two vectors. */
function cosine(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

// ─── Semantic Cache Entry ───────────────────────────────────────────

interface SemanticCacheEntry {
  /** The original query string */
  query: string;
  /** 512-dim embedding vector */
  embedding: number[];
  /** The cache key where the full result is stored */
  resultKey: string;
  /** Timestamp for TTL enforcement */
  storedAt: number;
}

// ─── In-Memory Embedding Index ──────────────────────────────────────
// For speed, we keep recent embeddings in memory. Redis stores the full
// results, but embedding comparison happens in-process to avoid serializing
// 500 × 512-dim vectors on every request.

const embeddingIndex: SemanticCacheEntry[] = [];

/** Evict expired entries from the in-memory index. */
function evictExpired(): void {
  const now = Date.now();
  const cutoff = now - EMBEDDING_CACHE_TTL * 1000;
  let i = 0;
  while (i < embeddingIndex.length) {
    if (embeddingIndex[i].storedAt < cutoff) {
      embeddingIndex.splice(i, 1);
    } else {
      i++;
    }
  }
  // Cap at MAX_CACHED_EMBEDDINGS (remove oldest first)
  while (embeddingIndex.length > MAX_CACHED_EMBEDDINGS) {
    embeddingIndex.shift();
  }
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Look up a semantically similar cached result.
 *
 * @returns The cached result string if a similar query exists, null otherwise.
 */
export async function semanticCacheGet(
  query: string,
  depth: string,
  cache: CacheService,
  openrouterApiKey?: string,
): Promise<{ result: string; similarity: number; originalQuery: string } | null> {
  // Must have embedding API key for semantic matching
  if (!openrouterApiKey) return null;

  // Embed the incoming query
  const embedding = await embedQuery(query, openrouterApiKey);
  if (!embedding) return null;

  // Evict stale entries
  evictExpired();

  // Find best match in the index
  let bestSimilarity = 0;
  let bestEntry: SemanticCacheEntry | null = null;

  for (const entry of embeddingIndex) {
    // Must match depth mode
    if (!entry.resultKey.includes(`:${depth}:`)) continue;

    const sim = cosine(embedding, entry.embedding);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestEntry = entry;
    }
  }

  // Check if the best match exceeds the threshold
  if (!bestEntry || bestSimilarity < SIMILARITY_THRESHOLD) return null;

  // Retrieve the actual cached result from Redis/memory
  const cached = await cache.get(bestEntry.resultKey);
  if (!cached) {
    // Result expired in Redis — remove from index
    const idx = embeddingIndex.indexOf(bestEntry);
    if (idx >= 0) embeddingIndex.splice(idx, 1);
    return null;
  }

  return {
    result: cached,
    similarity: Math.round(bestSimilarity * 1000) / 1000,
    originalQuery: bestEntry.query,
  };
}

/**
 * Store a query embedding for future semantic matching.
 * Call this after successfully caching an answer result.
 */
export async function semanticCacheSet(
  query: string,
  depth: string,
  resultKey: string,
  openrouterApiKey?: string,
): Promise<void> {
  if (!openrouterApiKey) return;

  // Embed the query
  const embedding = await embedQuery(query, openrouterApiKey);
  if (!embedding) return;

  // Evict stale entries first
  evictExpired();

  // Check if we already have a very similar entry (avoid duplicates)
  for (const entry of embeddingIndex) {
    if (cosine(embedding, entry.embedding) > 0.98) {
      // Update the existing entry's result key and timestamp
      entry.resultKey = resultKey;
      entry.storedAt = Date.now();
      return;
    }
  }

  // Add to index
  embeddingIndex.push({
    query,
    embedding,
    resultKey,
    storedAt: Date.now(),
  });
}

/**
 * Get the current size of the semantic cache index.
 * Useful for monitoring/admin endpoints.
 */
export function semanticCacheSize(): number {
  evictExpired();
  return embeddingIndex.length;
}
