/**
 * BrowseAI Benchmark Seeder
 *
 * Runs 150 diverse queries through the BrowseAI answer API and 20 through compare,
 * then prints a summary and saves compare results for marketing use.
 *
 * Usage:
 *   npx tsx scripts/seed-benchmark.ts
 *
 * Env:
 *   BROWSE_API_KEY  — optional, falls back to the default bai key
 */

const API_BASE = process.env.API_BASE || "https://browseai.dev/api/browse";
const API_KEY = process.env.BROWSE_API_KEY || "";
if (!API_KEY && !process.env.SERP_API_KEY) {
  console.error("Set BROWSE_API_KEY or SERP_API_KEY + OPENROUTER_API_KEY env vars");
  process.exit(1);
}

// Skip first N queries (for resuming after a stop)
const SKIP = parseInt(process.env.SKIP || "0", 10);

// BYOK headers — if provided, use these directly instead of bai_ key
const TAVILY_KEY = process.env.SERP_API_KEY || process.env.TAVILY_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

const CONCURRENCY = parseInt(process.env.CONCURRENCY || "1", 10);
const QUERY_DELAY_MS = parseInt(process.env.DELAY_MS || "30000", 10); // delay between queries (30s default to avoid Tavily rate limits)
const MAX_RETRIES = 3;

// ── Benchmark queries ──────────────────────────────────────────────

interface BenchmarkQuery {
  category: string;
  query: string;
}

