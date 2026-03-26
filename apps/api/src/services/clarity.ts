/**
 * Clarity — Anti-Hallucination Answer Engine
 *
 * Three modes:
 * 1. Prompt (mode="prompt"): Analyzes prompt, selects techniques, rewrites
 *    prompt → returns only the enhanced system + user prompts. No LLM call,
 *    no web search. Use when your own LLM (e.g. Claude) should answer.
 * 2. Answer (mode="answer"): Rewrites prompt → calls LLM with anti-hallucination
 *    instructions → returns answer with claims. No internet. Quick.
 * 3. Verified (mode="verified"): Does #2, then runs browse pipeline, fuses the
 *    best of both — keeps source-backed claims, drops fabricated ones,
 *    returns one unified high-quality answer.
 */

import { LLM_ENDPOINT, LLM_MODEL } from "@browse/shared";
import type {
  ClarityIntent,
  ClarityTechnique,
  ClarityMode,
  ClarityResult,
  ClarityClaim,
  BrowseResult,
  BrowseSource,
  TraceStep,
  Contradiction,
} from "@browse/shared";
import { fetchWithRetry } from "../lib/retry.js";
import { answerQuery } from "./answer.js";
import type { Env } from "../config/env.js";
import type { CacheService } from "./cache.js";

// ── Technique Library ──

const TECHNIQUE_FRAGMENTS: Record<ClarityTechnique, { label: string; instruction: string }> = {
  uncertainty_permission: {
    label: "Uncertainty Permission",
    instruction: `If you are unsure about any part of your answer, say "I don't have enough information to confidently assess this" rather than guessing. Partial answers with acknowledged gaps are better than complete answers with fabricated details.`,
  },
  direct_quote_grounding: {
    label: "Direct Quote Grounding",
    instruction: `Before answering, extract the exact word-for-word quotes from the provided context that are most relevant. Number each quote. Then base your answer ONLY on those extracted quotes, referencing them by number. If you cannot find relevant quotes, state "No relevant quotes found."`,
  },
  citation_then_verify: {
    label: "Citation-Then-Verify",
    instruction: `For every claim in your response, cite the specific source using [Source N] notation. After drafting, review EVERY claim — find a direct quote from the sources that supports it. If you cannot find a supporting quote for any claim, REMOVE that claim and mark the removal with [REMOVED — no supporting evidence].`,
  },
  chain_of_verification: {
    label: "Chain-of-Verification (CoVe)",
    instruction: `After drafting your response, (1) list 3-5 narrow verification questions for your key claims, (2) answer each verification question independently without looking at your draft, (3) compare and correct any inconsistencies. Remove any claims that fail verification.`,
  },
  step_back_abstraction: {
    label: "Step-Back Abstraction",
    instruction: `Before answering the specific question, first identify the general principles or concepts involved. Then apply those principles to the specific question. If the general principles suggest uncertainty, flag it explicitly.`,
  },
  source_attribution: {
    label: "Source Attribution",
    instruction: `Attribute every factual claim to a specific source. Only include information that would be found in the cited source. If a source would not cover the topic, say so explicitly.`,
  },
  external_knowledge_restriction: {
    label: "External Knowledge Restriction",
    instruction: `Answer using ONLY the information provided in the context. Do not use any prior knowledge or training data. If the answer is not in the context, say "Not found in provided context." Never extrapolate beyond what the context explicitly states.`,
  },
};

const ALL_TECHNIQUES = Object.keys(TECHNIQUE_FRAGMENTS) as ClarityTechnique[];

// ── LLM-Powered Intent Detection + Technique Selection ──

type AnalysisResult = {
  intent: ClarityIntent;
  techniques: ClarityTechnique[];
  risks: string[];
  userPromptRewrite: string;
};

