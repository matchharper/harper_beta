import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(process.cwd(), "src/components/career/CareerTasksPanel.tsx"),
  "utf8"
);

function sourceBlock(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test("the inbox cancel-review button sends the login token like other pending-actions calls", () => {
  const withdraw = sourceBlock(
    "const withdrawPriorityReview",
    "const taskSuggestions"
  );

  assert.match(withdraw, /await fetchWithAuth\(\s*`\/api\/talent\/pending-actions/);
  assert.doesNotMatch(withdraw, /await fetch\(/);
});