const QUERIES: BenchmarkQuery[] = [
  // ── Science & Technology (13) ──
  { category: "Science & Technology", query: "How do quantum computers achieve quantum supremacy over classical computers?" },
  { category: "Science & Technology", query: "What is CRISPR-Cas9 and how does it enable gene editing?" },
  { category: "Science & Technology", query: "What is the current state of nuclear fusion energy research?" },
  { category: "Science & Technology", query: "How do mRNA vaccines work at the molecular level?" },
  { category: "Science & Technology", query: "What are the main approaches to achieving room-temperature superconductivity?" },
  { category: "Science & Technology", query: "How does neuromorphic computing differ from traditional computing architectures?" },
  { category: "Science & Technology", query: "What are metamaterials and what applications do they enable?" },
  { category: "Science & Technology", query: "How does quantum entanglement work and can it be used for communication?" },
  { category: "Science & Technology", query: "What is the current status of solid-state battery development?" },
  { category: "Science & Technology", query: "How do brain-computer interfaces like Neuralink work?" },
  { category: "Science & Technology", query: "What is topological quantum computing and why is Microsoft pursuing it?" },
  { category: "Science & Technology", query: "How does 6G technology differ from 5G and when is it expected?" },
  { category: "Science & Technology", query: "What are the latest breakthroughs in carbon nanotube transistors?" },

  // ── History (12) ──
  { category: "History", query: "What caused the fall of the Roman Empire?" },
  { category: "History", query: "How did the Industrial Revolution transform society and labor?" },
  { category: "History", query: "What were the key factors that led to World War I?" },
  { category: "History", query: "How did the Mongol Empire become the largest contiguous land empire?" },
  { category: "History", query: "What was the significance of the Gutenberg printing press?" },
  { category: "History", query: "How did the Cold War shape modern geopolitics?" },
  { category: "History", query: "What were the causes and consequences of the French Revolution?" },
  { category: "History", query: "How did ancient Egyptian civilization develop along the Nile?" },
  { category: "History", query: "What was the impact of the Silk Road on global trade and culture?" },
  { category: "History", query: "How did the Black Death reshape European society?" },
  { category: "History", query: "What led to the rise and fall of the Ottoman Empire?" },
  { category: "History", query: "How did the Renaissance transform European art and science?" },

  // ── Medicine & Health (13) ──
  { category: "Medicine & Health", query: "How do CAR-T cell therapies treat cancer?" },
  { category: "Medicine & Health", query: "What are the health effects of microplastics in the human body?" },
  { category: "Medicine & Health", query: "How does Alzheimer's disease progress and what treatments exist?" },
  { category: "Medicine & Health", query: "What is the gut-brain axis and how does it affect mental health?" },
  { category: "Medicine & Health", query: "How effective are GLP-1 receptor agonists like Ozempic for weight loss?" },
  { category: "Medicine & Health", query: "What are the latest developments in CRISPR-based gene therapies?" },
  { category: "Medicine & Health", query: "How do psychedelic-assisted therapies work for treatment-resistant depression?" },
  { category: "Medicine & Health", query: "What are prions and how do they cause disease?" },
  { category: "Medicine & Health", query: "How does intermittent fasting affect metabolism and longevity?" },
  { category: "Medicine & Health", query: "What is the current state of HIV vaccine research?" },
  { category: "Medicine & Health", query: "How do CRISPR diagnostics like SHERLOCK and DETECTR work?" },
  { category: "Medicine & Health", query: "What role does the microbiome play in autoimmune diseases?" },
  { category: "Medicine & Health", query: "How effective are mRNA vaccines against emerging variants?" },

  // ── Business & Economics (13) ──
  { category: "Business & Economics", query: "How does the Federal Reserve influence inflation through interest rates?" },
  { category: "Business & Economics", query: "What is the current state of the global semiconductor supply chain?" },
  { category: "Business & Economics", query: "How does venture capital funding work in Silicon Valley?" },
  { category: "Business & Economics", query: "What caused the 2008 financial crisis and what reforms followed?" },
  { category: "Business & Economics", query: "How do central bank digital currencies differ from cryptocurrencies?" },
  { category: "Business & Economics", query: "What is Modern Monetary Theory and why is it controversial?" },
  { category: "Business & Economics", query: "How has remote work affected commercial real estate markets?" },
  { category: "Business & Economics", query: "What are the economic implications of an aging population in developed countries?" },
  { category: "Business & Economics", query: "How does the CHIPS Act aim to reshape US semiconductor manufacturing?" },
  { category: "Business & Economics", query: "What is the role of sovereign wealth funds in global finance?" },
  { category: "Business & Economics", query: "How do stock buybacks affect company valuation and shareholders?" },
  { category: "Business & Economics", query: "What are the economic effects of universal basic income experiments?" },
  { category: "Business & Economics", query: "How does quantitative easing work and what are its long-term risks?" },

  // ── AI & Machine Learning (13) ──
  { category: "AI & Machine Learning", query: "How do transformer architectures work in large language models?" },
  { category: "AI & Machine Learning", query: "What is reinforcement learning from human feedback (RLHF)?" },
  { category: "AI & Machine Learning", query: "How do diffusion models generate images from text prompts?" },
  { category: "AI & Machine Learning", query: "What are the main approaches to AI alignment and safety?" },
  { category: "AI & Machine Learning", query: "How does retrieval-augmented generation (RAG) improve LLM accuracy?" },
  { category: "AI & Machine Learning", query: "What is the difference between narrow AI and artificial general intelligence?" },
  { category: "AI & Machine Learning", query: "How do graph neural networks work and what are their applications?" },
  { category: "AI & Machine Learning", query: "What are foundation models and why are they significant?" },
  { category: "AI & Machine Learning", query: "How does federated learning enable privacy-preserving machine learning?" },
  { category: "AI & Machine Learning", query: "What is mixture of experts architecture in modern LLMs?" },
  { category: "AI & Machine Learning", query: "How do AI agents use tool use and function calling?" },
  { category: "AI & Machine Learning", query: "What are the current limitations of large language models?" },
  { category: "AI & Machine Learning", query: "How does constitutional AI differ from RLHF?" },

  // ── Environment & Climate (12) ──
  { category: "Environment & Climate", query: "What are the main feedback loops accelerating climate change?" },
  { category: "Environment & Climate", query: "How effective are carbon capture and storage technologies?" },
  { category: "Environment & Climate", query: "What is the current state of global biodiversity loss?" },
  { category: "Environment & Climate", query: "How do offshore wind farms work and what is their environmental impact?" },
  { category: "Environment & Climate", query: "What role do oceans play in absorbing CO2 and regulating climate?" },
  { category: "Environment & Climate", query: "How effective are electric vehicles at reducing overall emissions?" },
  { category: "Environment & Climate", query: "What is the Paris Agreement and are countries meeting their targets?" },
  { category: "Environment & Climate", query: "How does deforestation in the Amazon affect global weather patterns?" },
  { category: "Environment & Climate", query: "What are the environmental impacts of lithium mining for batteries?" },
  { category: "Environment & Climate", query: "How do heat pumps compare to traditional HVAC systems for emissions?" },
  { category: "Environment & Climate", query: "What is ocean acidification and how does it affect marine ecosystems?" },
  { category: "Environment & Climate", query: "How feasible is green hydrogen as a replacement for fossil fuels?" },

  // ── Space & Astronomy (12) ──
  { category: "Space & Astronomy", query: "What is a black hole and how does Hawking radiation work?" },
  { category: "Space & Astronomy", query: "What are the latest findings from the James Webb Space Telescope?" },
  { category: "Space & Astronomy", query: "How does SpaceX's Starship differ from previous launch vehicles?" },
  { category: "Space & Astronomy", query: "What are exoplanets and how do astronomers detect them?" },
  { category: "Space & Astronomy", query: "What is dark matter and what evidence supports its existence?" },
  { category: "Space & Astronomy", query: "How do gravitational waves reveal information about the universe?" },
  { category: "Space & Astronomy", query: "What are the current plans for human Mars missions?" },
  { category: "Space & Astronomy", query: "How does the Artemis program aim to return humans to the Moon?" },
  { category: "Space & Astronomy", query: "What is the Fermi Paradox and what are the leading explanations?" },
  { category: "Space & Astronomy", query: "How do neutron stars form and what makes magnetars special?" },
  { category: "Space & Astronomy", query: "What is the multiverse theory and is there any evidence for it?" },
  { category: "Space & Astronomy", query: "How do ion propulsion engines work for deep space missions?" },

  // ── Politics & Law (12) ──
  { category: "Politics & Law", query: "How does the US Supreme Court decide which cases to hear?" },
  { category: "Politics & Law", query: "What is the European Union's AI Act and what does it regulate?" },
  { category: "Politics & Law", query: "How does the Electoral College work in US presidential elections?" },
  { category: "Politics & Law", query: "What is international humanitarian law and when does it apply?" },
  { category: "Politics & Law", query: "How do sanctions work as a tool of foreign policy?" },
  { category: "Politics & Law", query: "What is the International Criminal Court and what authority does it have?" },
  { category: "Politics & Law", query: "How does the GDPR regulate data privacy in Europe?" },
  { category: "Politics & Law", query: "What is gerrymandering and how does it affect elections?" },
  { category: "Politics & Law", query: "How do antitrust laws apply to big tech companies?" },
  { category: "Politics & Law", query: "What is the difference between common law and civil law systems?" },
  { category: "Politics & Law", query: "How does the World Trade Organization resolve trade disputes?" },
  { category: "Politics & Law", query: "What are the legal frameworks governing autonomous weapons?" },

  // ── Culture & Society (12) ──
  { category: "Culture & Society", query: "How has social media changed political discourse and polarization?" },
  { category: "Culture & Society", query: "What are the demographic trends in global population growth?" },
  { category: "Culture & Society", query: "How does the digital divide affect educational outcomes worldwide?" },
  { category: "Culture & Society", query: "What is the creator economy and how big is it?" },
  { category: "Culture & Society", query: "How has streaming changed the music industry's revenue model?" },
  { category: "Culture & Society", query: "What are the societal impacts of widespread AI adoption on employment?" },
  { category: "Culture & Society", query: "How do different cultures approach work-life balance?" },
  { category: "Culture & Society", query: "What is the loneliness epidemic and what causes it?" },
  { category: "Culture & Society", query: "How has urbanization changed family structures globally?" },
  { category: "Culture & Society", query: "What role does misinformation play in public health crises?" },
  { category: "Culture & Society", query: "How do language preservation efforts work for endangered languages?" },
  { category: "Culture & Society", query: "What is the impact of AI-generated content on creative industries?" },

  // ── Current Events & Tech Industry (13) ──
  { category: "Current Events & Tech Industry", query: "What is Apple's Vision Pro and how does spatial computing work?" },
  { category: "Current Events & Tech Industry", query: "How is OpenAI structured and what is its relationship with Microsoft?" },
  { category: "Current Events & Tech Industry", query: "What are the latest developments in autonomous vehicle regulation?" },
  { category: "Current Events & Tech Industry", query: "How has the AI chip market evolved with Nvidia's dominance?" },
  { category: "Current Events & Tech Industry", query: "What is the current state of the TikTok ban debate in the US?" },
  { category: "Current Events & Tech Industry", query: "How are tech companies implementing responsible AI practices?" },
  { category: "Current Events & Tech Industry", query: "What is the Fediverse and how does it differ from centralized social media?" },
  { category: "Current Events & Tech Industry", query: "How is the EU Digital Markets Act affecting big tech companies?" },
  { category: "Current Events & Tech Industry", query: "What are the latest trends in cybersecurity threats and defenses?" },
  { category: "Current Events & Tech Industry", query: "How has the AI boom affected energy consumption in data centers?" },
  { category: "Current Events & Tech Industry", query: "What is the current state of quantum computing commercialization?" },
  { category: "Current Events & Tech Industry", query: "How are AI coding assistants changing software development?" },
  { category: "Current Events & Tech Industry", query: "What is edge AI and why is on-device inference important?" },

  // ── Controversial / Nuanced Topics (12) ──
  { category: "Controversial / Nuanced", query: "Is nuclear energy safe and should it be expanded to fight climate change?" },
  { category: "Controversial / Nuanced", query: "What are the arguments for and against universal basic income?" },
  { category: "Controversial / Nuanced", query: "Does social media cause mental health problems in teenagers?" },
  { category: "Controversial / Nuanced", query: "Is cryptocurrency a viable alternative to traditional banking?" },
  { category: "Controversial / Nuanced", query: "What are the ethical concerns around facial recognition technology?" },
  { category: "Controversial / Nuanced", query: "Should AI-generated art be eligible for copyright protection?" },
  { category: "Controversial / Nuanced", query: "Is organic food significantly healthier than conventionally grown food?" },
  { category: "Controversial / Nuanced", query: "What are the pros and cons of genetic engineering in agriculture?" },
  { category: "Controversial / Nuanced", query: "Does remote work improve or hurt productivity compared to office work?" },
  { category: "Controversial / Nuanced", query: "Should there be an AI moratorium until safety is better understood?" },
  { category: "Controversial / Nuanced", query: "Is space colonization a realistic solution to Earth's problems?" },
  { category: "Controversial / Nuanced", query: "Are standardized tests a fair measure of student ability?" },

  // ── Comparison Questions (13) ──
  { category: "Comparison", query: "How does GPT-4 compare to Claude in terms of capabilities and safety?" },
  { category: "Comparison", query: "What are the differences between TCP and UDP protocols?" },
  { category: "Comparison", query: "How does React compare to Vue.js for frontend development?" },
  { category: "Comparison", query: "What are the key differences between Python and Rust for systems programming?" },
  { category: "Comparison", query: "How does solar energy compare to wind energy in cost and efficiency?" },
  { category: "Comparison", query: "What are the differences between SQL and NoSQL databases?" },
  { category: "Comparison", query: "How does the US healthcare system compare to the UK's NHS?" },
  { category: "Comparison", query: "Kubernetes vs Docker Swarm: which is better for container orchestration?" },
  { category: "Comparison", query: "How does SpaceX compare to Blue Origin in rocket technology?" },
  { category: "Comparison", query: "What are the differences between capitalism and socialism in practice?" },
  { category: "Comparison", query: "How does RISC-V compare to ARM processor architecture?" },
  { category: "Comparison", query: "What are the pros and cons of TypeScript vs JavaScript?" },
  { category: "Comparison", query: "How does Postgres compare to MySQL for modern applications?" },
];

