import assert from "node:assert/strict";
import test from "node:test";

import { buildNetworkLeadContextSeeds } from "./networkClaim";

test("network claim keeps desired teams in Brief and technical strength in Memory", () => {
  assert.deepEqual(
    buildNetworkLeadContextSeeds({
      lead: {
        dreamTeams: "작고 제품 중심인 팀",
        impactSummary: "결제 플랫폼을 처음부터 설계했다.",
      },
      preferredLocale: "ko-KR",
    }),
    [
      {
        collection: "brief",
        content: "작고 제품 중심인 팀",
        key: "desired_teams",
        label: "선호 팀",
      },
      {
        collection: "memory",
        content: "결제 플랫폼을 처음부터 설계했다.",
        importance: 3,
      },
    ]
  );
});

test("network claim localizes the seeded Brief label", () => {
  assert.equal(
    buildNetworkLeadContextSeeds({
      lead: { dreamTeams: "early-stage product teams", impactSummary: null },
      preferredLocale: "en-US",
    })[0]?.label,
    "Preferred teams"
  );
});
