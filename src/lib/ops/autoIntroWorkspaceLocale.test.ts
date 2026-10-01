import assert from "node:assert/strict";
import test from "node:test";
import {
  attachAutoIntroSlackReviewAction,
  buildAutoIntroRoleSummarySlackBlocks,
  buildAutoIntroRoleSummaryText,
  type AutoIntroRoleSummary,
} from "./autoIntroToCompanyMessage";

const summary: AutoIntroRoleSummary = {
  companyName: "Acme",
  roles: [
    {
      pendingDecisionCount: 2,
      roleId: "role-id",
      roleTitle: "Backend Engineer",
      status: "active",
      workspaceId: "workspace-id",
    },
  ],
  workspaceId: "workspace-id",
};

test("English role summary and Slack actions use Ready to connect", () => {
  const text = buildAutoIntroRoleSummaryText({ locale: "en", summary });
  const blocks = buildAutoIntroRoleSummarySlackBlocks({
    locale: "en",
    summary,
  });
  const review = attachAutoIntroSlackReviewAction({
    candidateCount: 2,
    locale: "en",
    messageBody: "Candidates are ready to connect.",
  });
  assert.match(text, /2 ready to connect/);
  assert.match(JSON.stringify(blocks), /Ready to connect/);
  assert.match(JSON.stringify(review), /Review 2 candidates/);
  assert.doesNotMatch(
    `${text}\n${JSON.stringify(blocks)}\n${JSON.stringify(review)}`,
    /[가-힣]/
  );
});
