import { beforeEach, describe, expect, it, vi } from "vitest";
import { isProfileUnavailableError, passwordUpdateErrorMessage, signOut } from "../src/lib/auth";
import { getSupabaseClient } from "../src/lib/supabase/client";
import { disablePush } from "../src/lib/pushNotifications";

vi.mock("../src/lib/supabase/client", () => ({ getSupabaseClient: vi.fn() }));
vi.mock("../src/lib/pushNotifications", () => ({ disablePush: vi.fn() }));

const getSupabaseClientMock = vi.mocked(getSupabaseClient);
const disablePushMock = vi.mocked(disablePush);

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

  it("lida com erros nulos ou primitivos sem falhar", () => {
    expect(passwordUpdateErrorMessage(null)).toBe("Não foi possível atualizar a senha.");
    expect(passwordUpdateErrorMessage("erro de rede")).toBe("Não foi possível atualizar a senha.");
  });

  it("explica quando a senha atual não confere", () => {
    expect(passwordUpdateErrorMessage({ code: "current_password_invalid" })).toBe(
      "A senha atual está incorreta.",
    );
  });
});

describe("ciclo de sessão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("identifica somente a ausência de perfil como sessão sem autorização", () => {
    expect(isProfileUnavailableError({ code: "PGRST116" })).toBe(true);
    expect(isProfileUnavailableError({ code: "NETWORK_ERROR" })).toBe(false);
  });

  it("encerra Auth mesmo se a limpeza de Push falhar", async () => {
    const authSignOut = vi.fn().mockResolvedValue({ error: null });
    getSupabaseClientMock.mockReturnValue({ auth: { signOut: authSignOut } } as never);
    disablePushMock.mockRejectedValue(new Error("push cleanup failed"));

    await expect(signOut()).resolves.toEqual({ pushCleanupFailed: true });
    expect(authSignOut).toHaveBeenCalledOnce();
  });

  it("remove a sessão local quando a revogação Auth falha", async () => {
    const authSignOut = vi
      .fn()
      .mockResolvedValueOnce({ error: new Error("network error") })
      .mockResolvedValueOnce({ error: null });
    getSupabaseClientMock.mockReturnValue({ auth: { signOut: authSignOut } } as never);
    disablePushMock.mockResolvedValue(undefined);

    await expect(signOut()).rejects.toThrow("network error");
    expect(authSignOut).toHaveBeenNthCalledWith(2, { scope: "local" });
  });
});