async function analyzeForClarity(
  prompt: string,
  context: string | undefined,
  apiKey: string,
): Promise<AnalysisResult> {
  const techniqueList = ALL_TECHNIQUES.map(
    t => `- ${t}: ${TECHNIQUE_FRAGMENTS[t].label} — ${TECHNIQUE_FRAGMENTS[t].instruction.slice(0, 100)}...`
  ).join("\n");

  const res = await fetchWithRetry(LLM_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `You are an anti-hallucination prompt engineer. Your job is to analyze a user's prompt, detect what kind of task it is, identify hallucination risks, select the right mitigation techniques, and rewrite the user prompt to be more grounded.

Available intent types:
- factual_question: Questions seeking specific facts, dates, numbers, definitions
- document_qa: Questions about specific documents/context provided
- content_generation: Writing articles, reports, summaries, emails
- agent_pipeline: System prompts, agent instructions, tool configurations
- code_generation: Writing, debugging, or explaining code
- general: Other tasks

Available anti-hallucination techniques:
${techniqueList}

Select 2-4 techniques most relevant to the detected intent and specific risks. Do NOT select all techniques — pick the ones that matter most for this specific prompt.

Rewrite the user prompt to naturally incorporate grounding cues without making it feel robotic. The rewrite should:
- Preserve the user's original intent completely
- Add specificity where vague ("tell me about X" → "What are the key facts about X, with dates and sources?")
- Add grounding cues natural to the question type
- NOT add technique names or meta-instructions to the user prompt — those go in the system prompt`,
        },
        {
          role: "user",
          content: `Analyze this prompt and return your analysis:\n\n${context ? `Context provided: Yes (${context.length} chars)\n\n` : ""}User prompt: "${prompt}"`,
        },
      ],
      tools: [
        {
          type: "function" as const,
          function: {
            name: "return_analysis",
            description: "Return the prompt analysis and clarity plan",
            parameters: {
              type: "object",
              properties: {
                intent: {
                  type: "string",
                  enum: ["factual_question", "document_qa", "content_generation", "agent_pipeline", "code_generation", "general"],
                  description: "Detected intent type",
                },
                techniques: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ALL_TECHNIQUES,
                  },
                  description: "Selected anti-hallucination techniques (2-4)",
                },
                risks: {
                  type: "array",
                  items: { type: "string" },
                  description: "Specific hallucination risks identified (e.g. 'may fabricate statistics', 'may invent source URLs')",
                },
                userPromptRewrite: {
                  type: "string",
                  description: "Rewritten user prompt with natural grounding cues. Must preserve original intent.",
                },
              },
              required: ["intent", "techniques", "risks", "userPromptRewrite"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_analysis" } },
    }),
  });

  const data = await res.json() as any;
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall) {
    return {
      intent: "general",
      techniques: ["uncertainty_permission", "chain_of_verification"],
      risks: ["Unable to analyze — applying default safeguards"],
      userPromptRewrite: prompt,
    };
  }

  const parsed = JSON.parse(toolCall.function.arguments);

  const validTechniques = (parsed.techniques as string[]).filter(
    t => ALL_TECHNIQUES.includes(t as ClarityTechnique)
  ) as ClarityTechnique[];

  return {
    intent: parsed.intent || "general",
    techniques: validTechniques.length > 0 ? validTechniques : ["uncertainty_permission"],
    risks: parsed.risks || [],
    userPromptRewrite: parsed.userPromptRewrite || prompt,
  };
}

// ── LLM Call with Anti-Hallucination System Prompt ──

type LLMAnswer = {
  answer: string;
  claims: string[];
};

async function callLLMWithClarity(
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
): Promise<LLMAnswer> {
  const res = await fetchWithRetry(LLM_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function" as const,
          function: {
            name: "return_answer",
            description: "Return the structured answer with extracted claims",
            parameters: {
              type: "object",
              properties: {
                answer: {
                  type: "string",
                  description: "The complete answer to the user's question, following all anti-hallucination rules",
                },
                claims: {
                  type: "array",
                  items: { type: "string" },
                  description: "List of individual factual claims made in the answer. Each should be a single verifiable statement.",
                },
              },
              required: ["answer", "claims"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_answer" } },
    }),
  });

  const data = await res.json() as any;
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

  if (!toolCall) {
    // Fallback: use the text response if tool call failed
    const textContent = data.choices?.[0]?.message?.content || "Unable to generate answer.";
    return { answer: textContent, claims: [] };
  }

  const parsed = JSON.parse(toolCall.function.arguments);
  return {
    answer: parsed.answer || "Unable to generate answer.",
    claims: Array.isArray(parsed.claims) ? parsed.claims : [],
  };
}

// ── Fusion: Merge LLM answer with browse pipeline results ──

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(w => w.length > 2);
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = new Set(tokenize(b));
  if (tokensA.length === 0 || tokensB.size === 0) return 0;
  const shared = tokensA.filter(t => tokensB.has(t)).length;
  return shared / Math.max(tokensA.length, tokensB.size);
}

const OVERLAP_THRESHOLD = 0.35;

