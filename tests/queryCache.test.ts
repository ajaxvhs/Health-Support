import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { fetchBatchOffset, pageOffsetWithinBatch } from "../src/lib/pageBatch";
import { queryCache } from "../src/lib/queryCache";

describe("lotes paginados e cache de consultas", () => {
  it("usa a mesma resposta do servidor nas três páginas visuais do lote", () => {
    expect([1, 2, 3].map(fetchBatchOffset)).toEqual([0, 0, 0]);
    expect([1, 2, 3].map(pageOffsetWithinBatch)).toEqual([0, 10, 20]);
    expect(fetchBatchOffset(4)).toBe(30);
  });

  it("reutiliza páginas frescas, separa usuários e refaz após invalidação", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    let calls = 0;
    const read = (userId: string, page: number) => {
      const queryKey = ["ticket-pages", userId, { offset: fetchBatchOffset(page), limit: 30 }];
      return queryClient.fetchQuery({
        queryKey,
        queryFn: async () => ++calls,
        ...queryCache.ticketPages,
      });
    };

    await read("admin-a", 1);
    await read("admin-a", 2);
    await read("admin-a", 3);
    expect(calls).toBe(1);

    await read("admin-a", 4);
    await read("requester-b", 1);
    expect(calls).toBe(3);

    await queryClient.invalidateQueries({ queryKey: ["ticket-pages", "admin-a"] });
    await read("admin-a", 1);
    expect(calls).toBe(4);

    queryClient.clear();
  });
});
