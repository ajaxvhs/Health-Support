// Manual local integration test: node tests/usernameLoginApi.mjs
// Refuses non-local targets and removes its synthetic Auth/profile/rate-limit fixtures.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const expectStatus = (label, response, expected) =>
  assert.equal(
    response.status,
    expected,
    `${label}: expected ${expected}, got ${response.status}.`,
  );

async function startLocalFunctions(url, anonKey) {
  const child = spawn("supabase", ["functions", "serve"], { stdio: "ignore" });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Local Edge Runtime exited before starting.");
    try {
      const response = await globalThis.fetch(`${url}/functions/v1/username-login`, {
        method: "OPTIONS",
        headers: { apikey: anonKey, "Access-Control-Request-Method": "POST" },
      });
      if (response.status !== 502 && response.status !== 503) return child;
    } catch {
      // Poll until the local Edge Functions runtime is ready.
    }
    await delay(400);
  }
  child.kill("SIGINT");
  throw new Error("Local username-login Edge Function did not start in time.");
}

async function stopLocalFunctions(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5000)]);
  if (child.exitCode === null) child.kill("SIGTERM");
}

async function postLogin(url, anonKey, username, password, clientIp) {
  const response = await globalThis.fetch(`${url}/functions/v1/username-login`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
      "cf-connecting-ip": clientIp,
    },
    body: JSON.stringify({ username, password }),
  });
  return { status: response.status, body: await response.json() };
}

