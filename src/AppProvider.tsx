import { useEffect, useState, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { AppContext } from "./context/AppContext";
import { restoreUserSession, signOut } from "./lib/auth";
import { SupabaseRepository } from "./lib/repository";
import { getSupabaseClient } from "./lib/supabase/client";
import type { AppData, Profile } from "./types";

const emptyData: AppData = {
  profiles: [],
  units: [],
  categories: [],
  priorities: [],
  statuses: [],
  tickets: [],
  messages: [],
  events: [],
};

export function AppProvider({ children }: { children?: ReactNode }) {
  const [repo] = useState(() => {
    const client = getSupabaseClient();
    return client ? new SupabaseRepository(client) : null;
  });
  const [user, setUser] = useState<Profile | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    if (!repo) {
      setCheckingSession(false);
      return;
    }
    let mounted = true;
    restoreUserSession()
      .then(async (profile) => {
        if (!mounted) return;
        setUser(profile);
        if (profile) setData(await repo.getData());
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setCheckingSession(false);
      });
    return () => {
      mounted = false;
    };
  }, [repo]);

  const [data, setData] = useState<AppData>(emptyData);
  const refresh = async () => {
    if (!repo) throw new Error("O Supabase não está configurado.");
    const [nextUser, nextData] = await Promise.all([repo.getCurrentUser(), repo.getData()]);
    setUser(nextUser);
    setData(nextData);
  };
  const login = async (profile: Profile) => {
    if (!repo) throw new Error("O Supabase não está configurado.");
    const nextData = await repo.getData();
    setData(nextData);
    setUser(profile);
  };
  const logout = async () => {
    await signOut();
    setUser(null);
    setData(emptyData);
  };

  return (
    <AppContext.Provider value={{ repo, user, data, refresh, checkingSession, login, logout }}>
      {children ?? <Outlet />}
    </AppContext.Provider>
  );
}
