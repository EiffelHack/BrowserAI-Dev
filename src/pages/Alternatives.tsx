import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { SEO } from "@/components/SEO";
import {
  ArrowLeft, ArrowRight, CheckCircle2, XCircle, Minus,
  Shield, Brain, Code2, Globe, Zap, ExternalLink,
  Search, GitCompare, Terminal, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrowseLogo } from "@/components/BrowseLogo";
import { useAuth } from "@/contexts/AuthContext";

// --- Competitor data ---

interface Competitor {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  pricing: string;
  strengths: string[];
  weaknesses: string[];
  useCases: string[];
}

const COMPETITORS: Competitor[] = [
  {
    slug: "tavily",
    name: "Tavily",
    tagline: "Search API for AI agents",
    description:
      "Tavily provides a search API designed for LLM applications with AI-synthesized answers, relevance scoring, and strong framework integrations. Popular in LangChain and agent ecosystems.",
    pricing: "Free tier (1K searches/mo), paid plans from $50/mo",
    strengths: [
      "Fast response times with AI answer synthesis",
      "Strong LangChain, CrewAI, and MCP integrations",
      "Relevance scoring on search results",
      "Open-source SDKs (MIT)",
    ],
    weaknesses: [
      "No claim verification or fact-checking pipeline",
      "Relevance scores measure query match, not factual accuracy",
      "No contradiction detection across sources",
      "Core search engine is closed-source",
    ],
    useCases: ["Search augmentation for agents", "RAG pipelines", "LangChain tool use"],
  },
  {
    slug: "perplexity",
    name: "Perplexity AI",
    tagline: "Answer engine with citations",
    description:
      "Perplexity is an answer engine with cited responses. Has official MCP server, Python SDK, and LangChain integration. API (Sonar) offers multiple model options.",
    pricing: "Free tier, Pro $20/mo, API usage-based",
    strengths: [
      "Polished answers with inline citations",
      "Official MCP server, Python SDK, LangChain",
      "Large consumer user base and brand recognition",
      "Multiple model options (Sonar, Deep Research)",
    ],
    weaknesses: [
      "No structured claim verification pipeline",
      "No evidence-based confidence scores",
      "Core engine is closed-source",
      "No BYOK support",
    ],
    useCases: ["Consumer search replacement", "Quick Q&A with citations", "Research summaries"],
  },
  {
    slug: "exa",
    name: "Exa",
    tagline: "Neural search API",
    description:
      "Exa (formerly Metaphor) offers a neural search engine with semantic understanding. Has MCP server, Python SDK, LangChain integration, and an /answer endpoint.",
    pricing: "Free tier (1K searches/mo), paid plans from $100/mo",
    strengths: [
      "Semantic neural search (not keyword-based)",
      "AI answer endpoint with citations",
      "Official MCP server and LangChain package",
      "Open-source SDKs and MCP server",
    ],
    weaknesses: [
      "No claim verification or fact-checking pipeline",
      "No confidence scoring for factual accuracy",
      "No contradiction detection or source consensus",
      "No CrewAI integration",
    ],
    useCases: ["Semantic document retrieval", "Similar content discovery", "Research exploration"],
  },
  {
    slug: "you",
    name: "You.com",
    tagline: "AI search platform",
    description:
      "You.com provides search APIs with AI-generated answers via Research API and Express Agent. Has official MCP server and LangChain integration.",
    pricing: "Free tier, paid plans from $100/mo",
    strengths: [
      "Research API with controllable depth",
      "Official MCP server and LangChain integration",
      "AI-generated answers with citations",
      "Privacy-focused option",
    ],
    weaknesses: [
      "No evidence verification pipeline",
      "No confidence scores backed by evidence",
      "No contradiction detection",
      "Core engine is closed-source",
    ],
    useCases: ["General web search", "Research with AI synthesis", "RAG applications"],
  },
  {
    slug: "brave",
    name: "Brave Search API",
    tagline: "Independent search index",
    description:
      "Brave Search offers an independent search index (not sourced from Google/Bing). Their API provides web, news, and image search with privacy-first design. Has an official MCP server.",
    pricing: "Free tier (2K queries/mo), paid from $3/1K queries",
    strengths: [
      "Independent search index (not Google/Bing)",
      "Privacy-focused — no user tracking",
      "Official MCP server",
      "Competitive pricing",
    ],
    weaknesses: [
      "Raw search results only — no AI synthesis",
      "No claim verification or evidence analysis",
      "No confidence scoring",
      "No LangChain/CrewAI framework integrations",
    ],
    useCases: ["Privacy-conscious search", "Independent web index access", "Cost-effective bulk search"],
  },
];

