import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCareerPromptCompactDateTime,
  sanitizeCareerPromptDateValues,
} from "./promptUtils";

test("formats prompt timestamps as month, day, and Korean local time", () => {
  assert.equal(
    formatCareerPromptCompactDateTime(
      "2026-08-24T01:25:03.102495+00:00"
    ),
    "8월 24일 10:25"
  );
  assert.equal(
    sanitizeCareerPromptDateValues(
      "createdAt=2026-08-25T09:24:05.960Z"
    ),
    "createdAt=8월 25일 18:24"
  );
});
