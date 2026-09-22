import { useLayoutEffect, useState, type ReactNode } from "react";
import {
  isThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "../lib/theme";
import { ThemeContext } from "./themeContext";

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "light";
  } catch {
    return "light";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const resolvedTheme = resolveTheme(preference);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Theme still works for the current session when storage is unavailable.
    }
  }, [preference, resolvedTheme]);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