type FeatureSupport = "full" | "partial" | "none";

interface FeatureRow {
  feature: string;
  browseai: FeatureSupport;
  tavily: FeatureSupport;
  perplexity: FeatureSupport;
  exa: FeatureSupport;
  you: FeatureSupport;
  brave: FeatureSupport;
}

const FEATURE_MATRIX: FeatureRow[] = [
  { feature: "Web search", browseai: "full", tavily: "full", perplexity: "full", exa: "full", you: "full", brave: "full" },
  { feature: "AI-synthesized answers", browseai: "full", tavily: "full", perplexity: "full", exa: "full", you: "full", brave: "full" },
  { feature: "Evidence-backed citations", browseai: "full", tavily: "partial", perplexity: "partial", exa: "partial", you: "partial", brave: "partial" },
  { feature: "Claim verification", browseai: "full", tavily: "none", perplexity: "none", exa: "none", you: "none", brave: "none" },
  { feature: "Relevance/confidence scoring", browseai: "full", tavily: "partial", perplexity: "none", exa: "partial", you: "none", brave: "none" },
  { feature: "Contradiction detection", browseai: "full", tavily: "none", perplexity: "none", exa: "none", you: "none", brave: "none" },
  { feature: "Cross-source consensus", browseai: "full", tavily: "none", perplexity: "none", exa: "none", you: "none", brave: "none" },
  { feature: "Domain authority scoring", browseai: "full", tavily: "none", perplexity: "none", exa: "none", you: "none", brave: "none" },
  { feature: "MCP server", browseai: "full", tavily: "full", perplexity: "full", exa: "full", you: "full", brave: "full" },
  { feature: "Python SDK", browseai: "full", tavily: "full", perplexity: "full", exa: "full", you: "partial", brave: "partial" },
  { feature: "LangChain integration", browseai: "full", tavily: "full", perplexity: "full", exa: "full", you: "full", brave: "full" },
  { feature: "CrewAI integration", browseai: "full", tavily: "full", perplexity: "partial", exa: "none", you: "none", brave: "none" },
  { feature: "Open source (full pipeline)", browseai: "full", tavily: "partial", perplexity: "partial", exa: "partial", you: "partial", brave: "partial" },
  { feature: "Self-hostable", browseai: "full", tavily: "none", perplexity: "none", exa: "none", you: "none", brave: "none" },
  { feature: "BYOK (bring your own keys)", browseai: "full", tavily: "none", perplexity: "none", exa: "none", you: "none", brave: "none" },
];

const COLUMN_NAMES: Record<string, string> = {
  browseai: "BrowseAI Dev",
  tavily: "Tavily",
  perplexity: "Perplexity",
  exa: "Exa",
  you: "You.com",
  brave: "Brave",
};

function SupportIcon({ support }: { support: FeatureSupport }) {
  if (support === "full")
    return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (support === "partial")
    return <Minus className="w-4 h-4 text-yellow-400" />;
  return <XCircle className="w-4 h-4 text-zinc-600" />;
}

// --- Hub Page ---

