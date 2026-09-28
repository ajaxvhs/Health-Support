const retryDelaysMs = [30_000, 2 * 60_000, 10 * 60_000] as const;

export function pwaUpdateRetryDelay(attempt: number) {
  const index = Math.min(Math.max(Math.floor(attempt), 0), retryDelaysMs.length - 1);
  return retryDelaysMs[index];
}
