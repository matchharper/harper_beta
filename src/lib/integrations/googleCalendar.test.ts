import assert from "node:assert/strict";
import test from "node:test";
import {
  ComposioApiError,
  type ComposioClient,
  type ComposioConnectedAccount,
} from "./composio";
import { createGoogleCalendarService } from "./googleCalendar";
import { GoogleCalendarError } from "./googleCalendarError";
import type {
  CalendarIntegrationRow,
  GoogleCalendarStore,
} from "./googleCalendarStore";

export function calendarFixture() {
  const rows = new Map<string, CalendarIntegrationRow>();
  const accounts = new Map<string, ComposioConnectedAccount>();
  const calls: Array<{ action: string; id: string }> = [];
  let clock = 0;
  const timestamp = () =>
    new Date(Date.UTC(2026, 7, 26, 0, 0, ++clock)).toISOString();
  const store: GoogleCalendarStore = {
    async find(userId) {
      return structuredClone(rows.get(userId) ?? null);
    },
    async insert(userId, accountId) {
      if (
        rows.has(userId) ||
        [...rows.values()].some(
          (row) => row.composio_connected_account_id === accountId
        )
      )
        return null;
      const now = timestamp();
      const row = {
        company_user_id: userId,
        provider: "google_calendar",
        composio_connected_account_id: accountId,
        status: "active",
        created_at: now,
        last_sync_window_end_at: null,
        last_synced_at: null,
        updated_at: now,
      };
      rows.set(userId, row);
      return structuredClone(row);
    },
    async setStatus(row, status) {
      const current = rows.get(row.company_user_id);
      if (JSON.stringify(current) !== JSON.stringify(row)) return null;
      const updated = { ...row, status, updated_at: timestamp() };
      rows.set(row.company_user_id, updated);
      return structuredClone(updated);
    },
    async remove(row) {
      if (JSON.stringify(rows.get(row.company_user_id)) !== JSON.stringify(row))
        return false;
      return rows.delete(row.company_user_id);
    },
  };
  function account(
    userId = "alice",
    id = "ca_alice",
    overrides: Partial<ComposioConnectedAccount> = {}
  ) {
    const result = {
      id,
      user_id: userId,
      auth_config: { id: "ac_calendar" },
      toolkit: { slug: "googlecalendar" },
      status: "ACTIVE",
      ...overrides,
    };
    accounts.set(id, result);
    return result;
  }
  const vendor: ComposioClient = {
    async createLink(args) {
      calls.push({ action: "link", id: args.userId });
      return {
        accountId: "ca_new",
        authorizeUrl: "https://connect.composio.dev/link/test",
      };
    },
    async getAccount(id) {
      calls.push({ action: "get", id });
      const found = accounts.get(id);
      if (!found) throw new ComposioApiError("not found", 404);
      return structuredClone(found);
    },
    async revokeAccount(id) {
      calls.push({ action: "revoke", id });
    },
    async deleteAccount(id) {
      calls.push({ action: "delete", id });
      accounts.delete(id);
    },
    async executeTool() {
      throw new Error("not used by connection lifecycle tests");
    },
  };
  const service = createGoogleCalendarService({
    store,
    vendor,
    getAuthConfigId: () => "ac_calendar",
  });
  return { rows, accounts, calls, store, vendor, service, account };
}

test("a missing or disabled row never queries Composio for status", async () => {
  const f = calendarFixture();
  assert.equal((await f.service.getStatus("alice")).status, "not_connected");
  const row = await f.store.insert("alice", "ca_alice");
  await f.store.setStatus(row!, "disabled");
  assert.equal((await f.service.getStatus("alice")).status, "disabled");
  assert.deepEqual(f.calls, []);
});

test("an active account is verified and its pointer is not exposed in status", async () => {
  const f = calendarFixture();
  f.account();
  await f.store.insert("alice", "ca_alice");
  assert.deepEqual(await f.service.getStatus("alice"), {
    provider: "google_calendar",
    status: "active",
  });
});

test("server calendar operations can require only the user's verified active account", async () => {
  const f = calendarFixture();
  f.account();
  await f.store.insert("alice", "ca_alice");
  assert.equal(await f.service.requireActiveAccountId("alice"), "ca_alice");
  await assert.rejects(
    f.service.requireActiveAccountId("bob"),
    (error: unknown) =>
      error instanceof GoogleCalendarError && error.code === "NOT_CONNECTED"
  );
});

