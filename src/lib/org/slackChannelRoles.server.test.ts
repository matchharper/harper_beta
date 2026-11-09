import assert from "node:assert/strict";
import Module from "node:module";
import test from "node:test";

test("channel assignment batch preserves the delivery and access boundaries", async (t) => {
  const roleIds = Array.from({ length: 22 }, (_, i) => `role-${i}`);
  let authorized = true;
  let visibleIds = roleIds;
  let deniedRole: string | undefined;
  let failWrite = false;
  let optOuts: Array<{ role_id: string; channel_id: string }> = [];
  let emails = new Set<string>();
  let channels = [{ id: "target-db", slack_channel_id: "C_TARGET" }, { id: "other-db", slack_channel_id: "C_OTHER" }];
  const writes: Array<{ method: string; table: string; rows?: unknown; filters: unknown }> = [];
  const reads: string[] = [];
  const audience: string[] = [];
  const admin = { from(table: string) {
    let method = "select";
    let rows: Array<{ role_id: string; channel_id: string }> = [];
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      in: (key: string, value: unknown) => { filters[key] = value; return query; },
      delete: () => { method = "delete"; return query; },
      upsert: (values: typeof rows, options: unknown) => {
        assert.deepEqual(options, { onConflict: "role_id,channel_id" });
        method = "upsert"; rows = values; return query;
      },
      then(resolve: (value: unknown) => unknown) {
        const matches = (row: Record<string, unknown>) => Object.entries(filters).every(
          ([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value
        );
        if (method !== "select") {
          writes.push({ method, table, rows, filters });
          if (failWrite) return Promise.resolve(resolve({ data: null, error: new Error("write failed") }));
          assert.equal(table, "company_role_notification_channels");
          if (method === "delete") optOuts = optOuts.filter((row) => !matches(row));
          else for (const row of rows) {
            if (!optOuts.some((item) => item.role_id === row.role_id && item.channel_id === row.channel_id)) optOuts.push(row);
          }
          return Promise.resolve(resolve({ data: null, error: null }));
        }
        reads.push(table);
        const data = table === "company_slack_channels" ? channels
          : table === "company_role_notification_channels" ? optOuts.filter(matches)
          : roleIds.map((role_id) => ({ role_id, email_notifications_enabled: emails.has(role_id) })).filter(matches);
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return query;
  } };
  const nodeModule = Module as any;
  const load = nodeModule._load;
  class OrgHttpError extends Error { constructor(public status: number, message: string) { super(message); } }
  t.mock.method(nodeModule, "_load", function (this: unknown, name: string, ...args: unknown[]) {
    if (name === "@/lib/server/candidateAccess") return { getSupabaseAdmin: () => admin };
    if (name === "./server") return {
      OrgHttpError,
      assertOrgWorkspacePermission: async (args: any) => {
        assert.equal(args.workspaceId, "workspace");
        assert.equal(args.user.id, "user");
        assert.equal(args.permission, "manage_candidates");
        if (!authorized) throw new OrgHttpError(403, "Forbidden");
      },
      fetchRoleRowsForWorkspace: async () => visibleIds.map((role_id) => ({ role_id })),
    };
    if (name === "./slackHarper") return {
      isHarperSlackAudienceAllowed: async (args: any) => {
        assert.equal(args.channelId, "C_TARGET");
        audience.push(args.roleId);
        return args.roleId !== deniedRole;
      },
    };
    return load.call(this, name, ...args);
  });
  const { updateOrgSlackChannelRoleAssignments: update } = await import("./slackChannelRoles.server");
  const base = { workspaceId: "workspace", channelId: "C_TARGET", user: { id: "user" } as any };
  const disable = roleIds.slice(1).map((roleId) => ({ roleId, enabled: false }));
  const reset = () => {
    authorized = true; visibleIds = roleIds; deniedRole = undefined; failWrite = false;
    optOuts = []; emails = new Set();
    channels = [{ id: "target-db", slack_channel_id: "C_TARGET" }, { id: "other-db", slack_channel_id: "C_OTHER" }];
    writes.length = 0; reads.length = 0; audience.length = 0;
  };

  await t.test("22-role selection uses one bulk write and preserves unrelated assignments", async () => {
    reset();
    optOuts.push({ role_id: "role-0", channel_id: "other-db" });
    assert.deepEqual(await update({ ...base, roles: disable }), { ok: true });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].method, "upsert");
    assert.equal((writes[0].rows as unknown[]).length, 21);
    assert.equal(reads.length, 3);
    assert.equal(optOuts.filter((row) => row.channel_id === "target-db").length, 21);
    assert.ok(optOuts.some((row) => row.role_id === "role-0" && row.channel_id === "other-db"));
    assert.deepEqual(audience, []);
    await update({ ...base, roles: disable });
    assert.equal(optOuts.length, 22, "retry does not duplicate opt-outs");
  });
  await t.test("workspace and role access fail before any write", async () => {
    reset(); authorized = false;
    await assert.rejects(update({ ...base, roles: disable }), /Forbidden/);
    assert.equal(reads.length, 0);
    authorized = true; visibleIds = ["role-0"];
    await assert.rejects(update({ ...base, roles: disable }), /Role not found/);
    assert.equal(writes.length, 0);
  });
  await t.test("an unconnected channel cannot be changed", async () => {
    reset();
    await assert.rejects(update({ ...base, channelId: "C_FOREIGN", roles: disable }), /Unknown notification target/);
    assert.equal(writes.length, 0);
  });
  await t.test("a late invalid destination prevents every write in the batch", async () => {
    reset();
    optOuts.push({ role_id: "role-21", channel_id: "other-db" });
    await assert.rejects(update({ ...base, roles: disable }), /Slack 채널이나 메일/);
    assert.equal(writes.length, 0);
    emails.add("role-21");
    await update({ ...base, roles: disable });
    assert.equal(writes.length, 1);
  });
  await t.test("audience is rechecked before enabling, and rejection prevents disables too", async () => {
    reset(); deniedRole = "role-0";
    await assert.rejects(update({ ...base, roles: [{ roleId: "role-0", enabled: true }, ...disable] }), /접근 권한/);
    assert.deepEqual(audience, ["role-0"]);
    assert.equal(writes.length, 0);
  });
  await t.test("enabling deletes only this channel's opt-out for the changed role", async () => {
    reset();
    optOuts = [{ role_id: "role-0", channel_id: "target-db" }, { role_id: "role-0", channel_id: "other-db" }, { role_id: "role-1", channel_id: "target-db" }];
    await update({ ...base, roles: [{ roleId: "role-0", enabled: true }] });
    assert.deepEqual(optOuts, [{ role_id: "role-0", channel_id: "other-db" }, { role_id: "role-1", channel_id: "target-db" }]);
  });
  await t.test("a database failure is surfaced rather than reporting a successful save", async () => {
    reset(); failWrite = true;
    await assert.rejects(update({ ...base, roles: disable }), /write failed/);
    assert.equal(optOuts.length, 0);
  });
  await t.test("an unchanged selection does not write", async () => {
    reset();
    assert.deepEqual(await update({ ...base, roles: [] }), { ok: true });
    assert.equal(writes.length, 0);
  });
});
