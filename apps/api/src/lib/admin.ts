import type { FastifyRequest } from "fastify";

export async function getAuthUser(supabaseUrl: string, serviceRoleKey: string, token: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function isAdmin(supabaseUrl: string, serviceRoleKey: string, email: string): Promise<boolean> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/admins?email=eq.${encodeURIComponent(email)}&select=id`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!res.ok) return false;
  const rows = await res.json();
  return rows.length > 0;
}

export async function requireAdmin(
  request: FastifyRequest,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ email: string } | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const userData = await getAuthUser(supabaseUrl, serviceRoleKey, authHeader.slice(7));
  if (!userData) return null;

  if (!(await isAdmin(supabaseUrl, serviceRoleKey, userData.email))) return null;

  return { email: userData.email };
}
