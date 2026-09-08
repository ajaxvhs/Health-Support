import { useRef, useState } from "react";
import {
  Bell,
  Database,
  HelpCircle,
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
          Suporte<span className="text-teal-700"> Saúde</span>
        </p>
        <p className="text-[10px] font-medium uppercase tracking-[.14em] text-teal-700">
          Atendimento de TI
        </p>
      </div>
    </div>
  );
}

function navigationFor(user: Profile, data: AppData): NavigationGroup[] {
  const staff = isStaff(user.role);
  const openTickets = data.tickets.filter((ticket) => ticket.status !== "fechado");
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
    <div className="min-h-screen bg-cream">
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
          "fixed inset-y-0 left-0 z-50 flex w-[274px] flex-col border-r border-slate-100 bg-white px-4 py-5 transition-transform md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="px-2">
          <Logo />
        </div>
        <nav className="mt-9 flex-1 space-y-6 overflow-y-auto">
          {navigationFor(user, data).map((group) => (
            <div key={group.title}>
              <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.17em] text-slate-400">
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
                        "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-all duration-200",
                        active && !link.primary
                          ? "bg-teal-50 pl-4 text-teal-900 shadow-sm ring-1 ring-inset ring-teal-100 before:absolute before:bottom-2 before:left-0 before:top-2 before:w-1 before:rounded-r-full before:bg-teal-600 before:content-['']"
                          : "text-slate-500 hover:-translate-y-px hover:bg-slate-50 hover:text-ink hover:shadow-sm",
                        link.primary &&
                          "bg-teal-700 text-white shadow-sm ring-1 ring-inset ring-teal-600 hover:-translate-y-px hover:bg-teal-800 hover:shadow-lg",
                      );
                    }}
                  >
                    <link.icon
                      size={17}
                      className={cn(
                        "shrink-0",
                        link.primary ? "text-teal-100" : "text-slate-400 group-hover:text-current",
                      )}
                    />
                    <span className="flex-1">{link.label}</span>
                    {link.count !== undefined && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 group-[.bg-teal-50]:bg-white group-[.bg-teal-50]:text-teal-700">
                        {link.count}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="rounded-2xl bg-teal-50 p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-teal-700">
              <HelpCircle size={15} />
            </span>
            <p className="text-xs font-bold text-teal-900">Precisa de ajuda?</p>
          </div>
          <p className="mt-2 px-1 text-[11px] leading-4 text-teal-700/80">
            Abra um chamado e nossa equipe responde em breve.
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="mt-3 flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700"
        >
          <LogOut size={17} />
          Sair da conta
        </button>
      </aside>
      <div className="md:pl-[274px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-slate-100 bg-white/90 px-4 backdrop-blur-md sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu"
            >
              <Menu size={22} />
            </button>
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <span className="hidden text-xs font-medium text-slate-400 sm:block">
              Portal interno · Secretaria de Saúde
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                className="relative rounded-xl p-2 text-slate-400 hover:bg-slate-50 hover:text-ink"
                aria-label="Notificações"
                aria-expanded={notificationsOpen}
                aria-controls="notifications-popover"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <Bell size={19} />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-orange-500 px-1 text-center text-[9px] font-bold leading-4 text-white ring-2 ring-white">
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
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <button
              type="button"
              onClick={() => navigate("/perfil")}
              className="flex cursor-pointer items-center gap-2 rounded-xl p-1.5 pr-2 text-left hover:bg-slate-50"
            >
              <Avatar user={user} size="sm" />
              <span className="hidden leading-tight sm:block">
                <strong className="block max-w-[150px] truncate text-sm font-bold text-ink">
                  {user.fullName}
                </strong>
                <small className="text-[11px] text-slate-400">{roleLabels[user.role]}</small>
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
