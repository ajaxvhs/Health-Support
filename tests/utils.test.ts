import { describe, expect, it } from "vitest";
import {
  averageFirstPublicStaffResponseMinutes,
  filterAuditEvents,
  filterTickets,
  formatResponseTime,
} from "../src/lib/utils";
import type { Profile, Ticket, TicketMessage } from "../src/types";

const requester: Profile = {
  id: "requester",
  fullName: "Ana Pessoa",
  username: "ana.pessoa",
  email: "ana@example.com",
  phone: "",
  role: "solicitante",
  unitId: "unit-a",
  isActive: true,
};
const staff: Profile = {
  id: "staff",
  fullName: "Equipe TI",
  username: "equipe.ti",
  email: "ti@example.com",
  phone: "",
  role: "atendente",
  unitId: "unit-a",
  isActive: true,
};
const ticket = (id: string, createdAt: string, priorityId = "low"): Ticket => ({
  id,
  number: Number(id.replace("t-", "")),
  title: id === "t-1" ? "Rede indisponivel" : "Impressora",
  description: "Descricao do chamado",
  unitId: "unit-a",
  categoryId: "cat",
  priorityId,
  status: "aberto",
  createdBy: requester.id,
  requesterName: requester.fullName,
  requesterPhone: "",
  createdAt,
  updatedAt: createdAt,
});

describe("metricas e filtros de chamados", () => {
  it("calcula a primeira resposta publica de equipe e ignora nota interna", () => {
    const tickets = [ticket("t-1", "2025-01-10T10:00:00.000Z")];
    const messages: TicketMessage[] = [
      {
        id: "internal",
        ticketId: "t-1",
        senderId: staff.id,
        message: "nota",
        isInternal: true,
        createdAt: "2025-01-10T10:30:00.000Z",
      },
      {
        id: "public",
        ticketId: "t-1",
        senderId: staff.id,
        message: "resposta",
        isInternal: false,
        createdAt: "2025-01-10T11:30:00.000Z",
      },
      {
        id: "requester",
        ticketId: "t-1",
        senderId: requester.id,
        message: "retorno",
        isInternal: false,
        createdAt: "2025-01-10T11:00:00.000Z",
      },
    ];
    expect(averageFirstPublicStaffResponseMinutes(tickets, messages, [requester, staff])).toBe(90);
    expect(formatResponseTime(90)).toBe("1h 30min");
    expect(formatResponseTime(null)).toBe("Sem respostas ainda");
  });

  it("filtra por busca, prioridade e periodo e ordena resultados", () => {
    const tickets = [
      ticket("t-1", "2025-01-10T10:00:00.000Z", "high"),
      ticket("t-2", "2025-01-01T10:00:00.000Z", "low"),
    ];
    const result = filterTickets(
      tickets,
      {
        search: "rede",
        status: "todos",
        priorityId: "high",
        unitId: "",
        requesterId: "",
        dateRange: "7d",
        sort: "newest",
      },
      { unitNames: { "unit-a": "Unidade A" }, now: Date.parse("2025-01-10T15:00:00.000Z") },
    );
    expect(result.map((item) => item.id)).toEqual(["t-1"]);
  });

  it("filtra auditoria por ator, ação, texto e intervalo de data", () => {
    const events = [
      {
        id: "e-1",
        ticketId: "t-1",
        actorId: staff.id,
        type: "status_changed",
        detail: "Status alterado",
        createdAt: "2025-01-10T10:00:00.000Z",
      },
      {
        id: "e-2",
        ticketId: "t-2",
        actorId: requester.id,
        type: "message_added",
        detail: "Mensagem adicionada",
        createdAt: "2025-01-01T10:00:00.000Z",
      },
    ];
    expect(
      filterAuditEvents(events, [requester, staff], {
        search: "equipe",
        actorId: staff.id,
        type: "status_changed",
        from: "2025-01-09T00:00",
        to: "2025-01-11T23:59",
      }),
    ).toHaveLength(1);
  });
});
