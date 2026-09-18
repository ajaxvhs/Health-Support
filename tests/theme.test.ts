import { describe, expect, it } from "vitest";
import { isThemePreference, resolveTheme } from "../src/lib/theme";

describe("theme preferences", () => {
  it("uses light as the default explicit preference", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("accepts only supported preference values", () => {
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(false);
    expect(isThemePreference("sepia")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});
