import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Profile, Ticket, TicketEvent, TicketMessage, TicketStatus } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}
export function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
    .format(new Date(value))
    .replace(".", "");
}
export function relativeDate(value: string) {
  const days = Math.round((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  return `Há ${days} dias`;
}
export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0])
    .join("")
    .toUpperCase();
}
export function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits ? `(${digits}` : "";
  const area = digits.slice(0, 2);
  const number = digits.slice(2);
  return `(${area}) ${number.slice(0, 5)}${number.length > 5 ? `-${number.slice(5)}` : ""}`;
}
export type TicketDateRange = "all" | "today" | "7d" | "30d";
export type TicketSort = "newest" | "oldest" | "priority";
export interface TicketFilters {
  search: string;
  status: TicketStatus | "todos";
  priorityId: string;
  unitId: string;
  requesterId: string;
  dateRange: TicketDateRange;
  sort: TicketSort;
}

export interface AuditFilters {
  search: string;
  actorId: string;
  type: string;
  from: string;
  to: string;
}

export function filterAuditEvents(
  events: TicketEvent[],
  profiles: Profile[],
  filters: AuditFilters,
) {
  const query = filters.search.trim().toLowerCase();
  const actors = Object.fromEntries(profiles.map((profile) => [profile.id, profile.fullName]));
  const parseFilterDate = (value: string, endOfDay = false) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value).getTime();
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    if (endOfDay) date.setHours(23, 59, 59, 999);
    return date.getTime();
  };
  const from = filters.from ? parseFilterDate(filters.from) : undefined;
  const to = filters.to ? parseFilterDate(filters.to, true) : undefined;
  return events.filter((event) => {
    const eventDate = new Date(event.createdAt).getTime();
    const searchable = `${event.detail} ${event.type} ${actors[event.actorId] ?? ""}`.toLowerCase();
    return (
      (!query || searchable.includes(query)) &&
      (!filters.actorId || event.actorId === filters.actorId) &&
      (!filters.type || event.type === filters.type) &&
      (from === undefined || eventDate >= from) &&
      (to === undefined || eventDate <= to)
    );
  });
}

export function filterTickets(
  tickets: Ticket[],
  filters: TicketFilters,
  context: {
    unitNames?: Record<string, string>;
    requesterNames?: Record<string, string>;
    priorityOrder?: Record<string, number>;
    now?: number;
  } = {},
) {
  const query = filters.search.trim().toLowerCase();
  const now = context.now ?? Date.now();
  const dateStart =
    filters.dateRange === "today"
      ? new Date(new Date(now).setHours(0, 0, 0, 0)).getTime()
      : filters.dateRange === "7d"
        ? now - 7 * 86400000
        : filters.dateRange === "30d"
          ? now - 30 * 86400000
          : undefined;
  const filtered = tickets.filter((ticket) => {
    const requesterName = context.requesterNames?.[ticket.createdBy] ?? ticket.requesterName;
    const unitName = context.unitNames?.[ticket.unitId] ?? "";
    const searchable =
      `${ticket.number} ${ticket.title} ${ticket.description} ${requesterName} ${ticket.requesterName} ${unitName}`.toLowerCase();
    return (
      (!query || searchable.includes(query)) &&
      (filters.status === "todos" || ticket.status === filters.status) &&
      (!filters.priorityId || ticket.priorityId === filters.priorityId) &&
      (!filters.unitId || ticket.unitId === filters.unitId) &&
      (!filters.requesterId || ticket.createdBy === filters.requesterId) &&
      (dateStart === undefined || new Date(ticket.createdAt).getTime() >= dateStart)
    );
  });
  return [...filtered].sort((a, b) => {
    if (filters.sort === "priority") {
      return (
        (context.priorityOrder?.[a.priorityId] ?? Number.MAX_SAFE_INTEGER) -
        (context.priorityOrder?.[b.priorityId] ?? Number.MAX_SAFE_INTEGER)
      );
    }
    const difference = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return filters.sort === "newest" ? difference : -difference;
  });
}

export function averageFirstPublicStaffResponseMinutes(
  tickets: Ticket[],
  messages: TicketMessage[],
  profiles: Profile[],
) {
  const staffIds = new Set(
    profiles.filter((profile) => profile.role !== "solicitante").map((profile) => profile.id),
  );
  const responseTimes = tickets.flatMap((ticket) => {
    const createdAt = new Date(ticket.createdAt).getTime();
    const firstResponse = messages
      .filter(
        (message) =>
          message.ticketId === ticket.id && !message.isInternal && staffIds.has(message.senderId),
      )
      .map((message) => new Date(message.createdAt).getTime())
      .filter(
        (createdAtMessage) => Number.isFinite(createdAtMessage) && createdAtMessage >= createdAt,
      )
      .sort((a, b) => a - b)[0];
    return firstResponse === undefined || !Number.isFinite(createdAt)
      ? []
      : [Math.max(0, firstResponse - createdAt) / 60000];
  });
  return responseTimes.length
    ? Math.round(responseTimes.reduce((total, value) => total + value, 0) / responseTimes.length)
    : null;
}

export function formatResponseTime(minutes: number | null) {
  if (minutes === null) return "Sem respostas ainda";
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
}
