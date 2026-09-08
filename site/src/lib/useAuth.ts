import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      const current = data.session;
      // A stale-but-still-stored session (e.g. the tab was backgrounded past
      // token expiry and the background refresh timer got throttled) shows
      // up here as a session whose expiry has already passed. Rather than
      // let the next query fail with a raw "JWT expired" error, force a
      // clean sign-out now — onAuthStateChange below picks up the resulting
      // SIGNED_OUT event and ProtectedRoute redirects to /login.
      if (current && current.expires_at && current.expires_at * 1000 < Date.now()) {
        await supabase.auth.signOut();
        return;
      }
      setSession(current);
      setLoading(false);
    }

    checkSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    // Re-check on tab focus, since that's exactly when a long-backgrounded
    // tab's stale/expired session would otherwise only surface as an error
    // from whatever query the user happens to trigger first.
    function handleVisibility() {
      if (document.visibilityState === "visible") checkSession();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      listener.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return { session, loading, isAuthenticated: !!session };
}
