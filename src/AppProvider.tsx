import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { AppContext, type TicketNavigationCounts } from "./context/AppContext";
import { isProfileUnavailableError, restoreUserSession, signOut } from "./lib/auth";
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
  const [sessionError, setSessionError] = useState(false);
  const sessionGeneration = useRef(0);
  const currentUser = useRef<Profile | null>(null);
  const setCurrentUser = useCallback((nextUser: Profile | null) => {
    currentUser.current = nextUser;
    setUser(nextUser);
  }, []);

  useEffect(() => {
    if (!repo) {
      setSessionChecked(true);
      return;
    }
    let mounted = true;
    const client = getSupabaseClient();
    if (!client) {
      setSessionChecked(true);
      return;
    }
    const { data } = client.auth.onAuthStateChange((event, session) => {
      const generation = ++sessionGeneration.current;
      const previousUser = currentUser.current;
      const nextUserId = session?.user.id ?? null;

      if (event === "TOKEN_REFRESHED" && previousUser?.id === nextUserId) return;

      if (previousUser) clearTicketDraft(previousUser.id);
      void queryClient.cancelQueries();
      queryClient.clear();
      setCurrentUser(null);
      setSessionError(false);
      setSessionChecked(!session);
      if (!session) return;

      setSessionChecked(false);
      queueMicrotask(() => {
        void restoreUserSession(session)
          .then((profile) => {
            if (!mounted || generation !== sessionGeneration.current) return;
            setCurrentUser(profile);
            setSessionChecked(true);
          })
          .catch((reason: unknown) => {
            if (!mounted || generation !== sessionGeneration.current) return;
            if (isProfileUnavailableError(reason)) {
              void client.auth.signOut({ scope: "local" });
              return;
            }
            setSessionError(true);
            setSessionChecked(true);
          });
      });
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient, repo, setCurrentUser]);

  const appDataQuery = useQuery({
    queryKey: appDataKey(user?.id ?? "anonymous"),
    queryFn: async () => {
      if (!repo) throw new Error("O Supabase não está configurado.");
      const generation = sessionGeneration.current;
      const result = await repo.getData();
      if (generation !== sessionGeneration.current) throw new Error("A sessão foi alterada.");
      return result;
    },
    enabled: Boolean(user && !user.mustChangePassword && repo),
    ...queryCache.appData,
  });
  const navigationCountsQuery = useQuery({
    queryKey: navigationCountsKey(user?.id ?? "anonymous"),
    queryFn: async () => {
      if (!repo) throw new Error("O Supabase não está configurado.");
      const generation = sessionGeneration.current;
      const result = await repo.getTicketNavigationCounts();
      if (generation !== sessionGeneration.current) throw new Error("A sessão foi alterada.");
      return result;
    },
    enabled: Boolean(user && !user.mustChangePassword && repo),
    ...queryCache.ticketNavigation,
  });
  const data = user ? (appDataQuery.data ?? emptyData) : emptyData;
  const ticketNavigationCounts =
    user && !user.mustChangePassword
      ? (navigationCountsQuery.data ?? emptyTicketNavigationCounts)
      : emptyTicketNavigationCounts;
  const checkingSession =
    !sessionChecked || Boolean(user && !user.mustChangePassword && appDataQuery.isLoading);

  const refresh = async () => {
    if (!repo) throw new Error("O Supabase não está configurado.");
    const generation = sessionGeneration.current;
    const nextUser = await repo.getCurrentUser();
    if (generation !== sessionGeneration.current) return;
    setCurrentUser(nextUser);
    if (!nextUser) return;
    await queryClient.fetchQuery({
      queryKey: appDataKey(nextUser.id),
      queryFn: async () => {
        const result = await repo.getData();
        if (generation !== sessionGeneration.current) throw new Error("A sessão foi alterada.");
        return result;
      },
      staleTime: 0,
    });
    if (generation !== sessionGeneration.current) return;
    await queryClient.fetchQuery({
      queryKey: navigationCountsKey(nextUser.id),
      queryFn: async () => {
        const result = await repo.getTicketNavigationCounts();
        if (generation !== sessionGeneration.current) throw new Error("A sessão foi alterada.");
        return result;
      },
      staleTime: 0,
    });
    if (generation !== sessionGeneration.current) return;
    void queryClient.invalidateQueries({ queryKey: ["ticket-pages", nextUser.id] });
    void queryClient.invalidateQueries({ queryKey: ["ticket-dashboard", nextUser.id] });
    void queryClient.invalidateQueries({ queryKey: ["audit-pages", nextUser.id] });
  };

  const refreshTicketNavigationCounts = async () => {
    if (!repo || !user) return;
    const generation = sessionGeneration.current;
    await queryClient.fetchQuery({
      queryKey: navigationCountsKey(user.id),
      queryFn: async () => {
        const result = await repo.getTicketNavigationCounts();
        if (generation !== sessionGeneration.current) throw new Error("A sessão foi alterada.");
        return result;
      },
      staleTime: 0,
    });
  };

  const login = async (profile: Profile) => {
    if (!repo) throw new Error("O Supabase não está configurado.");
    const client = getSupabaseClient();
    const session = client ? (await client.auth.getSession()).data.session : null;
    if (session?.user.id !== profile.id) throw new Error("A sessão mudou durante a entrada.");
    sessionGeneration.current += 1;
    void queryClient.cancelQueries();
    queryClient.clear();
    setSessionError(false);
    setSessionChecked(true);
    setCurrentUser(profile);
  };

  const logout = async () => {
    const previousUser = currentUser.current;
    try {
      return (await signOut()).pushCleanupFailed;
    } finally {
      if (previousUser) clearTicketDraft(previousUser.id);
      queryClient.clear();
      setCurrentUser(null);
      setSessionError(false);
      setSessionChecked(true);
    }
  };

  const retrySession = async () => {
    const generation = sessionGeneration.current;
    setSessionError(false);
    setSessionChecked(false);
    try {
      const profile = await restoreUserSession();
      if (generation === sessionGeneration.current) setCurrentUser(profile);
    } catch (reason) {
      if (generation === sessionGeneration.current && isProfileUnavailableError(reason)) {
        await getSupabaseClient()?.auth.signOut({ scope: "local" });
      } else if (generation === sessionGeneration.current) {
        setSessionError(true);
      }
    } finally {
      if (generation === sessionGeneration.current) setSessionChecked(true);
    }
  };

  const mergeProfiles = useCallback(
    (profiles: Profile[]) => {
      if (!user || currentUser.current?.id !== user.id) return;
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
    if (!user || currentUser.current?.id !== user.id) return;
    setCurrentUser({ ...user, ...values });
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
        sessionError,
        retrySession,
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
