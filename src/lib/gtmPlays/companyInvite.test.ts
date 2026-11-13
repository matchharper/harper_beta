import assert from "node:assert/strict";
import { test } from "node:test";
import { isGtmOnboardingDeferred, type WorkspaceSignupState } from "../org/signup";
import { isGtmCompanyInviteId } from "./companyInvite";
import { gtmCompanyInviteRoleId } from "./companyInviteRole";

const MAIL = "0b66075d-1111-4222-8333-444455556666";
const WS_A = "aaaaaaaa-1111-4222-8333-444455556666";
const WS_B = "bbbbbbbb-1111-4222-8333-444455556666";

test("one Role id per mail and workspace, shaped as a UUID v4", () => {
  const id = gtmCompanyInviteRoleId(MAIL, WS_A);
  assert.equal(id, gtmCompanyInviteRoleId(MAIL.toUpperCase(), WS_A));
  assert.notEqual(id, gtmCompanyInviteRoleId(MAIL, WS_B));
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("only uuid mail ids are kept from the link", () => {
  assert.equal(isGtmCompanyInviteId(MAIL), true);
  assert.equal(isGtmCompanyInviteId("javascript:alert(1)"), false);
  assert.equal(isGtmCompanyInviteId(["a"]), false);
});

test("onboarding waits only for the creator who claimed the mail", () => {
  const state: WorkspaceSignupState = {
    createdBy: "u1", researchStatus: "idle",
    gtmInvite: { mailId: MAIL, roleId: "r1", claimedBy: "u1", claimedAt: "2026-11-12T00:00:00Z" },
  };
  assert.equal(isGtmOnboardingDeferred(state, "u1"), true);
  assert.equal(isGtmOnboardingDeferred(state, "u2"), false);
  assert.equal(isGtmOnboardingDeferred({ ...state, gtmInvite: undefined }, "u1"), false);
  assert.equal(isGtmOnboardingDeferred({ ...state, createdBy: "u2" }, "u1"), false);
  assert.equal(isGtmOnboardingDeferred(null, "u1"), false);
});