// Pick 20 queries for compare (mix of comparison + controversial)
const COMPARE_QUERIES = QUERIES.filter(
  (q) =>
    q.category === "Comparison" || q.category === "Controversial / Nuanced"
).slice(0, 20);

// ── Types ──────────────────────────────────────────────────────────

interface BrowseSource {
  url: string;
  title: string;
  domain: string;
  quote: string;
  verified?: boolean;
  authority?: number;
}

interface BrowseClaim {
  claim: string;
  sources: string[];
  verified?: boolean;
  verificationScore?: number;
  consensusCount?: number;
  consensusLevel?: string;
}

interface Contradiction {
  claimA: string;
  claimB: string;
  topic: string;
}

interface BrowseResult {
  answer: string;
  claims: BrowseClaim[];
  sources: BrowseSource[];
  confidence: number;
  trace: { step: string; duration_ms: number; detail?: string }[];
  contradictions?: Contradiction[];
  shareId?: string;
}

interface CompareResult {
  query: string;
  raw_llm: { answer: string; sources: number; claims: number; confidence: null };
  evidence_backed: {
    answer: string;
    sources: number;
    claims: number;
    confidence: number;
    citations: BrowseSource[];
    claimDetails: BrowseClaim[];
    trace: BrowseResult["trace"];
  };
}

