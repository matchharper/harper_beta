import assert from "node:assert/strict";
import test from "node:test";
import { HIRING_BRIEF_AUTHORING_PROMPT } from "@/lib/org/agent/hiringBriefAuthoringPrompt";

test("shared Hiring Brief contract keeps anchors concrete without copying biographies", () => {
  assert.match(
    HIRING_BRIEF_AUTHORING_PROMPT,
    /decision axis, rule strength, observable profile evidence/
  );
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
