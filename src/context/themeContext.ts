import { createContext } from "react";
import type { ResolvedTheme, ThemePreference } from "../lib/theme";

export type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
