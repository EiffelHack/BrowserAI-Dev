/**
 * NLI (Natural Language Inference) service for semantic claim verification.
 *
 * Uses DeBERTa-v3-base-mnli-fever-anli via HuggingFace Inference API
 * to determine whether evidence ENTAILS, CONTRADICTS, or is NEUTRAL
 * toward a claim.
 *
 * This is the semantic layer on top of BM25 — BM25 finds matching sentences,
 * NLI understands whether they actually support the claim.
 */

export type NLILabel = "entailment" | "neutral" | "contradiction";

export interface NLIResult {
  /** Probability that evidence supports the claim */
  entailment: number;
  /** Probability that evidence is unrelated to the claim */
  neutral: number;
  /** Probability that evidence contradicts the claim */
  contradiction: number;
  /** The winning label */
  label: NLILabel;
}

// ─── Configuration ─────────────────────────────────────────────────

const NLI_MODEL = "MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli";
const HF_API_URL = `https://api-inference.huggingface.co/models/${NLI_MODEL}`;
const NLI_TIMEOUT_MS = 8000;
const MAX_INPUT_LENGTH = 1024; // Truncate long texts to avoid token limits

// ─── Helpers ───────────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

/**
 * Parse HuggingFace text-classification response into NLIResult.
 *
 * HF returns: [[{label: "entailment", score: 0.87}, {label: "neutral", score: 0.10}, ...]]
 * or sometimes: [{label: "entailment", score: 0.87}, ...]
 */
function parseHFResponse(data: unknown): NLIResult | null {
  try {
    // Handle nested array format: [[{label, score}, ...]]
    let items: Array<{ label: string; score: number }>;
    if (Array.isArray(data) && Array.isArray(data[0])) {
      items = data[0];
    } else if (Array.isArray(data)) {
      items = data as Array<{ label: string; score: number }>;
    } else {
      return null;
    }

    const scores: Record<string, number> = {};
    for (const item of items) {
      const label = item.label?.toLowerCase();
      if (label && typeof item.score === "number") {
        // Handle both "ENTAILMENT" and "entailment" formats
        if (label.includes("entail")) scores.entailment = item.score;
        else if (label.includes("contradict")) scores.contradiction = item.score;
        else if (label.includes("neutral")) scores.neutral = item.score;
      }
    }

    const entailment = scores.entailment ?? 0;
    const neutral = scores.neutral ?? 0;
    const contradiction = scores.contradiction ?? 0;

    // Determine winning label
    let label: NLILabel = "neutral";
    if (entailment >= contradiction && entailment >= neutral) label = "entailment";
    else if (contradiction >= entailment && contradiction >= neutral) label = "contradiction";

    return { entailment, neutral, contradiction, label };
  } catch {
    return null;
  }
}

// ─── API calls ─────────────────────────────────────────────────────

/**
 * Check if a piece of evidence entails, contradicts, or is neutral toward a claim.
 *
 * @param evidence - The source text (premise)
 * @param claim - The claim to verify (hypothesis)
 * @param apiKey - HuggingFace API key
 * @returns NLI scores, or null if the service is unavailable
 */
export async function checkEntailment(
  evidence: string,
  claim: string,
  apiKey: string,
): Promise<NLIResult | null> {
  if (!apiKey) return null;

  const premise = truncate(evidence, MAX_INPUT_LENGTH);
  const hypothesis = truncate(claim, MAX_INPUT_LENGTH / 2);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), NLI_TIMEOUT_MS);

    const res = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: `${premise} [SEP] ${hypothesis}`,
        parameters: { truncation: true },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      // Model loading (503) — HF cold start, skip NLI for this request
      if (res.status === 503) {
        console.warn("NLI model loading (cold start), falling back to BM25");
        return null;
      }
      console.warn(`NLI API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    return parseHFResponse(data);
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      console.warn("NLI request timed out, falling back to BM25");
    } else {
      console.warn("NLI request failed:", (err as Error).message);
    }
    return null;
  }
}

/**
 * Batch entailment checking — runs multiple (evidence, claim) pairs in parallel.
 * Uses Promise.allSettled so individual failures don't block the batch.
 *
 * @param pairs - Array of {evidence, claim} pairs
 * @param apiKey - HuggingFace API key
 * @param concurrency - Max concurrent requests (default 5)
 * @returns Array of NLIResult | null (same order as input)
 */
export async function batchCheckEntailment(
  pairs: Array<{ evidence: string; claim: string }>,
  apiKey: string,
  concurrency: number = 5,
): Promise<Array<NLIResult | null>> {
  if (!apiKey || pairs.length === 0) return pairs.map(() => null);

  const results: Array<NLIResult | null> = new Array(pairs.length).fill(null);

  // Process in chunks to respect rate limits
  for (let i = 0; i < pairs.length; i += concurrency) {
    const chunk = pairs.slice(i, i + concurrency);
    const promises = chunk.map((pair) =>
      checkEntailment(pair.evidence, pair.claim, apiKey),
    );

    const settled = await Promise.allSettled(promises);
    for (let j = 0; j < settled.length; j++) {
      if (settled[j].status === "fulfilled") {
        results[i + j] = (settled[j] as PromiseFulfilledResult<NLIResult | null>).value;
      }
    }
  }

  return results;
}

/**
 * Check if two claims contradict each other using NLI.
 * Tests both directions: A→B and B→A.
 *
 * Returns the max contradiction score across both directions,
 * since contradiction might be asymmetric in NLI.
 */
export async function checkContradiction(
  claimA: string,
  claimB: string,
  apiKey: string,
): Promise<{ isContradiction: boolean; score: number } | null> {
  if (!apiKey) return null;

  const [resultAB, resultBA] = await Promise.all([
    checkEntailment(claimA, claimB, apiKey),
    checkEntailment(claimB, claimA, apiKey),
  ]);

  if (!resultAB && !resultBA) return null;

  const scoreAB = resultAB?.contradiction ?? 0;
  const scoreBA = resultBA?.contradiction ?? 0;
  const maxScore = Math.max(scoreAB, scoreBA);

  return {
    isContradiction: maxScore >= 0.7, // High threshold for contradiction
    score: maxScore,
  };
}