const Alternatives = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  return (
    <>
      <SEO
        title="Alternatives — Compare AI Search APIs"
        description="Compare BrowseAI Dev vs Tavily, Perplexity, Exa, You.com, and Brave Search. Feature matrix, pricing, and honest comparison of AI search APIs for agents."
        canonical="/alternatives"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "BrowseAI Dev Alternatives — Compare AI Search APIs",
          description:
            "Compare BrowseAI Dev vs Tavily, Perplexity, Exa, You.com, and Brave Search API for AI agent research.",
          url: "https://browseai.dev/alternatives",
        }}
      />

      <div className="min-h-screen bg-background">
        {/* Nav */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-8 py-5 bg-background/80 backdrop-blur-sm border-b border-border/50"
        >
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => navigate("/")}
            >
              <BrowseLogo className="w-4 h-4" />
              <span className="font-semibold text-sm">BrowseAI Dev</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/compare")}
            >
              <GitCompare className="w-3.5 h-3.5 mr-1.5" />
              Live Compare
            </Button>
          </div>
        </motion.nav>

        <div className="max-w-6xl mx-auto px-6 py-12 space-y-16">
          {/* Hero */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center space-y-4"
          >
            <Badge variant="outline" className="text-xs">
              Agent-First Research Infrastructure
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              BrowseAI Dev vs. the alternatives
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Most search APIs return results for humans. BrowseAI Dev is
              infrastructure purpose-built for AI agents — giving them verified,
              evidence-backed knowledge to prevent hallucinations and make
              informed decisions.
            </p>
            <p className="text-sm text-muted-foreground max-w-xl mx-auto font-mono">
              Agent → BrowseAI Dev → Internet → Verified answers + confidence scores
            </p>
          </motion.section>

          {/* Feature Matrix */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-6"
          >
            <h2 className="text-xl font-semibold">Feature comparison</h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground min-w-[180px]">
                      Feature
                    </th>
                    {Object.entries(COLUMN_NAMES).map(([key, name]) => (
                      <th
                        key={key}
                        className={`text-center px-3 py-3 font-medium min-w-[100px] ${
                          key === "browseai"
                            ? "text-emerald-400 bg-emerald-400/5"
                            : "text-muted-foreground"
                        }`}
                      >
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {FEATURE_MATRIX.map((row, i) => (
                    <tr
                      key={row.feature}
                      className={`border-b border-border/50 ${
                        i % 2 === 0 ? "" : "bg-muted/10"
                      }`}
                    >
                      <td className="px-4 py-2.5 text-foreground">
                        {row.feature}
                      </td>
                      {(
                        Object.keys(COLUMN_NAMES) as Array<
                          keyof typeof COLUMN_NAMES
                        >
                      ).map((key) => (
                        <td
                          key={key}
                          className={`text-center px-3 py-2.5 ${
                            key === "browseai" ? "bg-emerald-400/5" : ""
                          }`}
                        >
                          <div className="flex justify-center">
                            <SupportIcon
                              support={row[key as keyof FeatureRow] as FeatureSupport}
                            />
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Full
                support
              </span>
              <span className="flex items-center gap-1.5">
                <Minus className="w-3.5 h-3.5 text-yellow-400" /> Partial
              </span>
              <span className="flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 text-zinc-600" /> Not available
              </span>
            </div>
          </motion.section>

          {/* Key differentiators */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="space-y-6"
          >
            <h2 className="text-xl font-semibold">
              Built for agents, not humans
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Other search APIs were built for human consumers and later added
              developer APIs. BrowseAI Dev is purpose-built infrastructure for
              AI agents that need to research, verify, and make decisions
              autonomously.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  icon: Shield,
                  title: "Prevent hallucinations",
                  desc: "Every answer comes with a 7-factor evidence-based confidence score. Your agent knows exactly how much to trust each piece of information before acting on it.",
                },
                {
                  icon: Brain,
                  title: "Verification pipeline",
                  desc: "Claims are decomposed, verified via hybrid BM25 + NLI entailment, cross-checked for consensus, and scanned for contradictions. Agents get grounded facts, not guesses.",
                },
                {
                  icon: Code2,
                  title: "Open infrastructure",
                  desc: "MIT licensed. Self-host it, bring your own keys, plug in your own search backends. MCP server, REST API, Python SDK, and framework integrations all included.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-5 rounded-lg border border-border bg-card space-y-2"
                >
                  <item.icon className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-medium">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </motion.section>

          {/* Individual competitor cards */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            <h2 className="text-xl font-semibold">Detailed comparisons</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {COMPETITORS.map((c) => (
                <div
                  key={c.slug}
                  className="group p-5 rounded-lg border border-border bg-card hover:border-emerald-400/30 transition-colors cursor-pointer"
                  onClick={() => navigate(`/alternatives/${c.slug}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-lg">{c.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {c.tagline}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 transition-colors mt-1" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {c.pricing}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.weaknesses.slice(0, 2).map((w) => (
                      <Badge
                        key={w}
                        variant="outline"
                        className="text-xs text-zinc-400"
                      >
                        No {w.replace(/^No /, "").split(" ").slice(0, 3).join(" ")}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          {/* CTA */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-center py-12 space-y-4"
          >
            <h2 className="text-2xl font-bold">Try it yourself</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              See how BrowseAI Dev compares on your own queries. Our{" "}
              <span
                className="text-emerald-400 cursor-pointer hover:underline"
                onClick={() => navigate("/compare")}
              >
                live comparison tool
              </span>{" "}
              shows raw LLM vs. evidence-backed answers side by side.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => navigate("/playground")}>
                <Terminal className="w-4 h-4 mr-1.5" />
                Playground
              </Button>
              <Button variant="outline" onClick={() => navigate("/docs")}>
                <BookOpen className="w-4 h-4 mr-1.5" />
                API Docs
              </Button>
            </div>
          </motion.section>
        </div>
      </div>
    </>
  );
};

export default Alternatives;
