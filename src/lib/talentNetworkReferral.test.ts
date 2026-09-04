import assert from "node:assert/strict";
import test from "node:test";
import {
  copyTalentNetworkReferralLinkForPath,
  getTalentNetworkReferralTokenFromUrlLike,
  isTalentNetworkReferralSource,
  TALENT_NETWORK_REFERRAL_SOURCE_OFFICIAL_JOB,
} from "./talentNetworkReferral";
import { buildTalentNetworkReferralUrl } from "./talentNetworkReferralUrl";

test("builds a referral URL that returns to the selected job", () => {
  assert.equal(
    buildTalentNetworkReferralUrl({
      baseUrl: "https://matchharper.com",
      pagePath: "/jobs/forward-deployed-engineer",
      token: "referral-token",
    }),
    "https://matchharper.com/jobs/forward-deployed-engineer?ref=referral-token"
  );
});

test("keeps the existing homepage referral URL behavior", () => {
  assert.equal(
    buildTalentNetworkReferralUrl({
      baseUrl: "https://matchharper.com",
      pagePath: "/",
      token: "referral-token",
    }),
    "https://matchharper.com/?ref=referral-token"
  );
});

test("the existing referral parser recognizes tokens on job URLs", () => {
  assert.equal(
    getTalentNetworkReferralTokenFromUrlLike(
      "https://matchharper.com/jobs/forward-deployed-engineer?ref=referral-token"
    ),
    "referral-token"
  );
  assert.equal(
    isTalentNetworkReferralSource(TALENT_NETWORK_REFERRAL_SOURCE_OFFICIAL_JOB),
    true
  );
});

test("loads the existing referral token and copies a job-specific URL", async () => {
  const copied: string[] = [];
  const url = await copyTalentNetworkReferralLinkForPath({
    baseUrl: "https://matchharper.com",
    fetchWithAuth: async (path) => {
      assert.equal(path, "/api/talent/network/referral/me");
      return new Response(
        JSON.stringify({
          createdAt: "2026-09-04T00:00:00.000Z",
          stats: { hires: 0, paid: 0, signups: 0, visits: 0 },
          token: "existing-token",
          url: "https://matchharper.com/?ref=existing-token",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      );
    },
    pagePath: "/jobs/forward-deployed-engineer",
    writeText: async (value) => {
      copied.push(value);
    },
  });

  assert.equal(
    url,
    "https://matchharper.com/jobs/forward-deployed-engineer?ref=existing-token"
  );
  assert.deepEqual(copied, [url]);
});

test("rejects a referral destination on another origin", () => {
  assert.throws(
    () =>
      buildTalentNetworkReferralUrl({
        baseUrl: "https://matchharper.com",
        pagePath: "https://example.com/jobs/role",
        token: "referral-token",
      }),
    /Harper origin/
  );
});
