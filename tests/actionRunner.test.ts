import { describe, expect, it } from "vitest";
import { executeAction } from "../src/lib/actionRunner";

describe("execução compartilhada de ações", () => {
  it("retorna o resultado e restaura o estado pendente em sucesso", async () => {
    const pending: boolean[] = [];
    const notifications: Array<{ message: string; kind?: string }> = [];
    const result = await executeAction(async () => "saved", {
      fallback: "Falha.",
      showToast: (message, kind) => notifications.push({ message, kind }),
      setPending: (value) => pending.push(value),
    });

    expect(result).toEqual({ ok: true, value: "saved" });
    expect(pending).toEqual([true, false]);
    expect(notifications).toEqual([]);
  });

  it("notifica uma vez, preserva metadados e restaura estado após falha", async () => {
    const reason = { code: "PGRST999", status: 503, message: "internal query detail" };
    const pending: boolean[] = [];
    const notifications: Array<{ message: string; kind?: string }> = [];
    const result = await executeAction(() => Promise.reject(reason), {
      fallback: "Não foi possível salvar.",
      showToast: (message, kind) => notifications.push({ message, kind }),
      setPending: (value) => pending.push(value),
    });

    expect(result).toMatchObject({
      ok: false,
      error: { message: "Não foi possível salvar.", code: "PGRST999", status: 503 },
    });
    expect(pending).toEqual([true, false]);
    expect(notifications).toEqual([{ message: "Não foi possível salvar.", kind: "error" }]);
  });
});
