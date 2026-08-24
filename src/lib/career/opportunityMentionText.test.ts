import assert from "node:assert/strict";
import test from "node:test";
import {
  appendCareerOpportunityMentionMetadata,
  extractCareerOpportunityMentions,
  formatCareerOpportunityMentionsForLlm,
  stripCareerOpportunityMentionMetadata,
} from "@/lib/career/opportunityMentionText";

const mentions = [{ label: "Harper · Product Engineer", roleId: "role-123" }];

test("stores selected role ids without exposing them in visible chat text", () => {
  const stored = appendCareerOpportunityMentionMetadata(
    "이 기회 자세히 알려줘",
    mentions
  );
  assert.deepEqual(extractCareerOpportunityMentions(stored), mentions);
  assert.equal(
    stripCareerOpportunityMentionMetadata(stored),
    "이 기회 자세히 알려줘"
  );
  assert.doesNotMatch(
    stripCareerOpportunityMentionMetadata(stored),
    /role-123/
  );
});

test("exposes selected role ids only to the LLM prompt formatter", () => {
  const formatted = formatCareerOpportunityMentionsForLlm(
    appendCareerOpportunityMentionMetadata("비교해줘", mentions)
  );
  assert.match(formatted, /Harper · Product Engineer/);
  assert.match(formatted, /roleId: role-123/);
});
