import type { Profile, Role } from "../types";
import { getSupabaseClient } from "./supabase/client";

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
  if (error || !data) throw new Error("Usuário não possui um perfil autorizado.");
  const profile = toProfile(data as ProfileRow, email);
  if (!profile.isActive) throw new Error("Usuário ou senha inválidos.");
  return profile;
}

export function passwordUpdateErrorMessage(reason: unknown) {
  const error = reason as { message?: unknown; status?: unknown; code?: unknown };
  const message = typeof error.message === "string" ? error.message : "";
  const normalized = message.toLowerCase();
  const isSamePassword =
    error.code === "same_password" ||
    (error.status === 422 &&
      /(different from (the )?old password|same (as|with) (the )?(old|current) password|password.*same)/i.test(
        normalized,
      ));

  if (isSamePassword) return "A nova senha não pode ser igual à senha atual.";
  return "Não foi possível atualizar a senha.";
}

export async function signInWithIdentifier(identifier: string, password: string) {
  const client = getSupabaseClient();
  if (!client) throw new Error("O Supabase precisa estar configurado para entrar.");

  let email = identifier.trim();
  if (!email.includes("@")) {
    const { data, error: lookupError } = await client.rpc("auth_email_for_username", {
      login_username: email,
    });
    if (lookupError || typeof data !== "string" || !data)
      throw new Error("Usuário ou senha inválidos.");
    email = data;
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Usuário ou senha inválidos.");
  const profile = await loadProfile(data.user.id, data.user.email ?? email);
  if (!profile) throw new Error("Usuário não possui um perfil autorizado.");
  return profile;
}

export async function restoreUserSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  if (!data.session) return null;
  const profile = await loadProfile(data.session.user.id, data.session.user.email ?? "");
  if (!profile) return null;
  return profile;
}

export async function signOut() {
  const client = getSupabaseClient();
  if (client) await client.auth.signOut();
}

export async function updatePassword(newPassword: string, currentPassword?: string) {
  if (newPassword.trim().length < 8)
    throw new Error("A nova senha precisa ter pelo menos 8 caracteres.");
  if (currentPassword && currentPassword === newPassword)
    throw new Error("A nova senha não pode ser igual à senha atual.");
  const client = getSupabaseClient();
  if (!client) throw new Error("O Supabase precisa estar configurado para atualizar a senha.");
  if (currentPassword) {
    const { data: sessionData } = await client.auth.getSession();
    const email = sessionData.session?.user.email;
    if (!email) throw new Error("Sessão expirada.");
    const { error: currentPasswordError } = await client.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (currentPasswordError) throw new Error("A senha atual está incorreta.");
  }
  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw new Error(passwordUpdateErrorMessage(error));
  const { error: profileError } = await client.rpc("mark_password_changed");
  if (profileError) throw new Error("Senha atualizada, mas não foi possível concluir o perfil.");
}
