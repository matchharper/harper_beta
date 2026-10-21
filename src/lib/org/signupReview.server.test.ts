import assert from "node:assert/strict";
import test from "node:test";
import { workspaceSignupReview } from "./signupReview.server";
import domains from "./workspaceReviewDomains.json";

const verified = (email: string) => ({ email, email_confirmed_at: "2026-10-20T00:00:00Z", is_anonymous: false });

test("code registry matches verified email hosts and their subdomains", () => {
  assert.equal(new Set(domains.map(row => row.domain)).size, domains.length);
  for (const { domain } of domains) {
    assert.equal(domain, domain.toLowerCase());
    assert.equal(workspaceSignupReview(verified(`OWNER@${domain.toUpperCase()}`)).p_review_domain, domain);
    assert.equal(workspaceSignupReview(verified(`owner@jobs.${domain}`)).p_review_domain, domain);
    assert.equal(workspaceSignupReview(verified(`owner@${domain}.attacker.example`)).p_review_domain, null);
  }
  assert.equal(workspaceSignupReview(verified("owner@notteamcandid.kr")).p_review_domain, null);
  assert.equal(workspaceSignupReview(verified("owner@ordinary.example")).p_review_domain, null);
});

test("missing or unverified identity cannot supply a review decision", () => {
  for (const user of [
    { ...verified("owner@teamcandid.kr"), email_confirmed_at: undefined },
    { ...verified("owner@teamcandid.kr"), is_anonymous: true },
    { ...verified("owner@teamcandid.kr"), email: undefined },
  ]) assert.throws(() => workspaceSignupReview(user), /signup_work_email_required/);
});
