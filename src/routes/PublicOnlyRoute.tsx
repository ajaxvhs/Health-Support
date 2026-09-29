import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useSession } from "../context/AppContext";

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, checkingSession, sessionError } = useSession();
  if (checkingSession) return null;
  if (sessionError) return <Navigate to="/" replace />;
  return user ? <Navigate to="/" replace /> : children;
}
