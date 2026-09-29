import { createContext, useContext } from "react";
import { SupabaseRepository } from "../lib/repository";
import type { AppData, Profile } from "../types";

export interface TicketNavigationCounts {
  visibleOpenCount: number;
  myOpenCount: number;
}

export interface AppContextValue {
  data: AppData;
  user: Profile | null;
  ticketNavigationCounts: TicketNavigationCounts;
  repo: SupabaseRepository | null;
  refresh: () => Promise<void>;
  refreshTicketNavigationCounts: () => Promise<void>;
  checkingSession: boolean;
  sessionError: boolean;
  retrySession: () => Promise<void>;
  login: (profile: Profile) => Promise<void>;
  logout: () => Promise<boolean>;
  mergeProfiles: (profiles: Profile[]) => void;
  updateCurrentProfile: (
    values: Partial<Pick<Profile, "fullName" | "phone" | "mustChangePassword">>,
  ) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const value = useContext(AppContext);
  if (!value?.user || !value.repo) throw new Error("Contexto autenticado ausente");
  return { ...value, user: value.user, repo: value.repo };
}

export function useSession() {
  const value = useContext(AppContext);
  if (!value) throw new Error("AppContext ausente");
  return value;
}
