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

test("a /jobs posting mention reaches the LLM as a readable posting ref", () => {
  const posting = [{ label: "Backend Engineer", roleId: "11111111-2222-3333-4444-555555555555", targetKind: "posting" as const }];
  const stored = appendCareerOpportunityMentionMetadata("이런 기회를 찾아주세요", posting);
  assert.deepEqual(extractCareerOpportunityMentions(stored), posting);
  assert.match(
    formatCareerOpportunityMentionsForLlm(stored),
    /Backend Engineer \(public Harper \/jobs posting; read with get_role_context roleId 11111111-2222-3333-4444-555555555555\)/
  );
});
