import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";

interface RequireSessionProps {
  session: Session | null;
  loading: boolean;
  children: ReactNode;
}

export default function RequireSession({ session, loading, children }: RequireSessionProps) {
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 text-sm text-white/70">
        Loading session...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
