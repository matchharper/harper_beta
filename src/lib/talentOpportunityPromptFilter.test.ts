import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const talentOpportunity = readFileSync(
  new URL("./talentOpportunity.ts", import.meta.url),
  "utf8"
);

test("neutral hidden recommendations stay out of default LLM prompt reads", () => {
  const neutralHiddenFilter =
    "feedback.not.is.null,saved_stage.is.null,saved_stage.neq.hidden";

  assert.equal(
    talentOpportunity.split(neutralHiddenFilter).length - 1,
    2
  );
});

test("expired cleanup only hides unanswered external recommendations", () => {
  const cleanup = talentOpportunity.match(
    /export async function hideExpiredUnansweredExternalOpportunities[\s\S]*?\n}\n\nexport async function fetchRecentRecommendedOpportunitiesForPrompt/
  )?.[0];

  assert.ok(cleanup);
  assert.match(cleanup, /\.eq\("company_role\.source_type", "external"\)/);
  assert.match(cleanup, /\.is\("feedback", null\)/);
  assert.match(cleanup, /\.is\("saved_stage", null\)/);
  assert.match(cleanup, /saved_stage: "hidden"/);
  assert.doesNotMatch(cleanup, /feedback:\s*"(?:positive|negative)"/);
});
