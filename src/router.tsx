import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppProvider } from "./AppProvider";
import { LoadingScreen } from "./components/LoadingScreen";
import { CapabilityRoute } from "./routes/CapabilityRoute";
import { LoginRoute } from "./routes/LoginRoute";
import { ProtectedAppLayout } from "./routes/ProtectedAppLayout";
import { PublicOnlyRoute } from "./routes/PublicOnlyRoute";

const AccessDeniedPage = lazy(() =>
  import("./pages/access/AccessDeniedPage").then((module) => ({
    default: module.AccessDeniedPage,
  })),
);
const AdminUsersPage = lazy(() =>
  import("./pages/admin/AdminUsersPage").then((module) => ({ default: module.AdminUsersPage })),
);
const AuditPage = lazy(() =>
  import("./pages/admin/AuditPage").then((module) => ({ default: module.AuditPage })),
);
const CatalogsPage = lazy(() =>
  import("./pages/admin/CatalogsPage").then((module) => ({ default: module.CatalogsPage })),
);
const DefinePasswordPage = lazy(() =>
  import("./pages/auth/DefinePasswordPage").then((module) => ({
    default: module.DefinePasswordPage,
  })),
);
const DashboardPage = lazy(() =>
  import("./pages/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const ProfilePage = lazy(() =>
  import("./pages/profile/ProfilePage").then((module) => ({ default: module.ProfilePage })),
);
const NewTicketPage = lazy(() =>
  import("./pages/tickets/NewTicketPage").then((module) => ({ default: module.NewTicketPage })),
);
const TicketDetailPage = lazy(() =>
  import("./pages/tickets/TicketDetailPage").then((module) => ({
    default: module.TicketDetailPage,
  })),
);
const TicketsPage = lazy(() =>
  import("./pages/tickets/TicketsPage").then((module) => ({ default: module.TicketsPage })),
);

const routeFallback = <LoadingScreen label="Carregando sessão..." />;

export const router = createBrowserRouter([
  {
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
