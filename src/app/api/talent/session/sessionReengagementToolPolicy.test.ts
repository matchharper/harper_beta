import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sessionRoute = readFileSync(
  new URL("./route.ts", import.meta.url),
  "utf8"
);
const reengagementRoute = readFileSync(
  new URL("./reengagement/route.ts", import.meta.url),
  "utf8"
);

test("session start and re-engagement turns expose no career tools", () => {
  assert.match(sessionRoute, /allowedToolNames:\s*\[\]/);
  assert.match(reengagementRoute, /allowedToolNames:\s*\[\]/);
  assert.doesNotMatch(
    `${sessionRoute}\n${reengagementRoute}`,
    /TALENT_TOOL_NAMES\.RECOMMEND_JOB_POSTINGS/
  );
});
