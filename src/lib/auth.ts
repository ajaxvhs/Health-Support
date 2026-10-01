import type { Profile, Role } from "../types";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase/client";
import { disablePush } from "./pushNotifications";

type ProfileRow = {
  id: string;
  username: string;
  full_name: string;
  phone: string;
  role: Role;
  default_unit_id: string;
  is_active: boolean;
  must_change_password: boolean;
};

function toProfile(row: ProfileRow, email: string): Profile {
  return {
    id: row.id,
    username: row.username,
    email,
    fullName: row.full_name,
    phone: row.phone,
    role: row.role,
    unitId: row.default_unit_id,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
  };
}

export function isProfileUnavailableError(reason: unknown) {
  return (
    typeof reason === "object" &&
    reason !== null &&
    (reason as { code?: unknown }).code === "PGRST116"
  );
}

async function loadProfile(userId: string, email: string) {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("profiles")
    .select(
      "id, username, full_name, phone, role, default_unit_id, is_active, must_change_password",
    )
    .eq("id", userId)
    .single();
  if (error) throw error;
  if (!data) throw new Error("Usuário não possui um perfil autorizado.");
  const profile = toProfile(data as ProfileRow, email);
  if (!profile.isActive) throw new Error("Usuário ou senha inválidos.");
  return profile;
}

export function passwordUpdateErrorMessage(reason: unknown) {
  const error =
    typeof reason === "object" && reason !== null
      ? (reason as { message?: unknown; status?: unknown; code?: unknown })
      : {};
  const message = typeof error.message === "string" ? error.message : "";
  const normalized = message.toLowerCase();
  const isSamePassword =
    error.code === "same_password" ||
    (error.status === 422 &&
      /(different from (the )?old password|same (as|with) (the )?(old|current) password|password.*same)/i.test(
        normalized,
      ));

  if (isSamePassword) return "A nova senha não pode ser igual à senha atual.";
  if (error.code === "current_password_invalid") return "A senha atual está incorreta.";
  return "Não foi possível atualizar a senha.";
}

export async function signInWithIdentifier(identifier: string, password: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error("O Supabase precisa estar configurado para entrar.");

  const trimmedIdentifier = identifier.trim();
  let authUserId: string;
  let authEmail: string;
  if (trimmedIdentifier.includes("@")) {
    const { data, error } = await client.auth.signInWithPassword({
      email: trimmedIdentifier,
      password,
    });
    if (error || !data.user) throw new Error("Usuário ou senha inválidos.");
    authUserId = data.user.id;
    authEmail = data.user.email ?? trimmedIdentifier;
  } else {
    const { data, error } = await client.functions.invoke<{ session: Session }>("username-login", {
      body: { username: trimmedIdentifier, password },
    });
    if (error || !data?.session) {
      const context = error && "context" in error ? error.context : null;
      if (context instanceof Response && context.status === 429)
        throw new Error("Muitas tentativas. Aguarde e tente novamente.");
      throw new Error("Usuário ou senha inválidos.");
    }
    const { data: sessionData, error: sessionError } = await client.auth.setSession(data.session);
    if (sessionError || !sessionData.user) throw new Error("Usuário ou senha inválidos.");
    authUserId = sessionData.user.id;
    authEmail = sessionData.user.email ?? "";
  }

  let profile: Profile | null;
  try {
    profile = await loadProfile(authUserId, authEmail);
  } catch (reason) {
    if (isProfileUnavailableError(reason)) {
      await client.auth.signOut({ scope: "local" });
      throw new Error("Usuário ou senha inválidos.");
    }
    throw new Error("Não foi possível carregar seu perfil. Tente novamente.");
  }
  if (!profile) throw new Error("Usuário não possui um perfil autorizado.");
  return profile;
}

export async function restoreUserSession(session?: Session) {
  const client = getSupabaseClient();
  if (!client) return null;
  const currentSession = session ?? (await client.auth.getSession()).data.session;
  if (!currentSession) return null;
  const profile = await loadProfile(currentSession.user.id, currentSession.user.email ?? "");
  if (!profile) return null;
  return profile;
}

export async function signOut() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const pushCleanupFailed = await Promise.race([
    disablePush().then(
      () => false,
      () => true,
    ),
    new Promise<boolean>((resolve) => {
      timeout = setTimeout(() => resolve(true), 3000);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  const client = getSupabaseClient();
  if (client) {
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch (reason) {
      await client.auth.signOut({ scope: "local" }).catch(() => undefined);
      throw reason;
    }
  }
  return { pushCleanupFailed };
}

export async function updatePassword(newPassword: string, currentPassword?: string) {
  if (newPassword.trim().length < 8)
    throw new Error("A nova senha precisa ter pelo menos 8 caracteres.");
  if (currentPassword && currentPassword === newPassword)
    throw new Error("A nova senha não pode ser igual à senha atual.");
  const client = getSupabaseClient();
  if (!client) throw new Error("O Supabase precisa estar configurado para atualizar a senha.");
  const { data, error } = await client.functions.invoke<{ ok?: boolean; error?: string }>(
    "update-password",
    { body: { newPassword, ...(currentPassword ? { currentPassword } : {}) } },
  );
  if (error) {
    const context = "context" in error ? error.context : undefined;
    const body =
      context && typeof (context as { json?: unknown }).json === "function"
        ? ((await (context as Response).json().catch(() => null)) as {
            code?: string;
            error?: string;
          } | null)
        : null;
    throw Object.assign(new Error(body?.error ?? "Não foi possível atualizar a senha."), {
      code: body?.code,
      status: context instanceof Response ? context.status : undefined,
    });
  }
  if (data?.error) throw new Error(passwordUpdateErrorMessage(new Error(data.error)));
}
