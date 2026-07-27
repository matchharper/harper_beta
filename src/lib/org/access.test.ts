import assert from "node:assert/strict";
import test from "node:test";
import {
  hasOrgWorkspaceAccessBypass,
  isOrgInvitationForUser,
} from "@/lib/org/access";

test("only matchharper.com accounts bypass organization membership checks", () => {
  assert.equal(hasOrgWorkspaceAccessBypass("operator@matchharper.com"), true);
  assert.equal(hasOrgWorkspaceAccessBypass("OPERATOR@MATCHHARPER.COM"), true);
  assert.equal(
    hasOrgWorkspaceAccessBypass("operator@ops.matchharper.com"),
    false
  );
  assert.equal(hasOrgWorkspaceAccessBypass("operator@example.com"), false);
});

test("organization invitations can only be accepted by the invited account", () => {
  assert.equal(
    isOrgInvitationForUser({
      invitationEmail: " invited@example.com ",
      userEmail: "INVITED@example.com",
    }),
    true
  );
  assert.equal(
    isOrgInvitationForUser({
      invitationEmail: "invited@example.com",
      userEmail: "other@example.com",
    }),
    false
  );
  assert.equal(
    isOrgInvitationForUser({
      invitationEmail: null,
      userEmail: "other@example.com",
    }),
    false
  );
});
