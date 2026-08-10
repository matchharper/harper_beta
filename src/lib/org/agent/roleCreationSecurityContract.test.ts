import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const store = source("./store.ts");
const state = source("./roleCreationState.ts");
const chat = source("./roleCreationChat.ts");
const extractRoute = source(
  "../../../app/api/org/agent/role-creation/extract-file/route.ts"
);
const confirmRoute = source(
  "../../../app/api/org/agent/role-creation/confirm/route.ts"
);
const chatRoute = source("../../../app/api/org/agent/chat/route.ts");
const messageRoute = source("../../../app/api/org/agent/messages/route.ts");
const internalSearch = source("../../career/internalRoleSearch.ts");
const migration = source(
  "../../../../supabase/migrations/20260807140000_org_role_creation_conversations.sql"
);

test("role creation storage is isolated from the workspace and other roles", () => {
  assert.match(store, /\.is\("role_id", null\)/);
  assert.match(
    store,
    /ensureOrgRoleCreationConversation[\s\S]*\.eq\("role_id", roleId\)/
  );
  assert.match(
    store,
    /fetchOrgAgentMessages[\s\S]*\.eq\("conversation_id", conversation\.id\)/
  );
  assert.match(
    migration,
    /unique index if not exists company_conversations_role_creation_uidx[\s\S]*company_workspace_id, role_id/
  );
});

test("every role creation entry point authenticates and checks manage permission", () => {
  for (const route of [chatRoute, messageRoute, extractRoute, confirmRoute]) {
    assert.match(route, /requireAuthenticatedUser/);
  }
  assert.match(state, /permission: "manage_candidates"/);
  assert.match(store, /permission: "manage_candidates"/);
});

test("drafts are excluded from search and regain a vector only after activation", () => {
  assert.match(
    migration,
    /status in \('draft', 'top_priority', 'active', 'ended', 'paused'\)/
  );
  assert.match(
    migration,
    /lower\(coalesce\(new\.status, 'active'\)\) = 'draft'[\s\S]*new\.opportunity_search_tsv := null/
  );
  assert.match(internalSearch, /cr\.status IN \('active', 'paused'\)/);
  assert.match(
    migration,
    /complete_company_role_creation_v1[\s\S]*set status = 'active'/
  );
});

test("attachment text stays server-only and all server limits are enforced", () => {
  assert.match(store, /delete visibleMetadata\.roleCreationAttachments/);
  assert.match(chat, /MAX_ROLE_CREATION_FILES/);
  assert.match(chat, /MAX_ROLE_CREATION_TOTAL_FILE_BYTES/);
  assert.match(chat, /MAX_ROLE_CREATION_FILE_BYTES/);
  assert.match(chat, /isRoleCreationFileMimeAllowed/);
  assert.match(extractRoute, /isRoleCreationFileMimeAllowed/);
});