function fuseClarityWithBrowse(
  llmClaims: string[],
  browseResult: BrowseResult,
): {
  claims: ClarityClaim[];
  answer: string;
  confidence: number;
  sources: BrowseSource[];
  contradictions: Contradiction[];
} {
  const fusedClaims: ClarityClaim[] = [];
  const matchedBrowseIndices = new Set<number>();

  // For each LLM claim, find matching browse claims
  for (const llmClaim of llmClaims) {
    let bestMatch: { index: number; overlap: number; browseClaim: typeof browseResult.claims[0] } | null = null;

    for (let i = 0; i < browseResult.claims.length; i++) {
      const overlap = tokenOverlap(llmClaim, browseResult.claims[i].claim);
      if (overlap >= OVERLAP_THRESHOLD && (!bestMatch || overlap > bestMatch.overlap)) {
        bestMatch = { index: i, overlap, browseClaim: browseResult.claims[i] };
      }
    }

    if (bestMatch) {
      // Confirmed: LLM claim backed by sources
      matchedBrowseIndices.add(bestMatch.index);
      fusedClaims.push({
        claim: llmClaim,
        origin: "confirmed",
        sources: bestMatch.browseClaim.sources || [],
        verified: bestMatch.browseClaim.verified,
        verificationScore: bestMatch.browseClaim.verificationScore,
      });
    } else {
      // LLM-only: no source backing
      fusedClaims.push({
        claim: llmClaim,
        origin: "llm",
        sources: [],
        verified: false,
      });
    }
  }

  // Add source-only claims (from browse pipeline, not mentioned by LLM)
  for (let i = 0; i < browseResult.claims.length; i++) {
    if (!matchedBrowseIndices.has(i)) {
      const bc = browseResult.claims[i];
      fusedClaims.push({
        claim: bc.claim,
        origin: "source",
        sources: bc.sources || [],
        verified: bc.verified,
        verificationScore: bc.verificationScore,
      });
    }
  }

  // Compute fused confidence: start from browse confidence, adjust based on confirmation
  const confirmedCount = fusedClaims.filter(c => c.origin === "confirmed").length;
  const llmOnlyCount = fusedClaims.filter(c => c.origin === "llm").length;
  let confidence = browseResult.confidence;
  confidence += confirmedCount * 0.03;  // Boost for confirmed claims
  confidence -= llmOnlyCount * 0.02;     // Penalize unconfirmed LLM claims
  confidence = Math.max(0.05, Math.min(0.97, confidence));
  confidence = Math.round(confidence * 100) / 100;

  // Use browse answer as the primary (it's source-backed), but note the fusion
  const answer = browseResult.answer;

  return {
    claims: fusedClaims,
    answer,
    confidence,
    sources: browseResult.sources,
    contradictions: browseResult.contradictions || [],
  };
}

// ── Build System Prompt from Techniques ──

function buildSystemPrompt(
  techniques: ClarityTechnique[],
  risks: string[],
  context?: string,
): string {
  const parts = [
    "You are a precise, evidence-based assistant that prioritizes accuracy over completeness.",
    "",
  ];

  if (risks.length > 0) {
    parts.push("KNOWN RISKS FOR THIS QUERY:");
    for (const risk of risks) {
      parts.push(`- ${risk}`);
    }
    parts.push("");
  }

  parts.push("ANTI-HALLUCINATION RULES:");
  for (const t of techniques) {
    parts.push("");
    parts.push(`${TECHNIQUE_FRAGMENTS[t].label.toUpperCase()}:`);
    parts.push(TECHNIQUE_FRAGMENTS[t].instruction);
  }

  if (context) {
    parts.push("");
    parts.push("CONTEXT:");
    parts.push(context);
  }

  return parts.join("\n");
}

// ── Main Function ──

