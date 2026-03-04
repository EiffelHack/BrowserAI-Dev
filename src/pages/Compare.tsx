import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Shield, ShieldAlert, Globe, Quote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrowseBadge } from "@/components/BrowseBadge";
import { browseCompare, type CompareResult } from "@/lib/api/browse";

const Compare = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") || "";
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    setError(null);
    browseCompare(query)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [query]);

  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-border">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent" />
            <span className="font-semibold text-sm">browse.ai</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground truncate max-w-md font-mono">
          "{query}"
        </p>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            <p className="text-sm text-muted-foreground">Running both pipelines in parallel...</p>
          </div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-center"
          >
            {error}
          </motion.div>
        )}

        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            {/* Stats bar */}
            <div className="flex items-center justify-center gap-8 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ShieldAlert className="w-4 h-4 text-orange-400" />
                <span>Raw LLM: <strong className="text-foreground">0 sources</strong></span>
              </div>
              <span className="text-muted-foreground">vs</span>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Browse AI: <strong className="text-foreground">{result.evidence_backed.sources} sources, {result.evidence_backed.claims} claims</strong></span>
              </div>
            </div>

            {/* Split view */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Raw LLM side */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-orange-400" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-400">Raw LLM</h2>
                  <Badge className="ml-auto bg-orange-400/15 text-orange-400 border-orange-400/30 text-xs">
                    No sources
                  </Badge>
                </div>
                <div className="p-6 rounded-xl bg-card border border-orange-400/20 min-h-[300px]">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {result.raw_llm.answer}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Sources: 0</span>
                  <span>Claims: 0</span>
                  <span>Confidence: Unknown</span>
                </div>
              </motion.div>

              {/* Evidence-backed side */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-400">Browse AI</h2>
                  <Badge className="ml-auto bg-emerald-400/15 text-emerald-400 border-emerald-400/30 text-xs">
                    {Math.round(result.evidence_backed.confidence * 100)}% confidence
                  </Badge>
                </div>
                <div className="p-6 rounded-xl bg-card border border-emerald-400/20 min-h-[300px]">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {result.evidence_backed.answer}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="text-emerald-400">{result.evidence_backed.sources} sources</span>
                  <span className="text-emerald-400">{result.evidence_backed.claims} claims</span>
                  <span className="text-emerald-400">{Math.round(result.evidence_backed.confidence * 100)}% confidence</span>
                </div>
              </motion.div>
            </div>

            {/* Citations */}
            {result.evidence_backed.citations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                  Sources (only available with Browse AI)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.evidence_backed.citations.map((src, i) => (
                    <div key={i} className="p-3 rounded-lg bg-card border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <Globe className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-accent font-mono">{src.domain}</span>
                        <span className="text-xs text-muted-foreground truncate">— {src.title}</span>
                      </div>
                      {src.quote && (
                        <div className="flex items-start gap-2 mt-1">
                          <Quote className="w-3 h-3 text-muted-foreground mt-0.5 shrink-0" />
                          <p className="text-xs text-muted-foreground italic leading-relaxed line-clamp-2">{src.quote}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            <div className="flex justify-center pt-4">
              <BrowseBadge />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Compare;
