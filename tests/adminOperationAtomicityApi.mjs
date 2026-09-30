// Manual local integration test: node tests/adminOperationAtomicityApi.mjs
// Refuses non-local Supabase targets. All fixture accounts/profiles are deleted in finally.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const unwrap = (label, result) => {
  if (result.error) throw new Error(`${label} failed (${result.error.code ?? "error"}).`);
  return result.data;
};

const createUserClient = (url, anonKey) =>
  createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

const invoke = async (client, body) => {
  const { data, error } = await client.functions.invoke("admin-users", { body });
  if (!error) return { status: 200, data };
  if (typeof error.context?.status === "number") {
    return {
      status: error.context.status,
      data: await error.context
        .clone()
        .json()
        .catch(() => null),
    };
  }
  throw new Error(`admin-users returned no HTTP response (${error.name}).`);
};

const expectStatus = (label, result, expected) => {
  assert.equal(result.status, expected, `${label}: expected ${expected}, got ${result.status}.`);
};

async function startLocalFunctions(url, anonKey) {
  const child = spawn("supabase", ["functions", "serve"], { stdio: "ignore" });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("Local Edge Runtime exited before starting.");
    try {
      const response = await globalThis.fetch(`${url}/functions/v1/admin-users`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ action: "list" }),
      });
      if (response.status !== 502 && response.status !== 503) return child;
    } catch {
      // Continue polling until the local functions server is ready.
    }
    await delay(400);
  }
  child.kill("SIGINT");
  throw new Error("Local admin-users Edge Function did not start in time.");
}

async function stopLocalFunctions(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([new Promise((resolve) => child.once("exit", resolve)), delay(5000)]);
  if (child.exitCode === null) child.kill("SIGTERM");
}

async function login(url, anonKey, user) {
  const client = createUserClient(url, anonKey);
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw new Error(`Synthetic sign-in failed for ${user.label}.`);
  return client;
}

