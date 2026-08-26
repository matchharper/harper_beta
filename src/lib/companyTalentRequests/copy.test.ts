import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATE_CONTACT_RELATIONSHIP_RULES,
  hasRedundantCandidateContactOptOut,
} from "@/lib/companyTalentRequests/copyRules";

test("candidate contact copy does not invent an application or ambiguous requester", () => {
  assert.match(
    CANDIDATE_CONTACT_RELATIONSHIP_RULES,
    /does not establish that the candidate applied/
  );
  assert.match(
    CANDIDATE_CONTACT_RELATIONSHIP_RULES,
    /Make the named company the clear requester and Harper the messenger/
  );
  assert.match(
    CANDIDATE_CONTACT_RELATIONSHIP_RULES,
    /Harper를 통해 문의해 주셨습니다/
  );
  assert.match(
    CANDIDATE_CONTACT_RELATIONSHIP_RULES,
    /Do not repeat opt-out language/
  );
});

test("candidate contact copy rejects repeated opt-out phrasing", () => {
  assert.equal(
    hasRedundantCandidateContactOptOut(
      "편하실 때 답변해 주세요. 답변은 선택사항이며, 원치 않으시면 회신하지 않으셔도 됩니다."
    ),
    true
  );
  assert.equal(
    hasRedundantCandidateContactOptOut(
      "편한 말로 답해주시면 Harper가 정리해 전달할게요. 답변은 선택이에요."
    ),
    false
  );
});
