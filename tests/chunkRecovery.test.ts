import { describe, expect, it } from "vitest";
import { claimChunkRecovery, isChunkLoadError } from "../src/lib/chunkRecovery";

describe("chunk recovery", () => {
  it("recognizes browser import failures without retrying application errors", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: /assets/page.js",
      "Importing a module script failed.",
      "error loading dynamically imported module",
      "Unable to preload CSS for /assets/page.css",
    ])
      expect(isChunkLoadError(new TypeError(message))).toBe(true);
    expect(isChunkLoadError(new Error("Failed to fetch"))).toBe(false);
    expect(isChunkLoadError(new Error("Invalid user profile"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it("limits reloads across routes and reloads to one per five minutes", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    expect(claimChunkRecovery(storage, 1000)).toBe(true);
    expect(claimChunkRecovery(storage, 2000)).toBe(false);
    expect(claimChunkRecovery(storage, 300999)).toBe(false);
    expect(claimChunkRecovery(storage, 301000)).toBe(true);
  });

  it("does not reload if storage cannot persist the guard", () => {
    expect(
      claimChunkRecovery({
        getItem: () => null,
        setItem: () => {
          throw new Error("Blocked");
        },
      }),
    ).toBe(false);
  });
});
