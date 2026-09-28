import { describe, expect, it } from "vitest";
import {
  TICKET_DRAFT_TTL_MS,
  clearTicketDraft,
  readTicketDraft,
  saveTicketDraft,
  type TicketDraft,
} from "../src/lib/ticketDraft";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const ticketDraft: Omit<TicketDraft, "savedAt"> = {
  title: "Impressora sem conexão",
  description: "O equipamento não conecta à rede local.",
  unitId: "unit-1",
  categoryId: "category-1",
  priorityId: "priority-2",
};

describe("rascunho local de novo chamado", () => {
  it("persiste por usuário e pode ser restaurado após recarregar a página", () => {
    const storage = new MemoryStorage();

    expect(saveTicketDraft("requester-1", ticketDraft, storage, 1000)).toBe(true);
    expect(readTicketDraft("requester-1", storage, 2000)).toEqual({
      ...ticketDraft,
      savedAt: 1000,
    });
    expect(readTicketDraft("requester-2", storage, 2000)).toBeNull();
  });

  it("expira e remove rascunhos antigos", () => {
    const storage = new MemoryStorage();
    saveTicketDraft("requester-1", ticketDraft, storage, 1000);

    expect(readTicketDraft("requester-1", storage, 1000 + TICKET_DRAFT_TTL_MS + 1)).toBeNull();
    expect(readTicketDraft("requester-1", storage, 1000 + TICKET_DRAFT_TTL_MS + 1)).toBeNull();
  });

  it("limpa o rascunho após envio ou logout", () => {
    const storage = new MemoryStorage();
    saveTicketDraft("requester-1", ticketDraft, storage, 1000);

    clearTicketDraft("requester-1", storage);

    expect(readTicketDraft("requester-1", storage, 2000)).toBeNull();
  });
});
