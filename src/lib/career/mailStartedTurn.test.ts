import assert from "node:assert/strict";
import test from "node:test";
import { isAshleyInboxMail, mailStartedToolNames } from "./mailStartedTurn";

const NAMES = { CONTACT_COMPANY: "contact_company", APPLY_TO_INTERNAL_ROLE: "apply_to_internal_role", USE_BROWSER: "use_browser", WRITE_EMAIL: "write_email" } as const;
const ALL = ["read_profile", "write_talent_context", "suggest_form", "contact_company", "apply_to_internal_role", "use_browser", "write_email"];
const mail = { message_type: "mail", payload: { via: "ashley_inbox", gtmAgentMessageId: "m-1" } };

test("a member's mail to Ashley is told apart from Harper's own mail and from chat", () => {
  assert.equal(isAshleyInboxMail(mail), true);
  assert.equal(isAshleyInboxMail({ message_type: "mail", payload: { via: "resend" } }), false);
  assert.equal(isAshleyInboxMail({ message_type: "chat", payload: { via: "ashley_inbox" } }), false);
  assert.equal(isAshleyInboxMail({ message_type: "mail", payload: null }), false);
});

test("a turn of such mails only: every chat tool but the ones that act toward others; any input from the person: nothing taken", () => {
  assert.deepEqual(mailStartedToolNames([mail, mail], ALL, NAMES), ["read_profile", "write_talent_context", "suggest_form"]);
  assert.equal(mailStartedToolNames([mail, { message_type: "chat", payload: {} }], ALL, NAMES), null);
  assert.equal(mailStartedToolNames([], ALL, NAMES), null);
});
