import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "../src/lib/repository";
import { errorMessage } from "../src/lib/utils";

type QueryResult = { data: unknown; error: unknown | null };
type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  is: (...args: unknown[]) => QueryBuilder;
  in: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
  range: (...args: unknown[]) => QueryBuilder;
  insert: (values: unknown) => QueryBuilder;
  update: (values: unknown) => QueryBuilder;
  delete: () => QueryBuilder;
  single: () => Promise<QueryResult>;
  maybeSingle: () => Promise<QueryResult>;
  then: <TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => PromiseLike<TResult1 | TResult2>;
};

const profileRow = {
  id: "staff-1",
  username: "staff",
  full_name: "Staff User",
  phone: "555",
  role: "admin",
  default_unit_id: "unit-1",
  is_active: true,
  must_change_password: false,
};
const ticketRow = {
  id: "ticket-1",
  ticket_number: 42,
  title: "Ticket title",
  description: "Ticket description",
  unit_id: "unit-1",
  category_id: "category-1",
  priority_id: "priority-1",
  status_id: "status-in-progress",
  status_slug: "em_andamento",
  created_by: "requester-1",
  assigned_to: "staff-1",
  requester_name_snapshot: "Requester",
  requester_phone_snapshot: "555",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ticket_statuses: { slug: "em_andamento" },
};

function repositoryWithResults(
  statusResult: QueryResult,
  updateResult: QueryResult,
  eventRows: unknown[] = [],
  rpcResult?: QueryResult,
  functionResult: QueryResult = { data: { users: [] }, error: null },
  tableResultOverrides: Record<string, QueryResult> = {},
) {
  const writes: unknown[] = [];
  const reads: string[] = [];
  const writeTables = new Set<string>();
  const functionActions: string[] = [];
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const listResults: Record<string, QueryResult> = {
    profiles: { data: [profileRow], error: null },
    units: { data: [], error: null },
    ticket_categories: { data: [], error: null },
    ticket_priorities: { data: [{ id: "priority-1", is_active: true }], error: null },
    ticket_statuses: { data: [], error: null },
    tickets: { data: [ticketRow], error: null },
    ticket_messages: { data: [], error: null },
    ticket_events: { data: eventRows, error: null },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "staff-1", email: "staff@test" } } }) },
    from: (table: string) => {
      const listResult = tableResultOverrides[table] ??
        listResults[table] ?? { data: [], error: null };
      const singleResult = table === "profiles" ? { data: profileRow, error: null } : statusResult;
      const query: QueryBuilder = {
        select: () => {
          if (!writeTables.has(table)) reads.push(table);
          return query;
        },
        eq: () => query,
        is: () => query,
        in: () => query,
        order: () => query,
        range: () => query,
        insert: (values) => {
          writes.push({ table, values });
          writeTables.add(table);
          return query;
        },
        update: (values) => {
          writes.push({ table, values });
          writeTables.add(table);
          return query;
        },
        delete: () => {
          writes.push({ table, operation: "delete" });
          writeTables.add(table);
          return query;
        },
        single: async () => singleResult,
        maybeSingle: async () => updateResult,
        then: (resolve, reject) => Promise.resolve(listResult).then(resolve, reject),
      };
      return query;
    },
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return rpcResult ?? updateResult;
    },
    functions: {
      invoke: async (_name: string, options: { body?: { action?: string } }) => {
        functionActions.push(options.body?.action ?? "");
        return functionResult;
      },
    },
  } as unknown as SupabaseClient;

  return { repository: new SupabaseRepository(client), writes, reads, functionActions, rpcCalls };
}

const statusMutations: Array<[string, (repository: SupabaseRepository) => Promise<unknown>]> = [
  [
    "createTicket",
    (repository) =>
      repository.createTicket({
        title: "Ticket title",
        description: "Ticket description",
        unitId: "unit-1",
        categoryId: "category-1",
        priorityId: "priority-1",
      }),
  ],
  ["claim", (repository) => repository.claim("ticket-1")],
  ["assign", (repository) => repository.assign("ticket-1", "staff-2")],
  ["changeStatus", (repository) => repository.changeStatus("ticket-1", "resolvido", "Fixed")],
];

