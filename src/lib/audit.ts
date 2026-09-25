import type { CatalogItem, TicketEvent, TicketStatus } from "../types";
import { ticketStatuses } from "../types";

export const auditEventLabels: Record<string, string> = {
  created: "Chamado aberto",
  assigned: "Atribuiu o chamado",
  unassigned: "Liberou o chamado para a fila",
  status_changed: "Status alterado",
  priority_changed: "Prioridade alterada",
  message_added: "Mensagem adicionada",
  claimed: "Assumiu o chamado",
  reopened: "Reabriu o chamado",
  resolved: "Resolveu o chamado",
  closed: "Encerrou o chamado sem solução registrada",
  released: "Liberou o chamado para a fila",
  reassigned: "Reatribuiu o chamado",
  ticket_details_updated: "Detalhes do chamado atualizados",
  password_changed: "Senha alterada",
  profile_updated: "Perfil atualizado",
  user_created: "Usuário criado",
  user_updated: "Usuário atualizado",
  user_activated: "Usuário ativado",
  user_deactivated: "Usuário desativado",
  user_deleted: "Usuário excluído",
  role_changed: "Perfil de acesso alterado",
  catalog_created: "Item de catálogo criado",
  catalog_renamed: "Item de catálogo renomeado",
  catalog_activated: "Item de catálogo ativado",
  catalog_deactivated: "Item de catálogo desativado",
  catalog_deleted: "Item de catálogo excluído",
};

function catalogItemByName(items: CatalogItem[], name: string | undefined) {
  if (!name) return undefined;
  return items.find(
    (item) => item.name.localeCompare(name.trim(), "pt-BR", { sensitivity: "base" }) === 0,
  );
}

export function auditEventStatus(
  event: TicketEvent,
  statuses: CatalogItem[],
): TicketStatus | undefined {
  const metadataStatus = ticketStatuses.find((status) => status === event.statusTo);
  if (metadataStatus) return metadataStatus;

  const statusFromType: Partial<Record<string, TicketStatus>> = {
    created: "aberto",
    claimed: "em_andamento",
    reopened: "aberto",
    released: "aberto",
    resolved: "resolvido",
    closed: "fechado",
  };
  const statusSlug =
    statusFromType[event.type] ??
    (event.type === "status_changed"
      ? catalogItemByName(statuses, event.detail.match(/^Situação alterada para\s+(.+)$/i)?.[1])
          ?.slug
      : undefined);

  return ticketStatuses.find((status) => status === statusSlug);
}

export function auditEventPriorityIds(
  event: TicketEvent,
  priorities: CatalogItem[],
): [string, string] | undefined {
  if (event.priorityFromId && event.priorityToId) return [event.priorityFromId, event.priorityToId];

  const legacyNames = event.detail.match(/^Prioridade alterada de\s+(.+)\s+para\s+(.+)$/i);
  const from = catalogItemByName(priorities, event.priorityFrom ?? legacyNames?.[1]);
  const to = catalogItemByName(priorities, event.priorityTo ?? legacyNames?.[2]);
  return from && to ? [from.id, to.id] : undefined;
}
