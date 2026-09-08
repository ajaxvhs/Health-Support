import { describe, expect, it } from "vitest";
import { passwordUpdateErrorMessage } from "../src/lib/auth";

describe("mensagens de atualização de senha", () => {
  it("explica quando a nova senha é igual à anterior", () => {
    expect(
      passwordUpdateErrorMessage({
        status: 422,
        message: "New password should be different from the old password",
      }),
    ).toBe("A nova senha não pode ser igual à senha atual.");
  });

  it("mantém a mensagem genérica para erros desconhecidos", () => {
    expect(passwordUpdateErrorMessage({ status: 500, message: "Erro interno" })).toBe(
      "Não foi possível atualizar a senha.",
    );
  });
});
