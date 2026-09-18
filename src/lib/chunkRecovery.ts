export function isChunkLoadError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
      error.message,
    )
  );
}

export function claimChunkRecovery(
  storage: Pick<Storage, "getItem" | "setItem">,
  now = Date.now(),
) {
  const key = "suporte-saude:chunk-recovery-at";
  try {
    const previous = Number(storage.getItem(key));
    if (previous && now - previous < 300_000) return false;
    storage.setItem(key, String(now));
    return true;
  } catch {
    return false;
  }
}
