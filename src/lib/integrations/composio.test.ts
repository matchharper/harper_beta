import assert from "node:assert/strict";
import test from "node:test";

import {
  getComposioAccountStatus,
  isOwnedComposioGmailAccount,
} from "./composio";

test("requires exact Gmail user and auth config ownership", () => {
  process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID = "ac_gmail_test";
  const account = {
    auth_config: { id: "ac_gmail_test" },
    id: "ca_test",
    status: "ACTIVE",
    toolkit: { slug: "gmail" },
    user_id: "talent-a",
  };

  assert.equal(isOwnedComposioGmailAccount(account, "talent-a"), true);
  assert.equal(isOwnedComposioGmailAccount(account, "talent-b"), false);
  assert.equal(
    isOwnedComposioGmailAccount(
      { ...account, auth_config: { id: "ac_other" } },
      "talent-a"
    ),
    false
  );
  assert.equal(
    isOwnedComposioGmailAccount(
      { ...account, toolkit: { slug: "googlecalendar" } },
      "talent-a"
    ),
    false
  );
});

test("treats a disabled Composio account as inactive", () => {
  assert.equal(
    getComposioAccountStatus({ is_disabled: true, status: "ACTIVE" }),
    "INACTIVE"
  );
  assert.equal(getComposioAccountStatus({ status: "expired" }), "EXPIRED");
});
