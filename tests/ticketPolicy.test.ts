import { describe, expect, it } from "vitest";
import {
  assertMessageAllowed,
  assertStatusChangeAllowed,
  availableStatusTransitions,
  canReopenTicket,
} from "../src/lib/ticketPolicy";
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

  it("não permite fechar um chamado já resolvido; reabrir continua explícito", () => {
    const resolved = { ...ticket, status: "resolvido" as const };
    expect(() => assertStatusChangeAllowed(requester, resolved, "fechado")).toThrow(
      "Esta transição não está disponível",
    );
    expect(() =>
      assertStatusChangeAllowed({ ...actor, role: "admin" }, resolved, "fechado"),
    ).toThrow("Esta transição não está disponível");
    expect(() => assertStatusChangeAllowed(requester, resolved, "aberto")).toThrow(
      "Somente um administrador pode reabrir",
    );
    expect(() =>
      assertStatusChangeAllowed({ ...actor, role: "admin", id: "admin" }, resolved, "aberto"),
    ).not.toThrow();
  });

  it("bloqueia outras transições solicitadas pelo solicitante", () => {
    expect(() => assertStatusChangeAllowed(requester, ticket, "resolvido")).toThrow(
      "Esta transição não está disponível",
    );
    expect(() =>
      assertStatusChangeAllowed(
        requester,
        { ...ticket, status: "aberto", assignedTo: undefined },
        "fechado",
      ),
    ).toThrow("Esta transição não está disponível");
  });

  it.each(["resolvido", "fechado"] as const)(
    "bloqueia mensagens públicas e notas internas em chamados %s",
    (status) => {
      const terminal = { ...ticket, status };
      expect(() => assertMessageAllowed(actor, terminal, false)).toThrow(
        "não aceitam novas mensagens",
      );
      expect(() => assertMessageAllowed(actor, terminal, true)).toThrow(
        "não aceitam novas mensagens",
      );
    },
  );

  it("apresenta somente as transições disponíveis e reserva resolução para ação explícita", () => {
    expect(
      availableStatusTransitions(actor, { ...ticket, status: "aberto", assignedTo: undefined }),
    ).toEqual([]);
    expect(availableStatusTransitions(actor, ticket)).toEqual(["aberto", "fechado"]);
    expect(availableStatusTransitions(actor, { ...ticket, status: "resolvido" })).toEqual([]);
  });

  it("reserva aberto → em andamento para a ação Assumir", () => {
    const admin = { ...actor, id: "admin", role: "admin" as const };
    const open = { ...ticket, status: "aberto" as const, assignedTo: undefined };

    expect(availableStatusTransitions(admin, open)).toEqual(["fechado"]);
    expect(() => assertStatusChangeAllowed(admin, open, "em_andamento")).toThrow(
      "Esta transição não está disponível",
    );
  });

  it("permite fechar diretamente um chamado ativo sem solução", () => {
    const admin = { ...actor, id: "admin", role: "admin" as const };
    const open = { ...ticket, status: "aberto" as const, assignedTo: undefined };
    expect(availableStatusTransitions(admin, open)).toEqual(["fechado"]);
    expect(() => assertStatusChangeAllowed(admin, open, "fechado")).not.toThrow();
    expect(() => assertStatusChangeAllowed(actor, ticket, "fechado")).not.toThrow();
    expect(() => assertStatusChangeAllowed({ ...actor, id: "other" }, ticket, "fechado")).toThrow(
      "Assuma o chamado",
    );
    expect(availableStatusTransitions(admin, { ...ticket, status: "resolvido" })).toEqual([
      "aberto",
    ]);
  });

  it("permite reabrir somente ao administrador", () => {
    const resolved = { ...ticket, status: "resolvido" as const };
    expect(canReopenTicket(requester, resolved)).toBe(false);
    expect(canReopenTicket(actor, resolved)).toBe(false);
    expect(canReopenTicket({ ...actor, id: "other" }, resolved)).toBe(false);
    expect(canReopenTicket({ ...actor, role: "admin", id: "admin" }, resolved)).toBe(true);
    expect(canReopenTicket(requester, ticket)).toBe(false);
  });

  it("exige mensagem permitida apenas de equipe elegível no chamado em andamento", () => {
    expect(() => assertMessageAllowed(actor, ticket, true)).not.toThrow();
    expect(() => assertMessageAllowed({ ...actor, id: "other" }, ticket, false)).toThrow(
      "Assuma o chamado",
    );
  });
});
