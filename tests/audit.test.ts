import { describe, expect, it } from "vitest";
import { auditEventLabels, auditEventPriorityIds, auditEventStatus } from "../src/lib/audit";
import type { CatalogItem, TicketEvent } from "../src/types";

const statuses: CatalogItem[] = [
  { id: "status-open", name: "Aberto", slug: "aberto", isActive: true },
  {
    id: "status-progress",
    name: "Em andamento",
    slug: "em_andamento",
    isActive: true,
  },
];
const priorities: CatalogItem[] = [
  { id: "priority-low", name: "Baixa", slug: "baixa", isActive: true },
  { id: "priority-high", name: "Alta", slug: "alta", isActive: true },
];

describe("apresentação de eventos de auditoria", () => {
  it("usa ações naturais para reabertura e fechamento sem solução", () => {
    expect(auditEventLabels.reopened).toBe("Reabriu o chamado");
    expect(auditEventLabels.closed).toBe("Encerrou o chamado sem solução registrada");
    expect(auditEventLabels.claimed).toBe("Assumiu o chamado");
    expect(auditEventLabels.released).toBe("Liberou o chamado para a fila");
  });

  it.each([
    ["claimed", "em_andamento"],
    ["released", "aberto"],
  ] as const)("resolve o status resultante do evento %s", (type, expectedStatus) => {
    expect(auditEventStatus({ type } as TicketEvent, statuses)).toBe(expectedStatus);
  });

  it("resolve a situação de eventos antigos pelo texto e catálogo", () => {
    const event = {
      type: "status_changed",
      detail: "Situação alterada para Em andamento",
    } as TicketEvent;

    expect(auditEventStatus(event, statuses)).toBe("em_andamento");
  });

  it("prioriza o slug de situação dos metadados novos", () => {
    const event = { type: "status_changed", statusTo: "fechado" } as TicketEvent;

    expect(auditEventStatus(event, statuses)).toBe("fechado");
  });

  it("resolve as prioridades de eventos antigos pelo texto", () => {
    const event = {
      type: "priority_changed",
      detail: "Prioridade alterada de Baixa para Alta",
    } as TicketEvent;

    expect(auditEventPriorityIds(event, priorities)).toEqual(["priority-low", "priority-high"]);
  });
});
