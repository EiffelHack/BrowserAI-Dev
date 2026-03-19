import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import type { BrowseClaim, Contradiction } from "@/lib/api/browse";

interface FollowUpSuggestionsProps {
  query: string;
  answer: string;
  claims?: BrowseClaim[];
  contradictions?: Contradiction[];
  onSelect: (query: string) => void;
}

export function FollowUpSuggestions({
  query,
  answer,
  claims,
  contradictions,
  onSelect,
}: FollowUpSuggestionsProps) {
  const suggestions = useMemo(
    () => generateFollowUps(query, answer, claims, contradictions),
    [query, answer, claims, contradictions],
  );

  if (suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="space-y-3"
    >
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-accent" />
        Related Questions
      </h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion, i) => (
          <motion.button
            key={suggestion}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + i * 0.08 }}
            onClick={() => onSelect(suggestion)}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-card border border-border hover:border-accent/40 hover:bg-accent/5 transition-all text-left group"
          >
            <span className="text-sm text-foreground/80 group-hover:text-foreground flex-1 line-clamp-2">
              {suggestion}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-accent shrink-0 transition-colors" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

// ── Follow-up generation (client-side, no API call needed) ──

function generateFollowUps(
  query: string,
  answer: string,
  claims?: BrowseClaim[],
  contradictions?: Contradiction[],
): string[] {
  const suggestions: string[] = [];
  const q = query.toLowerCase();

  // 1. If there are contradictions, ask about them
  if (contradictions && contradictions.length > 0) {
    const c = contradictions[0];
    suggestions.push(`Why do sources disagree about ${c.topic}?`);
  }

  // 2. Ask for deeper explanation of weak/unverified claims
  const weakClaims = claims?.filter(
    (c) => !c.verified || c.consensusLevel === "weak" || c.consensusLevel === "none",
  );
  if (weakClaims && weakClaims.length > 0) {
    const claim = weakClaims[0].claim;
    const short = claim.length > 60 ? claim.slice(0, 57) + "..." : claim;
    suggestions.push(`Is it true that ${short}`);
  }

  // 3. Comparison angle
  if (!q.includes(" vs ") && !q.includes("compare")) {
    const entities = extractEntities(answer);
    if (entities.length >= 2) {
      suggestions.push(`${entities[0]} vs ${entities[1]} — which is better?`);
    }
  }

  // 4. "How" follow-up if original was "What"
  if (q.startsWith("what ")) {
    suggestions.push(query.replace(/^what /i, "How does ").replace(/\?$/, " work?"));
  }

  // 5. Temporal follow-up
  if (!q.includes("latest") && !q.includes("recent") && !q.includes("2025") && !q.includes("2026")) {
    suggestions.push(`What are the latest developments in ${extractTopic(query)}?`);
  }

  // 6. "Why" follow-up
  if (!q.startsWith("why ")) {
    suggestions.push(`Why is ${extractTopic(query)} important?`);
  }

  // Deduplicate and limit
  const unique = [...new Set(suggestions)].filter(
    (s) => s.toLowerCase() !== q && s.length > 10 && s.length < 120,
  );
  return unique.slice(0, 4);
}

function extractTopic(query: string): string {
  return query
    .replace(/^(what|how|why|is|are|does|do|can|should|will)\s+(is|are|does|do|the|a|an)?\s*/i, "")
    .replace(/\?$/, "")
    .trim();
}

function extractEntities(text: string): string[] {
  // Simple: find capitalized multi-word phrases
  const matches = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  const unique = [...new Set(matches)].filter((m) => m.length > 3);
  return unique.slice(0, 4);
}
