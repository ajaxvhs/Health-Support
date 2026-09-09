import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AppData,
  AppNotification,
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

type Row = Record<string, unknown>;
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
const message = (r: Row): TicketMessage => ({
  id: r.id as string,
  ticketId: r.ticket_id as string,
  senderId: r.sender_id as string,
  message: r.message as string,
  isInternal: r.is_internal as boolean,
  createdAt: r.created_at as string,
});
const event = (r: Row): TicketEvent => ({
  id: r.id as string,
  ticketId: r.ticket_id as string | undefined,
  actorId: r.actor_id as string,
  type: r.event_type as string,
  detail: ((r.metadata as Row)?.detail as string) ?? (r.event_type as string),
  createdAt: r.created_at as string,
});

export class SupabaseRepository {
  private client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }
  async getData(): Promise<AppData> {
    const [profiles, units, categories, priorities, statuses, tickets, messages, events] =
      await Promise.all([
        this.client.from("profiles").select("*").order("full_name"),
        this.client.from("units").select("*"),
        this.client.from("ticket_categories").select("*"),
        this.client.from("ticket_priorities").select("*").order("level"),
        this.client.from("ticket_statuses").select("*"),
        this.client
          .from("tickets")
          .select("*, ticket_statuses!inner(slug)")
          .order("created_at", { ascending: false }),
        this.client.from("ticket_messages").select("*").order("created_at"),
        this.client.from("ticket_events").select("*").order("created_at", { ascending: false }),
      ]);
    const result = [profiles, units, categories, priorities, statuses, tickets, messages, events];
    const failed = result.find((item) => item.error);
    if (failed?.error) throw failed.error;
    let profileRows = (profiles.data ?? []) as Row[];
    const current = await this.getCurrentUser();
    if (current?.role === "admin") {
      const listed = await this.invokeUserAction("list", {});
      profileRows = (listed.users ?? profileRows) as Row[];
    }
    return {
      profiles: profileRows.map((r) => profile(r, r.email as string | undefined)),
      units: (units.data ?? []).map((r) => unit(r as Row)),
      categories: (categories.data ?? []).map((r) => catalog(r as Row)),
      priorities: (priorities.data ?? []).map((r) => catalog(r as Row)),
      statuses: (statuses.data ?? []).map((r) => catalog(r as Row)),
      tickets: (tickets.data ?? []).map((r) =>
        ticket({ ...(r as Row), status_slug: ((r as Row).ticket_statuses as Row).slug }),
      ),
      messages: (messages.data ?? []).map((r) => message(r as Row)),
      events: (events.data ?? []).map((r) => event(r as Row)),
    };
  }
  async getCurrentUser(): Promise<Profile | null> {
    const { data } = await this.client.auth.getUser();
    if (!data.user) return null;
    const { data: row, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();
    if (error || !row || !(row as Row).is_active) return null;
    return profile(row as Row, data.user.email ?? "");
  }
  async getNotifications(userId: string) {
    const { data, error } = await this.client
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(
      (r) =>
        ({
          id: r.id,
          userId: r.user_id,
          title: r.title,
          message: r.message,
          createdAt: r.created_at,
          read: r.read,
          ticketId: r.ticket_id ?? undefined,
        }) as AppNotification,
    );
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
    const { data, error } = await this.client
      .from("tickets")
      .insert({
        title: input.title.trim(),
        description: input.description.trim(),
        unit_id: input.unitId,
        category_id: input.categoryId,
        priority_id: input.priorityId,
        status_id: (
          await this.client.from("ticket_statuses").select("id").eq("slug", "aberto").single()
        ).data?.id,
        created_by: user.id,
        requester_name_snapshot: user.fullName,
        requester_phone_snapshot: user.phone,
      })
      .select("*, ticket_statuses!inner(slug)")
      .single();
    if (error || !data) throw error ?? new Error("Não foi possível criar o chamado.");
    return ticket({ ...(data as Row), status_slug: ((data as Row).ticket_statuses as Row).slug });
  }
  async addMessage(ticketId: string, text: string, internal: boolean) {
    const user = await this.getCurrentUser();
    if (!user || !text.trim()) throw new Error("Escreva uma mensagem antes de enviar.");
    const data = await this.getData();
    const target = data.tickets.find((item) => item.id === ticketId);
    if (!target) throw new Error("Chamado não encontrado.");
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
    const { error } = await this.client
      .from("tickets")
      .update({
        assigned_to: user.id,
        status_id: (
          await this.client.from("ticket_statuses").select("id").eq("slug", "em_andamento").single()
        ).data?.id,
      })
      .eq("id", id)
      .is("assigned_to", null);
    if (error) throw error;
  }
  async assign(id: string, userId: string) {
    const status = userId ? "em_andamento" : undefined;
    const { data: statusRow } = status
      ? await this.client.from("ticket_statuses").select("id").eq("slug", status).single()
      : { data: null };
    const { error } = await this.client
      .from("tickets")
      .update({ assigned_to: userId || null, ...(statusRow ? { status_id: statusRow.id } : {}) })
      .eq("id", id);
    if (error) throw error;
  }
  async changeStatus(id: string, status: TicketStatus, resolutionNotes?: string) {
    const user = await this.getCurrentUser();
    const data = await this.getData();
    const target = data.tickets.find((item) => item.id === id);
    if (!user || !target) throw new Error("Chamado não encontrado.");
    assertStatusChangeAllowed(user, target, status);
    if (status === "resolvido" && !resolutionNotes?.trim())
      throw new Error("Informe a descrição da solução antes de resolver.");
    const { data: row } = await this.client
      .from("ticket_statuses")
      .select("id")
      .eq("slug", status)
      .single();
    const { error } = await this.client
      .from("tickets")
      .update({
        status_id: row?.id,
        ...(status === "resolvido"
          ? {
              resolution_notes: resolutionNotes?.trim(),
              resolved_at: new Date().toISOString(),
            }
          : {}),
        ...(status === "fechado" ? { closed_at: new Date().toISOString() } : {}),
      })
      .eq("id", id);
    if (error) throw error;
  }
  async updatePriority(id: string, priorityId: string) {
    const user = await this.getCurrentUser();
    const data = await this.getData();
    const target = data.tickets.find((item) => item.id === id);
    if (!user || !target || !isStaff(user.role)) throw new Error("Acesso restrito a equipe.");
    if (user.role === "atendente" && target.assignedTo !== user.id)
      throw new Error("Assuma o chamado antes de atualizá-lo.");
    if (!data.priorities.some((item) => item.id === priorityId && item.isActive))
      throw new Error("Prioridade inválida ou inativa.");
    const { error } = await this.client
      .from("tickets")
      .update({ priority_id: priorityId })
      .eq("id", id);
    if (error) throw error;
  }
  async saveProfile(input: Pick<Profile, "fullName" | "phone">) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error("Sessão expirada.");
    const { error } = await this.client
      .from("profiles")
      .update({ full_name: input.fullName.trim(), phone: input.phone.trim() })
      .eq("id", user.id);
    if (error) throw error;
  }
  async invokeUserAction(action: string, payload: Row) {
    const { data, error } = await this.client.functions.invoke("admin-users", {
      body: { action, ...payload },
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
    return data;
  }
  async createUser(input: Row) {
    return this.invokeUserAction("create", input);
  }
  async updateUser(id: string, input: Row) {
    return this.invokeUserAction("update", { id, ...input });
  }
  async toggleUser(id: string) {
    return this.invokeUserAction("toggle", { id });
  }
  async deleteUser(id: string) {
    return this.invokeUserAction("delete", { id });
  }
  async resetUserPassword(id: string, password: string) {
    return this.invokeUserAction("reset_password", { id, password });
  }
  async changeRole(id: string, role: Role) {
    return this.invokeUserAction("update", { id, role });
  }
  async bulkSetUsersActive(ids: string[], isActive: boolean) {
    return this.invokeUserAction("bulk_toggle", { ids, isActive });
  }
  async bulkDeleteUsers(ids: string[]) {
    return this.invokeUserAction("bulk_delete", { ids });
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
    const { error } = await this.client.from(table).update(values).eq("id", id);
    if (error) throw error;
  }
  async setCatalogActive(kind: CatalogKind, id: string, isActive: boolean) {
    const table = catalogTables[kind];
    const { error } = await this.client.from(table).update({ is_active: isActive }).eq("id", id);
    if (error) throw error;
  }
  async deleteCatalog(kind: CatalogKind, id: string) {
    const table = catalogTables[kind];
    const { error } = await this.client.from(table).delete().eq("id", id);
    if (!error) return "deleted" as const;
    if (error.code !== "23503") throw error;
    await this.setCatalogActive(kind, id, false);
    return "deactivated" as const;
  }
  async bulkSetCatalogActive(kind: CatalogKind, ids: string[], isActive: boolean) {
    const table = catalogTables[kind];
    const { error } = await this.client.from(table).update({ is_active: isActive }).in("id", ids);
    if (error) throw error;
  }
  async bulkDeleteCatalog(kind: CatalogKind, ids: string[]) {
    await Promise.all(ids.map((id) => this.deleteCatalog(kind, id)));
  }
}
