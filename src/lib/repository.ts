import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppData,
  AppNotification,
  AdminUserActionRequest,
  AdminUserDeleteOutcome,
  BulkUserDeleteResult,
  CatalogKind,
  CatalogItem,
  Profile,
  Role,
  Ticket,
  TicketEvent,
  TicketMessage,
  TicketStatus,
  Unit,
} from "../types";
import { assertMessageAllowed, assertStatusChangeAllowed } from "./ticketPolicy";
import { isStaff } from "./permissions";
import { requireMutationResult } from "./mutationContracts";

type Row = Record<string, unknown>;
export interface TicketPageQuery {
  view: "all" | "mine" | "queue";
  assignedToMeOnly: boolean;
  status: string;
  statusSelection?: string[];
  priorityId?: string;
  unitId?: string;
  requesterId?: string;
  search: string;
  createdAfter?: string;
  sort: "newest" | "oldest" | "priority";
  offset: number;
  limit: number;
}
export interface TicketPageResult {
  tickets: Ticket[];
  totalCount: number;
  queueUnassignedCount: number;
  queueInProgressCount: number;
}
export interface TicketDashboardData {
  openCount: number;
  inProgressCount: number;
  closedCount: number;
  waitingCount: number;
  urgentCount: number;
  unassignedCount: number;
  assignedToMeCount: number;
  waitingForRequesterCount: number;
  tickets: Ticket[];
}
export interface AuditPageResult {
  events: TicketEvent[];
  totalCount: number;
  ticketCount: number;
  actorCount: number;
}
type CreateUserInput = Extract<AdminUserActionRequest, { action: "create" }>;
type UpdateUserInput = Extract<AdminUserActionRequest, { action: "update" }>;
const catalogTables: Record<CatalogKind, string> = {
  categories: "ticket_categories",
  units: "units",
  priorities: "ticket_priorities",
  statuses: "ticket_statuses",
};
const profile = (r: Row, email = ""): Profile => ({
  id: r.id as string,
  username: r.username as string,
  email,
  fullName: r.full_name as string,
  phone: r.phone as string,
  role: r.role as Role,
  unitId: r.default_unit_id as string,
  isActive: r.is_active as boolean,
  mustChangePassword: r.must_change_password as boolean,
});
const unit = (r: Row): Unit => ({
  id: r.id as string,
  name: r.name as string,
  code: r.code as string,
  isActive: r.is_active as boolean,
});
const catalog = (r: Row): CatalogItem => ({
  id: r.id as string,
  name: r.name as string,
  description: r.description as string | undefined,
  code: r.code as string | undefined,
  slug: r.slug as string | undefined,
  color: r.color as string | undefined,
  isActive: r.is_active as boolean,
});
const ticket = (r: Row): Ticket => ({
  id: r.id as string,
  number: Number(r.ticket_number),
  title: r.title as string,
  description: r.description as string,
  unitId: r.unit_id as string,
  categoryId: r.category_id as string,
  priorityId: r.priority_id as string,
  status: r.status_slug as TicketStatus,
  createdBy: r.created_by as string,
  assignedTo: r.assigned_to as string | undefined,
  requesterName: r.requester_name_snapshot as string,
  requesterPhone: r.requester_phone_snapshot as string,
  resolutionNotes: r.resolution_notes as string | undefined,
  resolvedAt: r.resolved_at as string | undefined,
  closedAt: r.closed_at as string | undefined,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});
const ticketFromRow = (r: Row) => {
  const relation = r.ticket_statuses as Row | null;
  if (typeof relation?.slug !== "string") throw new Error("O status do chamado não foi retornado.");
  return ticket({ ...r, status_slug: relation.slug });
};
const message = (r: Row): TicketMessage => ({
  id: r.id as string,
  ticketId: r.ticket_id as string,
  senderId: r.sender_id as string,
  message: r.message as string,
  isInternal: r.is_internal as boolean,
  createdAt: r.created_at as string,
});
const event = (r: Row): TicketEvent => {
  const metadata = (r.metadata ?? {}) as Row;
  return {
    id: r.id as string,
    ticketId: r.ticket_id as string | undefined,
    actorId: r.actor_id as string | undefined,
    type: r.event_type as string,
    detail: (metadata.detail as string) ?? (r.event_type as string),
    createdAt: r.created_at as string,
    statusFrom: metadata.from_status_slug as string | undefined,
    statusTo: metadata.to_status_slug as string | undefined,
    priorityFromId: metadata.priority_from_id as string | undefined,
    priorityToId: metadata.priority_to_id as string | undefined,
    priorityFrom: metadata.priority_from as string | undefined,
    priorityTo: metadata.priority_to as string | undefined,
    ticketNumber: typeof r.ticket_number === "number" ? r.ticket_number : undefined,
    ticketTitle: typeof r.ticket_title === "string" ? r.ticket_title : undefined,
    requesterName:
      typeof r.requester_name_snapshot === "string" ? r.requester_name_snapshot : undefined,
  };
};

