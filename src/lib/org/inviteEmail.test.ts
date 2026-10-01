import assert from "node:assert/strict";
import test from "node:test";
import { buildOrgInviteEmail } from "./inviteEmail";

test("English workspace invitation keeps subject, body and button in English", () => {
  const invite = buildOrgInviteEmail({
    companyName: "Acme",
    inviteUrl: "https://matchharper.com/org/invite?token=abc",
    inviterEmail: "sam@acme.com",
    inviterName: "Sam",
    locale: "en",
  });
  assert.equal(invite.subject, "Join Acme on Harper");
  assert.match(invite.text, /Join workspace/);
  assert.match(invite.html, /lang="en"/);
  assert.doesNotMatch(
    `${invite.subject}\n${invite.text}\n${invite.html}`,
    /[가-힣]/
  );
});