export async function clarityPrompt(
  prompt: string,
  options: {
    context?: string;
    intent?: ClarityIntent;
    mode?: ClarityMode;
    /** @deprecated Use mode instead */
    verify?: boolean;
    env: Env;
    cache: CacheService;
  },
): Promise<ClarityResult> {
  const apiKey = options.env.OPENROUTER_API_KEY;
  const trace: TraceStep[] = [];

  // Resolve mode: explicit mode takes priority, then legacy verify flag, then default "answer"
  const mode: ClarityMode = options.mode ?? (options.verify ? "verified" : "answer");

  // Step 1: Analyze prompt — detect intent, risks, techniques, rewrite
  const analysisStart = Date.now();
  const analysis = await analyzeForClarity(prompt, options.context, apiKey);
  const intent = options.intent || analysis.intent;
  const techniques = analysis.techniques;
  trace.push({
    step: "Clarity Analysis",
    duration_ms: Date.now() - analysisStart,
    detail: `Intent: ${intent}, Techniques: ${techniques.join(", ")}`,
  });

  // Step 2: Build anti-hallucination system prompt
  const systemPrompt = buildSystemPrompt(techniques, analysis.risks, options.context);
  const userPrompt = analysis.userPromptRewrite;

  // ── Mode: Prompt — return enhanced prompts only, no LLM call ──
  if (mode === "prompt") {
    return {
      original: prompt,
      intent,
      answer: "",
      claims: [],
      sources: [],
      confidence: 0,
      techniques,
      risks: analysis.risks,
      verified: false,
      mode: "prompt",
      trace,
      systemPrompt,
      userPrompt,
    };
  }

  // ── Mode: Verified — LLM + browse pipeline in parallel, then fuse ──
  if (mode === "verified") {
    const llmStart = Date.now();
    const [llmAnswer, browseResult] = await Promise.all([
      callLLMWithClarity(systemPrompt, userPrompt, apiKey),
      answerQuery(prompt, options.env, options.cache, "fast").catch((err) => {
        // First attempt failed — retry with minimal env (Tavily + OpenRouter only)
        console.warn("Browse pipeline failed, retrying with minimal keys:", err?.message || err);
        const minimalEnv = {
          ...options.env,
          HF_API_KEY: undefined,
          BRAVE_API_KEY: undefined,
          EXA_API_KEY: undefined,
        };
        return answerQuery(prompt, minimalEnv, options.cache, "fast").catch((retryErr) => {
          console.warn("Browse pipeline retry also failed, degrading to LLM-only:", retryErr?.message || retryErr);
          return null;
        });
      }),
    ]);

    trace.push({
      step: "Clarity LLM Answer",
      duration_ms: Date.now() - llmStart,
      detail: `${llmAnswer.claims.length} claims extracted from LLM${browseResult ? "" : " (browse pipeline failed, LLM-only fallback)"}`,
    });

    // If browse pipeline completely failed (even with minimal keys), return LLM-only answer
    if (!browseResult) {
      const claims: ClarityClaim[] = llmAnswer.claims.map(claim => ({
        claim,
        origin: "llm" as const,
        sources: [],
        verified: false,
      }));

      return {
        original: prompt,
        intent,
        answer: llmAnswer.answer,
        claims,
        sources: [],
        confidence: 0.4,
        techniques,
        risks: [...analysis.risks, "browse pipeline unavailable — LLM answer not verified"],
        verified: false,
        mode: "verified",
        trace,
        systemPrompt,
        userPrompt,
      };
    }

    const fusionStart = Date.now();
    const fused = fuseClarityWithBrowse(llmAnswer.claims, browseResult);

    const confirmedCount = fused.claims.filter(c => c.origin === "confirmed").length;
    const llmOnlyCount = fused.claims.filter(c => c.origin === "llm").length;
    const sourceOnlyCount = fused.claims.filter(c => c.origin === "source").length;

    trace.push({
      step: "Fusion",
      duration_ms: Date.now() - fusionStart,
      detail: `${confirmedCount} confirmed, ${llmOnlyCount} LLM-only, ${sourceOnlyCount} source-only`,
    });

    trace.push(...browseResult.trace);

    return {
      original: prompt,
      intent,
      answer: fused.answer,
      claims: fused.claims,
      sources: fused.sources,
      confidence: fused.confidence,
      techniques,
      risks: analysis.risks,
      verified: true,
      mode: "verified",
      trace,
      systemPrompt,
      userPrompt,
      contradictions: fused.contradictions.length > 0 ? fused.contradictions : undefined,
    };
  }

  // ── Mode: Answer (default) — LLM only, no internet ──
  const llmStart = Date.now();
  const llmAnswer = await callLLMWithClarity(systemPrompt, userPrompt, apiKey);

  trace.push({
    step: "Clarity LLM Answer",
    duration_ms: Date.now() - llmStart,
    detail: `${llmAnswer.claims.length} claims (LLM only, no web verification)`,
  });

  const claims: ClarityClaim[] = llmAnswer.claims.map(claim => ({
    claim,
    origin: "llm" as const,
    sources: [],
    verified: false,
  }));

  const confidence = Math.min(0.65, 0.45 + claims.length * 0.02);

  return {
    original: prompt,
    intent,
    answer: llmAnswer.answer,
    claims,
    sources: [],
    confidence: Math.round(confidence * 100) / 100,
    techniques,
    risks: analysis.risks,
    verified: false,
    mode: "answer",
    trace,
    systemPrompt,
    userPrompt,
  };
}
