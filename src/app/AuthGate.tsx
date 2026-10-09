import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { supabase } from "@/lib/api/supabase";
import { Spinner } from "@/components/ui";

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");
  const loc = useLocation();
  useEffect(() => {
    let alive = true;
    api.auth.current().then((a) => alive && setState(a.email ? "in" : "out"));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => alive && setState(s ? "in" : "out"));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  if (state === "loading") return <Spinner label="Checking your session" />;
  if (state === "out" && api.mode === "supabase") return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}
