import { useRef, useState } from "react";
import {
  Bell,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Ticket,
  UserCog,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";
import { can, isStaff } from "../../lib/permissions";
import { roleLabels, type AppData, type Profile } from "../../types";
import { cn } from "../../lib/utils";
import { NotificationPopover } from "../notifications";
import { Avatar } from "../ui";
import { useNotifications } from "./useNotifications";

type NavigationLink = {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  primary?: boolean;
};
type NavigationGroup = { title: string; links: NavigationLink[] };

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <img src="/favicon.svg" alt="" className="h-9 w-9 rounded-xl" />
      <div>
        <p className="font-display text-[16px] font-bold tracking-[-0.03em] text-ink">
          Suporte<span className="text-brand-strong"> Saúde</span>
        </p>
        <p className="text-[10px] font-medium uppercase tracking-[.14em] text-brand-strong">
          Atendimento de TI
        </p>
      </div>
    </div>
  );
}

function navigationFor(user: Profile, data: AppData): NavigationGroup[] {
  const staff = isStaff(user.role);
  const openTickets = data.tickets.filter(
    (ticket) => ticket.status !== "fechado" && ticket.status !== "resolvido",
  );
  const visibleTickets = staff
    ? openTickets
    : openTickets.filter((ticket) => ticket.createdBy === user.id);
  const mine = openTickets.filter((ticket) => ticket.createdBy === user.id);
  const groups: NavigationGroup[] = [
    {
      title: "Acesso rápido",
      links: [{ to: "/chamados/novo", label: "Novo chamado", icon: Plus, primary: true }],
    },
    { title: "Visão geral", links: [{ to: "/", label: "Início", icon: LayoutDashboard }] },
    {
      title: "Chamados",
      links: [
        {
          to: "/chamados",
          label: staff ? "Atendimento" : "Meus chamados",
          icon: Ticket,
          count: visibleTickets.length,
        },
        ...(staff
          ? [
              {
                to: "/chamados?visao=meus",
                label: "Meus chamados",
                icon: Ticket,
                count: mine.length,
              },
            ]
          : []),
      ],
    },
  ];
  const adminLinks = [
    can(user.role, "manage_users")
      ? { to: "/admin/usuarios", label: "Usuários", icon: Users }
      : null,
    can(user.role, "manage_catalogs")
      ? { to: "/admin/catalogos", label: "Catálogos", icon: Database }
      : null,
    can(user.role, "view_audit")
      ? { to: "/admin/auditoria", label: "Auditoria", icon: ShieldCheck }
      : null,
  ].filter((link): link is NavigationLink => link !== null);
  if (adminLinks.length)
    groups.push({
      title: "Administração",
      links: adminLinks,
    });
  groups.push({
    title: "Sua conta",
    links: [{ to: "/perfil", label: "Meu perfil", icon: UserCog }],
  });
  return groups;
}

export function AppShell() {
  const { user, data, repo, logout } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast } = useToast();
  const { notifications, markRead, markAll, remove, removeAll } = useNotifications(
    repo,
    user.id,
    showToast,
  );
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="min-h-screen bg-canvas">
      <div
        className={cn(
          "fixed inset-0 z-40 bg-ink/30 transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[232px] flex-col overflow-hidden border-r border-line-soft bg-surface px-4 py-5 transition-transform md:transform-none md:transition-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="px-2">
          <Logo />
        </div>
        <nav className="scrollbar-none mt-9 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain">
          {navigationFor(user, data).map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.17em] text-subtle">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === "/"}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => {
                      const active = link.to.includes("?")
                        ? `${location.pathname}${location.search}` === link.to
                        : link.to === "/chamados"
                          ? location.pathname === "/chamados" && !location.search
                          : isActive;
                      return cn(
                        "group relative flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors duration-150 [&>*]:pointer-events-none",
                        link.primary &&
                          "bg-brand-strong text-on-brand shadow-sm ring-1 ring-inset ring-brand hover:bg-brand-deep hover:text-on-brand hover:shadow-md",
                        !link.primary &&
                          (active
                            ? "bg-brand-soft text-brand-contrast shadow-sm ring-1 ring-inset ring-brand-border before:pointer-events-none before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-r-full before:bg-brand before:content-['']"
                            : "text-secondary hover:bg-surface-soft hover:text-ink"),
                      );
                    }}
                  >
                    <link.icon
                      size={17}
                      className={cn(
                        "shrink-0",
                        link.primary ? "text-on-brand/80" : "text-subtle group-hover:text-current",
                      )}
                    />
                    <span className="flex-1 whitespace-nowrap">{link.label}</span>
                    {link.count !== undefined && (
                      <span className="flex h-6 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] text-muted group-[.bg-brand-soft]:bg-surface group-[.bg-brand-soft]:text-brand-strong">
                        {link.count}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <button
          type="button"
          onClick={logout}
          className="mt-3 flex min-h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm font-semibold text-secondary transition-colors hover:bg-danger-soft hover:text-danger-strong [&>*]:pointer-events-none"
        >
          <LogOut size={17} />
          Sair da conta
        </button>
      </aside>
      <div className="md:pl-[232px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-line-soft bg-surface/90 px-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl p-2 text-secondary hover:bg-surface-muted md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
            <div className="hidden h-8 w-px bg-line-strong sm:block" />
            <span className="hidden text-xs font-medium text-subtle sm:block">
              Portal interno · Secretaria de Saúde
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                className="relative rounded-xl p-2 text-subtle hover:bg-surface-soft hover:text-ink"
                aria-label="Notificações"
                aria-expanded={notificationsOpen}
                aria-controls="notifications-popover"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Bell size={19} />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-warning-strong px-1 text-center text-[9px] font-bold leading-4 text-ink ring-2 ring-surface">
                    {unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}
                  </span>
                )}
              </button>
              <NotificationPopover
                open={notificationsOpen}
                notifications={notifications}
                containerRef={notificationsRef}
                onClose={() => setNotificationsOpen(false)}
                onRead={async (notification) => {
                  await markRead(notification);
                  if (notification.ticketId) navigate(`/chamados/${notification.ticketId}`);
                  setNotificationsOpen(false);
                }}
                onMarkAll={markAll}
                onDelete={remove}
                onDeleteAll={removeAll}
              />
            </div>
            <div className="hidden h-8 w-px bg-line-strong sm:block" />
            <button
              type="button"
              onClick={() => navigate("/perfil")}
              className="flex cursor-pointer items-center gap-2 rounded-xl p-1.5 pr-2 text-left hover:bg-surface-soft"
            >
              <Avatar user={user} size="sm" />
              <span className="hidden leading-tight sm:block">
                <strong className="block max-w-[150px] truncate text-sm font-bold text-ink">
                  {user.fullName}
                </strong>
                <small className="text-[11px] text-subtle">{roleLabels[user.role]}</small>
              </span>
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 py-7 sm:px-8 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
