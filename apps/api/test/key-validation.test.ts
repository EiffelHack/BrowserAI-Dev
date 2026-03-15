import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Unit tests for Tavily error categorization ──

describe("Tavily error categorization", () => {
  let tavilyModule: typeof import("../src/lib/tavily.js");

  beforeEach(async () => {
    tavilyModule = await import("../src/lib/tavily.js");
  });

  it("tavilySearch throws specific error on 401 (invalid key)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
      headers: new Headers(),
    }));

    await expect(
      tavilyModule.tavilySearch("test query", "bad-key")
    ).rejects.toThrow("Invalid Tavily API key");
  });

  it("tavilySearch throws expired error on 403 with expired body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "API key expired. Please renew your plan.",
      headers: new Headers(),
    }));

    await expect(
      tavilyModule.tavilySearch("test query", "expired-key")
    ).rejects.toThrow("expired or trial ended");
  });

  it("tavilySearch throws forbidden error on 403 without expired body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
      headers: new Headers(),
    }));

    await expect(
      tavilyModule.tavilySearch("test query", "blocked-key")
    ).rejects.toThrow("forbidden");
  });

  it("tavilySearch throws credits error on 402", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => "Payment required",
      headers: new Headers(),
    }));

    await expect(
      tavilyModule.tavilySearch("test query", "no-credits-key")
    ).rejects.toThrow("credits exhausted");
  });

  it("tavilySearch throws rate limit error on 429", async () => {
    // 429 is retryable, so fetchWithRetry will retry then return the response.
    // We need to mock fetch to always return 429.
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: false,
        status: 429,
        text: async () => "Rate limited",
        headers: new Headers(),
      };
    }));

    await expect(
      tavilyModule.tavilySearch("test query", "rate-limited-key")
    ).rejects.toThrow("rate limit");

    // Should have retried (maxRetries: 2 = 3 total attempts)
    expect(callCount).toBe(3);
  });
});

describe("validateTavilyKey", () => {
  let tavilyModule: typeof import("../src/lib/tavily.js");

  beforeEach(async () => {
    tavilyModule = await import("../src/lib/tavily.js");
  });

  it("returns valid for a working key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [], query: "test" }),
    }));

    const result = await tavilyModule.validateTavilyKey("tvly-valid-key");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns invalid with message for bad key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    }));

    const result = await tavilyModule.validateTavilyKey("tvly-bad-key");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid Tavily API key");
  });

  it("returns invalid with message for expired key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => "API key expired",
    }));

    const result = await tavilyModule.validateTavilyKey("tvly-expired");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("handles network errors gracefully", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const result = await tavilyModule.validateTavilyKey("tvly-test");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("ECONNREFUSED");
  });
});

// ── Error response mapping tests ──

describe("errorResponse mapping", () => {
  // We test the error mapping logic by simulating what browse.ts does
  function errorResponse(e: any, fallbackMsg: string): { status: number; error: string } {
    if (e.statusCode && e.message) return { status: e.statusCode, error: e.message };
    const msg = e.message || "";
    if (msg.includes("expired") || msg.includes("trial ended")) return { status: 402, error: msg };
    if (msg.includes("credits exhausted") || msg.includes("Top up")) return { status: 402, error: msg };
    if (msg.includes("forbidden") || msg.includes("revoked")) return { status: 403, error: msg };
    const isKeyError = msg.includes("Invalid") && msg.includes("key");
    if (isKeyError) return { status: 401, error: msg || "Invalid API key. Check your key in Settings." };
    if (msg.includes("Rate limit") || msg.includes("rate limit") || msg.includes("429")) return { status: 429, error: "Rate limit exceeded. Please try again in a minute." };
    if (msg.includes("credits") || msg.includes("insufficient") || msg.includes("402")) return { status: 402, error: "Insufficient API credits. Top up your Tavily or OpenRouter account." };
    if (msg.includes("No search results")) return { status: 404, error: "No results found. Try rephrasing your question." };
    if (msg.includes("Tavily") || msg.includes("search failed")) return { status: 502, error: "Search service temporarily unavailable. Please try again." };
    if (msg.includes("LLM") || msg.includes("parse")) return { status: 502, error: "AI processing error. Please try again." };
    return { status: 500, error: fallbackMsg };
  }

  it("maps expired key error to 402", () => {
    const result = errorResponse(
      new Error("Tavily API key expired or trial ended. Upgrade your Tavily plan at app.tavily.com."),
      "fail"
    );
    expect(result.status).toBe(402);
    expect(result.error).toContain("expired");
  });

  it("maps invalid key error to 401", () => {
    const result = errorResponse(
      new Error("Invalid Tavily API key. Check your key in Settings."),
      "fail"
    );
    expect(result.status).toBe(401);
    expect(result.error).toContain("Invalid");
  });

  it("maps forbidden/revoked key to 403", () => {
    const result = errorResponse(
      new Error("Tavily API key forbidden. Your key may be revoked or restricted."),
      "fail"
    );
    expect(result.status).toBe(403);
    expect(result.error).toContain("forbidden");
  });

  it("maps credits exhausted to 402", () => {
    const result = errorResponse(
      new Error("Tavily API credits exhausted. Top up your account at app.tavily.com."),
      "fail"
    );
    expect(result.status).toBe(402);
    expect(result.error).toContain("credits exhausted");
  });

  it("maps rate limit to 429", () => {
    const result = errorResponse(
      new Error("Tavily rate limit exceeded. Please wait a moment and try again."),
      "fail"
    );
    expect(result.status).toBe(429);
  });

  it("maps no search results to 404", () => {
    const result = errorResponse(new Error("No search results found"), "fail");
    expect(result.status).toBe(404);
  });

  it("maps unknown errors to fallback", () => {
    const result = errorResponse(new Error("Something weird happened"), "Search failed");
    expect(result.status).toBe(500);
    expect(result.error).toBe("Search failed");
  });

  it("maps statusCode-bearing errors directly", () => {
    const result = errorResponse({ statusCode: 401, message: "Invalid BrowseAI Dev API key." }, "fail");
    expect(result.status).toBe(401);
    expect(result.error).toBe("Invalid BrowseAI Dev API key.");
  });
});

// ── BYOK rate limit bypass tests ──

describe("BYOK rate limit bypass", () => {
  it("only marks isOwnKeys=true when tavily key is provided and long enough", () => {
    // Simulate the BYOK logic from browse.ts
    function checkByok(tavilyKey?: string, openrouterKey?: string) {
      if (tavilyKey || openrouterKey) {
        const hasTavilyKey = !!tavilyKey && tavilyKey.length >= 10;
        return { isOwnKeys: hasTavilyKey };
      }
      return { isOwnKeys: false };
    }

    // Valid tavily key → bypasses demo limit
    expect(checkByok("tvly-abcdefgh123", "sk-or-test").isOwnKeys).toBe(true);

    // Short/garbage tavily key → does NOT bypass demo limit
    expect(checkByok("bad", "sk-or-test").isOwnKeys).toBe(false);

    // No tavily key, only openrouter → does NOT bypass demo limit
    expect(checkByok(undefined, "sk-or-test").isOwnKeys).toBe(false);

    // Empty string tavily key → does NOT bypass
    expect(checkByok("", "sk-or-test").isOwnKeys).toBe(false);

    // No keys at all → demo
    expect(checkByok().isOwnKeys).toBe(false);
  });
});
