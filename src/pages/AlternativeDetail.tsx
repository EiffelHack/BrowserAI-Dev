import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { SEO } from "@/components/SEO";
import {
  ArrowLeft, CheckCircle2, XCircle, Shield, Brain,
  Code2, Terminal, BookOpen, GitCompare, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrowseLogo } from "@/components/BrowseLogo";

// --- Competitor data (shared with Alternatives.tsx) ---

interface CompetitorDetail {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  pricing: string;
  strengths: string[];
  weaknesses: string[];
  useCases: string[];
  browseaiAdvantages: string[];
  seoTitle: string;
  seoDescription: string;
}

const COMPETITOR_DETAILS: Record<string, CompetitorDetail> = {
  tavily: {
    slug: "tavily",
    name: "Tavily",
    tagline: "Search API for AI agents",
    description:
      "Tavily is a popular search API designed for LLM applications. It returns cleaned, relevant search results optimized for AI consumption and has strong LangChain integration. However, Tavily focuses solely on search — it doesn't verify claims, detect contradictions, or provide evidence-backed confidence scores.",
    pricing: "Free tier (1K searches/mo), paid plans from $50/mo",
    strengths: [
      "Fast response times (~1-2s)",
      "AI-synthesized answers via include_answer parameter",
      "Full MCP server (tavily-mcp on npm)",
      "First-class LangChain and CrewAI integrations",
      "Relevance scoring on each search result (cosine similarity)",
      "Open-source SDKs and MCP server (MIT license)",
      "Good developer documentation and affordable pricing",
    ],
    weaknesses: [
      "No claim verification — returns search results and optional AI summary, but doesn't fact-check",
      "Relevance scores measure query-match, not whether information is factually accurate",
      "No contradiction detection — conflicting sources aren't flagged",
      "No evidence consensus — no cross-validation across multiple sources",
      "No domain authority scoring — treats all sources equally",
      "Core search engine is closed-source (SDKs are open)",
    ],
    useCases: [
      "Search augmentation for AI agents",
      "RAG pipelines needing web context",
      "LangChain/CrewAI tool use",
    ],
    browseaiAdvantages: [
      "BrowseAI Dev decomposes claims and verifies each against sources — Tavily returns search results with an optional AI summary",
      "Evidence-backed confidence scores (7-factor model) vs. relevance scores that only measure query match",
      "Contradiction detection surfaces conflicting information across sources",
      "Cross-source consensus ensures answers are corroborated, not single-source",
      "Full pipeline is open-source and self-hostable — Tavily's core engine is closed",
      "Both have LangChain/CrewAI/MCP — BrowseAI Dev adds LlamaIndex and is fully open",
    ],
    seoTitle: "BrowseAI Dev vs Tavily — AI Search API Comparison",
    seoDescription:
      "Compare BrowseAI Dev and Tavily for AI agent search. BrowseAI Dev adds claim verification, confidence scores, and contradiction detection on top of web search.",
  },
  perplexity: {
    slug: "perplexity",
    name: "Perplexity AI",
    tagline: "Answer engine with citations",
    description:
      "Perplexity AI is a consumer-facing answer engine that provides natural language responses with inline citations. Their pplx-api offers programmatic access for developers. While Perplexity excels at conversational answers, its confidence assessment is LLM self-reported rather than evidence-based, and it lacks structured verification infrastructure for AI agents.",
    pricing: "Free tier, Pro $20/mo, API usage-based",
    strengths: [
      "Polished natural language answers with inline citations",
      "Official MCP server (@perplexity-ai/mcp-server) with web search, deep research, reasoning tools",
      "Official Python SDK (perplexityai on PyPI) and LangChain package (langchain-perplexity)",
      "Large consumer user base and brand recognition",
      "Multiple model options (Sonar, Sonar Pro, Deep Research, Reasoning)",
      "LlamaIndex support as LLM provider",
      "Mobile apps and browser extension",
    ],
    weaknesses: [
      "No structured claim verification pipeline — answers are grounded in sources but claims aren't individually verified",
      "No evidence-based confidence scores in API responses",
      "No contradiction detection across sources",
      "Core engine is closed-source (SDKs are Apache-2.0)",
      "No BYOK option — locked to Perplexity's infrastructure",
      "No dedicated CrewAI integration (works indirectly via OpenAI-compatible API)",
    ],
    useCases: [
      "Consumer search replacement",
      "Quick Q&A with citations",
      "Research summaries for human readers",
    ],
    browseaiAdvantages: [
      "Evidence-based confidence scores (7-factor algorithm) vs. no confidence scoring in Perplexity API",
      "Claim decomposition and individual verification vs. monolithic grounded answers",
      "Contradiction detection surfaces conflicting information across sources",
      "Both have MCP servers and LangChain integration — comparable distribution",
      "BrowseAI Dev adds dedicated CrewAI and LlamaIndex tool packages",
      "Fully open-source pipeline (MIT), self-hostable, BYOK — Perplexity is proprietary",
    ],
    seoTitle: "BrowseAI Dev vs Perplexity AI — AI Research Infrastructure Comparison",
    seoDescription:
      "Compare BrowseAI Dev and Perplexity AI for AI agent research. BrowseAI Dev offers evidence-based confidence, claim verification, and open-source infrastructure vs. Perplexity's consumer answer engine.",
  },
  exa: {
    slug: "exa",
    name: "Exa",
    tagline: "Neural search API",
    description:
      "Exa (formerly Metaphor) is a neural search engine with semantic understanding. Has an /answer endpoint for AI-synthesized answers with citations, official MCP server, Python SDK (exa-py), and LangChain package (langchain-exa). Strong at semantic retrieval but doesn't verify claims or provide factual confidence scoring.",
    pricing: "Free tier (1K searches/mo), paid from $100/mo",
    strengths: [
      "Semantic neural search (not keyword-based)",
      "AI answer endpoint with citations and streaming",
      "Official MCP server (exa-mcp-server on GitHub)",
      "Official Python SDK (exa-py) and LangChain package (langchain-exa)",
      "Open-source SDKs and MCP server",
      "Good at niche and technical queries",
    ],
    weaknesses: [
      "No claim verification or fact-checking pipeline",
      "No confidence scoring for factual accuracy",
      "No source consensus or contradiction detection",
      "No CrewAI integration",
      "Core search engine is closed-source (SDKs are open)",
      "Higher pricing than alternatives",
    ],
    useCases: [
      "Semantic document retrieval",
      "Similar content discovery",
      "Research exploration and literature review",
    ],
    browseaiAdvantages: [
      "Claim verification pipeline (BM25 + NLI) — Exa returns answers without individual claim verification",
      "7-factor evidence-based confidence scores vs. no factual confidence scoring",
      "Contradiction detection and cross-source consensus",
      "Both have MCP servers, Python SDKs, and LangChain — comparable distribution",
      "BrowseAI Dev adds dedicated CrewAI and LlamaIndex packages",
      "Full pipeline is open-source (MIT) and self-hostable, not just SDKs",
    ],
    seoTitle: "BrowseAI Dev vs Exa — AI Search & Verification Comparison",
    seoDescription:
      "Compare BrowseAI Dev and Exa (Metaphor) for AI agents. BrowseAI Dev adds answer synthesis, claim verification, and confidence scoring on top of semantic search.",
  },
  you: {
    slug: "you",
    name: "You.com",
    tagline: "AI search platform",
    description:
      "You.com provides search APIs with AI-synthesized answers via Research API (controllable depth) and Express Agent. Has an official MCP server, LangChain integration (via langchain-community), and a community Python SDK. Doesn't have structured verification or confidence scoring.",
    pricing: "Free tier, paid plans from $100/mo",
    strengths: [
      "Research API with controllable research_effort (lite to exhaustive)",
      "Official MCP server (hosted + local via npx @youdotcom-oss/mcp)",
      "AI-generated answers with citations",
      "LangChain integration (YouRetriever, YouSearchTool)",
      "Privacy-focused option available",
    ],
    weaknesses: [
      "No evidence verification pipeline",
      "No confidence scores backed by evidence",
      "No contradiction detection between sources",
      "No dedicated CrewAI or LlamaIndex integrations",
      "Core engine is closed-source (some open-source tools)",
      "Python SDK is community-maintained, not first-party",
    ],
    useCases: [
      "General web search with AI synthesis",
      "Research with controllable depth",
      "RAG applications needing web context",
    ],
    browseaiAdvantages: [
      "Full verification pipeline vs. unverified AI summaries",
      "Evidence-based confidence scores (7-factor model) vs. no scoring",
      "Contradiction detection catches conflicting sources",
      "Both have MCP servers and LangChain — comparable distribution",
      "BrowseAI Dev adds dedicated CrewAI and LlamaIndex packages",
      "Fully open-source pipeline (MIT), self-hostable, BYOK — You.com core is proprietary",
    ],
    seoTitle: "BrowseAI Dev vs You.com — AI Search API Comparison",
    seoDescription:
      "Compare BrowseAI Dev and You.com for AI agent research. BrowseAI Dev provides evidence verification, confidence scores, and open-source infrastructure vs. You.com's AI search platform.",
  },
  brave: {
    slug: "brave",
    name: "Brave Search API",
    tagline: "Independent search index",
    description:
      "Brave Search offers an independent search index not sourced from Google or Bing. Their API provides web, news, and image search with a Summarizer API for AI-generated answers. Has an official MCP server and LangChain integration. Privacy-first design with no user tracking.",
    pricing: "Free tier (2K queries/mo), paid from $3/1K queries",
    strengths: [
      "Independent search index (not Google/Bing dependent)",
      "AI Summarizer API for generated answers (free, only search call is billed)",
      "Official MCP server (brave-search-mcp-server, MIT license)",
      "LangChain integration (BraveSearch tool, BraveSearchLoader)",
      "Strong privacy guarantees — no user tracking",
      "Very competitive pricing ($3/1K queries)",
      "Web, news, image, and video search",
    ],
    weaknesses: [
      "No claim verification or fact-checking pipeline",
      "No confidence scoring of any kind",
      "Smaller index than Google/Bing-based alternatives",
      "No dedicated CrewAI or LlamaIndex integrations",
      "Python SDK is community-maintained, not first-party",
      "Core search index is closed-source",
    ],
    useCases: [
      "Privacy-conscious web search",
      "Independent search index access",
      "Cost-effective bulk search operations",
    ],
    browseaiAdvantages: [
      "Complete research pipeline (search + extract + verify + synthesize) vs. raw results",
      "BrowseAI Dev actually uses Brave as one of its search providers for source diversity",
      "Claim verification, contradiction detection, and consensus scoring on top of search",
      "7-factor evidence-backed confidence scores",
      "Both have MCP servers — BrowseAI Dev adds LangChain, CrewAI, LlamaIndex integrations",
      "Full pipeline is open-source and self-hostable",
    ],
    seoTitle: "BrowseAI Dev vs Brave Search API — AI Research vs Raw Search",
    seoDescription:
      "Compare BrowseAI Dev and Brave Search API. BrowseAI Dev adds AI synthesis, claim verification, and confidence scoring. BrowseAI Dev even uses Brave as one of its search providers.",
  },
};

