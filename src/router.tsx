import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppProvider } from "./AppProvider";
import { LoadingScreen } from "./components/LoadingScreen";
import { CapabilityRoute } from "./routes/CapabilityRoute";
import { LoginRoute } from "./routes/LoginRoute";
import { ProtectedAppLayout } from "./routes/ProtectedAppLayout";
import { PublicOnlyRoute } from "./routes/PublicOnlyRoute";

import { RouteErrorPage } from "./components/RouteErrorPage";
import { claimChunkRecovery, isChunkLoadError } from "./lib/chunkRecovery";

function lazyWithRecovery<T extends ComponentType<object>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await load();
    } catch (error) {
      if (isChunkLoadError(error) && navigator.onLine) {
        try {
          if (claimChunkRecovery(window.sessionStorage)) window.location.reload();
        } catch {
          // Storage may be unavailable; retain the original error for the fallback.
        }
      }
      throw error;
    }
  });
}

const AccessDeniedPage = lazyWithRecovery(() =>
  import("./pages/access/AccessDeniedPage").then((module) => ({
    default: module.AccessDeniedPage,
  })),
);
const AdminUsersPage = lazyWithRecovery(() =>
  import("./pages/admin/AdminUsersPage").then((module) => ({ default: module.AdminUsersPage })),
);
const AuditPage = lazyWithRecovery(() =>
  import("./pages/admin/AuditPage").then((module) => ({ default: module.AuditPage })),
);
const CatalogsPage = lazyWithRecovery(() =>
  import("./pages/admin/CatalogsPage").then((module) => ({ default: module.CatalogsPage })),
);
const DefinePasswordPage = lazyWithRecovery(() =>
  import("./pages/auth/DefinePasswordPage").then((module) => ({
    default: module.DefinePasswordPage,
  })),
);
const DashboardPage = lazyWithRecovery(() =>
  import("./pages/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const ProfilePage = lazyWithRecovery(() =>
  import("./pages/profile/ProfilePage").then((module) => ({ default: module.ProfilePage })),
);
const NewTicketPage = lazyWithRecovery(() =>
  import("./pages/tickets/NewTicketPage").then((module) => ({ default: module.NewTicketPage })),
);
const TicketDetailPage = lazyWithRecovery(() =>
  import("./pages/tickets/TicketDetailPage").then((module) => ({
    default: module.TicketDetailPage,
  })),
);
const TicketsPage = lazyWithRecovery(() =>
  import("./pages/tickets/TicketsPage").then((module) => ({ default: module.TicketsPage })),
);

const routeFallback = <LoadingScreen label="Carregando sessão..." />;

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    element: (
      <Suspense fallback={routeFallback}>
        <AppProvider />
      </Suspense>
    ),
    children: [
      {
        path: "entrar",
        element: (
          <PublicOnlyRoute>
            <LoginRoute />
          </PublicOnlyRoute>
        ),
      },
      {
        element: <ProtectedAppLayout />,
        children: [
          { path: "definir-senha", element: <DefinePasswordPage /> },
          { index: true, element: <DashboardPage /> },
          { path: "chamados", element: <TicketsPage /> },
          { path: "chamados/novo", element: <NewTicketPage /> },
          { path: "chamados/:id", element: <TicketDetailPage /> },
          { path: "fila", element: <Navigate to="/chamados?visao=fila" replace /> },
          {
            path: "admin/usuarios",
            element: (
              <CapabilityRoute capability="manage_users">
                <AdminUsersPage />
              </CapabilityRoute>
            ),
          },
          {
            path: "admin/catalogos",
            element: (
              <CapabilityRoute capability="manage_catalogs">
                <CatalogsPage />
              </CapabilityRoute>
            ),
          },
          {
            path: "admin/auditoria",
            element: (
              <CapabilityRoute capability="view_audit">
                <AuditPage />
              </CapabilityRoute>
            ),
          },
          { path: "perfil", element: <ProfilePage /> },
          { path: "acesso-negado", element: <AccessDeniedPage /> },
        ],
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
