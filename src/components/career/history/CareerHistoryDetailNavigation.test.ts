import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const source = readFileSync(
  path.join(process.cwd(), "src/components/career/CareerHistoryPanel.tsx"),
  "utf8"
);

function sourceBlock(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return source.slice(start, end);
}

test("opening a saved opportunity preserves the filtered list in browser history", () => {
  const openDetail = sourceBlock(
    "const openModalForItem",
    "const openOpportunityInfo"
  );

  assert.match(openDetail, /mode: "push"/);
  assert.doesNotMatch(openDetail, /mode: "replace"/);
});

test("the detail back action removes the role id without changing the filter", () => {
  const closeDetail = sourceBlock(
    "const closeOpportunityModal",
    "const handleInternalDecisionChangeConfirm"
  );

  assert.match(
    closeDetail,
    /updateHistoryLocation\(activeTab, activeSavedStatus/
  );
  assert.match(closeDetail, /mode: "replace",\s*roleId: null/);
});