// --- Detail Page ---

const AlternativeDetail = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const competitor = slug ? COMPETITOR_DETAILS[slug] : null;

  if (!competitor) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Competitor not found</h1>
          <Button onClick={() => navigate("/alternatives")}>
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to comparisons
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <SEO
        title={competitor.seoTitle}
        description={competitor.seoDescription}
        canonical={`/alternatives/${competitor.slug}`}
        structuredData={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: competitor.seoTitle,
          description: competitor.seoDescription,
          url: `https://browseai.dev/alternatives/${competitor.slug}`,
          author: { "@type": "Organization", name: "BrowseAI Dev" },
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/alternatives")}
            >
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
              onClick={() => navigate("/alternatives")}
            >
              All Comparisons
            </Button>
          </div>
        </motion.nav>

        <div className="max-w-4xl mx-auto px-6 py-12 space-y-12">
          {/* Header */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <Badge variant="outline" className="text-xs">
              vs. {competitor.name}
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              BrowseAI Dev vs. {competitor.name}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              {competitor.description}
            </p>
            <p className="text-sm text-muted-foreground">
              Pricing: {competitor.pricing}
            </p>
          </motion.section>

          {/* Side-by-side */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {/* Competitor strengths */}
            <div className="p-5 rounded-lg border border-border bg-card space-y-4">
              <h3 className="font-medium text-lg">
                {competitor.name} strengths
              </h3>
              <ul className="space-y-2">
                {competitor.strengths.map((s) => (
                  <li
                    key={s}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            {/* Competitor weaknesses */}
            <div className="p-5 rounded-lg border border-border bg-card space-y-4">
              <h3 className="font-medium text-lg">
                Where {competitor.name} falls short
              </h3>
              <ul className="space-y-2">
                {competitor.weaknesses.map((w) => (
                  <li
                    key={w}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <XCircle className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </motion.section>

          {/* Why BrowseAI Dev */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="p-6 rounded-lg border border-emerald-400/20 bg-emerald-400/5 space-y-4"
          >
            <h3 className="font-medium text-lg flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              Why choose BrowseAI Dev over {competitor.name}
            </h3>
            <ul className="space-y-2">
              {competitor.browseaiAdvantages.map((a) => (
                <li
                  key={a}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </motion.section>

          {/* Best use cases */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-4"
          >
            <h3 className="font-medium text-lg">
              When {competitor.name} might be enough
            </h3>
            <p className="text-sm text-muted-foreground">
              If your use case doesn't require verification, confidence scoring,
              or contradiction detection, {competitor.name} can work for:
            </p>
            <div className="flex flex-wrap gap-2">
              {competitor.useCases.map((uc) => (
                <Badge key={uc} variant="outline" className="text-xs">
                  {uc}
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              But if your AI agent needs to <em>know what it can trust</em>,
              BrowseAI Dev's verification pipeline is purpose-built for that.
            </p>
          </motion.section>

          {/* CTA */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="text-center py-8 space-y-4 border-t border-border"
          >
            <h2 className="text-2xl font-bold">See the difference yourself</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Try the same query with raw LLM output vs. BrowseAI Dev's
              evidence-backed pipeline.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={() => navigate("/compare")}>
                <GitCompare className="w-4 h-4 mr-1.5" />
                Live Compare
              </Button>
              <Button variant="outline" onClick={() => navigate("/playground")}>
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

export default AlternativeDetail;
