import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useApp } from "../context/AppContext";
import { can } from "../lib/permissions";

export function CapabilityRoute({
  capability,
  children,
}: {
  capability: Parameters<typeof can>[1];
  children: ReactNode;
}) {
  const { user } = useApp();
  return can(user.role, capability) ? children : <Navigate to="/acesso-negado" replace />;
}
