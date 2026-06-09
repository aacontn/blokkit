import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import Login from "./pages/Login";
import Home from "./pages/Home";
import RequireSession from "./components/RequireSession";
import PortalTickets from "./pages/tickets/PortalTickets";
import PortalTicketNew from "./pages/tickets/PortalTicketNew";
import PortalTicketDetail from "./pages/tickets/PortalTicketDetail";
import AdminTickets from "./pages/admin/AdminTickets";
import AdminTicketDetail from "./pages/admin/AdminTicketDetail";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session ?? null);
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <BrowserRouter basename="/app">
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login loading={loading} session={session} />} />
        <Route
          path="/home"
          element={
            <RequireSession loading={loading} session={session}>
              <Home loading={loading} session={session} />
            </RequireSession>
          }
        />
        <Route
          path="/tickets"
          element={
            <RequireSession loading={loading} session={session}>
              <PortalTickets session={session as Session} />
            </RequireSession>
          }
        />
        <Route
          path="/tickets/new"
          element={
            <RequireSession loading={loading} session={session}>
              <PortalTicketNew session={session as Session} />
            </RequireSession>
          }
        />
        <Route
          path="/tickets/:id"
          element={
            <RequireSession loading={loading} session={session}>
              <PortalTicketDetail session={session as Session} />
            </RequireSession>
          }
        />
        <Route
          path="/admin/tickets"
          element={
            <RequireSession loading={loading} session={session}>
              <AdminTickets session={session as Session} />
            </RequireSession>
          }
        />
        <Route
          path="/admin/tickets/:id"
          element={
            <RequireSession loading={loading} session={session}>
              <AdminTicketDetail session={session as Session} />
            </RequireSession>
          }
        />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