async function readUserByEmail(admin, email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Auth list failed (${error.status ?? "error"}).`);
  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

function runLocalDatabaseSql(container, sql) {
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
    { input: sql, encoding: "utf8", stdio: "pipe" },
  );
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
  const databaseContainer = execFileSync(
    "docker",
    ["ps", "--filter", "name=supabase_db_Health_Support", "--format", "{{.Names}}"],
    { encoding: "utf8" },
  ).trim();
  if (databaseContainer !== "supabase_db_Health_Support")
    throw new Error("The disposable local Supabase database container was not found.");

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const createdUserIds = new Set();
  let originalActiveAdminIds = [];
  let deactivatedAdminIds = [];
  let functionProcess;
  let failureTriggerName;
  let failureFunctionName;
  let authDeleteFailureTriggerName;
  let authDeleteFailureFunctionName;
  let rollbackFailureTriggerName;
  let rollbackFailureFunctionName;

  try {
    functionProcess = await startLocalFunctions(url, anonKey);
    const preflightResponse = await globalThis.fetch(`${url}/functions/v1/admin-users`, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" },
    });
    expectStatus("Allow POST preflight requests", preflightResponse, 200);
    const allowedMethods = preflightResponse.headers
      .get("access-control-allow-methods")
      ?.split(",")
      .map((method) => method.trim().toUpperCase());
    assert.ok(allowedMethods?.includes("POST") && allowedMethods.includes("OPTIONS"));

    const methodResponse = await globalThis.fetch(`${url}/functions/v1/admin-users`, {
      method: "GET",
      headers: { apikey: anonKey },
    });
    expectStatus("Reject non-POST admin-users requests", methodResponse, 405);
    assert.equal(methodResponse.headers.get("allow"), "POST, OPTIONS");

    const suffix = randomUUID().replaceAll("-", "").slice(0, 14);
    const units = unwrap(
      "Find active local unit",
      await admin.from("units").select("id").eq("is_active", true).limit(1),
    );
    assert.ok(units.length, "The local seed must contain an active unit.");
    const unitId = units[0].id;

    originalActiveAdminIds = unwrap(
      "Snapshot seed admins before fixture setup",
      await admin
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .eq("is_active", true)
        .eq("must_change_password", false),
    ).map(({ id }) => id);
    assert.ok(
      originalActiveAdminIds.length,
      "The local seed must provide an admin for safe cleanup.",
    );

    const specs = [
      { label: "atomic-admin-a", role: "admin" },
      { label: "atomic-admin-b", role: "admin" },
      { label: "atomic-requester", role: "solicitante" },
      { label: "atomic-email-conflict", role: "solicitante" },
    ];
    const users = [];
    for (const spec of specs) {
      const user = {
        ...spec,
        email: `${spec.label}-${suffix}@example.test`,
        password: `Tmp-${randomUUID().slice(0, 12)}Aa9!`,
      };
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        app_metadata: { force_password_change: false },
      });
      if (authError || !authData.user)
        throw new Error(
          `Failed to create synthetic ${user.label} (${authError?.status ?? "Auth"}).`,
        );
      user.id = authData.user.id;
      createdUserIds.add(user.id);
      const { error: profileError } = await admin.from("profiles").insert({
        id: user.id,
        username: `${user.label}-${suffix}`,
        full_name: `Synthetic ${user.label}`,
        phone: "0000000000",
        role: user.role,
        default_unit_id: unitId,
        is_active: true,
        must_change_password: false,
      });
      if (profileError)
        throw new Error(`Failed to create synthetic ${user.label} profile (${profileError.code}).`);
      users.push(user);
    }

    const [adminA, adminB, requester, emailConflict] = await Promise.all(
      users.map(async (user) => ({ ...user, client: await login(url, anonKey, user) })),
    );

    const { data: adminSessionData } = await adminA.client.auth.getSession();
    assert.ok(adminSessionData.session?.access_token);
    const malformedJsonResponse = await globalThis.fetch(`${url}/functions/v1/admin-users`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${adminSessionData.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: "{",
    });
    expectStatus("Reject malformed JSON request bodies", malformedJsonResponse, 400);

    expectStatus(
      "Reject a bulk request above the configured size limit",
      await invoke(adminA.client, {
        action: "bulk_toggle",
        ids: Array.from({ length: 101 }, () => randomUUID()),
        isActive: false,
      }),
      400,
    );

    const oversizedNameEmail = `oversized-name-${suffix}@example.test`;
    expectStatus(
      "Reject an overlong user field before creating an Auth account",
      await invoke(adminA.client, {
        action: "create",
        email: oversizedNameEmail,
        temporaryPassword: `New-${randomUUID().slice(0, 12)}Aa9!`,
        username: `oversized-name-${suffix}`,
        fullName: "N".repeat(121),
        phone: "0000000001",
        unitId,
        role: "solicitante",
      }),
      400,
    );
    assert.equal(await readUserByEmail(admin, oversizedNameEmail), null);

    expectStatus(
      "Reject unknown admin action",
      await invoke(adminA.client, { action: "unknown" }),
      400,
    );
    const missingFieldsEmail = `missing-fields-${suffix}@example.test`;
    expectStatus(
      "Reject missing and null create fields before Auth writes",
      await invoke(adminA.client, {
        action: "create",
        email: missingFieldsEmail,
        fullName: null,
      }),
      400,
    );
    assert.equal(await readUserByEmail(admin, missingFieldsEmail), null);
    const invalidRoleEmail = `invalid-role-${suffix}@example.test`;
    expectStatus(
      "Reject an unsupported role before Auth writes",
      await invoke(adminA.client, {
        action: "create",
        email: invalidRoleEmail,
        temporaryPassword: `New-${randomUUID().slice(0, 12)}Aa9!`,
        username: `invalid-role-${suffix}`,
        fullName: "Invalid role synthetic",
        phone: "0000000001",
        unitId,
        role: "staff",
      }),
      400,
    );
    assert.equal(await readUserByEmail(admin, invalidRoleEmail), null);
    expectStatus(
      "Reject a string instead of a boolean for set_active",
      await invoke(adminA.client, { action: "set_active", id: requester.id, isActive: "false" }),
      400,
    );
    expectStatus(
      "Reject an empty bulk selection",
      await invoke(adminA.client, { action: "bulk_toggle", ids: [], isActive: false }),
      400,
    );
    expectStatus(
      "Reject a malformed target ID",
      await invoke(adminA.client, { action: "delete", id: "not-a-uuid" }),
      400,
    );
    expectStatus(
      "Return not found for a valid but nonexistent target ID",
      await invoke(adminA.client, { action: "update", id: randomUUID(), fullName: "Synthetic" }),
      404,
    );
    expectStatus(
      "Reject an overlong update field",
      await invoke(adminA.client, {
        action: "update",
        id: requester.id,
        fullName: "N".repeat(121),
      }),
      400,
    );

    const directRoleChange = await adminA.client
      .from("profiles")
      .update({ role: "solicitante" })
      .eq("id", adminB.id)
      .select("id")
      .maybeSingle();
    assert.ok(directRoleChange.error || !directRoleChange.data);

    const invalidUnitEmail = `invalid-unit-${suffix}@example.test`;
    expectStatus(
      "Reject create before Auth when unit validation fails",
      await invoke(adminA.client, {
        action: "create",
        email: invalidUnitEmail,
        temporaryPassword: `New-${randomUUID().slice(0, 12)}Aa9!`,
        username: `invalid-unit-${suffix}`,
        fullName: "Invalid unit synthetic",
        phone: "0000000001",
        unitId: randomUUID(),
        role: "solicitante",
      }),
      400,
    );
    const invalidUnitUser = await readUserByEmail(admin, invalidUnitEmail);
    if (invalidUnitUser) createdUserIds.add(invalidUnitUser.id);
    assert.equal(invalidUnitUser, null);

    failureTriggerName = `atomicity_fail_insert_${suffix}`;
    failureFunctionName = `atomicity_fail_profile_${suffix}`;
    const failureEmail = `profile-insert-failure-${suffix}@example.test`;
    const failureUsername = `profile_insert_failure_${suffix}`;
    runLocalDatabaseSql(
      databaseContainer,
      `create function public.${failureFunctionName}() returns trigger language plpgsql as $$
begin
  if new.username = '${failureUsername}' then
    raise exception using errcode = '23514', message = 'injected profile insert failure';
  end if;
  return new;
end;
$$;
create trigger ${failureTriggerName} before insert on public.profiles
for each row execute function public.${failureFunctionName}();`,
    );
    try {
      const failedCreate = await invoke(adminA.client, {
        action: "create",
        email: failureEmail,
        temporaryPassword: `Failure-${randomUUID().slice(0, 12)}Aa9!`,
        username: failureUsername,
        fullName: "Injected profile failure",
        phone: "0000000004",
        unitId,
        role: "solicitante",
      });
      assert.equal(failedCreate.status, 500);
      if (typeof failedCreate.data?.authUserId === "string")
        createdUserIds.add(failedCreate.data.authUserId);
      assert.notEqual(failedCreate.data?.outcome, "partial_failure");
      const failedAuthUser = await readUserByEmail(admin, failureEmail);
      if (failedAuthUser) createdUserIds.add(failedAuthUser.id);
      assert.equal(failedAuthUser, null);
      const failedProfile = unwrap(
        "Verify injected profile failure left no profile",
        await admin.from("profiles").select("id").eq("username", failureUsername),
      );
      assert.equal(failedProfile.length, 0);
    } finally {
      runLocalDatabaseSql(
        databaseContainer,
        `drop trigger if exists ${failureTriggerName} on public.profiles;
drop function if exists public.${failureFunctionName}();`,
      );
      failureTriggerName = undefined;
      failureFunctionName = undefined;
    }

    failureTriggerName = `atomicity_fail_insert_${suffix}`;
    failureFunctionName = `atomicity_fail_profile_${suffix}`;
    authDeleteFailureTriggerName = `atomicity_fail_auth_delete_${suffix}`;
    authDeleteFailureFunctionName = `atomicity_fail_auth_${suffix}`;
    const partialEmail = `profile-compensation-failure-${suffix}@example.test`;
    const partialUsername = `profile_compensation_failure_${suffix}`;
    runLocalDatabaseSql(
      databaseContainer,
      `create function public.${failureFunctionName}() returns trigger language plpgsql as $$
begin
  if new.username = '${partialUsername}' then
    raise exception using errcode = '23514', message = 'injected profile insert failure';
  end if;
  return new;
end;
$$;
create trigger ${failureTriggerName} before insert on public.profiles
for each row execute function public.${failureFunctionName}();
create function public.${authDeleteFailureFunctionName}() returns trigger language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = 'injected Auth cleanup failure';
end;
$$;
create trigger ${authDeleteFailureTriggerName} before delete on auth.users
for each row when (old.email = '${partialEmail}')
execute function public.${authDeleteFailureFunctionName}();`,
    );
    try {
      const partialCreate = await invoke(adminA.client, {
        action: "create",
        email: partialEmail,
        temporaryPassword: `Partial-${randomUUID().slice(0, 12)}Aa9!`,
        username: partialUsername,
        fullName: "Synthetic partial failure",
        phone: "0000000005",
        unitId,
        role: "solicitante",
      });
      assert.equal(partialCreate.status, 500);
      assert.equal(partialCreate.data?.outcome, "partial_failure");
      const partialAuthUserId = partialCreate.data?.authUserId;
      assert.match(partialAuthUserId ?? "", /^[0-9a-f-]{36}$/i);
      createdUserIds.add(partialAuthUserId);
      const partialAuthUser = unwrap(
        "Verify Auth account remains discoverable after failed cleanup",
        await admin.auth.admin.getUserById(partialAuthUserId),
      );
      assert.equal(partialAuthUser.user.id, partialAuthUserId);
      const partialProfile = unwrap(
        "Verify failed profile insert did not create a profile",
        await admin.from("profiles").select("id").eq("id", partialAuthUserId),
      );
      assert.equal(partialProfile.length, 0);
    } finally {
      runLocalDatabaseSql(
        databaseContainer,
        `drop trigger if exists ${authDeleteFailureTriggerName} on auth.users;
drop function if exists public.${authDeleteFailureFunctionName}();
drop trigger if exists ${failureTriggerName} on public.profiles;
drop function if exists public.${failureFunctionName}();`,
      );
      authDeleteFailureTriggerName = undefined;
      authDeleteFailureFunctionName = undefined;
      failureTriggerName = undefined;
      failureFunctionName = undefined;
    }

    const duplicateNameEmail = `duplicate-name-${suffix}@example.test`;
    expectStatus(
      "Reject duplicate profile username before Auth create",
      await invoke(adminA.client, {
        action: "create",
        email: duplicateNameEmail,
        temporaryPassword: `New-${randomUUID().slice(0, 12)}Aa9!`,
        username: `${requester.label}-${suffix}`,
        fullName: "Duplicate name synthetic",
        phone: "0000000002",
        unitId,
        role: "solicitante",
      }),
      409,
    );
    const duplicateNameUser = await readUserByEmail(admin, duplicateNameEmail);
    if (duplicateNameUser) createdUserIds.add(duplicateNameUser.id);
    assert.equal(duplicateNameUser, null);

    const racingName = `atomic-race-${suffix}`;
    const racingEmails = [
      `atomic-create-a-${suffix}@example.test`,
      `atomic-create-b-${suffix}@example.test`,
    ];
    const createResults = await Promise.all(
      racingEmails.map((email, index) =>
        invoke(adminA.client, {
          action: "create",
          email,
          temporaryPassword: `Race-${randomUUID().slice(0, 12)}Aa9!`,
          username: racingName,
          fullName: `Synthetic race ${index}`,
          phone: "0000000003",
          unitId,
          role: "solicitante",
        }),
      ),
    );
    assert.equal(createResults.filter(({ status }) => status === 200).length, 1);
    const raceAccounts = await Promise.all(
      racingEmails.map((email) => readUserByEmail(admin, email)),
    );
    assert.equal(
      raceAccounts.filter(Boolean).length,
      1,
      "Racing create left an orphan Auth account.",
    );
    const raceProfiles = unwrap(
      "Check racing create profile count",
      await admin.from("profiles").select("id").eq("username", racingName),
    );
    assert.equal(raceProfiles.length, 1);
    for (const user of raceAccounts) if (user) createdUserIds.add(user.id);

    const profileBeforeEmailChange = unwrap(
      "Read requester before duplicate email update",
      await admin
        .from("profiles")
        .select("full_name,username,phone,default_unit_id,role")
        .eq("id", requester.id)
        .single(),
    );
    const authFailure = await invoke(adminA.client, {
      action: "update",
      id: requester.id,
      email: emailConflict.email,
      fullName: "Must be rolled back",
      username: `rollback-${suffix}`,
    });
    assert.ok([400, 409].includes(authFailure.status));
    const profileAfterEmailChange = unwrap(
      "Read requester after duplicate email update",
      await admin
        .from("profiles")
        .select("full_name,username,phone,default_unit_id,role")
        .eq("id", requester.id)
        .single(),
    );
    assert.deepEqual(profileAfterEmailChange, profileBeforeEmailChange);
    const authAfterEmailFailure = unwrap(
      "Read requester Auth record after duplicate email update",
      await admin.auth.admin.getUserById(requester.id),
    );
    assert.equal(authAfterEmailFailure.user.email, requester.email);

    rollbackFailureTriggerName = `atomicity_fail_profile_rollback_${suffix}`;
    rollbackFailureFunctionName = `atomicity_fail_rollback_${suffix}`;
    const rollbackUsername = `rollback_partial_${suffix}`;
    runLocalDatabaseSql(
      databaseContainer,
      `create function public.${rollbackFailureFunctionName}() returns trigger language plpgsql as $$
begin
  if old.username = '${rollbackUsername}' and new.username = '${requester.label}-${suffix}' then
    raise exception using errcode = '23514', message = 'injected profile rollback failure';
  end if;
  return new;
end;
$$;
create trigger ${rollbackFailureTriggerName} before update on public.profiles
for each row execute function public.${rollbackFailureFunctionName}();`,
    );
    try {
      const partialEmailUpdate = await invoke(adminA.client, {
        action: "update",
        id: requester.id,
        email: emailConflict.email,
        fullName: "Partial profile write",
        username: rollbackUsername,
      });
      assert.equal(partialEmailUpdate.status, 409);
      assert.equal(partialEmailUpdate.data?.outcome, "partial_failure");
      const partialProfile = unwrap(
        "Inspect profile after injected compensation failure",
        await admin.from("profiles").select("full_name,username").eq("id", requester.id).single(),
      );
      assert.equal(partialProfile.full_name, "Partial profile write");
      assert.equal(partialProfile.username, rollbackUsername);
      const unchangedAuthEmail = unwrap(
        "Confirm Auth email remained unchanged after partial update",
        await admin.auth.admin.getUserById(requester.id),
      );
      assert.equal(unchangedAuthEmail.user.email, requester.email);
    } finally {
      runLocalDatabaseSql(
        databaseContainer,
        `drop trigger if exists ${rollbackFailureTriggerName} on public.profiles;
drop function if exists public.${rollbackFailureFunctionName}();`,
      );
      rollbackFailureTriggerName = undefined;
      rollbackFailureFunctionName = undefined;
    }

    const requesterProfileBeforeReset = unwrap(
      "Read requester before invalid reset",
      await admin
        .from("profiles")
        .select("is_active,must_change_password")
        .eq("id", requester.id)
        .single(),
    );
    expectStatus(
      "Reject an overlong reset password before profile mutation",
      await invoke(adminA.client, {
        action: "reset_password",
        id: requester.id,
        password: "P".repeat(129),
      }),
      400,
    );
    expectStatus(
      "Reject invalid reset before profile gate mutation",
      await invoke(adminA.client, {
        action: "reset_password",
        id: requester.id,
        password: "short",
      }),
      400,
    );
    const requesterProfileAfterReset = unwrap(
      "Verify invalid reset left profile unchanged",
      await admin
        .from("profiles")
        .select("is_active,must_change_password")
        .eq("id", requester.id)
        .single(),
    );
    assert.deepEqual(requesterProfileAfterReset, requesterProfileBeforeReset);

    for (const desired of [false, false, true, true]) {
      expectStatus(
        `Set requester active=${desired} idempotently`,
        await invoke(adminA.client, { action: "set_active", id: requester.id, isActive: desired }),
        200,
      );
    }
    const requesterState = unwrap(
      "Verify idempotent set_active result",
      await admin.from("profiles").select("is_active").eq("id", requester.id).single(),
    );
    assert.equal(requesterState.is_active, true);

    const bulkDeactivation = await invoke(adminA.client, {
      action: "bulk_toggle",
      ids: [requester.id],
      isActive: false,
    });
    expectStatus("Apply a typed bulk_toggle response", bulkDeactivation, 200);
    assert.deepEqual(bulkDeactivation.data.updated, [requester.id]);
    const bulkReactivation = await invoke(adminA.client, {
      action: "bulk_toggle",
      ids: [requester.id],
      isActive: true,
    });
    expectStatus("Restore the requester after bulk_toggle", bulkReactivation, 200);
    assert.deepEqual(bulkReactivation.data.updated, [requester.id]);

    const requesterStateBeforeReset = unwrap(
      "Snapshot requester before same-password reset",
      await admin.from("profiles").select("must_change_password").eq("id", requester.id).single(),
    );
    const samePasswordReset = await invoke(adminB.client, {
      action: "reset_password",
      id: requester.id,
      password: requester.password,
    });
    const requesterAfterReset = unwrap(
      "Verify reset outcome state",
      await admin.from("profiles").select("must_change_password").eq("id", requester.id).single(),
    );
    if (samePasswordReset.status === 200) {
      assert.equal(requesterAfterReset.must_change_password, true);
    } else if (samePasswordReset.data?.outcome === "partial_failure") {
      assert.equal(requesterAfterReset.must_change_password, true);
    } else {
      assert.notEqual(samePasswordReset.status, 500);
      assert.deepEqual(requesterAfterReset, requesterStateBeforeReset);
    }

    const bulkDelete = await invoke(adminA.client, {
      action: "bulk_delete",
      ids: [emailConflict.id],
    });
    expectStatus("Apply a typed bulk_delete response", bulkDelete, 200);
    assert.deepEqual(bulkDelete.data.outcomes, [{ id: emailConflict.id, outcome: "deleted" }]);

    const firstDelete = await invoke(adminA.client, { action: "delete", id: requester.id });
    expectStatus("Delete an unreferenced synthetic requester", firstDelete, 200);
    assert.equal(firstDelete.data.outcome, "deleted");
    const deletedProfile = unwrap(
      "Verify successful Auth deletion removed its profile",
      await admin.from("profiles").select("id").eq("id", requester.id).maybeSingle(),
    );
    assert.equal(deletedProfile, null);
    const deletedAuthUser = await admin.auth.admin.getUserById(requester.id);
    assert.ok(deletedAuthUser.error || !deletedAuthUser.data.user);
    const retriedDelete = await invoke(adminA.client, { action: "delete", id: requester.id });
    expectStatus("Retry deletion after a lost response", retriedDelete, 200);
    assert.equal(retriedDelete.data.outcome, "deleted");

    for (const id of originalActiveAdminIds) {
      const { error } = await admin.from("profiles").update({ is_active: false }).eq("id", id);
      if (error) throw new Error(`Could not isolate local admin fixtures (${error.code}).`);
      deactivatedAdminIds.push(id);
    }

    const concurrentEdgeDeactivations = await Promise.all([
      invoke(adminA.client, { action: "set_active", id: adminB.id, isActive: false }),
      invoke(adminB.client, { action: "set_active", id: adminA.id, isActive: false }),
    ]);
    assert.equal(
      concurrentEdgeDeactivations.filter(({ status }) => status === 200).length,
      1,
      "Concurrent admin-users requests must not deactivate both active admins.",
    );
    const adminsAfterEdgeRace = unwrap(
      "Verify last-admin invariant after concurrent Edge requests",
      await admin
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .eq("is_active", true)
        .eq("must_change_password", false),
    );
    assert.equal(adminsAfterEdgeRace.length, 1);
    unwrap(
      "Restore synthetic admins for direct-database race test",
      await admin
        .from("profiles")
        .update({ role: "admin", is_active: true, must_change_password: false })
        .in("id", [adminA.id, adminB.id]),
    );

    const concurrentDemotions = await Promise.all(
      [adminA, adminB].map((user) =>
        admin
          .from("profiles")
          .update({ role: "solicitante" })
          .eq("id", user.id)
          .select("id")
          .maybeSingle(),
      ),
    );
    assert.equal(
      concurrentDemotions.filter(({ error, data }) => !error && data?.id).length,
      1,
      "Database guard must allow only one of two concurrent last-admin demotions.",
    );
    const remainingAdmins = unwrap(
      "Verify last-admin invariant after concurrent privileged writes",
      await admin
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .eq("is_active", true)
        .eq("must_change_password", false),
    );
    assert.equal(remainingAdmins.length, 1);

    globalThis.console.log("PASS direct authenticated profile writes are denied");
    globalThis.console.log(
      "PASS invalid and racing create operations leave no orphan Auth accounts",
    );
    globalThis.console.log(
      "PASS profile failure with failed Auth cleanup returns a partial result for reconciliation",
    );
    globalThis.console.log("PASS failed Auth email update compensates profile changes");
    globalThis.console.log("PASS deleting a user is idempotent after a lost response");
    globalThis.console.log("PASS active-state updates are idempotent");
    globalThis.console.log(
      "PASS concurrent admin-users and direct database writes preserve an active administrator",
    );
  } finally {
    for (const id of deactivatedAdminIds) {
      const { error } = await admin.from("profiles").update({ is_active: true }).eq("id", id);
      if (error) {
        globalThis.console.error("Fixture cleanup warning: failed to restore a seed admin.");
        process.exitCode = 1;
      }
    }

    if (authDeleteFailureTriggerName && authDeleteFailureFunctionName) {
      try {
        runLocalDatabaseSql(
          databaseContainer,
          `drop trigger if exists ${authDeleteFailureTriggerName} on auth.users;
drop function if exists public.${authDeleteFailureFunctionName}();`,
        );
      } catch {
        globalThis.console.error("Fixture cleanup warning: local Auth failure trigger remains.");
        process.exitCode = 1;
      }
    }
    if (failureTriggerName && failureFunctionName) {
      try {
        runLocalDatabaseSql(
          databaseContainer,
          `drop trigger if exists ${failureTriggerName} on public.profiles;
drop function if exists public.${failureFunctionName}();`,
        );
      } catch {
        globalThis.console.error("Fixture cleanup warning: local failpoint trigger remains.");
        process.exitCode = 1;
      }
    }
    if (rollbackFailureTriggerName && rollbackFailureFunctionName) {
      try {
        runLocalDatabaseSql(
          databaseContainer,
          `drop trigger if exists ${rollbackFailureTriggerName} on public.profiles;
drop function if exists public.${rollbackFailureFunctionName}();`,
        );
      } catch {
        globalThis.console.error("Fixture cleanup warning: local rollback failpoint remains.");
        process.exitCode = 1;
      }
    }

    if (createdUserIds.size) {
      const ids = [...createdUserIds];
      if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
        globalThis.console.error("Fixture cleanup refused an unexpected user identifier.");
        process.exitCode = 1;
      } else {
        const literals = ids.map((id) => `'${id}'`).join(",");
        const cleanupSql = `begin;
delete from auth.users where id = any(array[${literals}]::uuid[]);
do $$ begin
  if exists (select 1 from public.profiles where id = any(array[${literals}]::uuid[])) then
    raise exception 'Synthetic profile cleanup failed';
  end if;
end $$;
commit;`;
        try {
          execFileSync(
            "docker",
            [
              "exec",
              "-i",
              databaseContainer,
              "psql",
              "-U",
              "postgres",
              "-d",
              "postgres",
              "-v",
              "ON_ERROR_STOP=1",
            ],
            { input: cleanupSql, encoding: "utf8", stdio: "pipe" },
          );
        } catch {
          globalThis.console.error("Fixture cleanup warning: local Auth/profile rows remain.");
          process.exitCode = 1;
        }
      }
    }
    try {
      await stopLocalFunctions(functionProcess);
    } catch {
      globalThis.console.error("Fixture cleanup warning: failed to stop local Edge Runtime.");
      process.exitCode = 1;
    }
  }
}

run().catch((error) => {
  globalThis.console.error(`Admin operation atomicity test failed: ${error.message}`);
  process.exitCode = 1;
});
