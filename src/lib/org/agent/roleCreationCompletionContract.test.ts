import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const confirmation = readFileSync(
  new URL("./roleCreationConfirmation.ts", import.meta.url),
  "utf8"
);
const chat = readFileSync(
  new URL("./roleCreationChat.ts", import.meta.url),
  "utf8"
);
const migration = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260807140000_org_role_creation_conversations.sql",
    import.meta.url
  ),
  "utf8"
);

test("draft activation uses only the guarded completion RPC", () => {
  assert.match(confirmation, /complete_company_role_creation_v1/);
  assert.doesNotMatch(confirmation, /\.update\(\{\s*status:\s*"active"/);
  assert.match(migration, /guard_company_role_draft_activation_v1/);
  assert.match(migration, /current_setting\('app\.role_creation_completion'/);
  assert.match(
    migration,
    /revoke all on function public\.complete_company_role_creation_v1\(uuid, uuid\)[\s\S]*from public, anon, authenticated;/
  );
  assert.match(
    migration,
    /grant execute on function public\.complete_company_role_creation_v1\(uuid, uuid\)[\s\S]*to service_role;/
  );
});

test("completion claims a conversation before writing confirmation messages", () => {
  const claim = confirmation.indexOf(
    "const claimedMetadata = await claimConfirmation"
  );
  const persist = confirmation.indexOf("await persistConfirmationMessages");
  assert.notEqual(claim, -1);
  assert.notEqual(persist, -1);
  assert.ok(claim < persist);
  assert.match(
    confirmation,
    /ROLE_CREATION_CONFIRMATION_LEASE_MS|canReclaimRoleCreationConfirmation/
  );
  assert.match(confirmation, /wasRoleCreationConfirmationHandled/);
});

test("confirmation pending metadata preserves notification confirmations from the latest state", () => {
  assert.match(
    chat,
    /confirmationState = await fetchRoleCreationState[\s\S]*current:\s*confirmationState\?\.conversation\.metadata/
  );
});

test("the decline choice explains that more details can be added in chat", () => {
  assert.match(
    chat,
    /label:\s*"아니오 : 채팅에서 바로 추가로 알려주고 싶은 사항을 작성하셔도 됩니다\."/
  );
});

test("a contextual free-form affirmative reuses the guarded confirmation path", () => {
  assert.match(chat, /confirm_pending_role_creation/);
  assert.match(chat, /previousMessage\?\.id === pendingConfirmationMessageId/);
  assert.match(chat, /await import\([\s\S]*roleCreationConfirmation/);
  assert.match(chat, /confirmationUserMessage: userMessage/);
  assert.match(
    confirmation,
    /args\.confirmationUserMessage[\s\S]*\.eq\("role", "user"\)/
  );
});

test("role creation conversation stays model-authored while successful completion uses fixed guidance", () => {
  assert.doesNotMatch(
    chat,
    /MIN_ROLE_CREATION_REPLY_CHARS|MAX_RESPONSE_REPAIR_ATTEMPTS|buildRoleCreationConfirmationReply|buildRoleCreationRecoveryReply/
  );
  assert.doesNotMatch(
    confirmation,
    /missingFieldsReply|declinedReply|completedReply/
  );
  assert.match(
    confirmation,
    /completed[\s\S]*buildRoleCreationCompletionMessage/
  );
  assert.match(confirmation, /generateRoleCreationOutcomeReply/);
});

test("role creation gives high-reasoning models enough output budget", () => {
  assert.match(chat, /ROLE_CREATION_MAX_OUTPUT_TOKENS = 4_800/);
  assert.equal(
    chat.match(
      /(?:max_completion_tokens|max_tokens): ROLE_CREATION_MAX_OUTPUT_TOKENS/g
    )?.length,
    4
  );
  assert.equal(
    chat.match(/openAIResponses: \{ reasoningEffort: "high" \}/g)?.length,
    2
  );
});
