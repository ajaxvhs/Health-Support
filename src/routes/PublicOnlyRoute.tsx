import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useSession } from "../context/AppContext";

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, checkingSession } = useSession();
  if (checkingSession) return null;
  return user ? <Navigate to="/" replace /> : children;
}
