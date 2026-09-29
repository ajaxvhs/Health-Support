import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return response({ error: "Método não permitido." }, 405);

  try {
    const token = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return response({ error: "Não autenticado." }, 401);

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!isRecord(parsed)) return response({ error: "Corpo da requisição inválido." }, 400);
      body = parsed;
    } catch {
      return response({ error: "Corpo da requisição inválido." }, 400);
    }

    const newPassword = body.newPassword;
    const currentPassword = body.currentPassword;
    if (typeof newPassword !== "string" || newPassword.trim().length < 8)
      return response({ error: "A nova senha precisa ter pelo menos 8 caracteres." }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const publicClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await publicClient.auth.getUser(token);
    const actor = userData.user;
    if (userError || !actor?.email) return response({ error: "Sessão expirada." }, 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("is_active,must_change_password")
      .eq("id", actor.id)
      .maybeSingle();
    if (profileError) throw new Error("Não foi possível validar o perfil.");
    if (!profile?.is_active) return response({ error: "Conta indisponível." }, 403);

    if (!profile.must_change_password) {
      if (typeof currentPassword !== "string" || !currentPassword)
        return response({ error: "Informe a senha atual." }, 400);
      const verificationClient = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: verificationError } = await verificationClient.auth.signInWithPassword({
        email: actor.email,
        password: currentPassword,
      });
      if (verificationError)
        return response(
          { code: "current_password_invalid", error: "A senha atual está incorreta." },
          401,
        );
    }

    const { data: currentActor, error: currentActorError } = await admin.auth.admin.getUserById(
      actor.id,
    );
    if (currentActorError || !currentActor.user)
      throw new Error("Não foi possível validar a conta.");
    const currentAppMetadata = isRecord(currentActor.user.app_metadata)
      ? currentActor.user.app_metadata
      : {};

    if (profile.must_change_password && currentAppMetadata.force_password_change === false) {
      const retryVerificationClient = createClient(url, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: retryVerificationError } =
        await retryVerificationClient.auth.signInWithPassword({
          email: actor.email,
          password: newPassword,
        });
      if (retryVerificationError)
        return response({ error: "Não foi possível confirmar a senha atualizada." }, 401);

      const { data: completedProfile, error: completionError } = await admin
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", actor.id)
        .eq("is_active", true)
        .select("id")
        .maybeSingle();
      if (completionError) throw new Error("Não foi possível concluir o perfil.");
      if (!completedProfile) return response({ error: "Conta indisponível." }, 403);
      return response({ ok: true });
    }

    const { error: updatePasswordError } = await admin.auth.admin.updateUserById(actor.id, {
      password: newPassword,
      app_metadata: {
        ...currentAppMetadata,
        force_password_change: false,
      },
    });
    if (updatePasswordError) {
      const samePassword =
        updatePasswordError.status === 422 &&
        /(different from (the )?old password|same (as|with) (the )?(old|current) password|password.*same)/i.test(
          updatePasswordError.message,
        );
      return response(
        {
          ...(samePassword ? { code: "same_password" } : {}),
          error: samePassword
            ? "A nova senha não pode ser igual à senha atual."
            : "Não foi possível atualizar a senha.",
        },
        updatePasswordError.status ?? 400,
      );
    }

    const { data: updatedProfile, error: updatedProfileError } = await admin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", actor.id)
      .eq("is_active", true)
      .select("id")
      .maybeSingle();
    if (updatedProfileError) throw new Error("Não foi possível concluir o perfil.");
    if (!updatedProfile) return response({ error: "Conta indisponível." }, 403);

    return response({ ok: true });
  } catch {
    return response({ error: "Não foi possível atualizar a senha." }, 500);
  }
});
