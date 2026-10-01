import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidLoginInput, USERNAME_LOGIN_LIMITS } from "../_shared/usernameLoginLimits.ts";

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
const invalidCredentials = () => response({ error: "Usuário ou senha inválidos." }, 401);
const tooManyAttempts = (retryAfter: number) =>
  response({ error: "Muitas tentativas. Aguarde e tente novamente." }, 429, {
    "Retry-After": String(Math.max(1, retryAfter)),
  });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashBucket(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toHex(digest);
}

function clientAddress(request: Request) {
  const cloudflareAddress = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflareAddress) return cloudflareAddress;
  const forwardedAddresses = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  return forwardedAddresses?.at(-1) ?? "unknown";
}

async function consumeRateLimit(
  admin: ReturnType<typeof createClient>,
  bucketHash: string,
  maxAttempts: number,
  windowSeconds: number,
) {
  const { data, error } = await admin.rpc("consume_username_login_attempt", {
    p_bucket_hash: bucketHash,
    p_max_attempts: maxAttempts,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("Username login rate limit is unavailable.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row) || typeof row.allowed !== "boolean")
    throw new Error("Username login rate limit response is invalid.");
  return {
    allowed: row.allowed,
    retryAfter: typeof row.retry_after_seconds === "number" ? row.retry_after_seconds : 0,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST")
    return response({ error: "Método não permitido." }, 405, { Allow: "POST, OPTIONS" });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2048) return response({ error: "Dados de acesso inválidos." }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Dados de acesso inválidos." }, 400);
  }
  if (!isRecord(body) || !isValidLoginInput(body.username, body.password))
    return response({ error: "Dados de acesso inválidos." }, 400);

  const username = body.username.trim();
  const password = body.password;
  const normalizedUsername = username.toLowerCase();
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey)
    return response({ error: "Não foi possível autenticar agora." }, 503);

  try {
    const address = clientAddress(request);
    const ipHash = await hashBucket(serviceRoleKey, `ip:${address}`);
    const usernameHash = await hashBucket(
      serviceRoleKey,
      `username:${address}:${normalizedUsername}`,
    );
    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });

    const ipLimit = await consumeRateLimit(
      admin,
      ipHash,
      USERNAME_LOGIN_LIMITS.ipAttempts,
      USERNAME_LOGIN_LIMITS.ipWindowSeconds,
    );
    if (!ipLimit.allowed) return tooManyAttempts(ipLimit.retryAfter);

    const usernameLimit = await consumeRateLimit(
      admin,
      usernameHash,
      USERNAME_LOGIN_LIMITS.identifierAttempts,
      USERNAME_LOGIN_LIMITS.identifierWindowSeconds,
    );
    if (!usernameLimit.allowed) return tooManyAttempts(usernameLimit.retryAfter);

    const { data: profiles, error: profileError } = await admin.rpc("auth_user_id_for_username", {
      login_username: username,
    });
    if (profileError) {
      console.error("Username login profile lookup failed:", profileError.code ?? "unknown");
      return response({ error: "Não foi possível autenticar agora." }, 503);
    }
    const profile = Array.isArray(profiles) && isRecord(profiles[0]) ? profiles[0] : null;
    let authEmail = "invalid-username-login@invalid.example";

    if (profile?.is_active === true && typeof profile.user_id === "string") {
      const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(
        profile.user_id,
      );
      if (authLookupError && authLookupError.status !== 404) {
        console.error("Username login Auth lookup failed:", authLookupError.code ?? "unknown");
        return response({ error: "Não foi possível autenticar agora." }, 503);
      }
      if (typeof authUser.user?.email === "string") authEmail = authUser.user.email;
    }

    const authClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { data, error } = await authClient.auth.signInWithPassword({
      email: authEmail,
      password,
    });
    if (error?.status === 429) return tooManyAttempts(60);
    if (
      error ||
      !data.user ||
      !data.session ||
      profile?.is_active !== true ||
      data.user.id !== profile.user_id
    )
      return invalidCredentials();

    return response({ session: data.session });
  } catch (error) {
    console.error("Username login failed:", error instanceof Error ? error.name : "unknown");
    return response({ error: "Não foi possível autenticar agora." }, 503);
  }
});
