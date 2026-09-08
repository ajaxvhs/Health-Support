import { describe, expect, it } from "vitest";
import { assertStatusChangeAllowed } from "../src/lib/ticketPolicy";
import type { Profile, Ticket } from "../src/types";

const actor: Profile = {
  id: "staff",
  fullName: "Equipe TI",
  username: "equipe.ti",
  email: "equipe@example.com",
  phone: "",
  role: "atendente",
  unitId: "unit-a",
  isActive: true,
};

const ticket: Ticket = {
  id: "t-1",
  number: 1,
  title: "Rede indisponível",
  description: "A unidade está sem acesso à rede.",
  unitId: "unit-a",
  categoryId: "cat-net",
  priorityId: "pri-high",
  status: "em_andamento",
  createdBy: "requester",
  assignedTo: actor.id,
  requesterName: "Solicitante",
  requesterPhone: "",
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-01T10:00:00.000Z",
};

const requester: Profile = {
  ...actor,
  id: ticket.createdBy,
  role: "solicitante",
};

describe("regras de transição do chamado", () => {
  it("permite o próximo status para o atendente responsável", () => {
    expect(() => assertStatusChangeAllowed(actor, ticket, "resolvido")).not.toThrow();
  });

  it("bloqueia atualização por atendente sem atribuição", () => {
    expect(() =>
      assertStatusChangeAllowed(actor, { ...ticket, assignedTo: "other" }, "resolvido"),
    ).toThrow("Assuma o chamado");
  });

  it("permite que o solicitante encerre ou reabra um chamado resolvido", () => {
    const resolved = { ...ticket, status: "resolvido" as const };
    expect(() => assertStatusChangeAllowed(requester, resolved, "fechado")).not.toThrow();
    expect(() => assertStatusChangeAllowed(requester, resolved, "em_andamento")).not.toThrow();
  });

  it("bloqueia outras transições solicitadas pelo solicitante", () => {
    expect(() => assertStatusChangeAllowed(requester, ticket, "resolvido")).toThrow(
      "Esta transição não está disponível",
    );
  });
});