export class SupabaseRepository {
  private client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }
  private async getStatusId(status: TicketStatus) {
    const { data, error } = await this.client
      .from("ticket_statuses")
      .select("id")
      .eq("slug", status)
      .eq("is_active", true)
      .single();
    const row = requireMutationResult(
      { data: data as Row | null, error },
      `Não foi possível confirmar o status "${status}". Tente novamente.`,
    );
    if (typeof row.id !== "string" || !row.id)
      throw new Error(`O status "${status}" não está disponível neste momento.`);
    return row.id;
  }
  async getData(): Promise<AppData> {
    const [profiles, units, categories, priorities, statuses, participants] = await Promise.all([
      this.client.from("profiles").select("*").order("full_name"),
      this.client.from("units").select("*"),
      this.client.from("ticket_categories").select("*"),
      this.client.from("ticket_priorities").select("*").order("level"),
      this.client.from("ticket_statuses").select("*"),
      this.client.rpc("get_ticket_participants"),
    ]);
    const result = [profiles, units, categories, priorities, statuses, participants];
    const failed = result.find((item) => item.error);
    if (failed?.error) throw failed.error;
    const profileRows = (profiles.data ?? []) as Row[];
    return {
      profiles: profileRows.map((r) => profile(r, r.email as string | undefined)),
      ticketParticipants: (Array.isArray(participants.data)
        ? (participants.data as Row[])
        : []
      ).map((row) => ({
        id: row.id as string,
        fullName: row.full_name as string,
      })),
      units: (units.data ?? []).map((r) => unit(r as Row)),
      categories: (categories.data ?? []).map((r) => catalog(r as Row)),
      priorities: (priorities.data ?? []).map((r) => catalog(r as Row)),
      statuses: (statuses.data ?? []).map((r) => catalog(r as Row)),
    };
  }
  async getTicketMessages(ticketId: string) {
    const { data, error } = await this.client
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map((row) => message(row as Row));
  }
  async getTicketById(id: string) {
    const { data, error } = await this.client
      .from("tickets")
      .select("*, ticket_statuses!inner(slug)")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? ticketFromRow(data as Row) : null;
  }
  async getTicketPage(query: TicketPageQuery): Promise<TicketPageResult> {
    const { data, error } = await this.client.rpc("get_ticket_page", {
      p_view: query.view,
      p_assigned_to_me_only: query.assignedToMeOnly,
      p_status: query.status,
      p_statuses: query.statusSelection ?? [],
      p_priority_id: query.priorityId || null,
      p_unit_id: query.unitId || null,
      p_requester_id: query.requesterId || null,
      p_search: query.search,
      p_created_after: query.createdAfter ?? null,
      p_sort: query.sort,
      p_offset: query.offset,
      p_limit: query.limit,
    });
    if (error) throw error;
    const result = ((data ?? []) as Row[])[0];
    const rows = Array.isArray(result?.tickets) ? (result.tickets as Row[]) : [];
    return {
      tickets: rows.map((row) => ticketFromRow(row)),
      totalCount: Number(result?.total_count ?? 0),
      queueUnassignedCount: Number(result?.queue_unassigned_count ?? 0),
      queueInProgressCount: Number(result?.queue_in_progress_count ?? 0),
    };
  }
  async getTicketNavigationCounts() {
    const { data, error } = await this.client.rpc("get_ticket_navigation_counts");
    if (error) throw error;
    const row = ((data ?? []) as Row[])[0] ?? {};
    return {
      visibleOpenCount: Number(row.visible_open_count ?? 0),
      myOpenCount: Number(row.my_open_count ?? 0),
    };
  }
  async getTicketDashboard(): Promise<TicketDashboardData> {
    const { data, error } = await this.client.rpc("get_ticket_dashboard");
    if (error) throw error;
    const row = (data ?? {}) as Row;
    const rows = Array.isArray(row.tickets) ? (row.tickets as Row[]) : [];
    return {
      openCount: Number(row.open_count ?? 0),
      inProgressCount: Number(row.in_progress_count ?? 0),
      closedCount: Number(row.closed_count ?? 0),
      waitingCount: Number(row.waiting_count ?? 0),
      urgentCount: Number(row.urgent_count ?? 0),
      unassignedCount: Number(row.unassigned_count ?? 0),
      assignedToMeCount: Number(row.assigned_to_me_count ?? 0),
      waitingForRequesterCount: Number(row.waiting_for_requester_count ?? 0),
      tickets: rows.map((ticketRow) => ticketFromRow(ticketRow)),
    };
  }
  async getAuditEventsPage(query: {
    actorId: string;
    type: string;
    from?: string;
    to?: string;
    search: string;
    offset: number;
    limit: number;
  }): Promise<AuditPageResult> {
    const { data, error } = await this.client.rpc("get_audit_events_page", {
      p_actor_id: query.actorId || null,
      p_event_type: query.type,
      p_from: query.from ?? null,
      p_to: query.to ?? null,
      p_search: query.search,
      p_offset: query.offset,
      p_limit: query.limit,
    });
    if (error) throw error;
    const row = ((data ?? []) as Row[])[0] ?? {};
    const rows = Array.isArray(row.events) ? (row.events as Row[]) : [];
    return {
      events: rows.map((eventRow) => event(eventRow)),
      totalCount: Number(row.total_count ?? 0),
      ticketCount: Number(row.ticket_count ?? 0),
      actorCount: Number(row.actor_count ?? 0),
    };
  }
  async getTicketEvents(ticketId: string) {
    const { data, error } = await this.client
      .from("ticket_events")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => event(row as Row));
  }
  async getLatestPublicTicketMessages() {
    const { data, error } = await this.client.rpc("get_latest_public_ticket_messages");
    if (error) throw error;
    return ((data ?? []) as Row[]).map((row) => ({
      ticketId: row.ticket_id as string,
      senderId: row.sender_id as string,
    }));
  }
  async getCurrentUser(): Promise<Profile | null> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) return null;
    const { data: row, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();
    if (error || !row || !(row as Row).is_active || (row as Row).must_change_password) return null;
    return profile(row as Row, data.user.email ?? "");
  }
  private async getTicketForMutation(id: string): Promise<Ticket> {
    const result = await this.client
      .from("tickets")
      .select("*, ticket_statuses!inner(slug)")
      .eq("id", id)
      .maybeSingle();
    const row = requireMutationResult(result, "Chamado não encontrado ou sem acesso.");
    return ticketFromRow(row as Row);
  }
  async getAdminUsers(): Promise<Profile[]> {
    const { users } = await this.invokeUserAction<{ users: Row[] }>({ action: "list" });
    return users.map((row) => profile(row, typeof row.email === "string" ? row.email : ""));
  }
  async getNotifications(userId: string, offset = 0, limit = 50) {
    const { data, error } = await this.client
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return (data ?? [])
      .map((row) => this.mapNotification(row))
      .filter((item): item is AppNotification => item !== null);
  }
  async getUnreadNotificationCount(userId: string) {
    const { count, error } = await this.client
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) throw error;
    return count ?? 0;
  }
  mapNotification(row: Record<string, unknown>): AppNotification | null {
    if (
      typeof row.id !== "string" ||
      typeof row.user_id !== "string" ||
      typeof row.title !== "string" ||
      typeof row.message !== "string" ||
      typeof row.created_at !== "string" ||
      typeof row.read !== "boolean"
    )
      return null;
    return {
      id: row.id,
      userId: row.user_id,
      title: row.title,
      message: row.message,
      createdAt: row.created_at,
      read: row.read,
      ticketId: typeof row.ticket_id === "string" ? row.ticket_id : undefined,
    };
  }
  async markNotificationRead(userId: string, id: string) {
    await this.updateNotification(userId, id, { read: true });
  }
  async markAllNotificationsRead(userId: string) {
    const { error } = await this.client
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId);
    if (error) throw error;
  }
  async deleteNotification(userId: string, id: string) {
    const { error } = await this.client
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  }
  async deleteAllNotifications(userId: string) {
    const { error } = await this.client.from("notifications").delete().eq("user_id", userId);
    if (error) throw error;
  }
  private async updateNotification(userId: string, id: string, values: Row) {
    const { error } = await this.client
      .from("notifications")
      .update(values)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  }
  async createTicket(
    input: Pick<Ticket, "title" | "description" | "unitId" | "categoryId" | "priorityId">,
  ) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Sessão expirada.");
    if (input.title.trim().length < 5)
      throw new Error("O título precisa ter pelo menos 5 caracteres.");
    if (input.description.trim().length < 10)
      throw new Error("Descreva o problema com pelo menos 10 caracteres.");
    const statusId = await this.getStatusId("aberto");
    const { data, error } = await this.client
      .from("tickets")
      .insert({
        title: input.title.trim(),
        description: input.description.trim(),
        unit_id: input.unitId,
        category_id: input.categoryId,
        priority_id: input.priorityId,
        status_id: statusId,
        created_by: user.id,
        requester_name_snapshot: user.fullName,
        requester_phone_snapshot: user.phone,
      })
      .select("*, ticket_statuses!inner(slug)")
      .single();
    if (error || !data) throw error ?? new Error("Não foi possível criar o chamado.");
    return ticketFromRow(data as Row);
  }
  async addMessage(ticketId: string, text: string, internal: boolean) {
    const user = await this.getCurrentUser();
    if (!user || !text.trim()) throw new Error("Escreva uma mensagem antes de enviar.");
    const target = await this.getTicketForMutation(ticketId);
    assertMessageAllowed(user, target, internal);
    const { data: row, error } = await this.client
      .from("ticket_messages")
      .insert({
        ticket_id: ticketId,
        sender_id: user.id,
        message: text.trim(),
        is_internal: internal,
      })
      .select()
      .single();
    if (error || !row) throw error ?? new Error("Não foi possível enviar a mensagem.");
    return message(row as Row);
  }
  async claim(id: string) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Sessão expirada.");
    const statusId = await this.getStatusId("em_andamento");
    const result = await this.client
      .from("tickets")
      .update({
        assigned_to: user.id,
        status_id: statusId,
      })
      .eq("id", id)
      .is("assigned_to", null)
      .select("*, ticket_statuses!inner(slug)")
      .maybeSingle();
    return ticketFromRow(
      requireMutationResult(result, "O chamado não está mais disponível para assumir.") as Row,
    );
  }
  async assign(id: string, userId: string) {
    const statusId = await this.getStatusId(userId ? "em_andamento" : "aberto");
    const result = await this.client
      .from("tickets")
      .update({ assigned_to: userId || null, status_id: statusId })
      .eq("id", id)
      .select("*, ticket_statuses!inner(slug)")
      .maybeSingle();
    return ticketFromRow(
      requireMutationResult(
        result,
        "O chamado não pôde ser atualizado. Atualize a página e tente novamente.",
      ) as Row,
    );
  }
  async changeStatus(id: string, status: TicketStatus, resolutionNotes?: string) {
    const [user, target] = await Promise.all([
      this.getCurrentUser(),
      this.getTicketForMutation(id),
    ]);
    if (!user || !target) throw new Error("Chamado não encontrado.");
    assertStatusChangeAllowed(user, target, status);
    if (status === "resolvido" && !resolutionNotes?.trim())
      throw new Error("Informe a descrição da solução antes de resolver.");
    const statusId = await this.getStatusId(status);
    const result = await this.client
      .from("tickets")
      .update({
        status_id: statusId,
        ...(status === "aberto" ? { assigned_to: null } : {}),
        ...(status === "resolvido"
          ? {
              resolution_notes: resolutionNotes?.trim(),
            }
          : {}),
      })
      .eq("id", id)
      .select("*, ticket_statuses!inner(slug)")
      .maybeSingle();
    return ticketFromRow(
      requireMutationResult(
        result,
        "O chamado não pôde ser atualizado. Atualize a página e tente novamente.",
      ) as Row,
    );
  }
  async updatePriority(id: string, priorityId: string) {
    const [user, target, priorityResult] = await Promise.all([
      this.getCurrentUser(),
      this.getTicketForMutation(id),
      this.client
        .from("ticket_priorities")
        .select("id")
        .eq("id", priorityId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    if (!user || !target || !isStaff(user.role)) throw new Error("Acesso restrito a equipe.");
    if (priorityResult.error) throw priorityResult.error;
    if (!priorityResult.data) throw new Error("Prioridade inválida ou inativa.");
    const result = await this.client
      .from("tickets")
      .update({ priority_id: priorityId })
      .eq("id", id)
      .select("*, ticket_statuses!inner(slug)")
      .maybeSingle();
    return ticketFromRow(
      requireMutationResult(
        result,
        "O chamado não pôde ser atualizado. Atualize a página e tente novamente.",
      ) as Row,
    );
  }
  async saveProfile(input: Pick<Profile, "fullName" | "phone">) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Sessão expirada.");
    const { data, error } = await this.client.rpc("update_own_profile", {
      p_full_name: input.fullName.trim(),
      p_phone: input.phone.trim(),
    });
    requireMutationResult(
      { data: data === true ? true : null, error },
      "Não foi possível atualizar o perfil. Verifique o acesso e tente novamente.",
    );
  }
  async invokeUserAction<T = Row>(request: AdminUserActionRequest): Promise<T> {
    const { data, error } = await this.client.functions.invoke("admin-users", {
      body: request,
    });
    if (error) {
      const context = "context" in error ? error.context : undefined;
      if (context && typeof (context as { json?: unknown }).json === "function") {
        const body = (await (context as Response).json().catch(() => null)) as Row | null;
        if (typeof body?.error === "string") throw new Error(body.error);
      }
      throw new Error("Não foi possível concluir a operação administrativa.");
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
  }
  async createUser(input: Omit<CreateUserInput, "action">) {
    return this.invokeUserAction<{ id: string }>({ action: "create", ...input });
  }
  async updateUser(id: string, input: Omit<UpdateUserInput, "action" | "id">) {
    return this.invokeUserAction<{ outcome: "updated"; id: string }>({
      action: "update",
      ...input,
      id,
    });
  }
  async toggleUser(id: string) {
    return this.invokeUserAction<{ outcome: "updated"; id: string }>({ action: "toggle", id });
  }
  async deleteUser(id: string): Promise<AdminUserDeleteOutcome> {
    return this.invokeUserAction<AdminUserDeleteOutcome>({ action: "delete", id });
  }
  async resetUserPassword(id: string, password: string) {
    return this.invokeUserAction<{ ok: true }>({ action: "reset_password", id, password });
  }
  async changeRole(id: string, role: Role) {
    return this.updateUser(id, { role });
  }
  async bulkSetUsersActive(ids: string[], isActive: boolean) {
    return this.invokeUserAction<{ updated: string[] }>({ action: "bulk_toggle", ids, isActive });
  }
  async bulkDeleteUsers(ids: string[]): Promise<BulkUserDeleteResult> {
    return this.invokeUserAction<BulkUserDeleteResult>({ action: "bulk_delete", ids });
  }
  async addCatalog(kind: "categories" | "units", name: string, description = "") {
    const table = kind === "units" ? "units" : "ticket_categories";
    const { error } =
      kind === "units"
        ? await this.client
            .from(table)
            .insert({ name: name.trim(), code: name.trim().slice(0, 3).toUpperCase() })
        : await this.client
            .from(table)
            .insert({ name: name.trim(), description: description.trim() || null });
    if (error) throw error;
  }
  async renameCatalog(kind: CatalogKind, id: string, name: string, description = "") {
    const table = catalogTables[kind];
    const values = {
      name: name.trim(),
      ...(kind === "categories" ? { description: description.trim() || null } : {}),
    };
    const result = await this.client
      .from(table)
      .update(values)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    requireMutationResult(
      result,
      "O item do catálogo não foi encontrado ou não pôde ser atualizado.",
    );
  }
  async setCatalogActive(kind: CatalogKind, id: string, isActive: boolean) {
    const table = catalogTables[kind];
    const result = await this.client
      .from(table)
      .update({ is_active: isActive })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    requireMutationResult(
      result,
      "O item do catálogo não foi encontrado ou não pôde ser atualizado.",
    );
  }
  async deleteCatalog(kind: CatalogKind, id: string) {
    const table = catalogTables[kind];
    const { data, error } = await this.client
      .from(table)
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error?.code === "23503") {
      await this.setCatalogActive(kind, id, false);
      return "deactivated" as const;
    }
    requireMutationResult(
      { data: data as Row | null, error },
      "O item do catálogo não foi encontrado ou não pôde ser excluído.",
    );
    return "deleted" as const;
  }
  async bulkSetCatalogActive(kind: CatalogKind, ids: string[], isActive: boolean) {
    const table = catalogTables[kind];
    const result = await this.client
      .from(table)
      .update({ is_active: isActive })
      .in("id", ids)
      .select("id");
    const rows = requireMutationResult(result, "Nenhum item do catálogo foi atualizado.");
    if (rows.length === 0) throw new Error("Nenhum item do catálogo foi atualizado.");
  }
  async bulkDeleteCatalog(kind: CatalogKind, ids: string[]) {
    await Promise.all(ids.map((id) => this.deleteCatalog(kind, id)));
  }
}
