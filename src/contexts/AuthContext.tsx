import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearTokenCache } from "@/lib/api/auth";

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signInWithGitHub: (redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (window as unknown as Record<string, unknown>).posthog &&
          (window as unknown as { posthog: { identify: (id: string, props: Record<string, unknown>) => void } }).posthog.identify(
            session.user.id,
            { email: session.user.email, name: session.user.user_metadata?.full_name }
          );
      } else {
        (window as unknown as Record<string, unknown>).posthog &&
          (window as unknown as { posthog: { reset: () => void } }).posthog.reset();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Validate redirect path to prevent open redirect attacks
  const safeRedirectUrl = (redirectTo?: string): string => {
    if (!redirectTo) return window.location.origin;
    // Strip to pathname only — never allow external URLs
    try {
      const url = new URL(redirectTo, window.location.origin);
      // Only allow same-origin redirects
      if (url.origin !== window.location.origin) return window.location.origin;
      return `${window.location.origin}${url.pathname}${url.search}`;
    } catch {
      // If parsing fails, only allow paths starting with /
      if (/^\/[a-zA-Z0-9/_\-?&=%.]*$/.test(redirectTo)) {
        return `${window.location.origin}${redirectTo}`;
      }
      return window.location.origin;
    }
  };

  const signInWithGoogle = async (redirectTo?: string) => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: safeRedirectUrl(redirectTo) },
    });
  };

  const signInWithGitHub = async (redirectTo?: string) => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: safeRedirectUrl(redirectTo) },
    });
  };

  const signOut = async () => {
    clearTokenCache();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signInWithGitHub, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
