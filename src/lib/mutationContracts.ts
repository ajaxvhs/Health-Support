export function requireMutationResult<T>(
  result: { data: T | null; error: unknown | null },
  message: string,
): T {
  if (result.error) {
    if (result.error instanceof Error) throw result.error;
    throw new Error(message, { cause: result.error });
  }
  if (result.data === null) throw new Error(message);
  return result.data;
}
