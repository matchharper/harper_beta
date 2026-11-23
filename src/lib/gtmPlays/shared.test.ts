import assert from "node:assert/strict";
import test from "node:test";
import { gtmWritesEnabled } from "./constants";
import {
  cleanPublicDescription,
  companyDomain,
  extractEmails,
  gtmFromHeader,
  gtmMailLinkOrigin,
  gtmMailWentOut,
  gtmOptOutMarkdown,
  gtmRoleName,
  type GtmJd,
  withoutCompanyName,
} from "./shared";

const jd: GtmJd = {
  source: "customer_role", companyName: "Acme Capital", title: "Investment Associate", description: "Role text",
  url: "https://example.com/job", location: "Seoul", sourceRoleId: "11111111-1111-1111-1111-111111111111",
  sourceWorkspaceId: "22222222-2222-2222-2222-222222222222", contactEmails: [],
};

test("the Role name carries the hiring company once", () => {
  assert.equal(gtmRoleName(jd), "Acme Capital · Investment Associate");
  assert.equal(gtmRoleName({ companyName: "Globex", title: "Globex Backend Engineer" }), "Globex Backend Engineer");
  assert.equal(gtmRoleName({ companyName: "", title: "Engineer" }), "Engineer");
});

test("addresses are read only from the text, without no-reply ones", () => {
  assert.deepEqual(
    extractEmails("Send to Recruit@Example.co.kr. or noreply@example.com", "jobs@example.com", "recruit@example.co.kr"),
    ["recruit@example.co.kr", "jobs@example.com"],
  );
  assert.deepEqual(extractEmails(null, undefined, ""), []);
});

test("company domain from a homepage", () => {
  assert.equal(companyDomain("https://www.Example.com/careers?x=1"), "example.com");
  assert.equal(companyDomain("example.co.kr"), "example.co.kr");
  assert.equal(companyDomain(null), null);
});

test("writes stay off unless the server says on", () => {
  assert.equal(gtmWritesEnabled({}), false);
  assert.equal(gtmWritesEnabled({ GTM_PLAYS_WRITES: "true" }), false);
  assert.equal(gtmWritesEnabled({ GTM_PLAYS_WRITES: " ON " }), true);
});

test("the From header is the name without header-breaking characters, then the address", () => {
  assert.equal(gtmFromHeader({ fromName: "Sam Lee", fromEmail: "sam@matchharper.com" }), "Sam Lee <sam@matchharper.com>");
  assert.equal(gtmFromHeader({ fromName: 'Sam "Lee" <x>\r\nBcc: a@b.c', fromEmail: "Sam@MatchHarper.com" }),
    "Sam Lee x Bcc a@b.c <sam@matchharper.com>");
});

test("the opt-out line links to the mail's own page, reply only in previews without one", () => {
  assert.equal(gtmOptOutMarkdown("ko", "https://matchharper.com/api/email/gtm-unsubscribe?m=1&t=2"),
    "*이런 메일을 더 받지 않으시려면 [여기](https://matchharper.com/api/email/gtm-unsubscribe?m=1&t=2)를 눌러 주세요.*");
  assert.match(gtmOptOutMarkdown("en", "https://x.test/u"), /\[unsubscribe here\]\(https:\/\/x\.test\/u\)/);
  assert.match(gtmOptOutMarkdown("ko", null), /답장/);
});

test("mail links go to matchharper.com unless a local server names its own loopback address", () => {
  assert.equal(gtmMailLinkOrigin({}), "https://matchharper.com");
  assert.equal(gtmMailLinkOrigin({ GTM_MAIL_LINK_ORIGIN: "http://127.0.0.1:3103/" }), "http://127.0.0.1:3103");
  assert.equal(gtmMailLinkOrigin({ GTM_MAIL_LINK_ORIGIN: "http://localhost:3000" }), "http://localhost:3000");
  assert.equal(gtmMailLinkOrigin({ GTM_MAIL_LINK_ORIGIN: "https://evil.example" }), "https://matchharper.com");
  assert.equal(gtmMailLinkOrigin({ GTM_MAIL_LINK_ORIGIN: "http://127.0.0.1.evil.example" }), "https://matchharper.com");
});

test("a company's description is cleaned and its name taken out of what candidates read", () => {
  assert.equal(cleanPublicDescription("\"결제 스타트업\""), "결제 스타트업");
  assert.equal(withoutCompanyName("A+B Labs (A+B)", "A+B", "X"), "X Labs (X)");
  assert.equal(withoutCompanyName("text", null, "X"), "text");
});

test("a mail went out when sent, or still sending with the provider's id", () => {
  assert.equal(gtmMailWentOut({ status: "sent" }), true);
  assert.equal(gtmMailWentOut({ status: "sending", provider_message_id: "re_123" }), true);
  assert.equal(gtmMailWentOut({ status: "sending", provider_message_id: null }), false);
  assert.equal(gtmMailWentOut({ status: "sending", provider_message_id: " " }), false);
  assert.equal(gtmMailWentOut({ status: "failed", provider_message_id: "re_123" }), false);
  assert.equal(gtmMailWentOut({ status: "blocked" }), false);
});
