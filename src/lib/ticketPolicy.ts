import type { Profile, Ticket, TicketStatus } from "../types";

export const ticketStatuses: TicketStatus[] = ["aberto", "em_andamento", "resolvido", "fechado"];

const transitions: Record<TicketStatus, TicketStatus[]> = {
  aberto: ["em_andamento"],
  em_andamento: ["resolvido"],
  resolvido: ["fechado", "em_andamento"],
  fechado: [],
};

export function assertMessageAllowed(actor: Profile, ticket: Ticket, internal: boolean) {
  if (actor.role === "solicitante" && ticket.createdBy !== actor.id)
    throw new Error("Acesso negado.");
  if (internal && actor.role === "solicitante")
    throw new Error("Você não pode criar notas internas.");
  if (actor.role === "solicitante" && ticket.status === "fechado")
    throw new Error("Chamados fechados não aceitam novas mensagens.");
}

export function assertStatusChangeAllowed(
  actor: Profile,
  ticket: Ticket,
  nextStatus: TicketStatus,
) {
  if (!ticketStatuses.includes(nextStatus)) throw new Error("Status inválido.");
  if (actor.role === "solicitante" && actor.id !== ticket.createdBy)
    throw new Error("Acesso negado.");
  if (
    actor.role === "solicitante" &&
    !(ticket.status === "resolvido" && ["fechado", "em_andamento"].includes(nextStatus))
  )
    throw new Error("Esta transição não está disponível.");
  if (actor.role === "atendente" && ticket.assignedTo !== actor.id)
    throw new Error("Assuma o chamado antes de atualizá-lo.");
  if (
    actor.role !== "admin" &&
    nextStatus !== ticket.status &&
    !transitions[ticket.status].includes(nextStatus)
  )
    throw new Error("Esta transição não está disponível.");
}
