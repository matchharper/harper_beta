import assert from "node:assert/strict";
import test from "node:test";
import { getOrgWorkspaceLocale } from "./workspaceLocale.server";

test("a workspace without a linked company uses the blank Headquarters language", async () => {
  const admin = {
    from: () => {
      const query = {
        eq: () => query,
        select: () => query,
        single: async () => ({ data: { company_db_id: null }, error: null }),
      };
      return query;
    },
  };
  assert.equal(await getOrgWorkspaceLocale("workspace", admin as never), "ko");
});
