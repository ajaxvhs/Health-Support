import { Navigate, useLocation } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { LoadingScreen } from "../components/LoadingScreen";
import { Button } from "../components/ui";
import { useSession } from "../context/AppContext";

export function ProtectedAppLayout() {
  const { user, checkingSession, sessionError, retrySession } = useSession();
  const location = useLocation();

  if (checkingSession) return <LoadingScreen label="Carregando sessão..." />;
  if (sessionError)
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <section className="max-w-md rounded-3xl border border-line-soft bg-surface p-6 text-center shadow-soft">
          <h1 className="font-display text-xl font-bold text-ink">
            Não foi possível verificar sua sessão
          </h1>
          <p className="mt-2 text-sm leading-6 text-secondary">
            Sua conexão pode estar instável. Tente novamente sem encerrar sua conta.
          </p>
          <Button className="mt-5" onClick={() => void retrySession()}>
            Tentar novamente
          </Button>
        </section>
      </main>
    );
  if (!user) return <Navigate to="/entrar" replace />;
  if (user.mustChangePassword && location.pathname !== "/definir-senha")
    return <Navigate to="/definir-senha" replace />;
  if (!user.mustChangePassword && location.pathname === "/definir-senha")
    return <Navigate to="/" replace />;

  return <AppShell />;
}
