import assert from "node:assert/strict";
import test from "node:test";
import { CAREER_MATCHING_TOOLS } from "./tools";

test("Career opportunity search rejects legacy internal queries before looking up roles or a saved run", async () => {
  const search = CAREER_MATCHING_TOOLS.search_opportunities.execute!;
  await assert.rejects(search({ source: "internal", roleIds: ["private-role"] }), /reads external opportunities/);
  await assert.rejects(search({ source: "internal", action: "read", runId: "old-run" }), /reads external opportunities/);
});
