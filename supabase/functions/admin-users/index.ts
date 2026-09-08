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
    const { data: actorProfile } = await admin
      .from("profiles")
      .select("role,is_active")
      .eq("id", actor.id)
      .single();
    if (!actorProfile?.is_active || actorProfile.role !== "admin")
      return response({ error: "Acesso restrito a administradores." }, 403);
    const body = await request.json();
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
    const targetId = body.id as string | undefined;
    if (body.action === "create") {
      const { data, error } = await admin.auth.admin.createUser({
        email: body.email,
        password: body.temporaryPassword,
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
        username: body.username.trim(),
        full_name: body.fullName.trim(),
        phone: body.phone.trim(),
        default_unit_id: body.unitId,
        role: body.role,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw profileError;
      }
      return response({ id: data.user.id });
    }
    if (body.action === "bulk_toggle" || body.action === "bulk_delete") {
      const ids = Array.isArray(body.ids)
        ? [...new Set(body.ids.filter((id: unknown): id is string => typeof id === "string"))]
        : [];
      if (!ids.length) return response({ error: "Nenhum usuário informado." }, 400);
      if (ids.includes(actor.id))
        return response({ error: "Não é possível alterar o próprio usuário." }, 400);

      const { data: targets, error: targetsError } = await admin
        .from("profiles")
        .select("id,role,is_active")
        .in("id", ids);
      if (targetsError) throw targetsError;
      const removesActiveAdmins =
        body.action === "bulk_delete" || (body.action === "bulk_toggle" && !body.isActive);
      if (removesActiveAdmins) {
        const affectedAdmins = (targets ?? []).filter(
          (profile) => profile.role === "admin" && profile.is_active,
        ).length;
        const { count } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin")
          .eq("is_active", true);
        if ((count ?? 0) - affectedAdmins < 1)
          return response({ error: "É necessário manter pelo menos um administrador ativo." }, 400);
      }

      if (body.action === "bulk_toggle") {
        const { error } = await admin
          .from("profiles")
          .update({ is_active: Boolean(body.isActive) })
          .in("id", ids);
        if (error) throw error;
        return response({ ok: true });
      }

      for (const id of ids) {
        const references = await Promise.all([
          admin
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .or(`created_by.eq.${id},assigned_to.eq.${id}`),
          admin
            .from("ticket_messages")
            .select("id", { count: "exact", head: true })
            .eq("sender_id", id),
          admin
            .from("ticket_events")
            .select("id", { count: "exact", head: true })
            .eq("actor_id", id),
        ]);
        if (references.some(({ count }) => (count ?? 0) > 0)) {
          const { error } = await admin.from("profiles").update({ is_active: false }).eq("id", id);
          if (error) throw error;
        } else {
          const { error } = await admin.auth.admin.deleteUser(id);
          if (error) throw error;
        }
      }
      return response({ ok: true });
    }
    if (!targetId) return response({ error: "Usuário não informado." }, 400);
    if (targetId === actor.id)
      return response({ error: "Não é possível alterar o próprio usuário." }, 400);
    const { data: target } = await admin
      .from("profiles")
      .select("role,is_active")
      .eq("id", targetId)
      .single();
    if (!target) return response({ error: "Usuário não encontrado." }, 404);
    if (body.action === "reset_password") {
      if (typeof body.password !== "string" || body.password.length < 8)
        return response({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      const { error: passwordError } = await admin.auth.admin.updateUserById(targetId, {
        password: body.password,
      });
      if (passwordError) throw passwordError;
      const { error: profileError } = await admin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", targetId);
      if (profileError) throw profileError;
      return response({ ok: true });
    }
    const protectsLastAdmin =
      target.role === "admin" &&
      target.is_active &&
      (body.action === "toggle" ||
        body.action === "delete" ||
        (body.action === "update" && body.role && body.role !== "admin"));
    if (protectsLastAdmin) {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true);
      if ((count ?? 0) <= 1)
        return response({ error: "É necessário manter pelo menos um administrador ativo." }, 400);
    }
    if (body.action === "delete") {
      for (const id of [targetId]) {
        const references = await Promise.all([
          admin
            .from("tickets")
            .select("id", { count: "exact", head: true })
            .or(`created_by.eq.${id},assigned_to.eq.${id}`),
          admin
            .from("ticket_messages")
            .select("id", { count: "exact", head: true })
            .eq("sender_id", id),
          admin
            .from("ticket_events")
            .select("id", { count: "exact", head: true })
            .eq("actor_id", id),
        ]);
        if (references.some(({ count }) => (count ?? 0) > 0)) {
          await admin.from("profiles").update({ is_active: false }).eq("id", id);
          continue;
        }
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw error;
      }
      return response({ ok: true });
    }
    if (body.action === "toggle") {
      const { data: current, error } = await admin
        .from("profiles")
        .select("is_active")
        .eq("id", targetId)
        .single();
      if (error) throw error;
      const { error: updateError } = await admin
        .from("profiles")
        .update({ is_active: !current.is_active })
        .eq("id", targetId);
      if (updateError) throw updateError;
      return response({ ok: true });
    }
    if (body.action === "update") {
      if (body.email !== undefined) {
        const { error: emailError } = await admin.auth.admin.updateUserById(targetId, {
          email: body.email.trim(),
          email_confirm: true,
        });
        if (emailError) throw emailError;
      }
      const values = {
        ...(body.fullName !== undefined ? { full_name: body.fullName.trim() } : {}),
        ...(body.username !== undefined ? { username: body.username.trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone.trim() } : {}),
        ...(body.unitId !== undefined ? { default_unit_id: body.unitId } : {}),
        ...(body.role !== undefined ? { role: body.role } : {}),
      };
      const { error } = await admin.from("profiles").update(values).eq("id", targetId);
      if (error) throw error;
      return response({ ok: true });
    }
    return response({ error: "Ação inválida." }, 400);
  } catch (error) {
    return response({ error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});
