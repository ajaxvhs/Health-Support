import { normalizeError, type AppError } from "./errors";

export type ActionOutcome<T> = { ok: true; value: T } | { ok: false; error: AppError };
export type ActionToast = (message: string, kind?: "success" | "error" | "info") => void;

export async function executeAction<T>(
  action: () => Promise<T>,
  options: {
    fallback: string;
    showToast: ActionToast;
    setPending?: (pending: boolean) => void;
  },
): Promise<ActionOutcome<T>> {
  options.setPending?.(true);
  try {
    return { ok: true, value: await action() };
  } catch (reason) {
    const error = normalizeError(reason, options.fallback);
    options.showToast(error.message, "error");
    return { ok: false, error };
  } finally {
    options.setPending?.(false);
  }
}
