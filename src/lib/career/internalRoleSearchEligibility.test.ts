import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./internalRoleSearch.ts", import.meta.url),
  "utf8"
);

test("matched role queries use the canonical candidate-visible eligibility", () => {
  const eligibilityCalls = source.match(
    /public\.talent_internal_role_is_candidate_visible_v1\(fit\)/g
  );

  assert.equal(eligibilityCalls?.length, 1);
  assert.match(
    source,
    /talent_internal_role_reconsideration_is_pending_v1\(fit\)/
  );
  assert.match(source, /내부 역할 재검토 예정/);
  assert.match(source, /private selection context/);
  assert.match(source, /formalRecommendationState=not_presented/);
  assert.match(source, /use newOptionCount, not returnedCount/);
  assert.match(source, /Use selectionContext and sameCompanyFormalRoles only to judge/);
  assert.match(source, /fit\.role_fit/);
  assert.match(source, /fit\.candidate_fit/);
  assert.match(source, /fit\.company_fit/);
  assert.doesNotMatch(source, /description_summary/);
  assert.doesNotMatch(source, /Summary:/);
  assert.match(source, /Do not volunteer an unpresented role's name/);
  assert.match(source, /question about one is not consent/);
  assert.match(source, /sameCompanyFormalRoles/);
  assert.match(source, /candidate-safe public aliases/);
  assert.doesNotMatch(source, /actual company name for sibling roles/);
  assert.match(source, /\["like", "positive"\]/);
  assert.match(source, /\["dislike", "negative"\]/);
});

test("matched role context exposes state without a default company index", () => {
  assert.match(source, /newOptionCount/);
  assert.doesNotMatch(source, /MatchedInternalRoleCompanyIndexItem/);
});
