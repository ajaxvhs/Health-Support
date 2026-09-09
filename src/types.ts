export type Role = "admin" | "atendente" | "solicitante";
export type TicketStatus = "aberto" | "em_andamento" | "resolvido" | "fechado";
export type CatalogKind = "categories" | "units" | "priorities" | "statuses";

export interface Unit {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}
export interface CatalogItem {
  id: string;
  name: string;
  code?: string;
  slug?: string;
  description?: string;
  isActive: boolean;
  color?: string;
}
export interface Profile {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string;
  role: Role;
  unitId: string;
  isActive: boolean;
  mustChangePassword?: boolean;
}
export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
}
export interface TicketEvent {
  id: string;
  ticketId?: string;
  actorId: string;
  type: string;
  detail: string;
  createdAt: string;
}
export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  ticketId?: string;
}
export interface Ticket {
  id: string;
  number: number;
  title: string;
  description: string;
  unitId: string;
  categoryId: string;
  priorityId: string;
  status: TicketStatus;
  createdBy: string;
  assignedTo?: string;
  requesterName: string;
  requesterPhone: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface AppData {
  profiles: Profile[];
  units: Unit[];
  categories: CatalogItem[];
  priorities: CatalogItem[];
  statuses: CatalogItem[];
  tickets: Ticket[];
  messages: TicketMessage[];
  events: TicketEvent[];
}
export const statusMeta: Record<TicketStatus, { label: string; tone: string }> = {
  aberto: { label: "Aberto", tone: "blue" },
  em_andamento: { label: "Em andamento", tone: "amber" },
  resolvido: { label: "Resolvido", tone: "green" },
  fechado: { label: "Fechado", tone: "slate" },
};

export const roleLabels: Record<Role, string> = {
  admin: "Administrador",
  atendente: "Atendente",
  solicitante: "Solicitante",
};

export const roleOptions = (Object.entries(roleLabels) as Array<[Role, string]>).map(
  ([value, label]) => ({ value, label }),
);
