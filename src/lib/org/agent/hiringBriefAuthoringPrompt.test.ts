import assert from "node:assert/strict";
import test from "node:test";
import { HIRING_BRIEF_AUTHORING_PROMPT, ROLE_SOURCE_AUTHORING_PROMPT } from "@/lib/org/agent/hiringBriefAuthoringPrompt";

test("shared Hiring Brief contract keeps anchors concrete without copying biographies", () => {
  assert.match(
    HIRING_BRIEF_AUTHORING_PROMPT,
    /decision axis and strength/
  );
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /observable evidence, substitutes and decision effects when actually given/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /Do not save vague traits/);
  assert.match(
    HIRING_BRIEF_AUTHORING_PROMPT,
    /Never erase an established school bar/
  );
  assert.match(
    HIRING_BRIEF_AUTHORING_PROMPT,
    /exact employers are observed anchors, not an automatic preferred-company list/
  );
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /matchable peer group/);
  assert.match(
    HIRING_BRIEF_AUTHORING_PROMPT,
    /One reference normally supports a small set of non-exclusive bonuses/
  );
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /## Hard constraints/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /## Preferred criteria/);
});

test("authoring preserves evidence breadth across public and private views", () => {
  assert.ok(HIRING_BRIEF_AUTHORING_PROMPT.startsWith(ROLE_SOURCE_AUTHORING_PROMPT));
  assert.doesNotMatch(ROLE_SOURCE_AUTHORING_PROMPT, /professional_reference_calibration_contract/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /Public Description, private Hiring Brief and optional Evaluation Criteria/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /Private team preferences stay in the Brief/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /Do not automatically synchronize all three documents/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /Leave optional structured Evaluation Criteria empty unless/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /Preserve existing Criteria on edits/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /independent interview threshold/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /Do not invent such a bar/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /Keep a broad experience requirement broad/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /A preferred behavior must not become mandatory/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /Harper's earlier draft/);
  assert.match(HIRING_BRIEF_AUTHORING_PROMPT, /not approval of unrelated inferred qualifications/);
});