async function run() {
  const output = execFileSync("supabase", ["status", "--output", "env"], { encoding: "utf8" });
  const localEnv = new Map(
    output.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      return match ? [[match[1], match[2].replace(/^"|"$/g, "")]] : [];
    }),
  );
  const url = localEnv.get("API_URL");
  const anonKey = localEnv.get("ANON_KEY");
  const serviceRoleKey = localEnv.get("SERVICE_ROLE_KEY");
  if (url !== "http://127.0.0.1:54321" || !anonKey || !serviceRoleKey)
    throw new Error("This integration test only runs against local Supabase.");

  const container = execFileSync(
    "docker",
    ["ps", "--filter", "name=supabase_db_Health_Support", "--format", "{{.Names}}"],
    { encoding: "utf8" },
  ).trim();
  if (container !== "supabase_db_Health_Support")
    throw new Error("The disposable local Supabase database container was not found.");

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const runStartedAt = new Date().toISOString();
  const clientIp = `198.51.100.${10 + Math.floor(Math.random() * 200)}`;
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const username = `username-${suffix}`;
  const email = `username-login-${suffix}@example.test`;
  const password = `Tmp-${randomUUID().slice(0, 12)}Aa9!`;
  let userId;
  let functionProcess;

  try {
    functionProcess = await startLocalFunctions(url, anonKey);

    const oldLookup = await anon.rpc("auth_email_for_username", { login_username: username });
    assert.ok(oldLookup.error, "The anonymous email lookup RPC must be removed.");
    const privateLookup = await anon.rpc("auth_user_id_for_username", {
      login_username: username,
    });
    assert.ok(privateLookup.error, "The service-only profile lookup RPC must reject anon.");

    const serviceLookupBefore = await admin.rpc("auth_user_id_for_username", {
      login_username: username,
    });
    assert.equal(serviceLookupBefore.error, null);
    assert.deepEqual(serviceLookupBefore.data, []);

    const units = await admin.from("units").select("id").eq("is_active", true).limit(1);
    assert.equal(units.error, null);
    assert.ok(units.data?.length, "The local seed must provide an active unit.");

    const authCreate = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { force_password_change: false },
    });
    assert.equal(authCreate.error, null);
    assert.ok(authCreate.data.user);
    userId = authCreate.data.user.id;

    const profileCreate = await admin.from("profiles").insert({
      id: userId,
      username,
      full_name: "Synthetic Username Login",
      phone: "0000000000",
      role: "solicitante",
      default_unit_id: units.data[0].id,
      is_active: true,
      must_change_password: false,
    });
    assert.equal(profileCreate.error, null);

    const serviceLookup = await admin.rpc("auth_user_id_for_username", {
      login_username: username.toUpperCase(),
    });
    assert.equal(serviceLookup.error, null);
    assert.deepEqual(serviceLookup.data, [{ user_id: userId, is_active: true }]);

    const preflight = await globalThis.fetch(`${url}/functions/v1/username-login`, {
      method: "OPTIONS",
      headers: { apikey: anonKey, "Access-Control-Request-Method": "POST" },
    });
    expectStatus("Allow username-login preflight", preflight, 200);
    const allowedMethods = preflight.headers
      .get("access-control-allow-methods")
      ?.split(",")
      .map((method) => method.trim().toUpperCase());
    assert.ok(allowedMethods?.includes("POST") && allowedMethods.includes("OPTIONS"));

    const getResponse = await globalThis.fetch(`${url}/functions/v1/username-login`, {
      method: "GET",
      headers: { apikey: anonKey },
    });
    expectStatus("Reject username-login GET", getResponse, 405);
    assert.equal(getResponse.headers.get("allow"), "POST, OPTIONS");
    const malformedRequest = await globalThis.fetch(`${url}/functions/v1/username-login`, {
      method: "POST",
      headers: { apikey: anonKey, "Content-Type": "application/json" },
      body: "{",
    });
    expectStatus("Reject malformed username-login JSON", malformedRequest, 400);

    const validLogin = await postLogin(url, anonKey, username, password, clientIp);
    expectStatus("Authenticate a synthetic username/password account", validLogin, 200);
    assert.equal(validLogin.body.session.user.id, userId);
    assert.equal(validLogin.body.session.user.email, email);
    assert.ok(validLogin.body.session.access_token);
    assert.ok(validLogin.body.session.refresh_token);

    const sessionClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const setSession = await sessionClient.auth.setSession({
      access_token: validLogin.body.session.access_token,
      refresh_token: validLogin.body.session.refresh_token,
    });
    assert.equal(setSession.error, null);
    assert.equal(setSession.data.user?.id, userId);
    await sessionClient.auth.signOut({ scope: "local" });

    const gateUpdate = await admin
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", userId);
    assert.equal(gateUpdate.error, null);
    const passwordPendingLogin = await postLogin(url, anonKey, username, password, clientIp);
    expectStatus("Allow login for a user who must change password", passwordPendingLogin, 200);
    assert.equal(passwordPendingLogin.body.session.user.id, userId);
    const gateRestore = await admin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", userId);
    assert.equal(gateRestore.error, null);

    const wrongPassword = await postLogin(
      url,
      anonKey,
      username,
      `Wrong-${randomUUID().slice(0, 12)}Aa9!`,
      clientIp,
    );
    const unknownUsername = await postLogin(url, anonKey, `missing-${suffix}`, password, clientIp);
    expectStatus("Return a generic error for wrong password", wrongPassword, 401);
    expectStatus("Return the same generic error for missing username", unknownUsername, 401);
    assert.deepEqual(unknownUsername.body, wrongPassword.body);
    assert.equal(JSON.stringify(wrongPassword.body).includes(email), false);

    const overlongUsername = await postLogin(url, anonKey, "u".repeat(65), password, clientIp);
    expectStatus("Reject overlong username before Auth lookup", overlongUsername, 400);

    const rateLimitedUsername = `rate-${suffix}`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const failedAttempt = await postLogin(url, anonKey, rateLimitedUsername, password, clientIp);
      expectStatus(`Allow generic credential failure ${attempt + 1}`, failedAttempt, 401);
    }
    const rateLimitedAttempt = await postLogin(
      url,
      anonKey,
      rateLimitedUsername,
      password,
      clientIp,
    );
    expectStatus("Rate limit repeated login attempts", rateLimitedAttempt, 429);
    assert.equal(JSON.stringify(rateLimitedAttempt.body).includes(email), false);

    await admin.from("profiles").update({ is_active: false }).eq("id", userId);
    const inactiveLogin = await postLogin(url, anonKey, username, password, clientIp);
    expectStatus("Reject inactive user with the same generic response", inactiveLogin, 401);
    assert.deepEqual(inactiveLogin.body, wrongPassword.body);

    globalThis.console.log(
      "PASS username login session, private lookup, generic errors, inactive accounts, and rate limits",
    );
  } finally {
    if (userId) {
      const userCleanup = await admin.auth.admin.deleteUser(userId);
      if (userCleanup.error) {
        globalThis.console.error("Fixture cleanup warning: local username Auth user remains.");
        process.exitCode = 1;
      }
    }
    const rateLimitCleanup = await admin
      .from("username_login_rate_limits")
      .delete()
      .gte("updated_at", runStartedAt);
    if (rateLimitCleanup.error) {
      globalThis.console.error("Fixture cleanup warning: local username rate-limit rows remain.");
      process.exitCode = 1;
    }
    await stopLocalFunctions(functionProcess);
  }
}

run().catch((error) => {
  globalThis.console.error(`Username login integration test failed: ${error.message}`);
  process.exitCode = 1;
});
