import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOfficialJobMarkdown } from "./markdown";

test("replaces non-breaking spaces in official job markdown", () => {
  assert.equal(
    normalizeOfficialJobMarkdown(
      "  Harper\u00a0works with\u202fAI companies.  "
    ),
    "Harper works with AI companies."
  );
});

test("preserves markdown structure while normalizing whitespace", () => {
  assert.equal(
    normalizeOfficialJobMarkdown("**Role\u00a0Title**\n\n- First\u00a0item"),
    "**Role Title**\n\n- First item"
  );
});
