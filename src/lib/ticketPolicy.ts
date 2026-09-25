import type { Profile, Ticket, TicketStatus } from "../types";

export const ticketStatuses: TicketStatus[] = ["aberto", "em_andamento", "resolvido", "fechado"];

const transitions: Record<TicketStatus, TicketStatus[]> = {
  aberto: ["fechado"],
  em_andamento: ["aberto", "resolvido", "fechado"],
  resolvido: ["aberto"],
  fechado: ["aberto"],
};

export function assertMessageAllowed(actor: Profile, ticket: Ticket, internal: boolean) {
  if (ticket.status === "resolvido" || ticket.status === "fechado")
    throw new Error(
      "Chamados resolvidos ou fechados não aceitam novas mensagens. Reabra o chamado para continuar.",
    );
  if (actor.role === "solicitante" && ticket.createdBy !== actor.id)
    throw new Error("Acesso negado.");
  if (internal && actor.role === "solicitante")
    throw new Error("Você não pode criar notas internas.");
  if (
    actor.role === "atendente" &&
    ticket.assignedTo !== actor.id &&
    ticket.assignedTo !== undefined
  )
    throw new Error("Assuma o chamado antes de enviar uma mensagem.");
}

export function canReopenTicket(actor: Profile, ticket: Ticket) {
  if (ticket.status !== "resolvido" && ticket.status !== "fechado") return false;
  return actor.role === "admin";
}

export function isTicketTerminal(ticket: Ticket) {
  return ticket.status === "resolvido" || ticket.status === "fechado";
}

export function availableStatusTransitions(actor: Profile, ticket: Ticket): TicketStatus[] {
  if (isTicketTerminal(ticket)) return canReopenTicket(actor, ticket) ? ["aberto"] : [];
  if (actor.role === "solicitante") return [];
  if (ticket.status === "aberto") return actor.role === "admin" ? ["fechado"] : [];
  if (ticket.status === "em_andamento" && !ticket.assignedTo)
    return actor.role === "admin" ? ["fechado"] : [];
  if (actor.role === "atendente" && ticket.assignedTo !== actor.id) return [];
  return transitions[ticket.status].filter((status) => status !== "resolvido");
}

export function assertStatusChangeAllowed(
  actor: Profile,
  ticket: Ticket,
  nextStatus: TicketStatus,
) {
  if (!ticketStatuses.includes(nextStatus)) throw new Error("Status inválido.");
  if (actor.role === "solicitante" && actor.id !== ticket.createdBy)
    throw new Error("Acesso negado.");
  if (actor.role === "solicitante" && nextStatus !== "aberto")
    throw new Error("Esta transição não está disponível.");
  if (actor.role === "atendente" && ticket.assignedTo !== actor.id)
    throw new Error("Assuma o chamado antes de atualizá-lo.");
  if (
    (ticket.status === "resolvido" || ticket.status === "fechado") &&
    nextStatus === "aberto" &&
    actor.role !== "admin"
  )
    throw new Error("Somente um administrador pode reabrir o chamado.");
  if (nextStatus !== ticket.status && !transitions[ticket.status].includes(nextStatus))
    throw new Error("Esta transição não está disponível.");
}
