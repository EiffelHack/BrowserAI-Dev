import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getAuthUser, isAdmin, requireAdmin } from "../lib/admin.js";

const WaitlistSchema = z.object({
  email: z.string().email(),
  source: z.string().optional(),
});

// Simple in-memory rate limit for waitlist signups (5/hour per IP)
const waitlistRateMap = new Map<string, { count: number; resetAt: number }>();
function checkWaitlistRate(ip: string): boolean {
  const now = Date.now();
  const entry = waitlistRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    waitlistRateMap.set(ip, { count: 1, resetAt: now + 3600_000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}

export function registerWaitlistRoutes(
  app: FastifyInstance,
  supabaseUrl: string,
  serviceRoleKey: string
) {
  // Admin-only: list waitlist signups
  app.get("/waitlist", async (request, reply) => {
    const admin = await requireAdmin(request, supabaseUrl, serviceRoleKey);
    if (!admin) return reply.status(403).send({ success: false, error: "Forbidden" });

    const res = await fetch(
      `${supabaseUrl}/rest/v1/waitlist?select=id,email,source,created_at&order=created_at.desc`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "count=exact",
        },
      }
    );
    if (!res.ok) {
      return reply.status(500).send({ success: false, error: "Failed to fetch waitlist" });
    }
    const entries = await res.json();
    const count = res.headers.get("content-range")?.split("/")[1];
    return reply.send({
      success: true,
      result: { entries, total: count ? parseInt(count) : entries.length },
    });
  });

  // Check if logged-in user is on waitlist + admin status
  app.get("/waitlist/status", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const userData = await getAuthUser(supabaseUrl, serviceRoleKey, authHeader.slice(7));
    if (!userData) {
      return reply.status(401).send({ success: false, error: "Unauthorized" });
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/waitlist?email=eq.${encodeURIComponent(userData.email)}&select=id`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) {
      return reply.status(500).send({ success: false, error: "Failed to check waitlist" });
    }
    const rows = await res.json();
    const admin = await isAdmin(supabaseUrl, serviceRoleKey, userData.email);
    return reply.send({ success: true, result: { onWaitlist: rows.length > 0, isAdmin: admin } });
  });

  app.post("/waitlist", async (request, reply) => {
    const ip = request.ip || "unknown";
    if (!checkWaitlistRate(ip)) {
      return reply.status(429).send({ success: false, error: "Too many signups, try again later" });
    }

    const parsed = WaitlistSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: "Invalid email" });
    }

    const { email } = parsed.data;

    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/waitlist`, {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          email,
          source: parsed.data.source || "landing_page",
        }),
      });

      if (res.status === 409) {
        return reply.send({ success: true, message: "Already on the list" });
      }

      if (!res.ok) {
        console.warn("Waitlist insert failed:", res.status);
        return reply.status(500).send({ success: false, error: "Failed to join waitlist" });
      }

      return reply.send({ success: true, message: "You're on the list" });
    } catch (e) {
      console.error("Waitlist error:", e);
      return reply.status(500).send({ success: false, error: "Server error" });
    }
  });
}
