export type AuthSessionEvent =
  "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED" | string;

export function getAuthSessionTransition(
  event: AuthSessionEvent,
  currentUserId: string | null,
  nextUserId: string | null,
): "same-user" | "replace" | "signed-out" {
  if (!nextUserId) return "signed-out";
  if (currentUserId === nextUserId && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED"))
    return "same-user";
  return "replace";
}
