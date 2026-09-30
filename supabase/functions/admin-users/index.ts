import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ADMIN_USER_LIMITS, isValidBulkSize, isWithinLimit } from "../_shared/adminUserLimits.ts";
import {
  type AdminUserActionErrorResponse,
  isAdminUserAction,
  type AdminUserActionResponseMap,
} from "../_shared/adminUserContract.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const response = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", ...extraHeaders },
  });
const partialFailure = (error: string, status = 409, authUserId?: string) =>
  response(
    {
      outcome: "partial_failure",
      error,
      ...(authUserId ? { authUserId } : {}),
    } satisfies AdminUserActionErrorResponse,
    status,
  );
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const errorCode = (reason: unknown) =>
  typeof reason === "object" &&
  reason !== null &&
  typeof (reason as { code?: unknown }).code === "string"
    ? (reason as { code: string }).code
    : "";
const errorStatus = (reason: unknown) =>
  typeof reason === "object" &&
  reason !== null &&
  typeof (reason as { status?: unknown }).status === "number"
    ? (reason as { status: number }).status
    : undefined;
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validRoles = new Set(["admin", "solicitante"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST")
    return response({ error: "Método não permitido." }, 405, { Allow: "POST, OPTIONS" });
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return response({ error: "Não autenticado." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const publicClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user: actor },
    } = await publicClient.auth.getUser(token);
    if (!actor) return response({ error: "Sessão expirada." }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: actorProfile, error: actorProfileError } = await admin
      .from("profiles")
      .select("role,is_active,must_change_password")
      .eq("id", actor.id)
      .single();
    if (actorProfileError) throw new Error("Não foi possível validar o acesso administrativo.");
    if (
      !actorProfile?.is_active ||
      actorProfile.must_change_password ||
      actorProfile.role !== "admin"
    )
      return response({ error: "Acesso restrito a administradores." }, 403);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!isRecord(parsed)) return response({ error: "Corpo da requisição inválido." }, 400);
      body = parsed;
    } catch {
      return response({ error: "Corpo da requisição inválido." }, 400);
    }
    if (!isAdminUserAction(body.action)) return response({ error: "Ação inválida." }, 400);
    if (body.action === "set_active" && typeof body.isActive !== "boolean")
      return response({ error: "Informe o estado ativo desejado." }, 400);
    const deleteOrDeactivate = async (id: string) => {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id,role,is_active")
        .eq("id", id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) {
        const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(id);
        if (authLookupError?.status === 404) return { id, outcome: "deleted" as const };
        if (authLookupError) throw authLookupError;
        if (!authUser.user) return { id, outcome: "deleted" as const };
        const { error: orphanDeleteError } = await admin.auth.admin.deleteUser(id);
        if (orphanDeleteError) throw orphanDeleteError;
        return { id, outcome: "deleted" as const };
      }
      const references = await Promise.all([
        admin
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .or(`created_by.eq.${id},assigned_to.eq.${id}`),
        admin
          .from("ticket_messages")
          .select("id", { count: "exact", head: true })
          .eq("sender_id", id),
        admin.from("ticket_events").select("id", { count: "exact", head: true }).eq("actor_id", id),
      ]);
      if (references.some(({ error }) => error))
        throw new Error("Não foi possível verificar os vínculos do usuário.");

      if (references.some(({ count }) => (count ?? 0) > 0)) {
        const { data, error } = await admin
          .from("profiles")
          .update({ is_active: false })
          .eq("id", id)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Não foi possível desativar o usuário.");
        return { id, outcome: "deactivated" as const };
      }

      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error("Não foi possível excluir o usuário.");
      return { id, outcome: "deleted" as const };
    };
    if (body.action === "list") {
      const perPage = 1000;
      const profiles = [];
      for (let page = 1; ; page += 1) {
        const { data, error } = await admin
          .from("profiles")
          .select("*")
          .order("full_name")
          .order("id")
          .range((page - 1) * perPage, page * perPage - 1);
        if (error) throw new Error("Não foi possível carregar todos os perfis.");
        profiles.push(...(data ?? []));
        if ((data ?? []).length < perPage) break;
      }
      const emails = new Map<string, string>();
      for (let page = 1; ; page += 1) {
        const { data, error: authError } = await admin.auth.admin.listUsers({ page, perPage });
        if (authError) throw new Error("Não foi possível carregar todos os e-mails dos usuários.");
        for (const user of data.users) {
          if (user.email) emails.set(user.id, user.email);
        }
        if (data.users.length < perPage) break;
      }
      const users = profiles.map((item) => ({
        ...item,
        email: emails.get(item.id) ?? "",
      }));
      return response({ users } satisfies AdminUserActionResponseMap["list"]);
    }
    const targetId = isUuid(body.id) ? body.id : undefined;
    if (body.action === "create") {
      const { email, temporaryPassword, username, fullName, phone, unitId, role } = body;
      if (
        typeof email !== "string" ||
        typeof temporaryPassword !== "string" ||
        typeof username !== "string" ||
        typeof fullName !== "string" ||
        typeof phone !== "string" ||
        !isUuid(unitId) ||
        typeof role !== "string" ||
        !validRoles.has(role) ||
        !isWithinLimit(fullName, ADMIN_USER_LIMITS.fullName) ||
        !isWithinLimit(username, ADMIN_USER_LIMITS.username) ||
        !isWithinLimit(phone, ADMIN_USER_LIMITS.phone) ||
        !isWithinLimit(email, ADMIN_USER_LIMITS.email) ||
        temporaryPassword.length > ADMIN_USER_LIMITS.password
      )
        return response({ error: "Dados do usuário inválidos." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        return response({ error: "Informe um e-mail válido." }, 400);
      if (temporaryPassword.length < 8)
        return response({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      if (!username.trim() || !fullName.trim() || !phone.trim())
        return response({ error: "Preencha todos os campos obrigatórios." }, 400);
      const { data: activeUnit, error: unitError } = await admin
        .from("units")
        .select("id")
        .eq("id", unitId)
        .eq("is_active", true)
        .maybeSingle();
      if (unitError) throw new Error("Não foi possível validar a unidade selecionada.");
      if (!activeUnit) return response({ error: "A unidade selecionada não está ativa." }, 400);
      const { data: existingUsername, error: usernameError } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username.trim())
        .limit(1)
        .maybeSingle();
      if (usernameError) throw new Error("Não foi possível validar o nome de usuário.");
      if (existingUsername)
        return response({ error: "Este nome de usuário já está cadastrado." }, 409);
      const { data, error } = await admin.auth.admin.createUser({
        email: email.trim(),
        password: temporaryPassword,
        email_confirm: true,
        app_metadata: { force_password_change: true },
      });
      if (error || !data.user) {
        const message = error?.message.toLowerCase() ?? "";
        if (message.includes("already registered") || message.includes("already exists"))
          return response({ error: "Este e-mail já está cadastrado no Auth." }, 409);
        const status = errorStatus(error);
        if (status === undefined || status >= 500) {
          const { data: possibleAccount, error: lookupError } =
            await admin.auth.admin.getUserByEmail(email.trim());
          if (lookupError && lookupError.status !== 404)
            return partialFailure(
              "O Auth não confirmou o resultado da criação. Verifique a conta pelo e-mail antes de repetir.",
            );
          if (possibleAccount?.user) {
            const { data: existingProfile, error: profileLookupError } = await admin
              .from("profiles")
              .select("id")
              .eq("id", possibleAccount.user.id)
              .maybeSingle();
            if (profileLookupError)
              return partialFailure(
                "A conta Auth pode ter sido criada, mas o perfil não foi confirmado. Verifique antes de repetir.",
                409,
                possibleAccount.user.id,
              );
            if (!existingProfile)
              return partialFailure(
                "A conta Auth existe sem perfil. Verifique ou remova essa conta antes de repetir.",
                409,
                possibleAccount.user.id,
              );
            return response({ error: "Este e-mail já está cadastrado no Auth." }, 409);
          }
        }
        return response(
          { error: "Não foi possível criar a conta Auth; nenhuma criação foi confirmada." },
          status && status >= 400 && status < 500 ? status : 500,
        );
      }
      const { error: profileError } = await admin.from("profiles").insert({
        id: data.user.id,
        username: username.trim(),
        full_name: fullName.trim(),
        phone: phone.trim(),
        default_unit_id: unitId,
        role,
      });
      if (profileError) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
        if (cleanupError)
          return partialFailure(
            "A conta Auth foi criada, mas o perfil falhou e a compensação também falhou. Corrija manualmente este usuário.",
            500,
            data.user.id,
          );
        if (profileError.code === "23505")
          return response({ error: "Este nome de usuário ou perfil já está cadastrado." }, 409);
        return response({ error: "A criação do perfil falhou; a conta Auth foi removida." }, 500);
      }
      return response({ id: data.user.id } satisfies AdminUserActionResponseMap["create"]);
    }
    if (body.action === "bulk_toggle" || body.action === "bulk_delete") {
      if (
        !Array.isArray(body.ids) ||
        !isValidBulkSize(body.ids.length) ||
        !body.ids.every(isUuid) ||
        (body.action === "bulk_toggle" && typeof body.isActive !== "boolean")
      )
        return response({ error: "A seleção de usuários é inválida." }, 400);
      const ids = [...new Set(body.ids as string[])];
      if (ids.includes(actor.id))
        return response({ error: "Não é possível alterar o próprio usuário." }, 400);

      const { data: targets, error: targetsError } = await admin
        .from("profiles")
        .select("id,role,is_active,must_change_password")
        .in("id", ids);
      if (targetsError) throw new Error("Não foi possível verificar os usuários selecionados.");
      if (body.action === "bulk_toggle" && (targets ?? []).length !== ids.length)
        return response({ error: "Um ou mais usuários não foram encontrados." }, 404);
      const removesActiveAdmins =
        body.action === "bulk_delete" || (body.action === "bulk_toggle" && !body.isActive);
      if (removesActiveAdmins) {
        const affectedAdmins = (targets ?? []).filter(
          (profile) =>
            profile.role === "admin" && profile.is_active && !profile.must_change_password,
        ).length;
        const { count, error: countError } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("is_active", true)
          .eq("must_change_password", false);
        if (countError) throw new Error("Não foi possível validar a proteção de administradores.");
        if ((count ?? 0) - affectedAdmins < 1)
          return response({ error: "É necessário manter pelo menos um administrador ativo." }, 400);
      }

      if (body.action === "bulk_toggle") {
        const { data, error } = await admin
          .from("profiles")
          .update({ is_active: body.isActive })
          .in("id", ids)
          .select("id");
        if (error) throw error;
        if ((data ?? []).length !== ids.length)
          return response({ error: "Nem todos os usuários selecionados foram atualizados." }, 409);
        return response({
          updated: data.map(({ id }) => id),
        } satisfies AdminUserActionResponseMap["bulk_toggle"]);
      }

      const outcomes = [];
      for (const id of ids) {
        try {
          outcomes.push(await deleteOrDeactivate(id));
        } catch {
          outcomes.push({ id, outcome: "failed" as const });
        }
      }
      return response({ outcomes } satisfies AdminUserActionResponseMap["bulk_delete"]);
    }
    if (!targetId) return response({ error: "Identificador de usuário inválido." }, 400);
    if (body.action === "update") {
      const updateFields = ["email", "fullName", "username", "phone", "unitId", "role"] as const;
      const updateFieldLimits = {
        email: ADMIN_USER_LIMITS.email,
        fullName: ADMIN_USER_LIMITS.fullName,
        username: ADMIN_USER_LIMITS.username,
        phone: ADMIN_USER_LIMITS.phone,
        unitId: 36,
        role: 16,
      };
      if (updateFields.every((field) => body[field] === undefined))
        return response({ error: "Nenhum campo de usuário foi informado." }, 400);
      if (
        updateFields.some(
          (field) =>
            body[field] !== undefined && !isWithinLimit(body[field], updateFieldLimits[field]),
        )
      )
        return response({ error: "Os dados do usuário são inválidos." }, 400);
      if (body.role !== undefined && !validRoles.has(body.role as string))
        return response({ error: "Perfil de acesso inválido." }, 400);
      if (body.unitId !== undefined && !isUuid(body.unitId))
        return response({ error: "Unidade inválida." }, 400);
      if (
        body.email !== undefined &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((body.email as string).trim())
      )
        return response({ error: "Informe um e-mail válido." }, 400);
      if (
        [body.fullName, body.username, body.phone].some(
          (value) => typeof value === "string" && !value.trim(),
        )
      )
        return response({ error: "Nome, usuário e telefone não podem ficar vazios." }, 400);
    }
    const isSelfUpdate = targetId === actor.id && body.action === "update";
    if (targetId === actor.id && !isSelfUpdate)
      return response({ error: "Não é possível alterar o próprio usuário." }, 400);
    if (isSelfUpdate && body.role !== undefined && body.role !== actorProfile.role)
      return response({ error: "Não é possível alterar o próprio perfil." }, 400);
    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select(
        "role,is_active,must_change_password,full_name,username,phone,default_unit_id,updated_at",
      )
      .eq("id", targetId)
      .maybeSingle();
    if (targetError) throw new Error("Não foi possível verificar o usuário selecionado.");
    if (!target) {
      if (body.action === "delete")
        return response(
          (await deleteOrDeactivate(targetId)) satisfies AdminUserActionResponseMap["delete"],
        );
      return response({ error: "Usuário não encontrado." }, 404);
    }
    if (body.action === "reset_password") {
      if (
        typeof body.password !== "string" ||
        body.password.length < 8 ||
        body.password.length > ADMIN_USER_LIMITS.password
      )
        return response({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      const { data: authTarget, error: authTargetError } =
        await admin.auth.admin.getUserById(targetId);
      if (authTargetError || !authTarget.user)
        throw new Error("Não foi possível verificar a conta selecionada.");
      const { data: profileGate, error: profileGateError } = await admin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", targetId)
        .select("id")
        .maybeSingle();
      if (profileGateError || !profileGate)
        throw new Error("Não foi possível exigir a troca de senha.");
      const { error: passwordError } = await admin.auth.admin.updateUserById(targetId, {
        password: body.password,
        app_metadata: {
          ...authTarget.user.app_metadata,
          force_password_change: true,
        },
      });
      if (passwordError) {
        const status = errorStatus(passwordError);
        if (status !== undefined && status >= 400 && status < 500) {
          const { data: restoredGate, error: restoreError } = await admin
            .from("profiles")
            .update({ must_change_password: target.must_change_password })
            .eq("id", targetId)
            .select("id")
            .maybeSingle();
          if (restoreError || !restoredGate)
            return partialFailure(
              "A redefinição falhou e o estado anterior do perfil não pôde ser restaurado. Verifique o usuário antes de repetir.",
            );
          return response(
            { error: "A redefinição da senha foi rejeitada pelo Auth; o perfil foi restaurado." },
            status,
          );
        }
        return partialFailure(
          "Não foi possível confirmar a redefinição no Auth. O perfil permanece bloqueado por segurança; verifique ou repita a operação.",
        );
      }
      const { data: confirmedGate, error: confirmedGateError } = await admin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", targetId)
        .select("id")
        .maybeSingle();
      if (confirmedGateError || !confirmedGate)
        return partialFailure(
          "A senha foi redefinida, mas não foi possível confirmar o bloqueio de troca obrigatória. Revise o perfil antes de permitir acesso.",
        );
      return response({ ok: true } satisfies AdminUserActionResponseMap["reset_password"]);
    }
    const protectsLastAdmin =
      target.role === "admin" &&
      target.is_active &&
      !target.must_change_password &&
      ((body.action === "set_active" && body.isActive === false) ||
        body.action === "delete" ||
        (body.action === "update" && typeof body.role === "string" && body.role !== "admin"));
    if (protectsLastAdmin) {
      const { count, error: countError } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true)
        .eq("must_change_password", false);
      if (countError) throw new Error("Não foi possível validar a proteção de administradores.");
      if ((count ?? 0) <= 1)
        return response({ error: "É necessário manter pelo menos um administrador ativo." }, 400);
    }
    if (body.action === "delete") {
      return response(
        (await deleteOrDeactivate(targetId)) satisfies AdminUserActionResponseMap["delete"],
      );
    }
    if (body.action === "set_active") {
      const { data: updated, error: updateError } = await admin
        .from("profiles")
        .update({ is_active: body.isActive as boolean })
        .eq("id", targetId)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return response({ error: "O usuário não pôde ser atualizado." }, 409);
      return response({
        outcome: "updated",
        id: targetId,
      } satisfies AdminUserActionResponseMap["set_active"]);
    }
    if (body.action === "update") {
      const email = body.email as string | undefined;
      const fullName = body.fullName as string | undefined;
      const username = body.username as string | undefined;
      const phone = body.phone as string | undefined;
      const unitId = body.unitId as string | undefined;
      const role = body.role as string | undefined;

      if (unitId !== undefined) {
        const { data: activeUnit, error: unitError } = await admin
          .from("units")
          .select("id")
          .eq("id", unitId)
          .eq("is_active", true)
          .maybeSingle();
        if (unitError) throw new Error("Não foi possível validar a unidade selecionada.");
        if (!activeUnit) return response({ error: "A unidade selecionada não está ativa." }, 400);
      }

      if (username !== undefined) {
        const { data: existingUsername, error: usernameError } = await admin
          .from("profiles")
          .select("id")
          .eq("username", username.trim())
          .neq("id", targetId)
          .limit(1)
          .maybeSingle();
        if (usernameError) throw new Error("Não foi possível validar o nome de usuário.");
        if (existingUsername)
          return response({ error: "Este nome de usuário já está cadastrado." }, 409);
      }

      let authEmailBefore: string | null = null;
      if (email !== undefined) {
        const { data: authTarget, error: authTargetError } =
          await admin.auth.admin.getUserById(targetId);
        if (authTargetError || !authTarget.user)
          throw new Error("Não foi possível validar o e-mail atual do usuário.");
        authEmailBefore = authTarget.user.email ?? null;
      }

      const values = {
        ...(fullName !== undefined ? { full_name: fullName.trim() } : {}),
        ...(username !== undefined ? { username: username.trim() } : {}),
        ...(phone !== undefined ? { phone: phone.trim() } : {}),
        ...(unitId !== undefined ? { default_unit_id: unitId } : {}),
        ...(role !== undefined ? { role } : {}),
      };
      let updatedProfile: { id: string; updated_at: string } | null = null;
      if (Object.keys(values).length > 0) {
        const { data: updated, error } = await admin
          .from("profiles")
          .update(values)
          .eq("id", targetId)
          .eq("updated_at", target.updated_at)
          .select("id,updated_at")
          .maybeSingle();
        if (error) throw error;
        if (!updated)
          return response(
            { error: "O perfil mudou durante a edição. Atualize a tela e tente novamente." },
            409,
          );
        updatedProfile = updated;
      }

      if (email !== undefined && email.trim().toLowerCase() !== authEmailBefore?.toLowerCase()) {
        const { error: emailError } = await admin.auth.admin.updateUserById(targetId, {
          email: email.trim(),
          email_confirm: true,
        });
        if (emailError) {
          const { data: refreshedAuthUser, error: refreshError } =
            await admin.auth.admin.getUserById(targetId);
          if (refreshError)
            return partialFailure(
              "O resultado da atualização Auth é desconhecido. Verifique Auth e perfil antes de repetir.",
            );
          const authEmail = refreshedAuthUser.user?.email?.toLowerCase() ?? null;
          if (authEmail === email.trim().toLowerCase())
            return response({
              outcome: "updated",
              id: targetId,
            } satisfies AdminUserActionResponseMap["update"]);

          if (updatedProfile) {
            const previousValues = {
              ...(fullName !== undefined ? { full_name: target.full_name } : {}),
              ...(username !== undefined ? { username: target.username } : {}),
              ...(phone !== undefined ? { phone: target.phone } : {}),
              ...(unitId !== undefined ? { default_unit_id: target.default_unit_id } : {}),
              ...(role !== undefined ? { role: target.role } : {}),
            };
            const { data: restoredProfile, error: restoreError } = await admin
              .from("profiles")
              .update(previousValues)
              .eq("id", targetId)
              .eq("updated_at", updatedProfile.updated_at)
              .select("id")
              .maybeSingle();
            if (restoreError || !restoredProfile)
              return partialFailure(
                "A atualização do Auth falhou e o perfil mudou. A compensação não pôde restaurar o estado anterior; revise a conta antes de repetir.",
              );
          }

          return response(
            {
              error:
                "A atualização do e-mail no Auth falhou; os campos do perfil foram restaurados.",
            },
            errorStatus(emailError) === 409 ? 409 : 400,
          );
        }
      }
      return response({
        outcome: "updated",
        id: targetId,
      } satisfies AdminUserActionResponseMap["update"]);
    }
    return response({ error: "Ação inválida." }, 400);
  } catch (reason) {
    if (errorCode(reason) === "23514")
      return response({ error: "A operação deixaria o portal sem administrador ativo." }, 409);
    if (errorCode(reason) === "23505")
      return response({ error: "O nome de usuário já está cadastrado." }, 409);
    return response({ error: "Não foi possível concluir a operação administrativa." }, 500);
  }
});
