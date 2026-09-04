import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const store = source("./store.ts");
const state = source("./roleCreationState.ts");
const extractRoute = source(
  "../../../app/api/org/agent/role-creation/extract-file/route.ts"
);
const confirmRoute = source(
  "../../../app/api/org/agent/role-creation/confirm/route.ts"
);
const chatRoute = source("../../../app/api/org/agent/chat/route.ts");
const messageRoute = source("../../../app/api/org/agent/messages/route.ts");
const deletedStatusMigration = source(
  "../../../../supabase/migrations/20260819100000_internal_role_deleted_status.sql"
);

test("every role creation entry point authenticates and checks manage permission", () => {
  for (const route of [chatRoute, messageRoute, extractRoute, confirmRoute]) {
    assert.match(route, /requireAuthenticatedUser/);
  }
  assert.match(state, /permission: "manage_candidates"/);
  assert.match(store, /permission: "manage_candidates"/);
});

test("internal role deletion has a dedicated status and migrates only legacy soft deletes", () => {
  assert.match(
    deletedStatusMigration,
    /status = 'deleted' and source_type = 'internal'/
  );
  assert.match(
    deletedStatusMigration,
    /set status = 'deleted'[\s\S]*source_type = 'internal'[\s\S]*status = 'ended'[\s\S]*is_expired is true/
  );
  assert.match(
    deletedStatusMigration,
    /old\.status = 'draft'[\s\S]*new\.status is distinct from 'deleted'/
  );
});