interface AnswerApiResponse {
  success: boolean;
  result?: BrowseResult;
  error?: string;
}

interface CompareApiResponse {
  success: boolean;
  result?: CompareResult;
  error?: string;
}

// ── Helpers ────────────────────────────────────────────────────────

const headers: Record<string, string> = {
  "Content-Type": "application/json",
};

// Prefer BYOK headers if available (avoids stored key resolution issues)
if (TAVILY_KEY && OPENROUTER_KEY) {
  headers["X-Tavily-Key"] = TAVILY_KEY;
  headers["X-OpenRouter-Key"] = OPENROUTER_KEY;
  console.log("  Using BYOK headers (Tavily + OpenRouter keys)");
} else {
  headers["Authorization"] = `Bearer ${API_KEY}`;
  console.log("  Using BrowseAI API key");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry<T>(
  url: string,
  body: Record<string, unknown>,
  retries = MAX_RETRIES,
): Promise<{ success: boolean; result?: T; error?: string }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: { success: boolean; result?: T; error?: string };
      try {
        data = JSON.parse(text);
      } catch {
        console.log(`    ✗ Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
        return { success: false, error: `HTTP ${res.status}: ${text.slice(0, 100)}` };
      }
      if (data.success) return data;
      // Rate limit — wait and retry
      if (!data.success && attempt < retries && (data.error?.includes("Rate limit") || data.error?.includes("rate limit") || res.status === 429)) {
        console.log(`    ⟳ Rate limited, retrying in ${10 * (attempt + 1)}s...`);
        await sleep(10_000 * (attempt + 1));
        continue;
      }
      return data;
    } catch (e: any) {
      if (attempt < retries) {
        await sleep(5_000 * (attempt + 1));
        continue;
      }
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: "Max retries exceeded" };
}

async function fetchAnswer(
  query: string
): Promise<{ success: boolean; result?: BrowseResult; error?: string }> {
  return fetchWithRetry<BrowseResult>(`${API_BASE}/answer`, { query });
}

async function fetchCompare(
  query: string
): Promise<{ success: boolean; result?: CompareResult; error?: string }> {
  return fetchWithRetry<CompareResult>(`${API_BASE}/compare`, { query });
}

/** Run promises with a concurrency limit */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
      await sleep(QUERY_DELAY_MS);
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    runNext()
  );
  await Promise.all(workers);
  return results;
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(70));
  console.log("  BrowseAI Benchmark Seeder");
  console.log(`  ${QUERIES.length} answer queries + ${COMPARE_QUERIES.length} compare queries`);
  console.log(`  API: ${API_BASE}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log("=".repeat(70));
  console.log();

  // ── Phase 1: Answer queries ──

  console.log("Phase 1: Running answer queries...\n");

  const answerResults: {
    query: string;
    category: string;
    confidence: number;
    claims: number;
    sources: number;
    contradictions: number;
    domains: string[];
    success: boolean;
    error?: string;
  }[] = [];

  const queriesToRun = SKIP > 0 ? QUERIES.slice(SKIP) : QUERIES;
  if (SKIP > 0) console.log(`  Skipping first ${SKIP} queries (resuming from #${SKIP + 1})\n`);

  const answerTasks = queriesToRun.map((q, idx) => async () => {
    const i = idx + SKIP;
    const startTime = Date.now();
    const data = await fetchAnswer(q.query);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (data.success && data.result) {
      const r = data.result;
      const domains = r.sources.map((s) => s.domain.replace(/^www\./, ""));
      const entry = {
        query: q.query,
        category: q.category,
        confidence: r.confidence,
        claims: r.claims.length,
        sources: r.sources.length,
        contradictions: r.contradictions?.length || 0,
        domains,
        success: true,
      };
      answerResults.push(entry);
      console.log(
        `  [${String(i + 1).padStart(3)}/${QUERIES.length}] ${q.category.padEnd(32)} ` +
          `conf=${(r.confidence * 100).toFixed(0).padStart(3)}%  ` +
          `claims=${String(r.claims.length).padStart(2)}  ` +
          `sources=${String(r.sources.length).padStart(2)}  ` +
          `${elapsed}s`
      );
    } else {
      answerResults.push({
        query: q.query,
        category: q.category,
        confidence: 0,
        claims: 0,
        sources: 0,
        contradictions: 0,
        domains: [],
        success: false,
        error: data.error,
      });
      console.log(
        `  [${String(i + 1).padStart(3)}/${QUERIES.length}] ${q.category.padEnd(32)} ` +
          `FAILED: ${data.error || "unknown error"}  ${elapsed}s`
      );
    }
  });

  await runWithConcurrency(answerTasks, CONCURRENCY);

  console.log();
  console.log("-".repeat(70));

  // ── Phase 2: Compare queries ──

  console.log("\nPhase 2: Running compare queries...\n");
  await sleep(QUERY_DELAY_MS);

  const compareResults: CompareResult[] = [];
  const compareErrors: string[] = [];

  const compareTasks = COMPARE_QUERIES.map((q, i) => async () => {
    const startTime = Date.now();
    const data = await fetchCompare(q.query);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (data.success && data.result) {
      compareResults.push(data.result);
      const eb = data.result.evidence_backed;
      console.log(
        `  [${String(i + 1).padStart(2)}/${COMPARE_QUERIES.length}] ` +
          `${q.query.slice(0, 60).padEnd(60)}  ` +
          `EB conf=${(eb.confidence * 100).toFixed(0).padStart(3)}%  ` +
          `sources=${eb.sources}  ${elapsed}s`
      );
    } else {
      compareErrors.push(data.error || "unknown");
      console.log(
        `  [${String(i + 1).padStart(2)}/${COMPARE_QUERIES.length}] ` +
          `${q.query.slice(0, 60).padEnd(60)}  ` +
          `FAILED: ${data.error}  ${elapsed}s`
      );
    }
  });

  await runWithConcurrency(compareTasks, CONCURRENCY);

  // ── Summary ──────────────────────────────────────────────────────

  console.log();
  console.log("=".repeat(70));
  console.log("  BENCHMARK SUMMARY");
  console.log("=".repeat(70));

  const successful = answerResults.filter((r) => r.success);
  const failed = answerResults.filter((r) => !r.success);

  // Average confidence
  const avgConfidence =
    successful.length > 0
      ? successful.reduce((sum, r) => sum + r.confidence, 0) / successful.length
      : 0;

  // Total claims
  const totalClaims = successful.reduce((sum, r) => sum + r.claims, 0);

  // Total contradictions
  const totalContradictions = successful.reduce(
    (sum, r) => sum + r.contradictions,
    0
  );

  // Unique domains
  const allDomains = successful.flatMap((r) => r.domains);
  const uniqueDomains = new Set(allDomains);

  // Top 10 domains
  const domainCounts = new Map<string, number>();
  for (const d of allDomains) {
    domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
  }
  const top10Domains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Per-category stats
  const categoryStats = new Map<
    string,
    { count: number; totalConf: number; totalClaims: number }
  >();
  for (const r of successful) {
    const s = categoryStats.get(r.category) || {
      count: 0,
      totalConf: 0,
      totalClaims: 0,
    };
    s.count++;
    s.totalConf += r.confidence;
    s.totalClaims += r.claims;
    categoryStats.set(r.category, s);
  }

  console.log();
  console.log(`  Total queries attempted:     ${QUERIES.length}`);
  console.log(`  Successful:                  ${successful.length}`);
  console.log(`  Failed:                      ${failed.length}`);
  console.log(`  Average confidence:          ${(avgConfidence * 100).toFixed(1)}%`);
  console.log(`  Total claims verified:       ${totalClaims}`);
  console.log(`  Total contradictions found:  ${totalContradictions}`);
  console.log(`  Unique domains encountered:  ${uniqueDomains.size}`);

  console.log();
  console.log("  Top 10 Most-Cited Domains:");
  for (const [domain, count] of top10Domains) {
    console.log(`    ${String(count).padStart(4)}x  ${domain}`);
  }

  console.log();
  console.log("  Per-Category Breakdown:");
  for (const [cat, s] of [...categoryStats.entries()].sort(
    (a, b) => b[1].totalConf / b[1].count - a[1].totalConf / a[1].count
  )) {
    const avgCat = ((s.totalConf / s.count) * 100).toFixed(1);
    console.log(
      `    ${cat.padEnd(35)} ${String(s.count).padStart(2)} queries  avg conf=${avgCat.padStart(5)}%  claims=${String(s.totalClaims).padStart(3)}`
    );
  }

  // Compare summary
  console.log();
  console.log("  Compare Results:");
  console.log(`    Total compare queries:     ${COMPARE_QUERIES.length}`);
  console.log(`    Successful:                ${compareResults.length}`);
  console.log(`    Failed:                    ${compareErrors.length}`);

  if (compareResults.length > 0) {
    const ebWins = compareResults.filter(
      (r) => r.evidence_backed.sources > r.raw_llm.sources
    ).length;
    const avgEbConf =
      compareResults.reduce((s, r) => s + r.evidence_backed.confidence, 0) /
      compareResults.length;
    const avgEbSources =
      compareResults.reduce((s, r) => s + r.evidence_backed.sources, 0) /
      compareResults.length;
    const avgEbClaims =
      compareResults.reduce((s, r) => s + r.evidence_backed.claims, 0) /
      compareResults.length;

    console.log(
      `    Evidence-backed beat raw LLM: ${ebWins}/${compareResults.length} (${((ebWins / compareResults.length) * 100).toFixed(0)}%)`
    );
    console.log(`    Avg EB confidence:         ${(avgEbConf * 100).toFixed(1)}%`);
    console.log(`    Avg EB sources per query:   ${avgEbSources.toFixed(1)}`);
    console.log(`    Avg EB claims per query:    ${avgEbClaims.toFixed(1)}`);
  }

  console.log();
  console.log("=".repeat(70));

  // ── Save compare results ────────────────────────────────────────

  const outputPath = new URL("./benchmark-results.json", import.meta.url);
  const outputData = {
    timestamp: new Date().toISOString(),
    summary: {
      totalQueries: QUERIES.length,
      successfulQueries: successful.length,
      failedQueries: failed.length,
      averageConfidence: Math.round(avgConfidence * 1000) / 1000,
      totalClaimsVerified: totalClaims,
      totalContradictions,
      uniqueDomains: uniqueDomains.size,
      top10Domains: top10Domains.map(([domain, count]) => ({ domain, count })),
      categoryBreakdown: [...categoryStats.entries()].map(([cat, s]) => ({
        category: cat,
        queries: s.count,
        averageConfidence:
          Math.round((s.totalConf / s.count) * 1000) / 1000,
        totalClaims: s.totalClaims,
      })),
    },
    compareResults: compareResults.map((r) => ({
      query: r.query,
      raw_llm: {
        answerLength: r.raw_llm.answer.length,
        sources: r.raw_llm.sources,
        claims: r.raw_llm.claims,
      },
      evidence_backed: {
        answerLength: r.evidence_backed.answer.length,
        sources: r.evidence_backed.sources,
        claims: r.evidence_backed.claims,
        confidence: r.evidence_backed.confidence,
        topCitations: r.evidence_backed.citations.slice(0, 3).map((c) => ({
          domain: c.domain,
          title: c.title,
          verified: c.verified,
        })),
      },
    })),
    answerResults: successful.map((r) => ({
      query: r.query,
      category: r.category,
      confidence: r.confidence,
      claims: r.claims,
      sources: r.sources,
      contradictions: r.contradictions,
      topDomains: r.domains.slice(0, 5),
    })),
  };

  const { writeFileSync } = await import("fs");
  const { fileURLToPath } = await import("url");
  const savePath = fileURLToPath(outputPath);
  writeFileSync(savePath, JSON.stringify(outputData, null, 2));
  console.log(`\n  Results saved to: ${savePath}\n`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
