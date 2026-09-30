import { describe, expect, it } from "vitest";
import {
  errorMessage,
  filterAuditEvents,
  filterTickets,
  refreshAndNotify,
  refreshAfterMutation,
  resolutionValueForTicket,
} from "../src/lib/utils";
import { normalizeError, withErrorContext } from "../src/lib/errors";
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
  role: "admin",
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

  it("busca eventos por número exato ou título do chamado", () => {
    const events = [
      {
        id: "e-1",
        ticketId: "t-42",
        actorId: staff.id,
        type: "status_changed",
        detail: "Status alterado",
        createdAt: "2025-01-10T10:00:00.000Z",
      },
      {
        id: "e-2",
        ticketId: "t-420",
        actorId: requester.id,
        type: "status_changed",
        detail: "Status alterado",
        createdAt: "2025-01-10T11:00:00.000Z",
      },
    ];
    const tickets = [
      { ...ticket("t-42", "2025-01-01"), title: "Rede local" },
      { ...ticket("t-420", "2025-01-01"), title: "Impressora" },
    ];

    expect(
      filterAuditEvents(
        events,
        [requester, staff],
        { search: "#42", actorId: "", type: "", from: "", to: "" },
        tickets,
      ).map((event) => event.id),
    ).toEqual(["e-1"]);
    expect(
      filterAuditEvents(
        events,
        [requester, staff],
        { search: "impressora", actorId: "", type: "", from: "", to: "" },
        tickets,
      ).map((event) => event.id),
    ).toEqual(["e-2"]);
  });
});

describe("mensagens de erro do repository", () => {
  it("mapeia códigos conhecidos sem expor detalhes do banco", () => {
    expect(errorMessage({ code: "23503", message: "internal table detail" }, "Falha.")).toBe(
      "Este item está vinculado a outros registros e não pode ser excluído.",
    );
    expect(errorMessage({ code: "UNKNOWN", message: "internal table detail" }, "Falha.")).toBe(
      "Falha.",
    );
  });

  it("preserva erros de domínio já normalizados", () => {
    expect(errorMessage(new Error("Sessão expirada."), "Falha.")).toBe("Sessão expirada.");
  });

  it("mantém código, status e causa enquanto mostra fallback seguro para código desconhecido", () => {
    const reason = {
      code: "PGRST999",
      status: 503,
      message: "internal query text",
      details: "private database detail",
    };
    const normalized = normalizeError(reason, "Falha ao carregar os dados.");

    expect(normalized).toMatchObject({
      message: "Falha ao carregar os dados.",
      code: "PGRST999",
      status: 503,
      cause: reason,
    });
    expect(errorMessage(reason, "Falha ao carregar os dados.")).toBe("Falha ao carregar os dados.");
  });

  it("mantém o código original ao adicionar contexto seguro a uma falha de mutação", () => {
    const reason = Object.assign(new Error("internal query text"), {
      code: "23514",
      status: 409,
    });
    const normalized = withErrorContext(reason, "Não foi possível concluir a alteração.");

    expect(normalized).toMatchObject({
      message: "Não foi possível concluir a alteração.",
      code: "23514",
      status: 409,
      cause: reason,
    });
  });

  it("não exibe a mensagem interna de um erro Supabase desconhecido", () => {
    const reason = Object.assign(new Error("select * from auth.users"), {
      code: "XX999",
    });

    expect(errorMessage(reason, "Não foi possível concluir a ação.")).toBe(
      "Não foi possível concluir a ação.",
    );
  });

  it("usa fallback para null e strings sem metadados confiáveis", () => {
    expect(errorMessage(null, "Falha segura.")).toBe("Falha segura.");
    expect(errorMessage("internal database details", "Falha segura.")).toBe("Falha segura.");
  });
});

describe("rascunhos e sincronização de mutações", () => {
  it("mantém texto apagado como rascunho e não transporta rascunho entre chamados", () => {
    const draft = { ticketId: "ticket-a", value: "" };
    expect(resolutionValueForTicket("ticket-a", "Solução salva", draft)).toBe("");
    expect(resolutionValueForTicket("ticket-b", "Outra solução", draft)).toBe("Outra solução");
  });

  it("distingue refresh concluído de falha após uma mutação", async () => {
    await expect(refreshAfterMutation(async () => {})).resolves.toBe(true);
    await expect(
      refreshAfterMutation(async () => Promise.reject(new Error("offline"))),
    ).resolves.toBe(false);
  });

  it("notifica separadamente a gravação e a falha posterior de sincronização", async () => {
    const notifications: Array<{ message: string; kind?: string }> = [];
    await refreshAndNotify(
      async () => Promise.reject(new Error("offline")),
      (message, kind) => notifications.push({ message, kind }),
      "Chamado criado.",
    );

    expect(notifications).toEqual([
      {
        message:
          "A alteração foi salva, mas a tela não sincronizou. Atualize quando a conexão voltar.",
        kind: "info",
      },
    ]);
  });
});