describe("contratos de mutação do repository", () => {
  it.each(statusMutations)(
    "não grava %s quando o lookup do status falha",
    async (_name, mutate) => {
      const { repository, writes } = repositoryWithResults(
        { data: null, error: { code: "PGRST116", message: "lookup failed" } },
        { data: ticketRow, error: null },
      );

      await expect(mutate(repository)).rejects.toThrow("Não foi possível confirmar o status");
      expect(writes).toHaveLength(0);
    },
  );

  it("não grava atribuição quando o status não está disponível", async () => {
    const { repository, writes } = repositoryWithResults(
      { data: null, error: null },
      { data: ticketRow, error: null },
    );

    await expect(repository.assign("ticket-1", "staff-2")).rejects.toThrow(
      'Não foi possível confirmar o status "em_andamento". Tente novamente.',
    );
    expect(writes).toHaveLength(0);
  });

  it("trata atualização sem registro retornado como falha, não sucesso", async () => {
    const { repository } = repositoryWithResults(
      { data: { id: "status-in-progress" }, error: null },
      { data: null, error: null },
    );

    await expect(repository.assign("ticket-1", "staff-1")).rejects.toThrow(
      "O chamado não pôde ser atualizado. Atualize a página e tente novamente.",
    );
  });

  const rowMutationAttempts: Array<[string, (repository: SupabaseRepository) => Promise<unknown>]> =
    [
      ["claim", (repository: SupabaseRepository) => repository.claim("ticket-1")],
      [
        "changeStatus",
        (repository: SupabaseRepository) =>
          repository.changeStatus("ticket-1", "resolvido", "Fixed"),
      ],
      [
        "updatePriority",
        (repository: SupabaseRepository) => repository.updatePriority("ticket-1", "priority-1"),
      ],
      [
        "saveProfile",
        (repository: SupabaseRepository) =>
          repository.saveProfile({ fullName: "Staff User", phone: "555" }),
      ],
      [
        "renameCatalog",
        (repository: SupabaseRepository) =>
          repository.renameCatalog("categories", "category-1", "Network"),
      ],
      [
        "setCatalogActive",
        (repository: SupabaseRepository) =>
          repository.setCatalogActive("categories", "category-1", false),
      ],
      [
        "deleteCatalog",
        (repository: SupabaseRepository) => repository.deleteCatalog("categories", "category-1"),
      ],
      [
        "bulkSetCatalogActive",
        (repository: SupabaseRepository) =>
          repository.bulkSetCatalogActive("categories", ["category-1"], false),
      ],
    ];
  for (const [name, mutate] of rowMutationAttempts) {
    it(`${name} não reporta sucesso se o banco não retorna linhas alteradas`, async () => {
      const { repository } = repositoryWithResults(
        { data: { id: "status-in-progress" }, error: null },
        { data: null, error: null },
      );

      await expect(mutate(repository)).rejects.toThrow();
    });
  }

  it("aceita a mutação quando o banco retorna o registro atualizado", async () => {
    const { repository } = repositoryWithResults(
      { data: { id: "status-in-progress" }, error: null },
      { data: ticketRow, error: null },
    );

    await expect(repository.assign("ticket-1", "staff-1")).resolves.toMatchObject({
      id: "ticket-1",
      status: "em_andamento",
    });
  });

  it("assume o chamado atribuindo o administrador e mudando para em andamento", async () => {
    const { repository, writes } = repositoryWithResults(
      { data: { id: "status-in-progress" }, error: null },
      { data: ticketRow, error: null },
    );

    await repository.claim("ticket-1");

    expect(writes).toContainEqual({
      table: "tickets",
      values: { assigned_to: "staff-1", status_id: "status-in-progress" },
    });
  });

  it("reabre na fila e remove o responsável na mesma mutação", async () => {
    const { repository, writes } = repositoryWithResults(
      { data: { id: "status-open" }, error: null },
      { data: ticketRow, error: null },
    );

    await repository.changeStatus("ticket-1", "aberto");

    expect(writes).toContainEqual({
      table: "tickets",
      values: { status_id: "status-open", assigned_to: null },
    });
  });
});

