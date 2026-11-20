import assert from "node:assert/strict";
import { test } from "node:test";
import { isGtmOnboardingDeferred, type WorkspaceSignupState } from "../org/signup";
import { companyInviteMailOpens, interestedFromCompanyMail, isGtmCompanyInviteId } from "./companyInvite";
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

test("the landing opens #2 pool mails and #5 company mails (agent, audience company) with people to show", () => {
  const now = Date.parse("2026-11-23T00:00:00Z");
  const row = {
    audience: "company", campaign: "pool", status: "sent", provider_message_id: "re_1", created_at: "2026-11-20T00:00:00Z",
    posting: { title: "Backend Engineer" }, talent_ids: [WS_A], company_mail: null as unknown,
  };
  assert.equal(companyInviteMailOpens(row, now), true);
  assert.equal(companyInviteMailOpens({ ...row, talent_ids: [] }, now), false);
  assert.equal(companyInviteMailOpens({ ...row, audience: "candidate" }, now), false);
  assert.equal(companyInviteMailOpens({ ...row, created_at: "2026-07-01T00:00:00Z" }, now), false);
  const agent = { ...row, campaign: "agent", talent_ids: [] as string[], company_mail: { interestedPersonIds: ["p1"], interestedCards: [] } };
  // Only "직접 관심" candidates (no member): it opens; a provider-accepted "sending" row counts as sent.
  assert.equal(companyInviteMailOpens(agent, now), true);
  assert.equal(companyInviteMailOpens({ ...agent, status: "sending" }, now), true);
  assert.equal(companyInviteMailOpens({ ...agent, status: "sending", provider_message_id: null }, now), false);
  assert.equal(companyInviteMailOpens({ ...agent, company_mail: null }, now), false);
  assert.equal(companyInviteMailOpens({ ...agent, audience: "candidate" }, now), false);
  assert.equal(companyInviteMailOpens({ ...agent, campaign: "outreach" }, now), false);
});

test("the '직접 관심' cards are the mail's consented, nameless lines; the rest only count", () => {
  const facts = {
    interestedPersonIds: ["p1", "p2", "p3"],
    interestedCards: [
      { personId: "p1", line1: "백엔드 엔지니어 · 멕시코시티", line2: "결제 API를 처음부터 만들어 운영" },
      { personId: "p1", line1: "백엔드 엔지니어 · 멕시코시티", line2: "중복" },
      { personId: "p2", line1: "PM · 경력 5년", line2: "" },
      { personId: "p4", line1: "" },
    ],
  };
  assert.deepEqual(interestedFromCompanyMail(facts), {
    cards: [{ line1: "백엔드 엔지니어 · 멕시코시티", line2: "결제 API를 처음부터 만들어 운영" }, { line1: "PM · 경력 5년", line2: null }],
    others: 1,
  });
  assert.deepEqual(interestedFromCompanyMail(null), { cards: [], others: 0 });
});
