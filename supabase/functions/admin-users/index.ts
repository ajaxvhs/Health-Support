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
const allowedActions = new Set([
  "list",
  "create",
  "update",
  "toggle",
  "delete",
  "reset_password",
  "bulk_toggle",
  "bulk_delete",
]);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validRoles = new Set(["admin", "atendente", "solicitante"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
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
      .select("role,is_active")
      .eq("id", actor.id)
      .single();
    if (actorProfileError) throw new Error("Não foi possível validar o acesso administrativo.");
    if (!actorProfile?.is_active || actorProfile.role !== "admin")
      return response({ error: "Acesso restrito a administradores." }, 403);
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = await request.json();
      if (!isRecord(parsed)) return response({ error: "Corpo da requisição inválido." }, 400);
      body = parsed;
    } catch {
      return response({ error: "Corpo da requisição inválido." }, 400);
    }
    if (typeof body.action !== "string" || !allowedActions.has(body.action))
      return response({ error: "Ação inválida." }, 400);
    const deleteOrDeactivate = async (id: string) => {
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
        if (error || !data) throw new Error("Não foi possível desativar o usuário.");
        return { id, outcome: "deactivated" as const };
      }

      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error("Não foi possível excluir o usuário.");
      return { id, outcome: "deleted" as const };
    };
    if (body.action === "list") {
      const { data: profiles, error } = await admin.from("profiles").select("*").order("full_name");
      if (error) throw error;
      const users = await Promise.all(
        (profiles ?? []).map(async (item) => {
          const { data } = await admin.auth.admin.getUserById(item.id);
          return { ...item, email: data.user?.email ?? "" };
        }),
      );
      return response({ users });
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
        !validRoles.has(role)
      )
        return response({ error: "Dados do usuário inválidos." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
        return response({ error: "Informe um e-mail válido." }, 400);
      if (temporaryPassword.length < 8)
        return response({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      if (!username.trim() || !fullName.trim() || !phone.trim())
        return response({ error: "Preencha todos os campos obrigatórios." }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email: email.trim(),
        password: temporaryPassword,
        email_confirm: true,
      });
      if (error || !data.user) {
        const message = error?.message.toLowerCase() ?? "";
        if (message.includes("already registered") || message.includes("already exists"))
          return response({ error: "Este e-mail já está cadastrado no Auth." }, 409);
        throw error ?? new Error("Não foi possível criar a conta.");
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
        await admin.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }
      return response({ id: data.user.id });
    }
    if (body.action === "bulk_toggle" || body.action === "bulk_delete") {
      if (
        !Array.isArray(body.ids) ||
        body.ids.length === 0 ||
        !body.ids.every(isUuid) ||
        (body.action === "bulk_toggle" && typeof body.isActive !== "boolean")
      )
        return response({ error: "A seleção de usuários é inválida." }, 400);
      const ids = [...new Set(body.ids as string[])];
      if (ids.includes(actor.id))
        return response({ error: "Não é possível alterar o próprio usuário." }, 400);

      const { data: targets, error: targetsError } = await admin
        .from("profiles")
        .select("id,role,is_active")
        .in("id", ids);
      if (targetsError) throw new Error("Não foi possível verificar os usuários selecionados.");
      if ((targets ?? []).length !== ids.length)
        return response({ error: "Um ou mais usuários não foram encontrados." }, 404);
      const removesActiveAdmins =
        body.action === "bulk_delete" || (body.action === "bulk_toggle" && !body.isActive);
      if (removesActiveAdmins) {
        const affectedAdmins = (targets ?? []).filter(
          (profile) => profile.role === "admin" && profile.is_active,
        ).length;
        const { count, error: countError } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("is_active", true);
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
        return response({ updated: data.map(({ id }) => id) });
      }

      const outcomes = [];
      for (const id of ids) {
        try {
          outcomes.push(await deleteOrDeactivate(id));
        } catch {
          outcomes.push({ id, outcome: "failed" as const });
        }
      }
      return response({ outcomes });
    }
    if (!targetId) return response({ error: "Identificador de usuário inválido." }, 400);
    if (body.action === "update") {
      const updateFields = ["email", "fullName", "username", "phone", "unitId", "role"] as const;
      if (updateFields.every((field) => body[field] === undefined))
        return response({ error: "Nenhum campo de usuário foi informado." }, 400);
      if (
        updateFields.some((field) => body[field] !== undefined && typeof body[field] !== "string")
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
      .select("role,is_active")
      .eq("id", targetId)
      .single();
    if (targetError) throw new Error("Não foi possível verificar o usuário selecionado.");
    if (!target) return response({ error: "Usuário não encontrado." }, 404);
    if (body.action === "reset_password") {
      if (typeof body.password !== "string" || body.password.length < 8)
        return response({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      const { error: passwordError } = await admin.auth.admin.updateUserById(targetId, {
        password: body.password,
      });
      if (passwordError) throw passwordError;
      const { data: profileUpdate, error: profileError } = await admin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", targetId)
        .select("id")
        .maybeSingle();
      if (profileError || !profileUpdate)
        throw new Error("A senha foi redefinida, mas não foi possível atualizar o perfil.");
      return response({ ok: true });
    }
    const protectsLastAdmin =
      target.role === "admin" &&
      target.is_active &&
      (body.action === "toggle" ||
        body.action === "delete" ||
        (body.action === "update" && typeof body.role === "string" && body.role !== "admin"));
    if (protectsLastAdmin) {
      const { count, error: countError } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true);
      if (countError) throw new Error("Não foi possível validar a proteção de administradores.");
      if ((count ?? 0) <= 1)
        return response({ error: "É necessário manter pelo menos um administrador ativo." }, 400);
    }
    if (body.action === "delete") {
      return response(await deleteOrDeactivate(targetId));
    }
    if (body.action === "toggle") {
      const { data: current, error } = await admin
        .from("profiles")
        .select("is_active")
        .eq("id", targetId)
        .single();
      if (error) throw error;
      const { data: updated, error: updateError } = await admin
        .from("profiles")
        .update({ is_active: !current.is_active })
        .eq("id", targetId)
        .select("id")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updated) return response({ error: "O usuário não pôde ser atualizado." }, 409);
      return response({ outcome: "updated", id: targetId });
    }
    if (body.action === "update") {
      const email = body.email as string | undefined;
      const fullName = body.fullName as string | undefined;
      const username = body.username as string | undefined;
      const phone = body.phone as string | undefined;
      const unitId = body.unitId as string | undefined;
      const role = body.role as string | undefined;
      if (email !== undefined) {
        const { error: emailError } = await admin.auth.admin.updateUserById(targetId, {
          email: email.trim(),
          email_confirm: true,
        });
        if (emailError) throw emailError;
      }
      const values = {
        ...(fullName !== undefined ? { full_name: fullName.trim() } : {}),
        ...(username !== undefined ? { username: username.trim() } : {}),
        ...(phone !== undefined ? { phone: phone.trim() } : {}),
        ...(unitId !== undefined ? { default_unit_id: unitId } : {}),
        ...(role !== undefined ? { role } : {}),
      };
      if (Object.keys(values).length > 0) {
        const { data: updated, error } = await admin
          .from("profiles")
          .update(values)
          .eq("id", targetId)
          .select("id")
          .maybeSingle();
        if (error || !updated) throw new Error("O perfil não pôde ser atualizado.");
      }
      return response({ outcome: "updated", id: targetId });
    }
    return response({ error: "Ação inválida." }, 400);
  } catch {
    return response({ error: "Não foi possível concluir a operação administrativa." }, 500);
  }
});
