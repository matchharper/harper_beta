import assert from "node:assert/strict";
import test from "node:test";
import { ashleyInboxMailForModel, isAshleyInboxMail, mailStartedToolNames } from "./mailStartedTurn";
import { formatTalentMessageContentForLlmPrompt } from "./opportunityFeedbackNote";

const NAMES = { CONTACT_COMPANY: "contact_company", APPLY_TO_INTERNAL_ROLE: "apply_to_internal_role", USE_BROWSER: "use_browser", WRITE_EMAIL: "write_email", MANAGE_WORK: "manage_work" } as const;
const ALL = ["read_profile", "write_talent_context", "suggest_form", "contact_company", "apply_to_internal_role", "use_browser", "write_email", "manage_work", "write_calendar", "read_calendar"];
const mail = { message_type: "mail", payload: { via: "ashley_inbox", gtmAgentMessageId: "m-1" } };

test("a member's mail to Ashley is told apart from Harper's own mail and from chat", () => {
  assert.equal(isAshleyInboxMail(mail), true);
  assert.equal(isAshleyInboxMail({ message_type: "mail", payload: { via: "resend" } }), false);
  assert.equal(isAshleyInboxMail({ message_type: "chat", payload: { via: "ashley_inbox" } }), false);
  assert.equal(isAshleyInboxMail({ message_type: "mail", payload: null }), false);
});

test("a turn of such mails only: every chat tool but the ones that act toward others; any input from the person: nothing taken", () => {
  assert.deepEqual(mailStartedToolNames([mail, mail], ALL, NAMES), ["read_profile", "write_talent_context", "suggest_form", "read_calendar"]);
  assert.equal(mailStartedToolNames([mail, { message_type: "chat", payload: {} }], ALL, NAMES), null);
  assert.equal(mailStartedToolNames([], ALL, NAMES), null);
});

test("Harper's model reads such a mail as the person's message to it, with Ashley's mail and the roles it named", () => {
  const payload = { via: "ashley_inbox", ashleyThread: {
    mail: { subject: "Two roles for you", text: "Hi Sam, two roles: Company A and Company B." },
    postings: [{ companyName: "Company A", title: "Backend Engineer", url: "https://a.example/1", roleId: "role-a" }, { companyName: "Company B", title: "SRE", url: null }],
  } };
  const text = ashleyInboxMailForModel("[Email reply to Ashley's mail, passed to Harper]\nWhat is the pay?", payload);
  assert.match(text, /^\[Email reply to a mail from Ashley, received by Harper\][^\n]*not a draft for Harper to send/);
  assert.match(text, /\nWhat is the pay\?\nAshley's mail they answered \("Two roles for you"\):\nHi Sam, two roles/);
  assert.match(text, /\n- Company A — Backend Engineer \(roleId: role-a; https:\/\/a\.example\/1\)\n- Company B — SRE$/);
  // Routed before the context was written: said so, not guessed.
  assert.match(ashleyInboxMailForModel("Hi", { via: "ashley_inbox" }), /\nAshley's mail itself is not available here\.$/);
  // Every prompt that reads chat rows reads it so; other mails are as they were.
  const row = { role: "user", message_type: "mail", content: "What is the pay?", payload };
  assert.match(formatTalentMessageContentForLlmPrompt(row as never), /^\[Email reply to a mail from Ashley/);
  assert.equal(formatTalentMessageContentForLlmPrompt({ role: "user", message_type: "mail", content: "Plain mail", payload: {} } as never), "Plain mail");
});
