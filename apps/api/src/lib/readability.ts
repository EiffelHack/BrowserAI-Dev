import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { sanitizeText } from "./sanitize.js";
import { fetchWithRetry } from "./retry.js";

export type ParsedPage = {
  title: string;
  content: string;
  excerpt: string;
  siteName: string | null;
  byline: string | null;
  /** ISO date string extracted from meta tags, URL, or content. null if unknown. */
  publishedDate: string | null;
};

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const hostname = parsed.hostname;
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("169.254.") ||
      hostname === "[::1]" ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) return false;

    // Block IPv6-mapped IPv4 addresses (e.g. ::ffff:127.0.0.1)
    if (hostname.includes("::ffff:")) return false;

    // Block octal IP notation (e.g. 0177.0.0.1)
    if (/^0\d/.test(hostname)) return false;

    // Block decimal IP notation (e.g. 2130706433 = 127.0.0.1)
    if (/^\d+$/.test(hostname)) return false;

    // Warn on non-HTTPS URLs — HTTP is higher SSRF risk
    if (parsed.protocol === "http:") {
      console.warn(`[SSRF] Non-HTTPS URL requested: ${url}`);
    }

    return true;
  } catch {
    return false;
  }
}

// ─── Date Extraction ──────────────────────────────────────────────

/** Try to extract a publication date from HTML meta tags. */
function extractDateFromMeta(document: { querySelector: (s: string) => { getAttribute: (a: string) => string | null } | null }): string | null {
  // Priority order: most specific → least specific
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="date"]',
    'meta[name="publish-date"]',
    'meta[name="publication_date"]',
    'meta[name="DC.date.issued"]',
    'meta[property="og:article:published_time"]',
    'meta[name="sailthru.date"]',
    'time[datetime]',
    'meta[name="last-modified"]',
    'meta[property="article:modified_time"]',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const value = sel.includes("time[") ? el.getAttribute("datetime") : el.getAttribute("content");
    if (value) {
      const parsed = parseLooseDate(value);
      if (parsed) return parsed;
    }
  }

  return null;
}

/** Try to extract a date from a URL path (e.g. /2024/03/15/article-name). */
function extractDateFromUrl(url: string): string | null {
  // Match /YYYY/MM/DD/ or /YYYY/MM/ patterns
  const match = url.match(/\/(\d{4})\/(0[1-9]|1[0-2])(?:\/(0[1-9]|[12]\d|3[01]))?(?:\/|$)/);
  if (match) {
    const year = parseInt(match[1]);
    if (year >= 1990 && year <= 2030) {
      const month = match[2];
      const day = match[3] || "01";
      return `${year}-${month}-${day}`;
    }
  }
  // Match /YYYY-MM-DD- in slug patterns
  const slugMatch = url.match(/\/(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-/);
  if (slugMatch) {
    const year = parseInt(slugMatch[1]);
    if (year >= 1990 && year <= 2030) {
      return `${year}-${slugMatch[2]}-${slugMatch[3]}`;
    }
  }
  return null;
}

/** Parse a loose date string into ISO format (YYYY-MM-DD). Returns null if unparseable. */
function parseLooseDate(dateStr: string): string | null {
  try {
    // Try ISO format first
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      if (year >= 1990 && year <= 2030) {
        return d.toISOString().split("T")[0];
      }
    }
  } catch { /* ignore */ }
  return null;
}

export async function fetchAndParse(url: string): Promise<ParsedPage> {
  if (!isAllowedUrl(url)) {
    throw new Error("URL not allowed: only public http/https URLs are supported");
  }

  // Note: fetch follows redirects by default. For enterprise endpoints in
  // searchProvider.ts this is mitigated by the HTTPS-only requirement, which
  // prevents redirect-to-internal-IP attacks. For readability fetches, the
  // isAllowedUrl pre-check reduces risk but cannot guard against DNS rebinding
  // or redirect chains to internal IPs post-resolution.
  const res = await fetchWithRetry(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BrowseAI-Dev/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(10000),
  }, { maxRetries: 1 });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  const html = await res.text();
  const { document } = parseHTML(html);

  // Extract publication date before Readability strips meta tags
  const publishedDate = extractDateFromMeta(document) || extractDateFromUrl(url);

  // linkedom's Document type is compatible but not identical to Readability's expected Document
  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();

  if (!article) {
    throw new Error(`Readability could not parse ${url}`);
  }

  return {
    title: sanitizeText(article.title ?? ""),
    content: sanitizeText(article.textContent ?? ""),
    excerpt: sanitizeText(article.excerpt || ""),
    siteName: article.siteName ? sanitizeText(article.siteName) : null,
    byline: article.byline ? sanitizeText(article.byline) : null,
    publishedDate,
  };
}
