import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { AppContext, type TicketNavigationCounts } from "./context/AppContext";
import { restoreUserSession, signOut } from "./lib/auth";
import { SupabaseRepository } from "./lib/repository";
import { getSupabaseClient } from "./lib/supabase/client";
import { queryCache } from "./lib/queryCache";
import { clearTicketDraft } from "./lib/ticketDraft";
import type { AppData, Profile } from "./types";

const emptyData: AppData = {
  profiles: [],
  units: [],
  categories: [],
  priorities: [],
  statuses: [],
};
const emptyTicketNavigationCounts: TicketNavigationCounts = { visibleOpenCount: 0, myOpenCount: 0 };
const appDataKey = (userId: string) => ["app-data", userId] as const;
const navigationCountsKey = (userId: string) => ["ticket-navigation-counts", userId] as const;

export function AppProvider({ children }: { children?: ReactNode }) {
  const queryClient = useQueryClient();
  const [repo] = useState(() => {
    const client = getSupabaseClient();
    return client ? new SupabaseRepository(client) : null;
  });
  const [user, setUser] = useState<Profile | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    if (!repo) {
      setSessionChecked(true);
      return;
    }
    let mounted = true;
    restoreUserSession()
      .then((profile) => {
        if (mounted) setUser(profile);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setSessionChecked(true);
      });
    return () => {
      mounted = false;
    };
  }, [repo]);

  const appDataQuery = useQuery({
    queryKey: appDataKey(user?.id ?? "anonymous"),
    queryFn: () => {
      if (!repo) throw new Error("O Supabase não está configurado.");
      return repo.getData();
    },
    enabled: Boolean(user && repo),
    ...queryCache.appData,
  });
  const navigationCountsQuery = useQuery({
    queryKey: navigationCountsKey(user?.id ?? "anonymous"),
    queryFn: () => {
      if (!repo) throw new Error("O Supabase não está configurado.");
      return repo.getTicketNavigationCounts();
    },
    enabled: Boolean(user && repo),
    ...queryCache.ticketNavigation,
  });
  const data = user ? (appDataQuery.data ?? emptyData) : emptyData;
  const ticketNavigationCounts = navigationCountsQuery.data ?? emptyTicketNavigationCounts;
  const checkingSession = !sessionChecked || Boolean(user && appDataQuery.isLoading);

  useEffect(() => {
    if (user && appDataQuery.error && !appDataQuery.data) setUser(null);
  }, [appDataQuery.data, appDataQuery.error, user]);

  const refresh = async () => {
    if (!repo) throw new Error("O Supabase não está configurado.");
    const nextUser = await repo.getCurrentUser();
    setUser(nextUser);
    if (!nextUser) return;
    await queryClient.fetchQuery({
      queryKey: appDataKey(nextUser.id),
      queryFn: () => repo.getData(),
      staleTime: 0,
    });
    await queryClient.fetchQuery({
      queryKey: navigationCountsKey(nextUser.id),
      queryFn: () => repo.getTicketNavigationCounts(),
      staleTime: 0,
    });
    void queryClient.invalidateQueries({ queryKey: ["ticket-pages", nextUser.id] });
    void queryClient.invalidateQueries({ queryKey: ["ticket-dashboard", nextUser.id] });
    void queryClient.invalidateQueries({ queryKey: ["audit-pages", nextUser.id] });
  };

  const refreshTicketNavigationCounts = async () => {
    if (!repo || !user) return;
    await queryClient.fetchQuery({
      queryKey: navigationCountsKey(user.id),
      queryFn: () => repo.getTicketNavigationCounts(),
      staleTime: 0,
    });
  };

  const login = async (profile: Profile) => {
    if (!repo) throw new Error("O Supabase não está configurado.");
    await queryClient.fetchQuery({
      queryKey: appDataKey(profile.id),
      queryFn: () => repo.getData(),
      staleTime: queryCache.appData.staleTime,
    });
    await queryClient.fetchQuery({
      queryKey: navigationCountsKey(profile.id),
      queryFn: () => repo.getTicketNavigationCounts(),
      staleTime: queryCache.ticketNavigation.staleTime,
    });
    setUser(profile);
  };

  const logout = async () => {
    await signOut();
    if (user) clearTicketDraft(user.id);
    queryClient.clear();
    setUser(null);
  };

  const mergeProfiles = useCallback(
    (profiles: Profile[]) => {
      if (!user) return;
      queryClient.setQueryData<AppData>(appDataKey(user.id), (current) =>
        current
          ? { ...current, profiles: profiles.map((profile) => ({ ...profile, email: "" })) }
          : current,
      );
    },
    [queryClient, user],
  );

  const updateCurrentProfile = (
    values: Partial<Pick<Profile, "fullName" | "phone" | "mustChangePassword">>,
  ) => {
    if (!user) return;
    setUser((current) => (current ? { ...current, ...values } : current));
    queryClient.setQueryData<AppData>(appDataKey(user.id), (current) =>
      current
        ? {
            ...current,
            profiles: current.profiles.map((profile) =>
              profile.id === user.id ? { ...profile, ...values } : profile,
            ),
          }
        : current,
    );
  };

  return (
    <AppContext.Provider
      value={{
        repo,
        user,
        ticketNavigationCounts,
        data,
        refresh,
        refreshTicketNavigationCounts,
        checkingSession,
        login,
        logout,
        mergeProfiles,
        updateCurrentProfile,
      }}
    >
      {children ?? <Outlet />}
    </AppContext.Provider>
  );
}
