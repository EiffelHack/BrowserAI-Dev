import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * After OAuth redirect lands on "/", check if there's a pending fork in sessionStorage.
 * If the user is now signed in, navigate them back to the shared session page
 * where the auto-fork effect will trigger.
 */
export function PendingForkRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    const pendingShareId = sessionStorage.getItem("pendingForkShareId");
    if (user && pendingShareId && !location.pathname.startsWith("/session/share/")) {
      navigate(`/session/share/${pendingShareId}`, { replace: true });
    }
  }, [user, loading]);

  return null;
}
