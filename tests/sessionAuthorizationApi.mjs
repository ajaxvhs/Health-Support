// Manual local integration test: node tests/sessionAuthorizationApi.mjs
// Uses real local Auth JWTs for assertions; service_role is limited to fixtures/cleanup.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

const readLocalEnvironment = () => {
  const output = execFileSync("supabase", ["status", "--output", "env"], {
    encoding: "utf8",
  });
  const values = new Map(
    output.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) return [];
      return [[match[1], match[2].replace(/^"|"$/g, "")]];
    }),
  );
  const apiUrl = values.get("API_URL");
  if (apiUrl !== "http://127.0.0.1:54321")
    throw new Error("Este teste só pode usar o Supabase local em 127.0.0.1:54321.");
  const anonKey = values.get("ANON_KEY");
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
  if (!anonKey || !serviceRoleKey)
    throw new Error("As chaves locais do Supabase não foram encontradas.");
  return { apiUrl, anonKey, serviceRoleKey };
};

const unwrap = (label, result) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

const createUserClient = (apiUrl, anonKey) =>
  createClient(apiUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

const invoke = async (client, functionName, body) => {
  const { data, error } = await client.functions.invoke(functionName, { body });
  if (!error) return { status: 200, data };
  const context = error.context;
  if (context && typeof context.status === "number") {
    const payload = await context
      .clone()
      .json()
      .catch(() => null);
    return { status: context.status, data: payload };
  }
  throw new Error(`${functionName} invocation failed: ${error.message}`);
};

const expectStatus = (label, result, status) => {
  assert.equal(
    result.status,
    status,
    `${label}: expected HTTP ${status}, received ${result.status} (${result.data?.error ?? "no body"})`,
  );
};

const createLogin = async (apiUrl, anonKey, user, password = user.password) => {
  const client = createUserClient(apiUrl, anonKey);
  const { error } = await client.auth.signInWithPassword({ email: user.email, password });
  if (error) throw new Error(`Local sign-in failed for ${user.label}: ${error.message}`);
  return client;
};

const waitForEdgeRuntime = async (process, apiUrl, anonKey) => {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null)
      throw new Error(
        `Local Edge Runtime exited before becoming ready (code ${process.exitCode}).`,
      );
    try {
      const response = await globalThis.fetch(`${apiUrl}/functions/v1/update-password`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: "{}",
      });
      if (response.status !== 502 && response.status !== 503) return;
      await delay(400);
    } catch {
      await delay(400);
    }
  }
  throw new Error("The local update-password Edge Function did not start in time.");
};

const stopEdgeRuntime = async (process) => {
  if (!process || process.exitCode !== null) return;
  process.kill("SIGINT");
  await Promise.race([new Promise((resolve) => process.once("exit", resolve)), delay(5_000)]);
  if (process.exitCode === null) process.kill("SIGTERM");
};

const assertNoProtectedData = async (client, label, { canReadOwnProfile = false } = {}) => {
  for (const table of ["units", "tickets", "ticket_messages", "ticket_events", "notifications"]) {
    const { data, error } = await client.from(table).select("id");
    assert.equal(error, null, `${label} could not query ${table}: ${error?.message}`);
    assert.equal(data.length, 0, `${label} unexpectedly read ${table}`);
  }

  const { data: counts, error: countsError } = await client.rpc("get_ticket_navigation_counts");
  assert.equal(countsError, null, `${label} RPC failed: ${countsError?.message}`);
  assert.equal(counts?.[0]?.visible_open_count, 0, `${label} received visible ticket counts`);

  const { data: participants, error: participantsError } =
    await client.rpc("get_ticket_participants");
  assert.equal(participantsError, null, `${label} participant RPC failed`);
  assert.equal(participants.length, 0, `${label} received ticket participants`);

  const { data: ownProfile, error: profileError } = await client
    .from("profiles")
    .select("id,is_active,must_change_password")
    .maybeSingle();
  assert.equal(profileError, null, `${label} profile query failed`);
  assert.equal(
    Boolean(ownProfile),
    canReadOwnProfile,
    `${label} had unexpected access to its gate profile`,
  );
  if (canReadOwnProfile) {
    assert.equal(ownProfile.is_active, true);
    assert.equal(ownProfile.must_change_password, true);
  }
};

