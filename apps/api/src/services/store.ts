import type { BrowseResult } from "@browse/shared";

export interface ResultStore {
  save(query: string, result: BrowseResult): Promise<string>;
  get(id: string): Promise<{ query: string; result: BrowseResult; created_at: string } | null>;
  count(): Promise<number>;
}

export function createSupabaseStore(supabaseUrl: string, serviceRoleKey: string): ResultStore {
  async function supabaseFetch(path: string, options: RequestInit = {}) {
    const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
      ...options,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: options.method === "POST" ? "return=representation" : "return=minimal",
        ...options.headers,
      },
    });
    return res;
  }

  return {
    async save(query: string, result: BrowseResult): Promise<string> {
      const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
      const res = await supabaseFetch("/browse_results", {
        method: "POST",
        body: JSON.stringify({ id, query, result }),
      });
      if (!res.ok) {
        console.warn("Failed to save result:", res.status);
        return id;
      }
      return id;
    },

    async get(id: string) {
      const res = await supabaseFetch(`/browse_results?id=eq.${id}&select=*`);
      if (!res.ok) return null;
      const rows = await res.json();
      return rows[0] || null;
    },

    async count() {
      const res = await supabaseFetch("/browse_results?select=id", {
        headers: { Prefer: "count=exact" },
      });
      const count = res.headers.get("content-range")?.split("/")[1];
      return count ? parseInt(count) : 0;
    },
  };
}

export function createNoopStore(): ResultStore {
  return {
    async save() { return "no-store"; },
    async get() { return null; },
    async count() { return 0; },
  };
}
