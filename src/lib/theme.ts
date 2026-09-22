export type ThemePreference = "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "suporte-saude-theme";

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference;
}
