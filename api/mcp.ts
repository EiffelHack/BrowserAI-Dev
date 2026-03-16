import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const VERSION = "0.1.6";
const BROWSE_API_URL = process.env.BROWSE_API_URL || "https://browseai.dev/api";

async function apiCall(apiKey: string, path: string, body: Record<string, unknown>) {
  const res = await fetch(`${BROWSE_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || `API failed: ${res.status}`);
  return data.result;
}

function registerTools(server: McpServer, apiKey: string) {
  server.tool(
    "browse_search",
    "Search the web for information on a topic. Returns URLs, titles, snippets, and relevance scores.",
    { query: z.string(), limit: z.number().optional() },
    async ({ query, limit }) => {
      const result = await apiCall(apiKey, "/browse/search", { query, limit: limit ?? 5 });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "browse_open",
    "Fetch and parse a web page into clean text using Readability. Strips ads, nav, and boilerplate.",
    { url: z.string() },
    async ({ url }) => {
      const result = await apiCall(apiKey, "/browse/open", { url });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "browse_extract",
    "Extract structured knowledge (claims + sources + confidence) from a single web page using AI.",
    { url: z.string(), query: z.string().optional() },
    async ({ url, query }) => {
      const result = await apiCall(apiKey, "/browse/extract", { url, query });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "browse_answer",
    "Full deep research pipeline: search the web, fetch pages, extract claims, build evidence graph, and generate a structured answer with citations and confidence score.",
    { query: z.string() },
    async ({ query }) => {
      const result = await apiCall(apiKey, "/browse/answer", { query });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "browse_compare",
    "Compare a raw LLM answer (no sources) vs an evidence-backed answer. Shows the difference between hallucination-prone and grounded responses.",
    { query: z.string() },
    async ({ query }) => {
      const result = await apiCall(apiKey, "/browse/compare", { query });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
}

export const config = {
  supportsResponseStreaming: true,
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  // CORS
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, X-API-Key, Authorization");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }

  // Health check on GET
  if (req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 200;
    res.end(JSON.stringify({ status: "ok", version: VERSION, transport: "streamable-http" }));
    return;
  }

  // Users must bring their own API key via headers
  const apiKey = (req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "") || "") as string;
  if (!apiKey) {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "API key required. Pass via X-API-Key header or Authorization: Bearer <key>. Get one at https://browseai.dev/dashboard" }));
    return;
  }

  // Stateless transport — no session persistence (works with serverless)
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const server = new McpServer({
    name: "browseai-dev",
    version: VERSION,
  });
  registerTools(server, apiKey);
  await server.connect(transport);
  await transport.handleRequest(req, res);

  // Clean up
  await server.close();
}
