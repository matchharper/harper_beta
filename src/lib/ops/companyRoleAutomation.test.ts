import assert from "node:assert/strict";
import test from "node:test";
import { InternalApiError } from "@/lib/internalApi";
import { updateOpsCompanyRoleAutomation } from "@/lib/ops/company";

function createAdmin(args?: { roleFound?: boolean }) {
  const roleFilters = new Map<string, unknown>();
  const updateFilters = new Map<string, unknown>();
  let updatePayload: Record<string, unknown> | null = null;

  const roleQuery = {
    eq(column: string, value: unknown) {
      roleFilters.set(column, value);
      return this;
    },
    async maybeSingle() {
      return {
        data:
          args?.roleFound === false
            ? null
            : { role_id: "00000000-0000-4000-8000-000000000101" },
        error: null,
      };
    },
    select() {
      return this;
    },
  };

  const internalQuery = {
    eq(column: string, value: unknown) {
      updateFilters.set(column, value);
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          is_auto: updatePayload?.is_auto === true,
          role_id: "00000000-0000-4000-8000-000000000101",
          updated_at: "2026-08-24T08:00:00.000Z",
        },
        error: null,
      };
    },
    select() {
      return this;
    },
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      return this;
    },
  };

  return {
    admin: {
      from(table: string) {
        if (table === "company_roles") return roleQuery;
        if (table === "company_internal_roles") return internalQuery;
        throw new Error(`Unexpected table: ${table}`);
      },
    },
    getUpdatePayload: () => updatePayload,
    roleFilters,
    updateFilters,
  };
}

test("updates is_auto only after scoping the role to its internal workspace", async () => {
  const fake = createAdmin();
  const result = await updateOpsCompanyRoleAutomation({
    admin: fake.admin as never,
    isAuto: true,
    roleId: "00000000-0000-4000-8000-000000000101",
    workspaceId: "00000000-0000-4000-8000-000000000001",
  });

  assert.equal(
    fake.roleFilters.get("company_workspace_id"),
    result.role.workspaceId
  );
  assert.equal(fake.roleFilters.get("source_type"), "internal");
  assert.equal(
    fake.updateFilters.get("role_id"),
    "00000000-0000-4000-8000-000000000101"
  );
  assert.equal(fake.getUpdatePayload()?.is_auto, true);
  assert.equal(result.role.isAuto, true);
});

test("rejects a role outside the requested workspace", async () => {
  const fake = createAdmin({ roleFound: false });

  await assert.rejects(
    updateOpsCompanyRoleAutomation({
      admin: fake.admin as never,
      isAuto: false,
      roleId: "00000000-0000-4000-8000-000000000101",
      workspaceId: "00000000-0000-4000-8000-000000000002",
    }),
    (error) => error instanceof InternalApiError && error.status === 404
  );
  assert.equal(fake.getUpdatePayload(), null);
});