describe("mapeamento de eventos de auditoria", () => {
  it("retorna slugs de situação e prioridades dos metadados", async () => {
    const { repository } = repositoryWithResults(
      { data: null, error: null },
      { data: null, error: null },
      [
        {
          id: "event-1",
          ticket_id: "ticket-1",
          actor_id: "staff-1",
          event_type: "status_changed",
          created_at: "2026-01-02T00:00:00.000Z",
          metadata: {
            detail: "Situação alterada",
            from_status_slug: "em_andamento",
            to_status_slug: "resolvido",
            priority_from_id: "priority-low",
            priority_to_id: "priority-high",
            priority_from: "Baixa",
            priority_to: "Alta",
          },
          ticket_number: 42,
          ticket_title: "Chamado de teste",
        },
      ],
      {
        data: [
          {
            total_count: 1,
            ticket_count: 1,
            actor_count: 1,
            events: [
              {
                id: "event-1",
                ticket_id: "ticket-1",
                actor_id: "staff-1",
                event_type: "status_changed",
                created_at: "2026-01-02T00:00:00.000Z",
                metadata: {
                  detail: "Situação alterada",
                  from_status_slug: "em_andamento",
                  to_status_slug: "resolvido",
                  priority_from_id: "priority-low",
                  priority_to_id: "priority-high",
                  priority_from: "Baixa",
                  priority_to: "Alta",
                },
                ticket_number: 42,
                ticket_title: "Chamado de teste",
              },
            ],
          },
        ],
        error: null,
      },
    );

    const data = await repository.getAuditEventsPage({
      actorId: "",
      type: "",
      search: "",
      offset: 0,
      limit: 10,
    });

    expect(data.events).toEqual([
      {
        id: "event-1",
        ticketId: "ticket-1",
        actorId: "staff-1",
        type: "status_changed",
        detail: "Situação alterada",
        createdAt: "2026-01-02T00:00:00.000Z",
        statusFrom: "em_andamento",
        statusTo: "resolvido",
        priorityFromId: "priority-low",
        priorityToId: "priority-high",
        priorityFrom: "Baixa",
        priorityTo: "Alta",
        ticketNumber: 42,
        ticketTitle: "Chamado de teste",
        requesterName: undefined,
      },
    ]);
    expect(data).toMatchObject({ totalCount: 1, ticketCount: 1, actorCount: 1 });
  });
});