const run = async () => {
  const { apiUrl, anonKey, serviceRoleKey } = readLocalEnvironment();
  const databaseContainer = execFileSync(
    "docker",
    ["ps", "--filter", "name=supabase_db_Health_Support", "--format", "{{.Names}}"],
    { encoding: "utf8" },
  ).trim();
  if (databaseContainer !== "supabase_db_Health_Support")
    throw new Error("The disposable local Supabase database container was not found.");
  const edgeProcess = spawn("supabase", ["functions", "serve"], { stdio: "ignore" });
  const admin = createClient(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const createdUsers = [];
  const createdTicketIds = [];
  let testUnitId;

  try {
    await waitForEdgeRuntime(edgeProcess, apiUrl, anonKey);

    const suffix = randomUUID();
    const firstUnit = unwrap(
      "Find active local unit",
      await admin.from("units").select("id").eq("is_active", true).limit(1).single(),
    );
    const category = unwrap(
      "Find active local category",
      await admin.from("ticket_categories").select("id").eq("is_active", true).limit(1).single(),
    );
    const priority = unwrap(
      "Find active local priority",
      await admin.from("ticket_priorities").select("id").eq("is_active", true).limit(1).single(),
    );
    const openStatus = unwrap(
      "Find open status",
      await admin.from("ticket_statuses").select("id").eq("slug", "aberto").single(),
    );
    const extraUnit = unwrap(
      "Create synthetic second unit",
      await admin
        .from("units")
        .insert({ name: `Authorization test ${suffix}`, code: `AUTH-${suffix}` })
        .select("id")
        .single(),
    );
    testUnitId = extraUnit.id;

    const userSpecs = [
      { label: "active-admin", role: "admin" },
      { label: "active-requester", role: "solicitante" },
      { label: "deactivated-admin", role: "admin" },
      { label: "password-pending-admin", role: "admin" },
    ];
    for (const spec of userSpecs) {
      const password = `Tmp-${randomUUID().slice(0, 12)}Aa9!`;
      const email = `${spec.label}-${suffix}@example.test`;
      const authUser = unwrap(
        `Create synthetic ${spec.label}`,
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { force_password_change: false },
        }),
      );
      const user = { ...spec, id: authUser.user.id, email, password };
      createdUsers.push(user);
      unwrap(
        `Create profile for ${spec.label}`,
        await admin.from("profiles").insert({
          id: user.id,
          username: `${spec.label}-${suffix.slice(0, 8)}`,
          full_name: `Synthetic ${spec.label}`,
          phone: "0000000000",
          role: spec.role,
          default_unit_id: firstUnit.id,
          is_active: true,
          must_change_password: false,
        }),
      );
    }

    const [activeAdmin, requester, inactiveAdmin, pendingAdmin] = await Promise.all(
      createdUsers.map(async (user) => ({
        ...user,
        client: await createLogin(apiUrl, anonKey, user),
      })),
    );

    const activeUnits = unwrap(
      "Read all active units as an active requester",
      await requester.client.from("units").select("id").eq("is_active", true),
    );
    assert.ok(activeUnits.some(({ id }) => id === testUnitId));
    assert.notEqual(testUnitId, firstUnit.id);

    const newTicket = unwrap(
      "Create ticket in a unit other than the requester's default unit",
      await requester.client
        .from("tickets")
        .insert({
          title: "Cross-unit authorization test",
          description: "Synthetic request created through the real user JWT.",
          unit_id: testUnitId,
          category_id: category.id,
          priority_id: priority.id,
          status_id: openStatus.id,
          created_by: requester.id,
          requester_name_snapshot: `Synthetic ${requester.label}`,
          requester_phone_snapshot: "0000000000",
        })
        .select("id,unit_id,created_by")
        .single(),
    );
    createdTicketIds.push(newTicket.id);
    assert.equal(newTicket.unit_id, testUnitId);
    assert.equal(newTicket.created_by, requester.id);

    expectStatus(
      "Active admin-users access",
      await invoke(activeAdmin.client, "admin-users", { action: "list" }),
      200,
    );
    expectStatus(
      "Requester admin-users access",
      await invoke(requester.client, "admin-users", { action: "list" }),
      403,
    );

    expectStatus(
      "Password change without current password for a regular account",
      await invoke(requester.client, "update-password", {
        newPassword: `New-${randomUUID().slice(0, 12)}Aa9!`,
      }),
      400,
    );
    expectStatus(
      "Password change with wrong current password",
      await invoke(requester.client, "update-password", {
        currentPassword: "definitely-wrong",
        newPassword: `New-${randomUUID().slice(0, 12)}Aa9!`,
      }),
      401,
    );

    const normalPassword = `Normal-${randomUUID().slice(0, 12)}Aa9!`;
    expectStatus(
      "Regular password change with verified current password",
      await invoke(requester.client, "update-password", {
        currentPassword: requester.password,
        newPassword: normalPassword,
      }),
      200,
    );
    const normalProfile = unwrap(
      "Verify normal password change cleared its gate",
      await admin.from("profiles").select("must_change_password").eq("id", requester.id).single(),
    );
    assert.equal(normalProfile.must_change_password, false);

    const inactivePasswordResult = `Inactive-${randomUUID().slice(0, 12)}Aa9!`;
    unwrap(
      "Deactivate account after issuing its JWT",
      await admin.from("profiles").update({ is_active: false }).eq("id", inactiveAdmin.id),
    );
    expectStatus(
      "Inactive admin-users access with an existing JWT",
      await invoke(inactiveAdmin.client, "admin-users", { action: "list" }),
      403,
    );
    expectStatus(
      "Inactive update-password access with an existing JWT",
      await invoke(inactiveAdmin.client, "update-password", {
        newPassword: inactivePasswordResult,
      }),
      403,
    );
    const stillAuthenticated = unwrap(
      "Validate the issued inactive JWT remains valid in Auth",
      await inactiveAdmin.client.auth.getUser(),
    );
    assert.equal(stillAuthenticated.user.id, inactiveAdmin.id);
    await assertNoProtectedData(inactiveAdmin.client, "Inactive admin");
    const inactiveTicketAttempt = await inactiveAdmin.client
      .from("tickets")
      .insert({
        title: "Blocked inactive ticket",
        description: "This synthetic write must be denied.",
        unit_id: testUnitId,
        category_id: category.id,
        priority_id: priority.id,
        status_id: openStatus.id,
        created_by: inactiveAdmin.id,
        requester_name_snapshot: `Synthetic ${inactiveAdmin.label}`,
        requester_phone_snapshot: "0000000000",
      })
      .select("id")
      .maybeSingle();
    if (inactiveTicketAttempt.data?.id) createdTicketIds.push(inactiveTicketAttempt.data.id);
    assert.ok(inactiveTicketAttempt.error, "Inactive account unexpectedly created a ticket.");

    const pendingPassword = `Pending-${randomUUID().slice(0, 12)}Aa9!`;
    unwrap(
      "Gate account after issuing its JWT",
      await admin.from("profiles").update({ must_change_password: true }).eq("id", pendingAdmin.id),
    );
    const pendingAuthUser = unwrap(
      "Read current Auth metadata for pending admin",
      await admin.auth.admin.getUserById(pendingAdmin.id),
    );
    unwrap(
      "Mark password reset in trusted Auth metadata",
      await admin.auth.admin.updateUserById(pendingAdmin.id, {
        app_metadata: {
          ...pendingAuthUser.user.app_metadata,
          force_password_change: true,
        },
      }),
    );
    expectStatus(
      "Password-pending admin-users access with an existing JWT",
      await invoke(pendingAdmin.client, "admin-users", { action: "list" }),
      403,
    );
    await assertNoProtectedData(pendingAdmin.client, "Password-pending admin", {
      canReadOwnProfile: true,
    });
    const pendingTicketAttempt = await pendingAdmin.client
      .from("tickets")
      .insert({
        title: "Blocked pending ticket",
        description: "This synthetic write must be denied.",
        unit_id: testUnitId,
        category_id: category.id,
        priority_id: priority.id,
        status_id: openStatus.id,
        created_by: pendingAdmin.id,
        requester_name_snapshot: `Synthetic ${pendingAdmin.label}`,
        requester_phone_snapshot: "0000000000",
      })
      .select("id")
      .maybeSingle();
    if (pendingTicketAttempt.data?.id) createdTicketIds.push(pendingTicketAttempt.data.id);
    assert.ok(
      pendingTicketAttempt.error,
      "Password-pending account unexpectedly created a ticket.",
    );

    const pendingPasswordResult = await invoke(pendingAdmin.client, "update-password", {
      newPassword: pendingPassword,
    });
    if (pendingPasswordResult.status !== 200) {
      const [afterPasswordProfile, afterPasswordAuthUser] = await Promise.all([
        admin
          .from("profiles")
          .select("is_active,must_change_password")
          .eq("id", pendingAdmin.id)
          .single(),
        admin.auth.admin.getUserById(pendingAdmin.id),
      ]);
      globalThis.console.error(
        `Password-pending diagnostic: ${JSON.stringify({
          status: pendingPasswordResult.status,
          profile: afterPasswordProfile.data,
          forcePasswordChange:
            afterPasswordAuthUser.data?.user?.app_metadata?.force_password_change,
        })}`,
      );
    }
    expectStatus(
      "Password-pending account completes Auth password update without an old password",
      pendingPasswordResult,
      200,
    );
    const clearedPendingProfile = unwrap(
      "Verify completed password update cleared the pending flag",
      await admin
        .from("profiles")
        .select("is_active,must_change_password")
        .eq("id", pendingAdmin.id)
        .single(),
    );
    assert.equal(clearedPendingProfile.is_active, true);
    assert.equal(clearedPendingProfile.must_change_password, false);

    const reauthenticatedAdmin = await createLogin(apiUrl, anonKey, pendingAdmin, pendingPassword);
    expectStatus(
      "Admin regains Edge Function access after completing password update",
      await invoke(reauthenticatedAdmin, "admin-users", { action: "list" }),
      200,
    );

    const resetPassword = `Reset-${randomUUID().slice(0, 12)}Aa9!`;
    expectStatus(
      "Admin resets an active requester's password",
      await invoke(activeAdmin.client, "admin-users", {
        action: "reset_password",
        id: requester.id,
        password: resetPassword,
      }),
      200,
    );
    const resetProfile = unwrap(
      "Verify admin reset blocks the profile",
      await admin.from("profiles").select("must_change_password").eq("id", requester.id).single(),
    );
    assert.equal(resetProfile.must_change_password, true);
    const resetAuthUser = unwrap(
      "Verify admin reset marker",
      await admin.auth.admin.getUserById(requester.id),
    );
    assert.equal(resetAuthUser.user.app_metadata.force_password_change, true);

    const forcedRequester = await createLogin(apiUrl, anonKey, requester, resetPassword);
    await assertNoProtectedData(forcedRequester, "Reset requester", { canReadOwnProfile: true });
    expectStatus(
      "Reset requester cannot access admin-users",
      await invoke(forcedRequester, "admin-users", { action: "list" }),
      403,
    );
    const completedPassword = `Completed-${randomUUID().slice(0, 12)}Aa9!`;
    expectStatus(
      "Reset requester completes forced password change",
      await invoke(forcedRequester, "update-password", { newPassword: completedPassword }),
      200,
    );
    const restoredRequester = await createLogin(apiUrl, anonKey, requester, completedPassword);
    const restoredTicket = unwrap(
      "Read cross-unit ticket after completing password change",
      await restoredRequester.from("tickets").select("id,unit_id").eq("id", newTicket.id).single(),
    );
    assert.equal(restoredTicket.unit_id, testUnitId);

    globalThis.console.log(
      "PASS active account: all active units and cross-unit ticket creation use its JWT",
    );
    globalThis.console.log(
      "PASS inactive account: existing JWT denied at Data API and both Edge Functions",
    );
    globalThis.console.log(
      "PASS password-pending account: existing JWT gated, Auth password update re-enables access",
    );
    globalThis.console.log("PASS admin reset: profile remains gated until a real password update");
  } finally {
    if (createdTicketIds.length) {
      const ids = createdTicketIds.map((id) => `'${id}'`).join(",");
      const actorIds = createdUsers.map((user) => `'${user.id}'`).join(",");
      const sql = `begin;
set local session_replication_role = replica;
delete from public.ticket_messages where ticket_id = any(array[${ids}]::uuid[]);
delete from public.notifications where ticket_id = any(array[${ids}]::uuid[]);
delete from public.ticket_events where ticket_id = any(array[${ids}]::uuid[]) or actor_id = any(array[${actorIds}]::uuid[]);
delete from public.tickets where id = any(array[${ids}]::uuid[]);
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
          { input: sql, encoding: "utf8", stdio: "pipe" },
        );
      } catch {
        globalThis.console.error("Fixture cleanup: failed to remove local ticket rows.");
      }
    }
    for (const user of createdUsers) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error)
        globalThis.console.error(
          `Fixture cleanup: failed to remove ${user.label} (${error.message}).`,
        );
    }
    if (testUnitId) {
      const { error } = await admin.from("units").delete().eq("id", testUnitId);
      if (error)
        globalThis.console.error(`Fixture cleanup: failed to remove test unit (${error.message}).`);
    }
    await stopEdgeRuntime(edgeProcess);
  }
};

run().catch((error) => {
  globalThis.console.error(`Session authorization API test failed: ${error.message}`);
  process.exitCode = 1;
});
