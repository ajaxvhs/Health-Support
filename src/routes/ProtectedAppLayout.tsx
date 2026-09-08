import { Navigate, useLocation } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { LoadingScreen } from "../components/LoadingScreen";
import { useSession } from "../context/AppContext";

export function ProtectedAppLayout() {
  const { user, checkingSession } = useSession();
  const location = useLocation();

  if (checkingSession) return <LoadingScreen label="Carregando sessão..." />;
  if (!user) return <Navigate to="/entrar" replace />;
  if (user.mustChangePassword && location.pathname !== "/definir-senha")
    return <Navigate to="/definir-senha" replace />;
  if (!user.mustChangePassword && location.pathname === "/definir-senha")
    return <Navigate to="/" replace />;

  return <AppShell />;
}
