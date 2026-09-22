import { describe, expect, it } from "vitest";
import { filterAuditEvents, filterTickets } from "../src/lib/utils";
import type { Profile, Ticket } from "../src/types";

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
const ticket = (
  id: string,
  createdAt: string,
  priorityId = "low",
  status: Ticket["status"] = "aberto",
): Ticket => ({
  id,
  number: Number(id.replace("t-", "")),
  title: id === "t-1" ? "Rede indisponivel" : "Impressora",
  description: "Descricao do chamado",
  unitId: "unit-a",
  categoryId: "cat",
  priorityId,
  status,
  createdBy: requester.id,
  requesterName: requester.fullName,
  requesterPhone: "",
  createdAt,
  updatedAt: createdAt,
});

describe("metricas e filtros de chamados", () => {
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

  it("mantem chamados abertos e em andamento no filtro de chamados abertos", () => {
    const result = filterTickets(
      [
        ticket("t-1", "2025-01-10T10:00:00.000Z", "low", "aberto"),
        ticket("t-2", "2025-01-09T10:00:00.000Z", "low", "em_andamento"),
        ticket("t-3", "2025-01-08T10:00:00.000Z", "low", "resolvido"),
        ticket("t-4", "2025-01-07T10:00:00.000Z", "low", "fechado"),
      ],
      {
        search: "",
        status: "todos",
        statusSelection: ["aberto", "em_andamento"],
        priorityId: "",
        unitId: "",
        requesterId: "",
        dateRange: "all",
        sort: "newest",
      },
    );
    expect(result.map((item) => item.id)).toEqual(["t-1", "t-2"]);
  });

  it("mantem chamados abertos antes dos encerrados e aplica a ordenacao dentro de cada grupo", () => {
    const tickets = [
      ticket("t-1", "2025-01-10T10:00:00.000Z", "high", "fechado"),
      ticket("t-2", "2025-01-01T10:00:00.000Z", "low", "aberto"),
      ticket("t-3", "2025-01-05T10:00:00.000Z", "low", "resolvido"),
      ticket("t-4", "2025-01-08T10:00:00.000Z", "high", "em_andamento"),
    ];
    const filters = {
      search: "",
      status: "todos" as const,
      priorityId: "",
      unitId: "",
      requesterId: "",
      dateRange: "all" as const,
      sort: "newest" as const,
    };

    expect(filterTickets(tickets, filters).map((item) => item.id)).toEqual([
      "t-4",
      "t-2",
      "t-1",
      "t-3",
    ]);
    expect(filterTickets(tickets, { ...filters, sort: "oldest" }).map((item) => item.id)).toEqual([
      "t-2",
      "t-4",
      "t-3",
      "t-1",
    ]);
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
