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
