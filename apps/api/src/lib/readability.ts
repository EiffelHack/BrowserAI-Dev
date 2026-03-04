import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export type ParsedPage = {
  title: string;
  content: string;
  excerpt: string;
  siteName: string | null;
  byline: string | null;
};

export async function fetchAndParse(url: string): Promise<ParsedPage> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BrowseAI/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }

  const html = await res.text();
  const { document } = parseHTML(html);
  const reader = new Readability(document as any);
  const article = reader.parse();

  if (!article) {
    throw new Error(`Readability could not parse ${url}`);
  }

  return {
    title: article.title,
    content: article.textContent,
    excerpt: article.excerpt || "",
    siteName: article.siteName,
    byline: article.byline,
  };
}
