import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface Profile {
  id: string;
  tenant_id: string;
  full_name: string | null;
  email: string | null;
}

export function useProfile(userId?: string) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    supabase
      .from("profiles")
      .select("id, tenant_id, full_name, email")
      .eq("id", userId)
      .single()
      .then(({ data, error: fetchError }) => {
        if (!mounted) return;
        if (fetchError) {
          setError(fetchError.message);
          setProfile(null);
        } else {
          setProfile(data as Profile);
        }
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId]);

  return { profile, loading, error };
}