test("only the requesting employee's persisted connection is read or revoked", async () => {
  const f = calendarFixture();
  f.account();
  f.account("bob", "ca_bob");
  await f.store.insert("alice", "ca_alice");
  await f.store.insert("bob", "ca_bob");
  await f.service.disconnect("alice");
  assert.equal(f.rows.has("alice"), false);
  assert.equal(f.rows.get("bob")?.status, "active");
  assert.equal(f.accounts.has("ca_bob"), true);
  assert.ok(f.calls.every((call) => call.id === "ca_alice"));
});

test("even a incorrectly scoped store cannot return another employee's row", async () => {
  const f = calendarFixture();
  const bob = await f.store.insert("bob", "ca_bob");
  f.store.find = async () => bob;
  await assert.rejects(
    f.service.getStatus("alice"),
    (error: unknown) =>
      error instanceof GoogleCalendarError && error.code === "OWNER_MISMATCH"
  );
  await assert.rejects(f.service.disconnect("alice"));
  assert.deepEqual(f.calls, []);
});

for (const [label, overrides] of Object.entries({
  owner: { user_id: "bob" },
  toolkit: { toolkit: { slug: "gmail" } },
  authConfig: { auth_config: { id: "ac_other" } },
  accountId: { id: "ca_other" },
})) {
  test(`completion rejects mismatched ${label} before saving`, async () => {
    const f = calendarFixture();
    f.account("alice", "ca_alice", overrides);
    await assert.rejects(f.service.complete("alice", "ca_alice"));
    assert.equal(f.rows.size, 0);
  });
}

test("disconnect blocks locally but never revokes an account owned by someone else", async () => {
  const f = calendarFixture();
  await f.store.insert("alice", "ca_bob");
  f.account("bob", "ca_bob");
  await assert.rejects(f.service.disconnect("alice"));
  assert.equal(f.rows.get("alice")?.status, "disabled");
  assert.deepEqual(f.calls, [{ action: "get", id: "ca_bob" }]);
});

for (const vendorStatus of ["EXPIRED", "INACTIVE", "FAILED", "REVOKED"]) {
  test(`${vendorStatus} updates the active row to expired`, async () => {
    const f = calendarFixture();
    f.account("alice", "ca_alice", { status: vendorStatus });
    await f.store.insert("alice", "ca_alice");
    assert.equal((await f.service.getStatus("alice")).status, "expired");
    assert.equal(f.rows.get("alice")?.status, "expired");
  });
}

test("a deleted vendor connection is expired and disconnect can clean it up", async () => {
  const f = calendarFixture();
  await f.store.insert("alice", "ca_alice");
  assert.equal((await f.service.getStatus("alice")).status, "expired");
  await f.service.disconnect("alice");
  assert.equal(f.rows.size, 0);
  assert.ok(!f.calls.some((call) => call.action === "revoke"));
});

for (const code of [401, 403, 429, 500, 504]) {
  test(`vendor ${code} does not turn an active connection into expired`, async () => {
    const f = calendarFixture();
    await f.store.insert("alice", "ca_alice");
    f.vendor.getAccount = async () => {
      throw new ComposioApiError("unavailable", code);
    };
    await assert.rejects(f.service.getStatus("alice"));
    assert.equal(f.rows.get("alice")?.status, "active");
  });
}

test("incomplete OAuth cannot be saved", async () => {
  const f = calendarFixture();
  f.account("alice", "ca_alice", { status: "INITIATED" });
  await assert.rejects(f.service.complete("alice", "ca_alice"));
  assert.equal(f.rows.size, 0);
});

test("successful completion persists one row, and duplicate completion is idempotent", async () => {
  const f = calendarFixture();
  f.account();
  await f.service.complete("alice", "ca_alice");
  const saved = structuredClone(f.rows.get("alice"));
  await f.service.complete("alice", "ca_alice");
  assert.deepEqual(f.rows.get("alice"), saved);
  assert.equal(f.rows.size, 1);
});

test("a stale callback cannot overwrite a newer or disabled connection", async () => {
  const f = calendarFixture();
  f.account();
  let row = await f.store.insert("alice", "ca_newer");
  await assert.rejects(f.service.complete("alice", "ca_alice"));
  row = await f.store.setStatus(row!, "disabled");
  await assert.rejects(f.service.complete("alice", "ca_alice"));
  assert.deepEqual(f.rows.get("alice"), row);
});