describe("escopo das leituras", () => {
  it("não consulta a função administrativa ao carregar dados compartilhados", async () => {
    const { repository, functionActions } = repositoryWithResults(
      { data: null, error: null },
      { data: null, error: null },
    );

    await repository.getData();

    expect(functionActions).not.toContain("list");
  });

  it("preserva status e código da falha ao listar usuários sem exibir o texto interno", async () => {
    const functionError = Object.assign(new Error("internal edge details"), {
      name: "FunctionsHttpError",
      context: new Response(
        JSON.stringify({ error: "Não foi possível carregar os usuários.", code: "USER_LIST" }),
        { status: 503 },
      ),
    });
    const { repository } = repositoryWithResults(
      { data: null, error: null },
      { data: null, error: null },
      [],
      undefined,
      { data: null, error: functionError },
    );

    await expect(repository.getAdminUsers()).rejects.toMatchObject({
      name: "AppError",
      message: "Não foi possível carregar os usuários.",
      code: "USER_LIST",
      status: 503,
    });
  });

  it("preserva outcome e referência Auth de uma falha administrativa parcial", async () => {
    const functionError = Object.assign(new Error("internal edge details"), {
      name: "FunctionsHttpError",
      context: new Response(
        JSON.stringify({
          error: "A compensação Auth falhou; revise a conta.",
          code: "USER_CREATE_PARTIAL",
          outcome: "partial_failure",
          authUserId: "synthetic-user-id",
        }),
        { status: 500 },
      ),
    });
    const { repository } = repositoryWithResults(
      { data: null, error: null },
      { data: null, error: null },
      [],
      undefined,
      { data: null, error: functionError },
    );

    await expect(repository.getAdminUsers()).rejects.toMatchObject({
      message:
        "A compensação Auth falhou; revise a conta. Referência da conta Auth: synthetic-user-id.",
      code: "USER_CREATE_PARTIAL",
      status: 500,
      outcome: "partial_failure",
      authUserId: "synthetic-user-id",
    });
  });

  it("normaliza erros desconhecidos de leitura preservando metadados para diagnóstico", async () => {
    const backendError = {
      code: "PGRST999",
      status: 502,
      message: "internal query detail",
    };
    const { repository } = repositoryWithResults(
      { data: null, error: null },
      { data: null, error: null },
      [],
      undefined,
      undefined,
      { ticket_messages: { data: null, error: backendError } },
    );
    const result = await repository.getTicketMessages("ticket-1").catch((error: unknown) => error);

    expect(result).toMatchObject({ name: "AppError", code: "PGRST999", status: 502 });
    expect(errorMessage(result, "Não foi possível carregar as mensagens.")).toBe(
      "Não foi possível carregar as mensagens.",
    );
    expect((result as Error & { cause?: unknown }).cause).toBe(backendError);
  });

  it("normaliza resposta inválida da listagem administrativa", async () => {
    const { repository } = repositoryWithResults(
      { data: null, error: null },
      { data: null, error: null },
      [],
      undefined,
      { data: { users: null }, error: null },
    );

    await expect(repository.getAdminUsers()).rejects.toThrow(
      "Não foi possível carregar os usuários.",
    );
  });

  it("carrega apenas a página de chamados solicitada e mantém o total agregado", async () => {
    const { repository, rpcCalls } = repositoryWithResults(
      { data: null, error: null },
      { data: null, error: null },
      [],
      {
        data: [
          {
            total_count: 35,
            queue_unassigned_count: 8,
            queue_in_progress_count: 12,
            tickets: [ticketRow],
          },
        ],
        error: null,
      },
    );

    const result = await repository.getTicketPage({
      view: "queue",
      assignedToMeOnly: false,
      status: "todos",
      search: "",
      sort: "priority",
      offset: 10,
      limit: 10,
    });

    expect(result).toMatchObject({
      totalCount: 35,
      queueUnassignedCount: 8,
      queueInProgressCount: 12,
      tickets: [{ id: "ticket-1" }],
    });
    expect(rpcCalls.at(-1)).toMatchObject({
      name: "get_ticket_page",
      args: { p_offset: 10, p_limit: 10, p_view: "queue" },
    });
  });

  it("valida uma mensagem com o chamado específico, sem recarregar as coleções", async () => {
    const { repository, reads } = repositoryWithResults(
      {
        data: {
          id: "message-1",
          ticket_id: "ticket-1",
          sender_id: "staff-1",
          message: "A equipe está verificando.",
          is_internal: false,
          created_at: "2026-01-01T00:00:00.000Z",
        },
        error: null,
      },
      { data: ticketRow, error: null },
    );

    await repository.addMessage("ticket-1", "A equipe está verificando.", false);

    expect(reads).toContain("tickets");
    expect(reads).not.toContain("ticket_messages");
    expect(reads).not.toContain("ticket_events");
    expect(reads).not.toContain("ticket_priorities");
  });
});
