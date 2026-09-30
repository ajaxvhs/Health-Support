import { withErrorContext } from "./errors";

export function requireMutationResult<T>(
  result: { data: T | null; error: unknown | null },
  message: string,
): T {
  if (result.error) throw withErrorContext(result.error, message);
  if (result.data === null) throw new Error(message);
  return result.data;
}