test("a failed revoke blocks access first, preserves a retry pointer, and cannot be reconnected over", async () => {
  const f = calendarFixture();
  f.account();
  await f.store.insert("alice", "ca_alice");
  const revoke = f.vendor.revokeAccount;
  f.vendor.revokeAccount = async () => {
    assert.equal(f.rows.get("alice")?.status, "disabled");
    throw new ComposioApiError("temporary failure", 503);
  };
  await assert.rejects(f.service.disconnect("alice"));
  await assert.rejects(
    f.service.connect("alice", "https://harper.test/org/settings")
  );
  await assert.rejects(f.service.complete("alice", "ca_alice"));
  assert.equal(f.rows.get("alice")?.composio_connected_account_id, "ca_alice");
  f.vendor.revokeAccount = revoke;
  await f.service.disconnect("alice");
  assert.equal(f.rows.has("alice"), false);
});

test("DB failure to disable prevents all vendor mutations", async () => {
  const f = calendarFixture();
  await f.store.insert("alice", "ca_alice");
  f.store.setStatus = async () => {
    throw new Error("db down");
  };
  await assert.rejects(f.service.disconnect("alice"));
  assert.deepEqual(f.calls, []);
});

test("a failed delete can be retried after revocation without revoking twice", async () => {
  const f = calendarFixture();
  f.account();
  await f.store.insert("alice", "ca_alice");
  const remove = f.vendor.deleteAccount;
  f.vendor.revokeAccount = async (id) => {
    f.calls.push({ action: "revoke", id });
    f.accounts.get(id)!.status = "REVOKED";
  };
  f.vendor.deleteAccount = async () => {
    throw new ComposioApiError("temporary", 503);
  };
  await assert.rejects(f.service.disconnect("alice"));
  assert.equal(f.rows.get("alice")?.status, "disabled");
  f.vendor.deleteAccount = remove;
  await f.service.disconnect("alice");
  assert.equal(f.calls.filter((call) => call.action === "revoke").length, 1);
  assert.equal(f.rows.size, 0);
});

test("a disabled auth config is a setup failure, not a user-token expiry", async () => {
  const f = calendarFixture();
  f.account("alice", "ca_alice", {
    auth_config: { id: "ac_calendar", is_disabled: true },
  });
  await f.store.insert("alice", "ca_alice");
  await assert.rejects(
    f.service.getStatus("alice"),
    (error: unknown) =>
      error instanceof ComposioApiError &&
      error.details.code === "AUTH_CONFIG_DISABLED"
  );
  assert.equal(f.rows.get("alice")?.status, "active");
});

test("DB failure to save leaves completion retryable", async () => {
  const f = calendarFixture();
  f.account();
  const insert = f.store.insert;
  f.store.insert = async () => {
    throw new Error("db down");
  };
  await assert.rejects(f.service.complete("alice", "ca_alice"));
  f.store.insert = insert;
  await f.service.complete("alice", "ca_alice");
  assert.equal(f.rows.get("alice")?.status, "active");
});

test("connect reuses only the user's persisted active account", async () => {
  const f = calendarFixture();
  f.account();
  await f.store.insert("alice", "ca_alice");
  assert.deepEqual(
    await f.service.connect("alice", "https://harper.test/org/settings"),
    { status: "active" }
  );
  assert.ok(!f.calls.some((call) => call.action === "link"));
  await f.service.connect("bob", "https://harper.test/org/settings");
  assert.deepEqual(f.calls.at(-1), { action: "link", id: "bob" });
});

test("reconnect cleans up an expired pointer before creating the next link", async () => {
  const f = calendarFixture();
  f.account("alice", "ca_alice", { status: "EXPIRED" });
  await f.store.insert("alice", "ca_alice");
  const result = await f.service.connect(
    "alice",
    "https://harper.test/org/settings"
  );
  assert.equal(result.status, "redirect");
  assert.equal(f.rows.size, 0);
  assert.equal(f.accounts.has("ca_alice"), false);
  assert.deepEqual(
    f.calls.map((call) => call.action),
    ["get", "get", "revoke", "delete", "link"]
  );
});
