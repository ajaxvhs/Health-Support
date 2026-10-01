import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseClientMock } = vi.hoisted(() => ({
  getSupabaseClientMock: vi.fn(),
}));

vi.mock("../src/lib/supabase/client", () => ({
  getSupabaseClient: getSupabaseClientMock,
}));

import { signInWithIdentifier } from "../src/lib/auth";

const profileRow = {
  id: "user-id",
  username: "vpulici",
  full_name: "Synthetic Admin",
  phone: "0000000000",
  role: "admin",
  default_unit_id: "unit-id",
  is_active: true,
  must_change_password: false,
};

function makeClient(options?: { loginError?: unknown }) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: profileRow, error: null }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);

  const client = {
    functions: {
      invoke: vi.fn().mockResolvedValue(
        options?.loginError
          ? { data: null, error: options.loginError }
          : {
              data: { session: { access_token: "access-token", refresh_token: "refresh-token" } },
              error: null,
            },
      ),
    },
    auth: {
      setSession: vi.fn().mockResolvedValue({
        data: { user: { id: "user-id", email: "user@example.test" } },
        error: null,
      }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue(query),
    rpc: vi.fn(),
  };
  return { client, query };
}

describe("login por username", () => {
  beforeEach(() => {
    getSupabaseClientMock.mockReset();
  });

  it("autentica pelo endpoint sem consultar a RPC anônima de email", async () => {
    const { client } = makeClient();
    getSupabaseClientMock.mockReturnValue(client);

    const profile = await signInWithIdentifier("  vpulici  ", "senha-sintetica");

    expect(client.functions.invoke).toHaveBeenCalledWith("username-login", {
      body: { username: "vpulici", password: "senha-sintetica" },
    });
    expect(client.auth.setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalledWith("auth_email_for_username", expect.anything());
    expect(profile).toMatchObject({
      id: "user-id",
      username: "vpulici",
      email: "user@example.test",
    });
  });

  it("usa a mesma mensagem genérica quando o endpoint rejeita a autenticação", async () => {
    const functionError = Object.assign(new Error("private auth response"), {
      name: "FunctionsHttpError",
      context: new Response(JSON.stringify({ error: "Usuário ou senha inválidos." }), {
        status: 401,
      }),
    });
    const { client } = makeClient({ loginError: functionError });
    getSupabaseClientMock.mockReturnValue(client);

    await expect(signInWithIdentifier("user-unknown", "senha-incorreta")).rejects.toThrow(
      "Usuário ou senha inválidos.",
    );
    expect(client.auth.setSession).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
