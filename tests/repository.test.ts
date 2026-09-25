import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseRepository } from "../src/lib/repository";

type QueryResult = { data: unknown; error: unknown | null };
type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  is: (...args: unknown[]) => QueryBuilder;
  in: (...args: unknown[]) => QueryBuilder;
  order: (...args: unknown[]) => QueryBuilder;
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
  role: "atendente",
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

function repositoryWithResults(statusResult: QueryResult, updateResult: QueryResult) {
  const writes: unknown[] = [];
  const listResults: Record<string, QueryResult> = {
    profiles: { data: [profileRow], error: null },
    units: { data: [], error: null },
    ticket_categories: { data: [], error: null },
    ticket_priorities: { data: [{ id: "priority-1", is_active: true }], error: null },
    ticket_statuses: { data: [], error: null },
    tickets: { data: [ticketRow], error: null },
    ticket_messages: { data: [], error: null },
    ticket_events: { data: [], error: null },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "staff-1", email: "staff@test" } } }) },
    from: (table: string) => {
      const listResult = listResults[table] ?? { data: [], error: null };
      const singleResult = table === "profiles" ? { data: profileRow, error: null } : statusResult;
      const query: QueryBuilder = {
        select: () => query,
        eq: () => query,
        is: () => query,
        in: () => query,
        order: () => query,
        insert: (values) => {
          writes.push({ table, values });
          return query;
        },
        update: (values) => {
          writes.push({ table, values });
          return query;
        },
        delete: () => {
          writes.push({ table, operation: "delete" });
          return query;
        },
        single: async () => singleResult,
        maybeSingle: async () => updateResult,
        then: (resolve, reject) => Promise.resolve(listResult).then(resolve, reject),
      };
      return query;
    },
    rpc: async () => updateResult,
  } as unknown as SupabaseClient;

  return { repository: new SupabaseRepository(client), writes };
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
